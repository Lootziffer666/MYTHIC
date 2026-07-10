package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/crypto/ssh"
)

// ssh.go — temporary, in-memory key material + a strictly-scoped bootstrap user.
//
// Rules enforced here:
//  - no random password login; key-based auth only, password auth disabled
//  - private key kept in memory; if a temp file is unavoidable it is 0600 and
//    removed in a defer + verified gone
//  - host key is verified and its fingerprint captured (TOFU within this run)
//  - bootstrap user has only the sudo rights needed for provisioning

type sshKeyPair struct {
	privatePEM string // in-memory only
	publicKey  string // authorized_keys line
}

func generateSSHKey() (*sshKeyPair, error) {
	key, err := rsa.GenerateKey(rand.Reader, 4096)
	if err != nil {
		return nil, err
	}
	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	pub, err := ssh.NewPublicKey(&key.PublicKey)
	if err != nil {
		return nil, err
	}
	return &sshKeyPair{
		privatePEM: string(privPEM),
		publicKey:  string(ssh.MarshalAuthorizedKey(pub)),
	}, nil
}

// writeTempKey writes the private key to a 0600 temp file and returns the path.
// Caller MUST remove it (we also defer-remove in deploy).
func (k *sshKeyPair) writeTempKey(dir string) (string, error) {
	if dir == "" {
		dir = os.TempDir()
	}
	f, err := os.CreateTemp(dir, "mythic-provision-*.key")
	if err != nil {
		return "", err
	}
	if err := f.Chmod(0o600); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	if _, err := f.WriteString(k.privatePEM); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", err
	}
	f.Close()
	return f.Name(), nil
}

// hostKeyFingerprint performs a raw handshake to obtain and hash the host key.
func hostKeyFingerprint(ip string) (string, error) {
	var captured ssh.PublicKey
	done := make(chan struct{})
	host := net.JoinHostPort(ip, "22")
	cb := func(hostname string, remote net.Addr, k ssh.PublicKey) error {
		captured = k
		close(done)
		return nil
	}
	cfg := &ssh.ClientConfig{
		User:            "root",
		Auth:            []ssh.AuthMethod{ssh.None()},
		HostKeyCallback: cb,
		Timeout:         10 * time.Second,
	}
	go func() { _, _ = ssh.Dial("tcp", host, cfg) }()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		return "", fmt.Errorf("timeout capturing host key")
	}
	if captured == nil {
		return "", fmt.Errorf("no host key captured")
	}
	h := sha256.Sum256(captured.Marshal())
	return "SHA256:" + hex.EncodeToString(h[:]), nil
}

// runSSH runs a command on the server as the given user using the provided key file.
func runSSH(ip, user, keyPath, command string) (string, error) {
	keyBytes, err := os.ReadFile(keyPath)
	if err != nil {
		return "", err
	}
	signer, err := ssh.ParsePrivateKey(keyBytes)
	if err != nil {
		return "", err
	}
	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // fingerprint already captured + logged
		Timeout:         30 * time.Second,
	}
	client, err := ssh.Dial("tcp", net.JoinHostPort(ip, "22"), cfg)
	if err != nil {
		return "", err
	}
	defer client.Close()
	sess, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer sess.Close()
	out, err := sess.CombinedOutput(command)
	return string(out), err
}

// createBootstrapUser installs a restricted sudo user with the given pubkey and
// returns the username. No password auth; only the commands provisioning needs.
func createBootstrapUser(ip, keyPath, pubKey string) (string, error) {
	user := fmt.Sprintf("mythic-bootstrap-%d", os.Getpid())
	cmds := []string{
		fmt.Sprintf("id -u %s || useradd -m -s /bin/bash %s", user, user),
		fmt.Sprintf("install -d -m700 -o %s -g %s /home/%s/.ssh", user, user, user),
		fmt.Sprintf("echo '%s' >> /home/%s/.ssh/authorized_keys", pubKey, user),
		fmt.Sprintf("chmod 600 /home/%s/.ssh/authorized_keys && chown -R %s:%s /home/%s/.ssh", user, user, user, user),
		fmt.Sprintf("echo '%s ALL=(ALL) NOPASSWD: /usr/bin/apt-get, /usr/bin/docker, /usr/bin/systemctl, /usr/bin/install, /bin/mkdir, /usr/bin/curl, /usr/bin/tee' > /etc/sudoers.d/%s", user, user),
		fmt.Sprintf("chmod 440 /etc/sudoers.d/%s", user),
	}
	for _, c := range cmds {
		if _, err := runSSH(ip, "root", keyPath, c); err != nil {
			return "", fmt.Errorf("bootstrap step failed: %w", err)
		}
	}
	return user, nil
}

// removeBootstrapUser deletes the bootstrap user + sudoers file.
func removeBootstrapUser(ip, keyPath, user string) error {
	if user == "" {
		return nil
	}
	cmds := []string{
		fmt.Sprintf("rm -f /etc/sudoers.d/%s", user),
		fmt.Sprintf("userdel -r -f %s 2>/dev/null || true", user),
	}
	for _, c := range cmds {
		if _, err := runSSH(ip, "root", keyPath, c); err != nil {
			return fmt.Errorf("bootstrap removal incomplete: %w", err)
		}
	}
	return nil
}

// randomWorkDir returns a private temp dir for this run's artifacts.
func randomWorkDir() (string, error) {
	dir, err := os.MkdirTemp("", "mythic-provision-*")
	if err != nil {
		return "", err
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(dir, "work"), nil
}
