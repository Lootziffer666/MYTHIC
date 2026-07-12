package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
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

func (h *hetznerProvider) RegisterSSHKey(name, publicKey string) (string, error) {
	body := map[string]interface{}{
		"name":       name,
		"public_key": publicKey,
	}
	data, code, err := h.do("POST", "/ssh_keys", body)
	if err != nil {
		return "", err
	}
	if code >= 400 {
		return "", fmt.Errorf("ssh key registration failed: status %d body=%s", code, string(data))
	}
	var out struct {
		SSHKey struct {
			ID int `json:"id"`
		} `json:"ssh_key"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return "", err
	}
	if out.SSHKey.ID == 0 {
		return "", fmt.Errorf("ssh key registration returned no id")
	}
	return fmt.Sprintf("%d", out.SSHKey.ID), nil
}

func (h *hetznerProvider) DeleteSSHKey(sshKeyID string) error {
	if sshKeyID == "" {
		return nil
	}
	_, code, err := h.do("DELETE", "/ssh_keys/"+sshKeyID, nil)
	if err != nil {
		return err
	}
	if code == 404 {
		return nil
	}
	if code >= 400 {
		return fmt.Errorf("ssh key deletion failed: status %d", code)
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

func (h *hetznerProvider) CreateServer(name, serverType, region, image, sshKeyID string) (string, string, error) {
	body := map[string]interface{}{
		"name":        name,
		"server_type": serverType,
		"location":    region,
		"image":       image,
		"ssh_keys":    []string{sshKeyID},
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

func (h *hetznerProvider) DiscoverCapabilities() (*ProviderCapabilities, error) {
	locations, err := h.discoverLocations()
	if err != nil {
		return nil, err
	}
	images, err := h.discoverUbuntuImages()
	if err != nil {
		return nil, err
	}
	serverTypes, err := h.discoverServerTypes()
	if err != nil {
		return nil, err
	}
	caps := &ProviderCapabilities{
		Locations:         locations,
		Images:            images,
		ServerTypes:       serverTypes,
		RecommendedType:   recommendServerType(serverTypes),
		RecommendedRegion: recommendLocation(locations),
		RecommendedImage:  recommendImage(images),
	}
	return caps, nil
}

func (h *hetznerProvider) discoverLocations() ([]ProviderLocation, error) {
	data, code, err := h.do("GET", "/locations", nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("location discovery failed: status %d", code)
	}
	var out struct {
		Locations []struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Country     string `json:"country"`
		} `json:"locations"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	locations := make([]ProviderLocation, 0, len(out.Locations))
	for _, l := range out.Locations {
		locations = append(locations, ProviderLocation{Name: l.Name, Description: l.Description, Country: l.Country})
	}
	return locations, nil
}

func (h *hetznerProvider) discoverUbuntuImages() ([]ProviderImage, error) {
	data, code, err := h.do("GET", "/images?type=system&per_page=100", nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("image discovery failed: status %d", code)
	}
	var out struct {
		Images []struct {
			Name         string `json:"name"`
			Description  string `json:"description"`
			Architecture string `json:"architecture"`
			Status       string `json:"status"`
		} `json:"images"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	images := []ProviderImage{}
	for _, i := range out.Images {
		if !strings.Contains(strings.ToLower(i.Name), "ubuntu") || i.Status != "available" {
			continue
		}
		images = append(images, ProviderImage{Name: i.Name, Description: i.Description, Architecture: i.Architecture})
	}
	return images, nil
}

func (h *hetznerProvider) discoverServerTypes() ([]ProviderServerType, error) {
	data, code, err := h.do("GET", "/server_types?per_page=100", nil)
	if err != nil {
		return nil, err
	}
	if code >= 400 {
		return nil, fmt.Errorf("server type discovery failed: status %d", code)
	}
	var out struct {
		ServerTypes []struct {
			Name         string  `json:"name"`
			Description  string  `json:"description"`
			Cores        int     `json:"cores"`
			Memory       float64 `json:"memory"`
			Disk         int     `json:"disk"`
			Architecture string  `json:"architecture"`
			Prices       []struct {
				PriceMonthly struct {
					Gross string `json:"gross"`
				} `json:"price_monthly"`
			} `json:"prices"`
		} `json:"server_types"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	types := make([]ProviderServerType, 0, len(out.ServerTypes))
	for _, st := range out.ServerTypes {
		monthly := 0.0
		if len(st.Prices) > 0 {
			_, _ = fmt.Sscanf(st.Prices[0].PriceMonthly.Gross, "%f", &monthly)
		}
		types = append(types, ProviderServerType{Name: st.Name, Description: st.Description, CPU: st.Cores, MemoryGB: st.Memory, DiskGB: st.Disk, Architecture: st.Architecture, MonthlyEUR: monthly})
	}
	return types, nil
}

func recommendLocation(locations []ProviderLocation) string {
	for _, l := range locations {
		if l.Name == "fsn1" {
			return l.Name
		}
	}
	if len(locations) > 0 {
		return locations[0].Name
	}
	return ""
}

func recommendImage(images []ProviderImage) string {
	for _, i := range images {
		if i.Name == "ubuntu-24.04" {
			return i.Name
		}
	}
	if len(images) > 0 {
		return images[0].Name
	}
	return ""
}

func recommendServerType(types []ProviderServerType) string {
	for _, st := range types {
		if st.Name == "cpx11" {
			return st.Name
		}
	}
	for _, st := range types {
		if st.CPU >= 2 && st.MemoryGB >= 2 && st.Architecture == "x86" {
			return st.Name
		}
	}
	if len(types) > 0 {
		return types[0].Name
	}
	return ""
}

var _ CapabilityDiscoverer = (*hetznerProvider)(nil)
