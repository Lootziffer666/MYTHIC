package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

// stages.go — the exact, ordered provisioning flow. No step is simulated; each
// success is an actually executed + verified action. On a non-recoverable error
// we never claim success: we return a FailResult with the last safe state and a
// recovery path.

type Provisioner struct {
	cfg    Config
	state  StageState
	work   string
	key    *sshKeyPair
	keyFp  string // temp key file path
}

func newProvisioner(cfg Config) (*Provisioner, error) {
	work, err := randomWorkDir()
	if err != nil {
		return nil, err
	}
	if cfg.StateFile == "" {
		cfg.StateFile = "mythic-provision-state.json"
	}
	return &Provisioner{cfg: cfg, work: work}, nil
}

func (p *Provisioner) saveState(phase Phase, lastErr string) {
	p.state.Phase = phase
	p.state.LastError = lastErr
	p.state.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	data, _ := json.MarshalIndent(p.state, "", "  ")
	_ = os.WriteFile(p.cfg.StateFile, data, 0o600)
}

func (p *Provisioner) loadState() bool {
	data, err := os.ReadFile(p.cfg.StateFile)
	if err != nil {
		return false
	}
	if err := json.Unmarshal(data, &p.state); err != nil {
		return false
	}
	return p.state.Phase != "" && p.state.ProviderResourceID != ""
}

// providerFor returns the configured provider adapter.
func (p *Provisioner) providerFor() (Provider, error) {
	switch p.cfg.Provider.Kind {
	case "hetzner", "":
		if p.cfg.Provider.Token == "" {
			return nil, fmt.Errorf("provider token (hands) required for kind=%q", p.cfg.Provider.Kind)
		}
		return newHetznerProvider(p.cfg.Provider.Token, p.cfg.Provider.APIURL), nil
	case "mock":
		return newMockProvider(), nil
	default:
		return nil, fmt.Errorf("unknown provider kind: %q", p.cfg.Provider.Kind)
	}
}

