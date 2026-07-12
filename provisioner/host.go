package main

// host.go — the shared host-installation core (Workstream A0).
//
// Both provisioner entry modes converge here:
//
//   - New cloud machine  (Hetzner) → creation produces a HostTarget
//   - Existing machine   (homelab) → user input resolves a HostTarget
//
// Everything after a HostTarget exists (inspection, mutation planning,
// installation, health, handover, cleanup) MUST reuse this core rather than
// duplicating logic per mode. This file defines the seam; concrete
// implementations live in the mode files and the existing deploy/ssh seams.
//
// Boundary note (FABLE_FINAL_RUN §4.14): all host-control operations flow
// through these interfaces. UI and route code never touch Docker or SSH
// directly. The Docker-socket-backed implementation used today can later be
// replaced by a restricted on-host agent without changing any caller.

// HostOrigin records how a HostTarget came to exist.
type HostOrigin string

const (
	OriginCloud    HostOrigin = "cloud"    // provider-created (e.g. Hetzner)
	OriginExisting HostOrigin = "existing" // homelab / already-running machine
)

// HostTarget is the single addressable machine both modes install onto.
type HostTarget struct {
	Address     string     // hostname or IP
	Port        string     // SSH port ("22" default)
	User        string     // SSH login user
	KeyPath     string     // path to the private key authorized on the host
	Fingerprint string     // captured SSH host-key fingerprint (TOFU per run)
	Origin      HostOrigin // cloud | existing
	// UsesExistingKey is true when KeyPath is a permanent, user-owned key that
	// MYTHIC must NOT delete during cleanup (homelab). Cloud runs generate a
	// throwaway key which is always removed.
	UsesExistingKey bool
}

// PreflightStatus is the verdict of inspecting a host before any mutation.
type PreflightStatus string

const (
	PreflightReady            PreflightStatus = "READY"              // install can proceed unchanged
	PreflightReadyWithChanges PreflightStatus = "READY_WITH_CHANGES" // install can proceed after the listed changes
	PreflightBlocked          PreflightStatus = "BLOCKED"            // host cannot host MYTHIC as-is
)

// HostEnv classifies the machine so we can be honest about limitations.
type HostEnv string

const (
	EnvBareMetal HostEnv = "bare-metal"
	EnvVM        HostEnv = "vm"
	EnvContainer HostEnv = "container"
	EnvUnknown   HostEnv = "unknown"
)

// HostFacts is the non-secret snapshot gathered during preflight.
type HostFacts struct {
	OS                   string  `json:"os"`
	Arch                 string  `json:"arch"`
	Kernel               string  `json:"kernel"`
	Env                  HostEnv `json:"env"`
	CPUCount             int     `json:"cpu_count"`
	MemTotalMB           int     `json:"mem_total_mb"`
	DiskFreeMB           int     `json:"disk_free_mb"`
	DockerPresent        bool    `json:"docker_present"`
	ComposePresent       bool    `json:"compose_present"`
	Port80Free           bool    `json:"port_80_free"`
	Port443Free          bool    `json:"port_443_free"`
	ReverseProxyDetected bool    `json:"reverse_proxy_detected"`
}

// MutationStep is one change MYTHIC will make, shown to the user before it runs.
type MutationStep struct {
	Action string `json:"action"` // human-readable change
	Reason string `json:"reason"` // why it is needed
}

// HostMutationPlan is the approve-gated change plan produced from HostFacts.
type HostMutationPlan struct {
	Status   PreflightStatus `json:"status"`
	Facts    HostFacts       `json:"facts"`
	Steps    []MutationStep  `json:"steps"`    // exact changes (empty when READY)
	Blockers []string        `json:"blockers"` // populated when BLOCKED
}

// --- Shared installation-core interfaces (PROVISIONER_ENTRY_MODES §5) ---
//
// These document the seam both modes converge on. Schritt 1 implements
// HostInspector (homelab) and reuses the existing deploy/ssh seams behind
// HostControl. The remaining interfaces are defined here so later steps
// (cloud rebuild, health-gated handover) plug in without reshaping callers.

// HostInspector runs preflight and returns an approve-gated mutation plan.
type HostInspector interface {
	Inspect(t *HostTarget) (*HostMutationPlan, error)
}

// HostControl is the single interface through which every host-control
// operation flows (the future restricted-agent replacement seam, §4.14).
type HostControl interface {
	Run(t *HostTarget, command string) (string, error)
}

// MythicInstaller ensures Docker/Compose and installs the MYTHIC stack.
type MythicInstaller interface {
	Install(t *HostTarget, plan *HostMutationPlan, domain string) error
}

// AccessConfigurator wires the chosen exposure mode (LAN / proxy / public).
type AccessConfigurator interface {
	Configure(t *HostTarget, mode string) error
}

// HealthGate proves the appliance answers before COMPLETE is allowed.
type HealthGate interface {
	LocalHealthy(t *HostTarget) error
	PublicHealthy(url string) error
}

// CleanupCoordinator removes only credentials MYTHIC itself created.
type CleanupCoordinator interface {
	Cleanup(t *HostTarget) error
}

// sshHostControl is the default Docker-socket-backed HostControl. It routes
// through the existing testable SSH seam so tests can bypass a real host.
type sshHostControl struct{}

func (sshHostControl) Run(t *HostTarget, command string) (string, error) {
	if hookHomelabRun != nil {
		return hookHomelabRun(t, command)
	}
	return sshRunAt(t.Address, t.Port, t.User, t.KeyPath, command)
}
