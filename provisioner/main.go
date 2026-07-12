package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

// main.go — entry point. Two inputs from the user: the LLM key ("brain") and the
// provider token ("hands"). Everything else is deterministic.
//
//   mythic-provisioner \
//     --brain <LLM-KEY> --brain-base <URL> --brain-model <MODEL> \
//     --hands <PROVIDER-TOKEN> --provider hetzner \
//     --server-name mythic-1 --type cpx11 --region fsn1 --image ubuntu-24.04 \
//     --domain mythic.example.com
//
// Secrets may also be passed via files (--brain-file / --hands-file) or env
// (MYTHIC_BRAIN / MYTHIC_HANDS) so they never appear on the command line or in
// the process list / shell history.

func main() {
	var (
		brain       = flag.String("brain", envOr("", "MYTHIC_BRAIN"), "LLM API key (brain) — never logged")
		brainFile   = flag.String("brain-file", "", "file containing the LLM key")
		brainBase   = flag.String("brain-base", "", "LLM base URL (optional)")
		brainModel  = flag.String("brain-model", "gpt-4o-mini", "LLM default model")
		hands       = flag.String("hands", envOr("", "MYTHIC_HANDS"), "provider API token (hands) — never logged")
		handsFile   = flag.String("hands-file", "", "file containing the provider token")
		provider    = flag.String("provider", "hetzner", "provider kind: hetzner | mock")
		apiURL      = flag.String("provider-api", "", "provider API URL override")
		serverName  = flag.String("server-name", "mythic-1", "server/resource name")
		stype       = flag.String("type", "cpx11", "server type")
		region      = flag.String("region", "fsn1", "region/location")
		image       = flag.String("image", "ubuntu-24.04", "image")
		domain      = flag.String("domain", "", "FQDN for MYTHIC (sets mythic_url)")
		sshPub      = flag.String("ssh-pub", "", "pre-existing public key to inject (optional)")
		dryRun      = flag.Bool("dry-run", false, "validate + plan, perform no remote changes")
		resume      = flag.Bool("resume", false, "resume from local state file")
		status      = flag.Bool("status", false, "print last local state and exit")
		cleanup     = flag.Bool("cleanup", false, "destroy the provisioned server and exit")
		keepFail    = flag.Bool("keep-server-on-failure", false, "do not destroy server on failure")
		destroyFail = flag.Bool("destroy-server-on-failure", false, "destroy server on failure")
		exportHand  = flag.Bool("export-handover", false, "write plaintext handover JSON (default off)")
		handPass    = flag.String("handover-pass", "", "passphrase to encrypt handover export")
		stateFile   = flag.String("state-file", "mythic-provision-state.json", "local state file")
		mode        = flag.String("mode", "cloud", "entry mode: cloud (new machine) | homelab (existing machine)")
		hlHost      = flag.String("host", "", "homelab: existing machine hostname or IP")
		hlPort      = flag.String("ssh-port", "22", "homelab: SSH port")
		hlUser      = flag.String("ssh-user", "root", "homelab: SSH user")
		hlKey       = flag.String("ssh-key", "", "homelab: private key file (default: discover ~/.ssh key)")
	)
	flag.Parse()

	// --mode homelab: existing-machine preflight (no cloud token required).
	if *mode == "homelab" {
		if err := runHomelabPreflight(HomelabInput{
			Host:    *hlHost,
			SSHPort: *hlPort,
			SSHUser: *hlUser,
			KeyPath: *hlKey,
		}); err != nil {
			fatal(err.Error())
		}
		return
	}

	// --status
	if *status {
		printStatus(*stateFile)
		return
	}

	// resolve secrets from files if provided
	if *brainFile != "" {
		b, err := os.ReadFile(*brainFile)
		if err != nil {
			fatal("read brain-file: " + err.Error())
		}
		*brain = string(b)
	}
	if *handsFile != "" {
		h, err := os.ReadFile(*handsFile)
		if err != nil {
			fatal("read hands-file: " + err.Error())
		}
		*hands = string(h)
	}

	cfg := Config{
		Provider:       ProviderConfig{Kind: *provider, Token: *hands, APIURL: *apiURL},
		Brain:          BrainConfig{LLMKey: *brain, LLMBase: *brainBase, LLMModel: *brainModel},
		ServerName:     *serverName,
		ServerType:     *stype,
		Region:         *region,
		Image:          *image,
		Domain:         *domain,
		SSHPublicKey:   *sshPub,
		KeepOnFail:     *keepFail,
		DestroyOnFail:  *destroyFail,
		DryRun:         *dryRun,
		ExportHandover: *exportHand,
		HandoverPass:   *handPass,
		StateFile:      *stateFile,
	}

	// --cleanup
	if *cleanup {
		doCleanup(cfg)
		return
	}

	if *domain == "" && *provider != "mock" {
		fatal("--domain is required (FQDN for MYTHIC)")
	}

	p, err := newProvisioner(cfg)
	if err != nil {
		fatal(err.Error())
	}

	// --resume: continue from saved state
	if *resume {
		if !p.loadState() {
			fatal("no resumable state found at " + *stateFile)
		}
	}

	handover, failRes := p.Run()
	if failRes != nil {
		fmt.Fprintf(os.Stderr, "\nFAILED\nStage: %s\nLast safe state: %s\nCleanup: %s\nRecovery: %s\n",
			failRes.Stage, failRes.LastSafeState, failRes.Cleanup, failRes.Recovery)
		// honor cleanup preferences
		if cfg.DestroyOnFail {
			if prov, e := p.providerFor(); e == nil {
				_ = prov.DestroyServer(p.state.ProviderResourceID)
			}
		}
		os.Exit(1)
	}

	// success — print masked handover, reveal admin token once
	printHandover(handover)
}

