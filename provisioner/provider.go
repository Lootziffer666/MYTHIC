package main

// Provider is the minimal contract for a cloud provider ("hands").
// Implementations must talk ONLY to the explicitly configured provider API.
type Provider interface {
	// Authenticate validates the token (no side effects).
	Authenticate() error
	// FindServer returns the resource id + ip if a server with this name already
	// exists (for idempotency / --resume). Both empty if none.
	FindServer(name string) (resourceID, ip string, err error)
	// RegisterSSHKey registers a temporary public key and returns the provider-side key ID/name.
	// Providers that do not need a separate resource may return the public key itself.
	RegisterSSHKey(name, publicKey string) (sshKeyID string, err error)
	// DeleteSSHKey removes a temporary provider-side SSH key resource when supported.
	DeleteSSHKey(sshKeyID string) error
	// CreateServer provisions a new server with key-based access from first boot and returns its resource id + ip.
	CreateServer(name, serverType, region, image, sshKeyID string) (resourceID, ip string, err error)
	// ServerActive reports whether the server is running and reachable enough to SSH.
	ServerActive(resourceID string) (bool, error)
	// DestroyServer deletes the server (used by --cleanup / --destroy-server-on-failure).
	DestroyServer(resourceID string) error
}
