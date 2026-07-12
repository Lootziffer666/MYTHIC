package main

// Core data structures shared across the provisioner.

type ProviderConfig struct {
	Kind   string // "hetzner" | "mock"
	Token  string // provider API token ("hands") — never logged, never persisted in plaintext
	APIURL string // override for tests / private clouds
}

type BrainConfig struct {
	// LLM key ("brain"). The provisioner forwards it into MYTHIC's local secret
	// store and then forgets it. Never logged, never persisted in plaintext.
	LLMKey   string
	LLMBase  string // optional base URL (defaults to OpenAI-compatible)
	LLMModel string // optional default model
}

type Config struct {
	Provider       ProviderConfig
	Brain          BrainConfig
	ServerName     string
	ServerType     string // e.g. "cpx11"
	Region         string // e.g. "fsn1"
	Image          string // e.g. "ubuntu-24.04"
	Domain         string // FQDN for MYTHIC (sets mythic_url)
	SSHPublicKey   string // pre-existing key to inject (optional, alternative to generated key)
	KeepOnFail     bool
	DestroyOnFail  bool
	DryRun         bool
	ExportHandover bool
	HandoverPass   string // passphrase for encrypted export (optional)
	ReleaseChannel string // stable | development
	MythicImage    string // explicit image ref for development channel
	StateFile      string
	WorkDir        string
}

// Phase is one of the 23 ordered provisioning stages.
type Phase string

// Handover is the deliverable artifact. Secrets (admin token, ssh fingerprint)
// are produced at runtime and shown once; masked by default.
type Handover struct {
	ServerIP             string `json:"server_ip"`
	ServerHostname       string `json:"server_hostname"`
	MythicURL            string `json:"mythic_url"`
	AdminToken           string `json:"admin_token"` // one-time, single use
	SSHHostFingerprint   string `json:"ssh_host_fingerprint"`
	ProviderResourceID   string `json:"provider_resource_id"`
	ProvisionedAt        string `json:"provisioned_at"`
	HealthcheckStatus    string `json:"healthcheck_status"`
	BootstrapUserRemoved bool   `json:"bootstrap_user_removed"`
	TemporaryKeyRemoved  bool   `json:"temporary_key_removed"`
	CleanupVerified      bool   `json:"cleanup_verified"`
	MythicVersion        string `json:"mythic_version"`
	MythicImage          string `json:"mythic_image"`
	ReleaseChannel       string `json:"release_channel"`
}

// StageState is persisted locally so an interrupted run can --resume.
// IMPORTANT: it must never contain long-lived secrets in plaintext.
type StageState struct {
	Phase                   Phase  `json:"phase"`
	ProviderResourceID      string `json:"provider_resource_id"`
	ServerIP                string `json:"server_ip"`
	ServerName              string `json:"server_name"`
	SSHPublicKey            string `json:"ssh_public_key"`
	ProviderSSHKeyID        string `json:"provider_ssh_key_id"`
	MythicVersion           string `json:"mythic_version"`
	MythicImage             string `json:"mythic_image"`
	ReleaseChannel          string `json:"release_channel"`
	ReleaseChecksum         string `json:"release_checksum"`
	BootstrapUser           string `json:"bootstrap_user"`
	AdminToken              string `json:"admin_token"` // one-time, only needed for injection; cleared after use
	SSHHostFingerprintSaved string `json:"ssh_host_fingerprint"`
	MythicURL               string `json:"mythic_url"`
	CreatedAt               string `json:"created_at"`
	LastError               string `json:"last_error"`
}

// FailResult is returned on a non-recoverable error.
type FailResult struct {
	Stage         string
	LastSafeState string
	Cleanup       string
	Recovery      string
}
