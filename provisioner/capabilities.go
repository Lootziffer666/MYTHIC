package main

import "fmt"

// ProviderCapabilities is the non-secret provider snapshot shown before cloud
// creation so users can choose location/image/server size with an explicit cost
// expectation instead of accepting a hard-coded default.
type ProviderCapabilities struct {
	Locations         []ProviderLocation   `json:"locations"`
	Images            []ProviderImage      `json:"images"`
	ServerTypes       []ProviderServerType `json:"server_types"`
	RecommendedType   string               `json:"recommended_type"`
	RecommendedRegion string               `json:"recommended_region"`
	RecommendedImage  string               `json:"recommended_image"`
}

type ProviderLocation struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Country     string `json:"country"`
}

type ProviderImage struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	Architecture string `json:"architecture"`
}

type ProviderServerType struct {
	Name         string  `json:"name"`
	Description  string  `json:"description"`
	CPU          int     `json:"cpu"`
	MemoryGB     float64 `json:"memory_gb"`
	DiskGB       int     `json:"disk_gb"`
	Architecture string  `json:"architecture"`
	MonthlyEUR   float64 `json:"monthly_eur"`
}

// CapabilityDiscoverer is implemented by providers that can describe available
// regions, images, server types, and price metadata before resource creation.
type CapabilityDiscoverer interface {
	DiscoverCapabilities() (*ProviderCapabilities, error)
}

func printProviderCapabilities(c *ProviderCapabilities) {
	fmt.Println("\n=== MYTHIC PROVIDER CAPABILITIES ===")
	fmt.Printf("Recommended: type=%s region=%s image=%s\n", c.RecommendedType, c.RecommendedRegion, c.RecommendedImage)
	fmt.Println("\nLocations:")
	for _, l := range c.Locations {
		fmt.Printf("  - %s (%s) %s\n", l.Name, l.Country, l.Description)
	}
	fmt.Println("\nUbuntu images:")
	for _, i := range c.Images {
		fmt.Printf("  - %s [%s] %s\n", i.Name, i.Architecture, i.Description)
	}
	fmt.Println("\nServer types:")
	for _, st := range c.ServerTypes {
		price := "price unavailable"
		if st.MonthlyEUR > 0 {
			price = fmt.Sprintf("€%.2f/month", st.MonthlyEUR)
		}
		fmt.Printf("  - %s: %d vCPU, %.1f GB RAM, %d GB disk, %s, %s\n", st.Name, st.CPU, st.MemoryGB, st.DiskGB, st.Architecture, price)
	}
}
