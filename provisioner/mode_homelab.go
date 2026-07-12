package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// mode_homelab.go — the existing-machine / homelab entry mode (Workstream A2).
//
// This is the shortest path and a complete product mode, not a reduced
// fallback. It requires only: host/IP, SSH port, SSH user, and one
// user-approved authentication method. It NEVER asks for a cloud-provider
// token, never touches Gmail, and never requires a public domain or public IP.
//
// Schritt 1 delivers the front half of the homelab flow:
//
//   INPUT -> SSH_VERIFIED -> HOST_INSPECTED -> (change plan shown)
//
// i.e. resolve the target, capture the host fingerprint, inspect the host, and
// present the exact approve-gated change plan (READY | READY_WITH_CHANGES |
// BLOCKED). The mutating tail (HOST_PREPARED -> ... -> COMPLETE) reuses the
// shared installer seam and is wired in the following step.

// hookHomelabRun lets tests drive the inspector without a real SSH host,
// mirroring the existing testhooks.go seam pattern.
var hookHomelabRun func(t *HostTarget, command string) (string, error)

// HomelabInput is the minimal user-supplied configuration for an existing host.
type HomelabInput struct {
	Host    string // hostname or IP (required)
	SSHPort string // default "22"
	SSHUser string // default "root"
	KeyPath string // explicit private-key file; empty => discover a default key
}

// resolveHomelabTarget turns user input into a verified HostTarget: it locates a
// usable key, captures the host fingerprint (TOFU for this run), and confirms
// SSH actually answers. A pre-existing permanent key is flagged so cleanup never
// deletes it.
func resolveHomelabTarget(in HomelabInput) (*HostTarget, error) {
	if strings.TrimSpace(in.Host) == "" {
		return nil, fmt.Errorf("homelab host (hostname or IP) is required")
	}
	port := in.SSHPort
	if port == "" {
		port = "22"
	}
	user := in.SSHUser
	if user == "" {
		user = "root"
	}

	keyPath, existing, err := resolveHomelabKey(in.KeyPath)
	if err != nil {
		return nil, err
	}

	t := &HostTarget{
		Address:         in.Host,
		Port:            port,
		User:            user,
		KeyPath:         keyPath,
		Origin:          OriginExisting,
		UsesExistingKey: existing,
	}

	// SSH_VERIFIED: capture host fingerprint, then prove auth works.
	fp, err := hostKeyFingerprintAt(in.Host, port, user)
	if err != nil {
		return nil, fmt.Errorf("could not reach %s:%s over SSH: %w", in.Host, port, err)
	}
	t.Fingerprint = fp
	log.ok("SSH host fingerprint captured: " + fp)

	ctrl := sshHostControl{}
	if _, err := ctrl.Run(t, "echo mythic-ssh-ok"); err != nil {
		return nil, fmt.Errorf("SSH authentication to %s@%s failed: %w", user, in.Host, err)
	}
	log.ok("SSH authentication verified")
	return t, nil
}

// resolveHomelabKey returns the private-key path to use and whether it is a
// pre-existing, user-owned key (which must never be removed during cleanup).
func resolveHomelabKey(explicit string) (path string, existing bool, err error) {
	if explicit != "" {
		if _, e := os.Stat(explicit); e != nil {
			return "", false, fmt.Errorf("ssh key not found at %s: %w", explicit, e)
		}
		return explicit, true, nil
	}
	home, e := os.UserHomeDir()
	if e != nil {
		return "", false, fmt.Errorf("no --ssh-key given and home dir unknown: %w", e)
	}
	for _, name := range []string{"id_ed25519", "id_rsa", "id_ecdsa"} {
		cand := filepath.Join(home, ".ssh", name)
		if _, e := os.Stat(cand); e == nil {
			return cand, true, nil
		}
	}
	return "", false, fmt.Errorf("no --ssh-key given and no default key found in %s/.ssh", home)
}

