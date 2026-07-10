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

func (m *mockProvider) CreateServer(name, serverType, region, image, sshPublicKey string) (string, string, error) {
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
