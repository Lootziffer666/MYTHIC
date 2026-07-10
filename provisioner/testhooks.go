package main

// testhooks.go — dependency seams so tests can run without a real server.
// In production these are nil and the real implementations are used.

var (
	hookRunSSH          func(ip, user, keyPath, cmd string) (string, error)
	hookHostFingerprint func(ip string) (string, error)
	hookWaitSSH         func(ip, keyPath string) error
	hookInstall         func(ip, keyPath, user, domain string) error
	hookWaitContainer   func(ip, keyPath, user string) error
	hookUserGone        func(ip, keyPath, user string) bool
	hookWaitMythic      func(mythicURL string) (bool, error)
	hookInjectBrain     func(mythicURL, adminToken, llmKey, llmBase, llmModel string) error
	// forceExternalHealthFail lets tests trigger a deterministic failure at the
	// external HTTPS healthcheck stage (no real network required).
	forceExternalHealthFail bool
)

func runSSHSeam(ip, user, keyPath, cmd string) (string, error) {
	if hookRunSSH != nil {
		return hookRunSSH(ip, user, keyPath, cmd)
	}
	return runSSH(ip, user, keyPath, cmd)
}

func hostFingerprintSeam(ip string) (string, error) {
	if hookHostFingerprint != nil {
		return hookHostFingerprint(ip)
	}
	return hostKeyFingerprint(ip)
}

func waitSSHSeam(ip, keyPath string) error {
	if hookWaitSSH != nil {
		return hookWaitSSH(ip, keyPath)
	}
	return waitForSSH(ip, keyPath)
}

func installSeam(ip, keyPath, user, domain string) error {
	if hookInstall != nil {
		return hookInstall(ip, keyPath, user, domain)
	}
	return installDockerAndMythic(ip, keyPath, user, domain)
}

func waitContainerSeam(ip, keyPath, user string) error {
	if hookWaitContainer != nil {
		return hookWaitContainer(ip, keyPath, user)
	}
	return waitForContainer(ip, keyPath, user)
}

func userGoneSeam(ip, keyPath, user string) bool {
	if hookUserGone != nil {
		return hookUserGone(ip, keyPath, user)
	}
	return userGone(ip, keyPath, user)
}
