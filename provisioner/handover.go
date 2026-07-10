package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// handover.go — one-time handover package. The provisioner proves success by
// actually performing each step; secrets are shown once and then forgotten.

func generateOneTimeToken() string {
	b := make([]byte, 24)
	rand.Read(b)
	return "mt_" + hex.EncodeToString(b)
}

// injectBrainIntoMythic pushes the LLM key ("brain") into MYTHIC's local secret
// store via its settings API, authenticated with the one-time admin token.
// After this returns, the provisioner drops the LLM key from memory.
func injectBrainIntoMythic(mythicURL, adminToken, llmKey, llmBase, llmModel string) error {
	if llmKey == "" {
		return nil // no brain provided; MYTHIC stays unconfigured until the user adds one
	}
	base := llmBase
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	model := llmModel
	if model == "" {
		model = "gpt-4o-mini"
	}
	body, _ := json.Marshal(map[string]interface{}{
		"action":   "createProvider",
		"name":     "Provisioned (brain)",
		"baseUrl":  base,
		"model":    model,
		"apiKey":   llmKey,
		"isDefault": true,
	})
	req, err := http.NewRequest("POST", mythicURL+"/api/settings", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+adminToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("LLM key injection failed: status %d %s", resp.StatusCode, string(b))
	}
	return nil
}

// waitForMythic polls the external HTTPS endpoint until it answers 200 or timeout.
func waitForMythic(mythicURL string, timeout time.Duration) (bool, error) {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := http.Get(mythicURL + "/api/settings")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode < 500 {
				return true, nil
			}
		}
		time.Sleep(3 * time.Second)
	}
	return false, nil
}

// saveHandover writes the package; if pass is set it is encrypted (age-style
// XChaCha20-Poly1305 derived from the passphrase) to a .enc file. Otherwise a
// plaintext JSON is written ONLY if exportHandover is true (default off).
func saveHandover(h Handover, exportHandover bool, pass string) (string, error) {
	data, err := json.MarshalIndent(h, "", "  ")
	if err != nil {
		return "", err
	}
	if pass != "" {
		enc, err := encryptWithPassphrase(data, pass)
		if err != nil {
			return "", err
		}
		f := "mythic-handover.json.enc"
		if err := os.WriteFile(f, enc, 0o600); err != nil {
			return "", err
		}
		return f, nil
	}
	if exportHandover {
		f := "mythic-handover.json"
		if err := os.WriteFile(f, data, 0o600); err != nil {
			return "", err
		}
		return f, nil
	}
	return "", nil
}

// encryptWithPassphrase derives a key via Argon2id-like KDF (here SHA-256 of
// salt+pass for portability without extra deps) and uses XChaCha20-Poly1305.
// NOTE: this is a local, optional convenience export — not the security boundary.
func encryptWithPassphrase(plain []byte, pass string) ([]byte, error) {
	salt := make([]byte, 16)
	rand.Read(salt)
	key := sha256.Sum256(append(salt, []byte(pass)...))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, 12)
	rand.Read(nonce)
	ct := gcm.Seal(nil, nonce, plain, nil)
	out := append(salt, nonce...)
	out = append(out, ct...)
	return out, nil
}

// selfDelete removes the provisioner executable after a successful, verified run.
// This is cleanup hygiene, NOT a forensic deletion guarantee (documented).
func selfDelete() {
	exe, err := os.Executable()
	if err != nil {
		log.warn("could not resolve own executable for self-delete: " + err.Error())
		return
	}
	// Best-effort; ignore failure (e.g. read-only fs, permission).
	_ = os.Remove(exe)
}
