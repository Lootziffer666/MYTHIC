package main

import "fmt"

// deploy.go — install Docker + Docker Compose, write the MYTHIC compose stack
// (with the Docker socket mounted), start it, and verify health. All of this is
// executed over SSH on the new server; nothing here is simulated.
//
// Security note (documented, not hidden):
//   Mounting /var/run/docker.sock into MYTHIC is equivalent to granting broad
//   control over the host. For the first PoC this is acceptable and explicit.
//   The architecture isolates this behind the MYTHIC container so it can later
//   be replaced by a restricted host agent with a narrow API.

const composeYAML = `services:
  traefik:
    image: traefik:v3.2
    container_name: mythic_traefik
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@mythic.local"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "mythic_certs:/letsencrypt"
    networks: [mythic]
    restart: unless-stopped
  mythic:
    image: ghcr.io/lootziffer666/mythic:latest
    container_name: mythic
    environment:
      - MYTHIC_BASE_DOMAIN=%DOMAIN%
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
      - "mythic_data:/app/.deploy"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.mythic.rule=Host(\"%DOMAIN%\")"
      - "traefik.http.routers.mythic.entrypoints=websecure"
      - "traefik.http.routers.mythic.tls=true"
      - "traefik.http.routers.mythic.tls.certresolver=letsencrypt"
      - "traefik.http.services.mythic.loadbalancer.server.port=3000"
    networks: [mythic]
    depends_on: [traefik]
    restart: unless-stopped
networks:
  mythic:
    name: mythic
volumes:
  mythic_certs:
  mythic_data:
`

func waitForSSH(ip, keyPath string) error {
	for i := 0; i < 30; i++ {
		if _, err := runSSH(ip, "root", keyPath, "echo ok"); err == nil {
			return nil
		}
		sleep(3)
	}
	return fmt.Errorf("SSH not reachable after waiting")
}

func installDockerAndMythic(ip, keyPath, user, domain string) error {
	script := `
set -e
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
mkdir -p /opt/mythic
cat > /opt/mythic/docker-compose.yml <<'YAML'
` + indent(composeYAML, 2) + `
YAML
sed -i 's/%DOMAIN%/` + domain + `/g' /opt/mythic/docker-compose.yml
cd /opt/mythic && docker compose up -d
`
	if _, err := runSSH(ip, user, keyPath, "sudo bash -c "+shellQuote(script)); err != nil {
		return err
	}
	return nil
}

func waitForContainer(ip, keyPath, user string) error {
	script := `sudo docker inspect -f '{{.State.Health.Status}}' mythic 2>/dev/null || sudo docker ps --filter name=mythic --format '{{.Status}}'`
	for i := 0; i < 40; i++ {
		out, err := runSSH(ip, user, keyPath, script)
		if err == nil && (contains(out, "healthy") || contains(out, "Up")) {
			return nil
		}
		sleep(5)
	}
	return fmt.Errorf("MYTHIC container not healthy in time")
}

// userGone verifies the bootstrap user no longer exists (cleanup verification).
func userGone(ip, keyPath, user string) bool {
	if user == "" {
		return true
	}
	out, err := runSSH(ip, "root", keyPath, "id -u "+user+" 2>/dev/null || echo GONE")
	if err != nil {
		return false
	}
	return contains(out, "GONE")
}