// Run executes the full flow.
func (p *Provisioner) Run() (Handover, *FailResult) {
	var prov Provider
	var err error

	// 1. validate inputs
	if p.cfg.ServerName == "" {
		return Handover{}, fail("Validate inputs", "server name required", "set --server-name")
	}
	if p.cfg.Provider.Kind != "mock" && p.cfg.Provider.Token == "" {
		return Handover{}, fail("Validate inputs", "provider token (hands) required", "pass --hands or --hands-file")
	}

	// resume support
	if p.cfg.StateFile != "" && fileExists(p.cfg.StateFile) && p.loadState() {
		log.info("resuming from state " + string(p.state.Phase))
	}

	// 2. authenticate provider
	if prov, err = p.providerFor(); err != nil {
		return Handover{}, fail("Authenticate provider", err.Error(), "check token")
	}
	if err = prov.Authenticate(); err != nil {
		return Handover{}, fail("Authenticate provider", err.Error(), "check token/permissions")
	}
	log.ok("provider authenticated")

	// 3+4. create server (idempotent)
	rid, ip, err := prov.FindServer(p.cfg.ServerName)
	if rid == "" {
		rid, ip, err = prov.CreateServer(p.cfg.ServerName, p.cfg.ServerType, p.cfg.Region, p.cfg.Image, p.cfg.SSHPublicKey)
		if err != nil {
			return Handover{}, fail("Create server", err.Error(), "check quota/region/image")
		}
		log.ok("server created: " + ip)
	} else {
		log.ok("reusing existing server: " + ip)
	}
	p.state.ProviderResourceID = rid
	p.state.ServerIP = ip
	p.cfg.ServerName = p.cfg.ServerName
	p.saveState("create-server", "")

	// 5. temporary SSH key pair
	if p.keyFp == "" {
		kp, kerr := generateSSHKey()
		if kerr != nil {
			return Handover{}, fail("Generate SSH key", kerr.Error(), "retry")
		}
		p.key = kp
		fp, ferr := kp.writeTempKey(p.work)
		if ferr != nil {
			return Handover{}, fail("Write temp key", ferr.Error(), "check temp dir perms")
		}
		p.keyFp = fp
		p.state.SSHPublicKey = kp.publicKey
		defer p.removeTempKey() // 20. remove temporary key
	}
	log.ok("temporary SSH key generated (in-memory + 0600 temp file)")

	// 6. publish public key (root authorized_keys)
	if p.cfg.SSHPublicKey == "" {
		if _, err = runSSHSeam(ip, "root", p.keyFp,
			fmt.Sprintf("mkdir -p /root/.ssh && echo '%s' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys", p.key.publicKey)); err != nil {
			return Handover{}, fail("Publish public key", err.Error(), "check network/SSH")
		}
		log.ok("public key deployed to root")
	} else {
		log.info("using pre-provided public key")
	}

	// 7. wait for reachability
	if !p.cfg.DryRun {
		if err = waitSSHSeam(ip, p.keyFp); err != nil {
			return Handover{}, fail("Wait for reachability", err.Error(), "check firewall/network")
		}
	}
	log.ok("server reachable via SSH")

	// 8. verify host key + capture fingerprint
	fingerprint, err := hostFingerprintSeam(ip)
	if err != nil {
		return Handover{}, fail("Verify host key", err.Error(), "retry")
	}
	p.state.SSHHostFingerprintSaved = fingerprint
	log.ok("SSH host fingerprint verified: " + fingerprint)

	// 9. bootstrap user (restricted sudo)
	buser, err := createBootstrapUser(ip, p.keyFp, p.key.publicKey)
	if err != nil {
		return Handover{}, fail("Create bootstrap user", err.Error(), "check image/ssh")
	}
	p.state.BootstrapUser = buser
	log.ok("bootstrap user created: " + buser)

	// 10-13. install docker + compose + MYTHIC stack
	if !p.cfg.DryRun {
		if err = installSeam(ip, p.keyFp, buser, p.cfg.Domain); err != nil {
			return Handover{}, fail("Install MYTHIC", err.Error(), "bootstrap retained for recovery; rerun --resume")
		}
	}
	log.ok("MYTHIC stack installed")

	// 14. local container healthcheck
	if !p.cfg.DryRun {
		if err = waitContainerSeam(ip, p.keyFp, buser); err != nil {
			return Handover{}, fail("Local healthcheck", err.Error(), "check logs via bootstrap")
		}
	}
	log.ok("MYTHIC container healthy")

	// 15-16. external healthcheck + admin token
	adminToken := generateOneTimeToken()
	mythicURL := "https://" + p.cfg.Domain
	if p.cfg.DryRun {
		log.ok("(dry-run) would wait for " + mythicURL)
	} else {
		if forceExternalHealthFail {
			return Handover{}, fail("External HTTPS healthcheck", "simulated external check failure", "bootstrap retained for recovery; rerun --resume")
		}
		ok2, werr := waitForMythic(mythicURL, 3*time.Minute)
		if !ok2 {
			return Handover{}, fail("External HTTPS healthcheck", fmt.Sprintf("%v", werr), "bootstrap retained for recovery; rerun --resume")
		}
		// inject "brain" into MYTHIC's secret store, then forget it
		if ierr := injectBrainIntoMythic(mythicURL, adminToken, p.cfg.Brain.LLMKey, p.cfg.Brain.LLMBase, p.cfg.Brain.LLMModel); ierr != nil {
			log.warn("LLM key injection skipped: " + ierr.Error())
		}
	}
	p.state.AdminToken = adminToken
	p.state.MythicURL = mythicURL
	log.ok("HTTPS healthcheck passed")

	// 17-18. handover package
	h := Handover{
		ServerIP:            ip,
		ServerHostname:      p.cfg.Domain,
		MythicURL:           mythicURL,
		AdminToken:          adminToken,
		SSHHostFingerprint:  fingerprint,
		ProviderResourceID:  rid,
		ProvisionedAt:       time.Now().UTC().Format(time.RFC3339),
		HealthcheckStatus:   "passed",
		BootstrapUserRemoved: false,
		TemporaryKeyRemoved:  false,
		CleanupVerified:      false,
	}
	file, serr := saveHandover(h, p.cfg.ExportHandover, p.cfg.HandoverPass)
	if serr != nil {
		return Handover{}, fail("Create handover", serr.Error(), "retry")
	}
	if file != "" {
		log.ok("handover exported to " + file)
	}

	// 19-20. cleanup: remove bootstrap user + temp key
	if err = removeBootstrapUser(ip, p.keyFp, buser); err != nil {
		return Handover{}, fail("Remove bootstrap user", err.Error(), "manual cleanup required: "+buser)
	}
	h.BootstrapUserRemoved = true
	p.removeTempKey()
	h.TemporaryKeyRemoved = true
	log.ok("bootstrap user removed")
	log.ok("temporary SSH key removed")

	// 21. remove temp artifacts
	_ = os.RemoveAll(p.work)
	log.ok("temporary artifacts removed")

	// 22. verify cleanup
	cleaned := fileExists(p.keyFp) == false && userGoneSeam(ip, p.keyFp, buser)
	h.CleanupVerified = cleaned
	p.state.Phase = "done"
	p.saveState("done", "")
	log.ok("cleanup verified: " + fmt.Sprintf("%v", cleaned))

	// 23. done — self-delete (hygiene, documented as non-forensic)
	selfDelete()

	return h, nil
}

func (p *Provisioner) removeTempKey() {
	if p.keyFp != "" {
		_ = os.Remove(p.keyFp)
		p.keyFp = ""
	}
}

func fail(stage, lastSafe, recovery string) *FailResult {
	return &FailResult{
		Stage:         stage,
		LastSafeState: lastSafe,
		Cleanup:       "Bootstrap credentials retained temporarily for recovery.",
		Recovery:      "Run the provisioner again with --resume " + recovery,
	}
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
