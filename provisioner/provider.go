package main

// Provider is the minimal contract for a cloud provider ("hands").
// Implementations must talk ONLY to the explicitly configured provider API.
type Provider interface {
	// Authenticate validates the token (no side effects).
	Authenticate() error
	// FindServer returns the resource id + ip if a server with this name already
	// exists (for idempotency / --resume). Both empty if none.
	FindServer(name string) (resourceID, ip string, err error)
	// CreateServer provisions a new server and returns its resource id + ip.
	CreateServer(name, serverType, region, image, sshPublicKey string) (resourceID, ip string, err error)
	// ServerActive reports whether the server is running and reachable enough to SSH.
	ServerActive(resourceID string) (bool, error)
	// DestroyServer deletes the server (used by --cleanup / --destroy-server-on-failure).
	DestroyServer(resourceID string) error
}