// hostInspectScript gathers a non-secret host snapshot in one round trip. Output
// is stable key=value lines so parsing stays deterministic and testable.
const hostInspectScript = `
echo "os=$(. /etc/os-release 2>/dev/null; echo ${PRETTY_NAME:-unknown})"
echo "arch=$(uname -m 2>/dev/null || echo unknown)"
echo "kernel=$(uname -sr 2>/dev/null || echo unknown)"
echo "cpu=$(nproc 2>/dev/null || echo 0)"
echo "mem_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)"
echo "disk_mb=$(df -Pm / 2>/dev/null | awk 'NR==2{print $4}')"
echo "docker=$(command -v docker >/dev/null 2>&1 && echo yes || echo no)"
echo "compose=$(docker compose version >/dev/null 2>&1 && echo yes || echo no)"
echo "port80=$( (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ':80 ' && echo used || echo free)"
echo "port443=$( (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ':443 ' && echo used || echo free)"
echo "proxy=$( (command -v traefik >/dev/null 2>&1 || docker ps 2>/dev/null | grep -Eiq 'traefik|nginx|caddy|haproxy') && echo yes || echo no)"
echo "virt=$(systemd-detect-virt 2>/dev/null || echo unknown)"
`

// sshHostInspector is the default HostInspector: it runs the inspection script
// over the shared HostControl seam and derives an approve-gated mutation plan.
type sshHostInspector struct{ ctrl HostControl }

func (i sshHostInspector) Inspect(t *HostTarget) (*HostMutationPlan, error) {
	out, err := i.ctrl.Run(t, hostInspectScript)
	if err != nil {
		return nil, fmt.Errorf("host inspection failed: %w", err)
	}
	facts := parseHostFacts(out)
	return buildMutationPlan(facts), nil
}

func parseHostFacts(out string) HostFacts {
	kv := map[string]string{}
	for _, line := range strings.Split(out, "\n") {
		if i := strings.IndexByte(line, '='); i > 0 {
			kv[strings.TrimSpace(line[:i])] = strings.TrimSpace(line[i+1:])
		}
	}
	atoi := func(s string) int { n, _ := strconv.Atoi(strings.TrimSpace(s)); return n }

	env := EnvUnknown
	switch v := kv["virt"]; {
	case v == "none":
		env = EnvBareMetal
	case v == "" || v == "unknown":
		env = EnvUnknown
	case strings.Contains(v, "lxc") || strings.Contains(v, "docker") || strings.Contains(v, "openvz") || strings.Contains(v, "podman"):
		env = EnvContainer
	default:
		env = EnvVM
	}

	return HostFacts{
		OS:                   kv["os"],
		Arch:                 kv["arch"],
		Kernel:               kv["kernel"],
		Env:                  env,
		CPUCount:             atoi(kv["cpu"]),
		MemTotalMB:           atoi(kv["mem_mb"]),
		DiskFreeMB:           atoi(kv["disk_mb"]),
		DockerPresent:        kv["docker"] == "yes",
		ComposePresent:       kv["compose"] == "yes",
		Port80Free:           kv["port80"] == "free",
		Port443Free:          kv["port443"] == "free",
		ReverseProxyDetected: kv["proxy"] == "yes",
	}
}