func printStatus(stateFile string) {
	data, err := os.ReadFile(stateFile)
	if err != nil {
		fmt.Println("no state file:", stateFile)
		return
	}
	var s StageState
	if err := json.Unmarshal(data, &s); err != nil {
		fatal("corrupt state file")
	}
	fmt.Printf("Phase: %s\nServer: %s (%s)\nResource: %s\nFingerprint: %s\n",
		s.Phase, s.ServerName, s.ServerIP, s.ProviderResourceID, s.SSHHostFingerprintSaved)
	if s.LastError != "" {
		fmt.Println("Last error:", s.LastError)
	}
}

func doCleanup(cfg Config) {
	p, err := newProvisioner(cfg)
	if err != nil {
		fatal(err.Error())
	}
	if !p.loadState() {
		fatal("no state to clean up")
	}
	prov, err := p.providerFor()
	if err != nil {
		fatal(err.Error())
	}
	if err := prov.DestroyServer(p.state.ProviderResourceID); err != nil {
		fatal("destroy failed: " + err.Error())
	}
	_ = os.Remove(cfg.StateFile)
	log.ok("server " + p.state.ProviderResourceID + " destroyed; state file removed")
}

func printHandover(h Handover) {
	fmt.Println("\n=== MYTHIC HANDOVER ===")
	fmt.Printf("Server IP:        %s\n", h.ServerIP)
	fmt.Printf("Hostname:         %s\n", h.ServerHostname)
	fmt.Printf("MYTHIC URL:       %s\n", h.MythicURL)
	fmt.Printf("SSH fingerprint:  %s\n", h.SSHHostFingerprint)
	fmt.Printf("Resource ID:      %s\n", h.ProviderResourceID)
	fmt.Printf("Healthcheck:      %s\n", h.HealthcheckStatus)
	fmt.Printf("Bootstrap removed:%v\n", h.BootstrapUserRemoved)
	fmt.Printf("Temp key removed: %v\n", h.TemporaryKeyRemoved)
	fmt.Printf("Cleanup verified: %v\n", h.CleanupVerified)
	fmt.Println("\nOne-time admin token (single use — set a permanent secret on first login):")
	fmt.Printf("  %s\n", h.AdminToken)
}

func envOr(def, key string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, "FATAL:", msg)
	os.Exit(1)
}
