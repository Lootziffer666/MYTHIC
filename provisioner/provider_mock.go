package main

import "fmt"

// mockProvider is a deterministic, dependency-free provider used by tests and
// by `provisioner --provider mock --dry-run`. It performs NO network calls.
type mockProvider struct {
	failCreate bool
	failActive bool
	resourceID string
	ip         string
	destroyed  bool
}

func newMockProvider() *mockProvider {
	return &mockProvider{resourceID: "server-1001", ip: "203.0.113.10"}
}

func (m *mockProvider) Authenticate() error { return nil }

func (m *mockProvider) FindServer(name string) (string, string, error) {
	if m.resourceID != "" && name != "" {
		// simulate idempotent re-detection only when a prior run set it
		return "", "", nil
	}
	return "", "", nil
}

func (m *mockProvider) RegisterSSHKey(name, publicKey string) (string, error) {
	if publicKey == "" {
		return "", fmt.Errorf("mock: empty ssh public key")
	}
	return "mock-ssh-key-1", nil
}

func (m *mockProvider) DeleteSSHKey(sshKeyID string) error { return nil }

func (m *mockProvider) CreateServer(name, serverType, region, image, sshKeyID string) (string, string, error) {
	if m.failCreate {
		return "", "", fmt.Errorf("mock: server creation rejected by provider")
	}
	return m.resourceID, m.ip, nil
}

func (m *mockProvider) ServerActive(resourceID string) (bool, error) {
	if m.failActive {
		return false, nil
	}
	return true, nil
}

func (m *mockProvider) DestroyServer(resourceID string) error {
	m.destroyed = true
	return nil
}

var _ Provider = (*mockProvider)(nil)

func (m *mockProvider) DiscoverCapabilities() (*ProviderCapabilities, error) {
	return &ProviderCapabilities{
		Locations:         []ProviderLocation{{Name: "mock-1", Description: "Mock region", Country: "ZZ"}},
		Images:            []ProviderImage{{Name: "ubuntu-24.04", Description: "Ubuntu 24.04", Architecture: "x86"}},
		ServerTypes:       []ProviderServerType{{Name: "mock-small", Description: "Mock small", CPU: 2, MemoryGB: 2, DiskGB: 40, Architecture: "x86", MonthlyEUR: 0}},
		RecommendedType:   "mock-small",
		RecommendedRegion: "mock-1",
		RecommendedImage:  "ubuntu-24.04",
	}, nil
}

var _ CapabilityDiscoverer = (*mockProvider)(nil)