// buildMutationPlan turns facts into the exact, approve-gated change list.
// Minimum viable baseline only — no general server hardening (FABLE §4.5).
func buildMutationPlan(f HostFacts) *HostMutationPlan {
	plan := &HostMutationPlan{Facts: f}

	// Hard blockers: an unsupported host cannot run a MYTHIC appliance.
	if f.Arch != "x86_64" && f.Arch != "aarch64" && f.Arch != "arm64" {
		plan.Blockers = append(plan.Blockers, "unsupported CPU architecture: "+orUnknown(f.Arch))
	}
	if f.Env == EnvContainer {
		plan.Blockers = append(plan.Blockers, "host appears to be a container; MYTHIC needs a Docker-capable VM or bare-metal host")
	}
	if f.MemTotalMB > 0 && f.MemTotalMB < 512 {
		plan.Blockers = append(plan.Blockers, fmt.Sprintf("insufficient memory: %d MB (need >= 512 MB)", f.MemTotalMB))
	}
	if f.DiskFreeMB > 0 && f.DiskFreeMB < 2048 {
		plan.Blockers = append(plan.Blockers, fmt.Sprintf("insufficient free disk: %d MB (need >= 2048 MB)", f.DiskFreeMB))
	}

	// Changes MYTHIC would make (READY_WITH_CHANGES).
	if !f.DockerPresent {
		plan.Steps = append(plan.Steps, MutationStep{
			Action: "Install Docker Engine",
			Reason: "MYTHIC deploys apps as Docker containers",
		})
	}
	if !f.ComposePresent {
		plan.Steps = append(plan.Steps, MutationStep{
			Action: "Install the Docker Compose plugin",
			Reason: "the MYTHIC stack is defined as a compose project",
		})
	}
	plan.Steps = append(plan.Steps, MutationStep{
		Action: "Create /opt/mythic and the 'mythic' Docker network",
		Reason: "persistent stack directory and isolated app network",
	})
	if f.ReverseProxyDetected {
		plan.Steps = append(plan.Steps, MutationStep{
			Action: "Attach MYTHIC to the detected reverse proxy instead of binding :80/:443",
			Reason: "an existing proxy was found; avoid port conflicts (choose exposure at install)",
		})
	}

	switch {
	case len(plan.Blockers) > 0:
		plan.Status = PreflightBlocked
	case len(plan.Steps) == 0:
		plan.Status = PreflightReady
	default:
		plan.Status = PreflightReadyWithChanges
	}
	return plan
}

func orUnknown(s string) string {
	if s == "" {
		return "unknown"
	}
	return s
}

// runHomelabPreflight is the CLI entry for `--mode homelab`: it resolves the
// target, inspects it, and prints the approve-gated plan. It performs no
// mutation — the exact changes are shown before anything proceeds.
func runHomelabPreflight(in HomelabInput) error {
	log.info("homelab mode: existing-machine preflight (no cloud token, no changes yet)")
	t, err := resolveHomelabTarget(in)
	if err != nil {
		return err
	}
	inspector := sshHostInspector{ctrl: sshHostControl{}}
	plan, err := inspector.Inspect(t)
	if err != nil {
		return err
	}
	printMutationPlan(t, plan)
	return nil
}

func printMutationPlan(t *HostTarget, plan *HostMutationPlan) {
	f := plan.Facts
	fmt.Println("\n=== MYTHIC HOMELAB PREFLIGHT ===")
	fmt.Printf("Target:      %s@%s:%s\n", t.User, t.Address, t.Port)
	fmt.Printf("Fingerprint: %s\n", t.Fingerprint)
	fmt.Printf("OS:          %s (%s, %s)\n", orUnknown(f.OS), orUnknown(f.Arch), f.Env)
	fmt.Printf("Resources:   %d vCPU, %d MB RAM, %d MB free disk\n", f.CPUCount, f.MemTotalMB, f.DiskFreeMB)
	fmt.Printf("Docker:      present=%v compose=%v\n", f.DockerPresent, f.ComposePresent)
	fmt.Printf("Ports:       80 free=%v, 443 free=%v; existing proxy=%v\n", f.Port80Free, f.Port443Free, f.ReverseProxyDetected)
	fmt.Printf("\nStatus:      %s\n", plan.Status)

	if len(plan.Blockers) > 0 {
		fmt.Println("\nBlockers (must be resolved first):")
		for _, b := range plan.Blockers {
			fmt.Printf("  - %s\n", b)
		}
	}
	if len(plan.Steps) > 0 {
		fmt.Println("\nChanges MYTHIC will make (shown before proceeding):")
		for _, s := range plan.Steps {
			fmt.Printf("  - %s\n      why: %s\n", s.Action, s.Reason)
		}
	}
	if plan.Status == PreflightReady {
		fmt.Println("\nHost is ready; no changes required before installation.")
	}

	// Machine-readable form for automation / the future browser launcher.
	if data, err := json.MarshalIndent(plan, "", "  "); err == nil {
		fmt.Printf("\nplan.json:\n%s\n", string(data))
	}
}
