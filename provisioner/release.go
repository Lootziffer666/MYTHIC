package main

import "fmt"

const defaultStableMythicImage = "ghcr.io/lootziffer666/mythic:stable"

// MythicRelease is the resolved install artifact. The provisioner installs a
// pinned channel/image reference instead of an unbounded moving branch.
type MythicRelease struct {
	Channel  string `json:"channel"`
	Version  string `json:"version"`
	Image    string `json:"image"`
	Checksum string `json:"checksum,omitempty"`
	DevInput bool   `json:"dev_input"`
}

func resolveMythicRelease(channel, imageOverride string) (MythicRelease, error) {
	if channel == "" {
		channel = "stable"
	}
	switch channel {
	case "stable":
		image := defaultStableMythicImage
		if imageOverride != "" {
			return MythicRelease{}, fmt.Errorf("custom --mythic-image requires --release-channel development")
		}
		return MythicRelease{Channel: channel, Version: "stable", Image: image}, nil
	case "development":
		if imageOverride == "" {
			return MythicRelease{}, fmt.Errorf("--release-channel development requires --mythic-image with an explicit image ref or digest")
		}
		return MythicRelease{Channel: channel, Version: "development", Image: imageOverride, DevInput: true}, nil
	default:
		return MythicRelease{}, fmt.Errorf("unknown release channel %q (expected stable or development)", channel)
	}
}
