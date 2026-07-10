package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// hetznerProvider talks to the Hetzner Cloud API using only net/http.
// Documented network target: https://api.hetzner.cloud/v1 (plus the new server's IP).
type hetznerProvider struct {
	token string
	api   string
}

func newHetznerProvider(token, apiURL string) *hetznerProvider {
	if apiURL == "" {
		apiURL = "https://api.hetzner.cloud/v1"
	}
	return &hetznerProvider{token: token, api: apiURL}
}

func (h *hetznerProvider) do(method, path string, body interface{}) ([]byte, int, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, h.api+path, rdr)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+h.token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return data, resp.StatusCode, nil
}

func (h *hetznerProvider) Authenticate() error {
	// Listing servers is a cheap, side-effect-free auth check.
	_, code, err := h.do("GET", "/servers?per_page=1", nil)
	if err != nil {
		return err
	}
	if code == 401 {
		return fmt.Errorf("provider authentication failed (401): check token")
	}
	if code >= 400 {
		return fmt.Errorf("provider API error: status %d", code)
	}
	return nil
}

func (h *hetznerProvider) FindServer(name string) (string, string, error) {
	data, _, err := h.do("GET", "/servers?name="+name, nil)
	if err != nil {
		return "", "", err
	}
	var out struct {
		Servers []struct {
			ID        int    `json:"id"`
			Name      string `json:"name"`
			PublicNet struct {
				IPv4 struct {
					IP string `json:"ip"`
				} `json:"ipv4"`
			} `json:"public_net"`
		} `json:"servers"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return "", "", err
	}
	for _, s := range out.Servers {
		if s.Name == name {
			return fmt.Sprintf("server-%d", s.ID), s.PublicNet.IPv4.IP, nil
		}
	}
	return "", "", nil
}

func (h *hetznerProvider) CreateServer(name, serverType, region, image, sshPublicKey string) (string, string, error) {
	body := map[string]interface{}{
		"name":        name,
		"server_type": serverType,
		"location":    region,
		"image":       image,
		"ssh_keys":    []string{sshPublicKey},
		"public_net":  map[string]interface{}{"enable_ipv4": true},
	}
	data, code, err := h.do("POST", "/servers", body)
	if err != nil {
		return "", "", err
	}
	if code >= 400 {
		return "", "", fmt.Errorf("server creation failed: status %d body=%s", code, string(data))
	}
	var out struct {
		Server struct {
			ID        int `json:"id"`
			PublicNet struct {
				IPv4 struct {
					IP string `json:"ip"`
				} `json:"ipv4"`
			} `json:"public_net"`
		} `json:"server"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return "", "", err
	}
	return fmt.Sprintf("server-%d", out.Server.ID), out.Server.PublicNet.IPv4.IP, nil
}

func (h *hetznerProvider) ServerActive(resourceID string) (bool, error) {
	id := resourceID
	if len(id) > len("server-") && id[:7] == "server-" {
		id = id[7:]
	}
	data, code, err := h.do("GET", "/servers/"+id, nil)
	if err != nil {
		return false, err
	}
	if code == 404 {
		return false, nil
	}
	if code >= 400 {
		return false, fmt.Errorf("status %d", code)
	}
	var out struct {
		Server struct {
			Status string `json:"status"`
		} `json:"server"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return false, err
	}
	return out.Server.Status == "running", nil
}

func (h *hetznerProvider) DestroyServer(resourceID string) error {
	id := resourceID
	if len(id) > len("server-") && id[:7] == "server-" {
		id = id[7:]
	}
	_, code, err := h.do("DELETE", "/servers/"+id, nil)
	if err != nil {
		return err
	}
	if code == 404 {
		return nil
	}
	if code >= 400 {
		return fmt.Errorf("destroy failed: status %d", code)
	}
	return nil
}

// ensure interface compliance (helps catch drift at compile time)
var _ Provider = (*hetznerProvider)(nil)
