package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"time"
)

// launcher.go — local browser launcher for the default human path.
// It binds loopback only, keeps credentials in the local process/browser form,
// and has no LAN or hosted setup surface. The CLI remains the automation path.

const launcherHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MYTHIC Provisioner</title>
  <style>
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background:#08070d; color:#f8f4ff; }
    main { max-width: 980px; margin: 0 auto; padding: 48px 20px; }
    .hero { border:1px solid rgba(255,255,255,.14); border-radius:28px; padding:32px; background:radial-gradient(circle at top left, rgba(154,92,255,.25), transparent 36%), #11101a; box-shadow:0 24px 80px rgba(0,0,0,.45); }
    h1 { margin:0 0 12px; font-size: clamp(34px, 6vw, 72px); letter-spacing:-.06em; }
    p { color:#c9c1d9; line-height:1.55; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; margin-top:22px; }
    .card { border:1px solid rgba(255,255,255,.12); border-radius:22px; padding:20px; background:rgba(255,255,255,.045); }
    label { display:block; margin:14px 0 6px; color:#e9ddff; font-weight:700; }
    input, select { width:100%; box-sizing:border-box; border-radius:14px; border:1px solid rgba(255,255,255,.18); background:#07070c; color:#fff; padding:12px 14px; }
    button { border:0; border-radius:999px; padding:13px 18px; margin-top:16px; font-weight:800; color:#12091f; background:linear-gradient(135deg,#fff,#b894ff); cursor:pointer; }
    code { color:#d8c5ff; }
    .muted { font-size:13px; color:#9d94ad; }
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="muted">Local loopback setup · {{.Address}} · no hosted MYTHIC control plane</p>
    <h1>MYTHIC Provisioner</h1>
    <p>Choose how MYTHIC receives temporary abilities. <strong>Brain</strong> is optional OpenAI-compatible LLM access. <strong>Hands</strong> is only needed when MYTHIC creates a new cloud machine. Existing-machine mode never asks for a provider token.</p>
    <div class="grid">
      <div class="card">
        <h2>1. Entry mode</h2>
        <label for="mode">Where should MYTHIC install?</label>
        <select id="mode" name="mode">
          <option value="homelab">Use an existing machine / homelab</option>
          <option value="cloud">Create a new Hetzner cloud machine</option>
        </select>
        <p class="muted">No provider token is requested before this decision.</p>
      </div>
      <div class="card">
        <h2>2. Brain (optional)</h2>
        <label for="brain">LLM API key</label>
        <input id="brain" type="password" autocomplete="off" placeholder="optional" />
        <label for="brainBase">OpenAI-compatible base URL</label>
        <input id="brainBase" placeholder="https://api.openai.com/v1" />
        <p class="muted">Used only to seed MYTHIC's local provider settings after handover.</p>
      </div>
      <div class="card">
        <h2>3. Hands (cloud only)</h2>
        <label for="hands">Hetzner API token</label>
        <input id="hands" type="password" autocomplete="off" placeholder="required only for new cloud machine" />
        <label for="providerApi">Provider API URL override</label>
        <input id="providerApi" placeholder="optional" />
        <button id="discover" type="button">Discover Hetzner options</button>
        <p class="muted">Kept in this local setup session; never sent to a MYTHIC-operated service.</p>
      </div>
    </div>
    <pre id="capabilities" class="card muted" aria-live="polite">Capability discovery output will appear here.</pre>
    <p class="muted">This launcher slice performs read-only provider discovery and local preflight guidance only. Mutating install actions still require the CLI until the approval-gated browser flow is wired end to end.</p>
    <form method="post" action="/cancel"><button type="submit">Close launcher</button></form>
  </section>
</main>
<script>
const out = document.getElementById('capabilities');
document.getElementById('discover').addEventListener('click', async () => {
  out.textContent = 'Discovering provider capabilities…';
  const res = await fetch('/api/capabilities', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      provider: 'hetzner',
      hands: document.getElementById('hands').value,
      apiUrl: document.getElementById('providerApi').value
    })
  });
  const data = await res.json();
  if (!res.ok) {
    out.textContent = data.error || 'Capability discovery failed';
    return;
  }
  out.textContent = JSON.stringify(data, null, 2);
});
</script>
</body>
</html>`

type launcherPage struct{ Address string }

type launcherCapabilityRequest struct {
	Provider string `json:"provider"`
	Hands    string `json:"hands"`
	APIURL   string `json:"apiUrl"`
}

func writeLauncherError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func runLauncher() error {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	addr := ln.Addr().String()
	tmpl := template.Must(template.New("launcher").Parse(launcherHTML))
	server := &http.Server{ReadHeaderTimeout: 5 * time.Second}
	mux := http.NewServeMux()
	server.Handler = mux

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = tmpl.Execute(w, launcherPage{Address: "http://" + addr})
	})
	mux.HandleFunc("/api/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req launcherCapabilityRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeLauncherError(w, http.StatusBadRequest, "invalid request body")
			return
		}
		providerKind := req.Provider
		if providerKind == "" {
			providerKind = "hetzner"
		}
		p := &Provisioner{cfg: Config{Provider: ProviderConfig{Kind: providerKind, Token: req.Hands, APIURL: req.APIURL}}}
		prov, err := p.providerFor()
		if err != nil {
			writeLauncherError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := prov.Authenticate(); err != nil {
			writeLauncherError(w, http.StatusUnauthorized, err.Error())
			return
		}
		disc, ok := prov.(CapabilityDiscoverer)
		if !ok {
			writeLauncherError(w, http.StatusBadRequest, "provider does not support capability discovery")
			return
		}
		caps, err := disc.DiscoverCapabilities()
		if err != nil {
			writeLauncherError(w, http.StatusBadGateway, err.Error())
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(caps)
	})

	mux.HandleFunc("/cancel", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "MYTHIC Provisioner launcher closed. You can close this tab.")
		go func() {
			time.Sleep(150 * time.Millisecond)
			_ = server.Shutdown(context.Background())
		}()
	})

	url := "http://" + addr
	log.ok("launcher bound to loopback only: " + url)
	openBrowser(url)
	if err := server.Serve(ln); err != nil && err != http.ErrServerClosed {
		return err
	}
	log.ok("launcher closed")
	return nil
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.warn("could not open browser automatically; visit " + url)
	}
}
