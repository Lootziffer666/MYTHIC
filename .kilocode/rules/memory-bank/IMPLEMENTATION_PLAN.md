# MYTHIC — Umsetzung der dokumentierten Erweiterungswünsche

> **Zweck dieses Dokuments:** Ein vollständig ausführbarer Implementierungsplan, der ein anderes
> LLM (oder Menschen) befähigt, die in `main` dokumentierten Erweiterungswünsche umzusetzen —
> ohne die Quelldokumente neu interpretieren zu müssen. Grounded auf dem tatsächlichen Code-Stand
> vom Branch `claude/documented-extension-requests-p8vt9e` (Basis: `origin/main`, HEAD `bd33689`).

---

## 1. Context — warum dieser Plan existiert

MYTHIC ist ein self-hostbarer Zero-Config-Deploy-Dienst (Vercel/Railway/Coolify-artig): Git-URL rein,
Stack-Detection via nixpacks, Docker-Build, Traefik-Routing mit TLS. Der End-to-End-Deploy-Pfad,
Simulation-Mode, BYOK-LLM-Settings, die Landing-Page und ein erster Go-Provisioner **existieren bereits**.

Die "dokumentierten Erweiterungswünsche" sind **nicht** verstreute TODOs, sondern eine zusammenhängende
Produkt-Roadmap, festgelegt in drei Memory-Bank-Dateien in `main`:

- `.kilocode/rules/memory-bank/context.md` → Abschnitt **"Next Mission — Final Fable Run"** (Einstiegspunkt)
- `.kilocode/rules/memory-bank/FABLE_FINAL_RUN.md` → 769 Zeilen, Quelle der Wahrheit (P0-A, P0-B, P1, Datenmodell, Reihenfolge)
- `.kilocode/rules/memory-bank/PROVISIONER_ENTRY_MODES.md` → verpflichtender Companion (Homelab- vs. Cloud-Modus, gemeinsame Installations-Interfaces)

**Kernaussage der Roadmap:** MYTHIC ist kein weiteres Deploy-Dashboard, sondern eine *self-hosted
Deployment-Appliance-Factory*. Der **Provisioner ist die Vordertür und höchste Priorität** — er soll die
Maschine erschaffen/übernehmen, Zugang absichern, MYTHIC installieren, Gesundheit beweisen, temporären
Zugang entfernen und dem Nutzer ein funktionierendes Deploy-System übergeben. Erst danach folgt der
Deployment-Trust-Layer (Projekt/Release-Modell, Rollback, Secrets etc.).

**Gewünschtes Ergebnis:** Die dokumentierte Vision in ausführbaren, additiv-migrierenden Code überführen,
ohne bestehende Funktionalität zu zerstören.

---

## 2. Projekt-Konventionen, die dieser Plan respektiert (wichtig für Ausführende)

Die Quelldokumente definieren eine ungewöhnliche Arbeitsteilung ("Fable implementiert, Opus verifiziert").
Für die Umsetzung gelten daraus folgende **verbindliche Leitplanken**:

1. **Additiv, nie destruktiv.** Bestehende Systeme (Deploy-Engine, Provisioner, BYOK-Settings,
   `/api/deployments`, Simulation-Mode, Landing-Page) bleiben lauffähig. Weiterentwicklung ausschließlich
   über neue Seams + SQLite-Migrationen mit Versions-Tabelle.
2. **Keine neuen Test-Suiten / Fixtures / CI-Workflows** und **keine bestehende Verifikations-Suite
   ausführen oder umschreiben**, außer eine Datei blockiert physisch die Kompilierung. Vorhandene Testdatei
   `provisioner/stages_test.go` + `testhooks.go` bleiben unangetastet, solange sie bauen.
3. **Sanity-Gate ist erlaubt und erwünscht:** `bun typecheck`, `bun lint`, `bun run build`,
   `cd provisioner && go build ./... && go vet ./...`. Das ist Kompilier-/Typ-Sanity, **keine**
   Verifikations-Suite. Nicht-kompilierender Code darf nicht gepusht werden.
4. **Non-Goals strikt einhalten** (FABLE_FINAL_RUN §7): keine Multi-Tenant-SaaS, keine Orgs/Teams,
   kein Kubernetes, keine native Mobile-App, kein Browser-Terminal, kein hosted Control-Plane, kein
   Landing-Redesign, kein generisches Server-Admin-Panel. Wenn ein Seam nötig ist, die **kleinste**
   interne Abstraktion bauen, nicht die ganze Nachbarkategorie.
5. **Sekret-Hygiene:** Provider-Token ("Hands") und LLM-Key ("Brain") niemals loggen, niemals in
   URL/Browser-Storage/Shell-History/Prozessargumenten, niemals als Plaintext-State persistieren.
   Verschlüsselung wiederverwenden (`src/lib/crypto.ts` AES-256-GCM; analog in Go).

---

## 3. Aktueller Baseline-Bestand (grounding — was schon da ist)

**TypeScript / Next.js (`src/`):**

| Datei | Rolle | Für den Plan relevant |
|---|---|---|
| `src/lib/db.ts` | SQLite-Store, nur Tabelle `deployments` + `settings` + `llm_providers` | **Erweiterungspunkt** für Migrations + neue Tabellen |
| `src/lib/types.ts` | `DeploymentRecord`, `DeploymentPhase`, `AnalysisResult` | Basis für `Project`/`Release`-Typen |
| `src/lib/engine.ts` | orchestriert clone→analyze→build→deploy + AI-Autofix + Job-Guard | wird um Candidate-Release-Semantik erweitert |
| `src/lib/git.ts` / `analyzer.ts` / `builder.ts` / `docker.ts` | Pipeline-Phasen | wiederverwenden, nicht ersetzen |
| `src/lib/ai.ts` | OpenAI-kompatible Fehlerdiagnose/Repair | wird auf strukturierte Release-Evidence beschränkt |
| `src/lib/crypto.ts` / `settings.ts` | AES-256-GCM + verschlüsselter Settings-Store | **Basis für Projekt-Secrets** (generalisieren, nicht duplizieren) |
| `src/lib/discovery.ts` | Auto-Detect Docker-Socket + Traefik | wiederverwenden für Diagnostics |
| `src/app/api/**` | `/api/deployments`, `[id]`, `/redeploy`, `/ai-fix`, `/analyze`, `/settings`, `/llm/chat` | Kompat-Wrapper behalten, neue Routen additiv |
| `src/components/Wizard.tsx`, `DeploymentDetail.tsx`, `dashboard/page.tsx` | UI | additiv; keine Landing-Änderung |

**Go-Provisioner (`provisioner/`):** aktuell **linearer CLI-Flow** (`stages.go` `Run()`), grobe State-Datei
(`StageState`, Phase-Strings), Hetzner- + Mock-Adapter, SSH-Seams, Install-Seams, Handover.

| Datei | Rolle |
|---|---|
| `main.go` | CLI-Entry (Flags, `--resume/--status/--cleanup`) |
| `stages.go` | linearer `Run()`, `saveState/loadState` |
| `types.go` | `Config`, `ProviderConfig`, `BrainConfig`, `Handover`, `StageState`, `FailResult` |
| `provider.go` / `provider_hetzner.go` / `provider_mock.go` | Provider-Interface + Adapter |
| `ssh.go` / `stages.go` seams / `testhooks.go` | SSH, Install, Health, Injection (testbare Seams) |
| `handover.go` | Handover-Bau + verschlüsselter Export |

**Lücken ggü. Roadmap (was fehlt):** Homelab/Existing-Machine-Modus, gemeinsame `HostTarget`-Interfaces,
Browser-Launcher, Capability-Discovery + Kostenvorschau, Cloud-Firewall, pinned Release + Checksum,
fein-granulare resumbare State-Machine + verschlüsseltes Journal, Recovery-Surface, Appliance-Lifecycle,
DNS-Automation; TS-seitig: Projekt/Release-Modell, Webhooks, durable Logs, Promotion/Rollback,
Projekt-Secrets, interne Projekte, PWA, Diagnostics.

---

## 4. Workstream A — Provisioner als echtes One-Click-Produkt (P0-A) — HÖCHSTE PRIORITÄT

Referenz: FABLE_FINAL_RUN §4 + PROVISIONER_ENTRY_MODES vollständig. Reihenfolge folgt
PROVISIONER_ENTRY_MODES §6 (Homelab **zuerst** nach der Abstraktion — beweist den Installer ohne
Cloud-Komplexität).

### A0. Shared Host-Core-Interfaces (Fundament — zuerst)
Neue Datei `provisioner/host.go`. Definiere die von **beiden** Modi geteilten Interfaces
(PROVISIONER_ENTRY_MODES §5) — kein Duplizieren der Installationslogik:

```
type HostTarget      // Adresse, Port, User, Auth-Handle, Fingerprint, Herkunft (cloud|existing)
type HostInspector   // Preflight: OS/Arch, Disk/RAM/CPU, Docker/Compose-State, Ports 80/443, Reverse-Proxy-Detection, Env-Typ (container|vm|bare-metal) → READY | READY_WITH_CHANGES | BLOCKED
type HostAccess      // SSH-Verbindung (existierender Key | Key-Datei | Agent | temp Public Key)
type HostMutationPlan// exakte Änderungsliste vor Ausführung (approve-gated)
type MythicInstaller // Docker/Compose sicherstellen, MYTHIC-Stack installieren (pinned Release)
type AccessConfigurator // Exposure: LAN-only | existing-proxy | public-domain | (Seam) overlay
type HealthGate      // lokale + (public) HTTPS-Health
type HandoverBuilder // Handover-Record bauen
type CleanupCoordinator // nur von MYTHIC erzeugte Credentials entfernen
```
Cloud-Create produziert einen `HostTarget`; Homelab-Input **resolved** einen existierenden `HostTarget`.
Alles danach nutzt denselben Core. Bestehende Seams aus `stages.go`/`ssh.go` hinter diese Interfaces ziehen.

### A1. Resumable State-Machine + verschlüsseltes Journal
Ersetze die grobe `StageState`-Phase-Liste durch eine explizite State-Machine (neue Datei
`provisioner/statemachine.go`). Zustände exakt wie FABLE_FINAL_RUN §4.8 (Cloud) bzw.
PROVISIONER_ENTRY_MODES §2 Installation-Flow (Homelab):

- Cloud: `INPUT → PROVIDER_VERIFIED → KEY_CREATED → SERVER_REQUESTED → SERVER_ACTIVE → SSH_VERIFIED → HOST_PREPARED → MYTHIC_INSTALLED → LOCAL_HEALTHY → DNS_READY → HTTPS_HEALTHY → HANDOVER_READY → TEMP_ACCESS_REMOVED → COMPLETE`
- Homelab: `INPUT → SSH_VERIFIED → HOST_INSPECTED → CHANGE_PLAN_APPROVED → HOST_PREPARED → MYTHIC_INSTALLED → LOCAL_HEALTHY → ACCESS_READY → HANDOVER_READY → TEMP_ACCESS_REMOVED → COMPLETE`
- Alternate (beide): `ACTION_REQUIRED_DNS`, `RECOVERABLE_FAILURE`, `CLEANUP_REQUIRED`, `CANCELLED`, `DESTROYED`

Journal (lokal): Provider-Resource-IDs, non-secret Config, absolvierte Transitions, Host-Fingerprint,
aufgelöste MYTHIC-Version + Checksum, DNS-Mutationen, letzte sichere Recovery-Aktion. **Sensibles
Resume-Material lokal verschlüsseln** (run-spezifischer Key oder Passphrase) — nie Token/Private-Key als
Plaintext. Erweitere `Handover`/`StageState` in `types.go` additiv um: `exposure_mode`, `mythic_version`,
`checksum`, `firewall_id`, `dns_records`, `installation_id`, `schema_version`.

### A2. Homelab / Existing-Machine-Modus (ERSTER echter Modus)
Neue Datei `provisioner/mode_homelab.go`. Inputs: Host/IP, SSH-Port, SSH-User, **eine** approbierte
Auth-Methode (existierender Key | Key-Datei | Agent | temp Public Key über bereits authentisierte Session).
**Kein Provider-Token, kein Gmail, kein Public-Domain-/Public-IP-Zwang.**
- Optionale Discovery **nur nach expliziter Erlaubnis** (mDNS, ARP-Nachbarn, benutzerdefinierter Subnetz-Scan mit Cancel). Nie still das ganze LAN scannen, nie Passwörter probieren.
- Preflight über `HostInspector` → zeige exakte Änderungen, gib `READY|READY_WITH_CHANGES|BLOCKED` zurück.
- Exposure-Optionen: LAN-only (ehrlich: kein global vertrauenswürdiges HTTPS vortäuschen), existing-proxy, public-domain, overlay (nur Seam).
- **Wenn ein bereits existierender permanenter Key genutzt wurde: diesen NICHT löschen.** Nur von MYTHIC erzeugte Credentials entfernen.

### A3. Hetzner-Cloud-Modus (rebuild auf Core)
`mode_cloud.go` (extrahiert aus heutigem `stages.go`). Korrekte Sequenz (FABLE_FINAL_RUN §4.4), teils
schon vorhanden — sicherstellen & hinter State-Machine bringen:
1. temp SSH-Keypair lokal generieren → 2. **nur Public Key** via Provider-API registrieren →
3. Server mit Key-Zugang from-first-boot → 4. keine Passwort-Bootstrap-Annahmen →
5. Host-Fingerprint bei erster vertrauter Verbindung → 6. restricted Bootstrap-Account →
7. Provider-seitige temp SSH-Key-Ressourcen entfernen → 8. Bootstrap-Account + lokales Private-Key-Material nach Handover entfernen. **Nie** auf emailed Root-Passwort angewiesen sein.

### A4. Provider-Capability-Discovery + Kostenvorschau (Hetzner zuerst)
`provider_hetzner.go` erweitern: Locations, unterstützte Ubuntu-Images, Server-Typen inkl.
vCPU/RAM/Disk/Arch/Preis, empfohlener Default, **expliziter geschätzter Monatspreis vor Erstellung**.
Kein hartkodierter Single-Server-Typ. Nichts cachen über den aktiven lokalen Run hinaus.

### A5. Cloud-Firewall + Host-Baseline
Hetzner-Firewall minimal: SSH nur von erkannter/angegebener Quell-Range, HTTP/HTTPS public für
Public-Mode, keine DB-/App-Port-Exposition. Host-Baseline: Docker+Compose sicherstellen, key-only SSH,
MYTHIC-Verzeichnisse + Docker-Netzwerk anlegen, jede Host-Mutation ins Journal. **Kein** generelles
Server-Hardening-Produkt.

### A6. Pinned MYTHIC-Release-Acquisition
`provisioner/release.go`: Release-Channel (stable default, explizites dev-override), aufgelöste Version
vor Install anzeigen, **Checksum-Verifikation vor Ausführung/Extraktion**, optional Signatur, Abbruch bei
Mismatch, Version+Checksum ins Handover. **Kein `curl | bash`** für MYTHIC selbst. Dev-Mode darf konkreten
Repo-Ref installieren, sichtbar als "unverified development input".

### A7. Embedded Browser-Launcher (Default-Human-Pfad)
`provisioner/launcher.go`. Ohne CLI-Argumente gestartet: ephemeren **loopback-only** Port binden,
lokale Setup-Oberfläche im Browser öffnen, alle Credentials im lokalen Prozess halten, kein LAN/Internet-
Endpoint, Server nach Handover/Cancel schließen. UI aus **embedded Go-Assets** (`go:embed`) — **kein**
Electron/Tauri/hosted Frontend. CLI bleibt als Experten-/Automations-Surface.
- **Erste Entscheidung:** Modusauswahl (existierende Maschine vs. neue Cloud-Maschine) — **kein**
  Provider-Token vor dieser Entscheidung abfragen.
- **Brain & Hands Screen** (FABLE_FINAL_RUN §4.2): Brain = optionaler LLM-Key/Base/Model, Hands =
  Provider-Token (nur Cloud). Secret-Felder echoen nie den vollen Wert; erklären, wann welches Credential
  genutzt wird; Brain klar als optional markieren; Hands-Token lokal sofort nach Provider-Arbeit verwerfbar.

### A8. DNS-Closure (zwei ehrliche Modi)
`provisioner/dns.go` mit Adapter-Boundary. **Automated:** Hetzner-DNS zuerst, Cloudflare nur bei Budget;
nur zugängliche Zonen entdecken, exakte A-Records anzeigen **vor** Mutation, alte/neue Werte journaln, auf
beobachtbare DNS-Konvergenz warten vor finalem TLS-Health; nie Full-Account-Credential wenn DNS-scoped
Token reicht. **Guided:** Server+Install komplett, exakte Records zeigen (Copy-Buttons), resumbarer
`ACTION_REQUIRED_DNS`-State, nach Bestätigung fortsetzen. Nur den Automated-Pfad "one click" nennen.

### A9. Health-gated Handover + First-Login-Ritual
`COMPLETE` erst wenn (FABLE_FINAL_RUN §4.10): Provider meldet aktiv, SSH-Host-Identity erfasst, Docker
antwortet, MYTHIC-Container laufen, lokaler Health-Endpoint antwortet, Public-URL antwortet über HTTPS
(Public-Mode), One-Time-Admin-Credential erzeugt, temp Bootstrap-Zugang entfernt, Cleanup-State
aufgezeichnet. Handover-Screen als menschliche Übergabe (nicht nur JSON): URL, IP+Resource-ID, Version,
One-Time-Admin (1× reveal+copy, erzwingt permanente Credential-Erstellung beim First-Login), Fingerprint,
Monatspreis, Health, Temp-Access-Removal-Status, verschlüsselter Handover-Export, **prominente
Billing-Warnung**. JSON-Export für Automation behalten.

### A10. Recovery-Surface (Launcher + CLI identisch)
resume / inspect / retry-step / remove-temp-access / export-encrypted-handover / destroy-server /
keep-server / forget-state (nur nach Warnung über orphaned resources). Jeder Fehler liefert exakt:
was gelang, was scheiterte, was bleibt aktiv & potenziell abrechenbar, ob temp Zugang noch existiert,
**eine sicherste nächste Aktion**. Kein generischer Stacktrace als primäre Nutzermeldung.

### A11. Appliance-Lifecycle (kleinste vollständige Menge)
Installierte Version zeigen; nur auf explizite Aktion auf neue pinned Release prüfen; Upgrade unter
Erhalt von Volumes/Config; Restart; deterministische Appliance-Diagnostics; Admin-Recovery-Credential
rotieren; verschlüsseltes lokales Recovery-Bundle; Uninstall ohne Server-Daten zu zerstören; optionaler
separater expl, provider-autorisierter Server-Destroy. **Kein** general Host-Control-Panel.

### A12. Provisioner↔MYTHIC Bootstrap-Contract (versioniert)
Gemeinsames Schema Go↔TS (siehe §7). MYTHIC konsumiert Payload **einmal**, initialisiert First-Run-State,
markiert consumed; Plaintext-One-Time-Credential danach nicht mehr im Payload.

---

## 5. Workstream B — Deployment-Trust-Layer (P0-B) — erst nach struktureller P0-A-Vollständigkeit

Referenz: FABLE_FINAL_RUN §5 + §8 (Datenmodell). Alles über **additive** SQLite-Migrationen.

### B0. Migrations-Framework
`src/lib/db.ts` um eine `schema_migrations`-Tabelle (Versions-Nr.) + idempotente `migrate()`-Funktion
erweitern, die beim ersten `getDb()` läuft. Bestehende `deployments`/`settings`/`llm_providers` unangetastet.

### B1. Projekt- + immutables Release-Modell
Neue Typen in `src/lib/types.ts` (`Project`, `Release`, `ReleaseEvent`) + Store-Module
`src/lib/projects.ts`, `src/lib/releases.ts`. Tabellen additiv (§7). **Bestehende `deployments`-Records
nicht-destruktiv importieren** (Migration erzeugt je Deployment ein Project + initiales Release).
Release-Flow: `queued → cloning → analyzing → building → starting → verifying → ready → promoted`;
Alternate: `failed`, `stopped`, `rolled_back`, `superseded`. **Ein fehlgeschlagener Kandidat überschreibt
nie das aktive gesunde Release.**

### B2. Git-Source + Auto-Redeploy (GitHub-Webhook)
Neue Route `src/app/api/webhooks/github/route.ts`: **HMAC-SHA-256-Signaturprüfung**, Auto-Deploy-Toggle
pro Projekt, Branch-Filter, Duplikat-Schutz per Delivery-ID + Commit-SHA (`webhook_deliveries`-Tabelle),
Trigger-Metadaten (manual|webhook|rollback|ai|provisioner). Public-Repo als garantierte Baseline;
verschlüsselte ephemere Auth für private Repos (crypto.ts wiederverwenden). Keinen Fake-GitHub-App-Flow.

### B3. Durable Logs + Release-Evidence
Ersetze das einzelne append-only `logs`-Textfeld als Primär-Architektur durch geordnete
`release_events` (durable Build-/Runtime-Chunks, `sequence`-basiert). Reconnectable Streaming ab
Sequence-Nr. (neue Route `src/app/api/releases/[id]/logs/stream`). **Secret-Redaction vor
Persistenz/Anzeige/API/LLM.** Kompat-Zugriff für die alte Polling-UI erhalten.

### B4. Sichere Candidate-Promotion + Rollback
`src/lib/engine.ts` + `docker.ts` anpassen: eindeutig getaggtes Image bauen → eindeutig benannten
Candidate-Container starten → Docker-Running prüfen → Health proben → **erst dann Routing promoten** →
vorheriges Release verfügbar halten falls Promotion scheitert → Rollback auf retained known-good Image
ohne Rebuild → letzte 3 erfolgreichen Images behalten → expliziter Cleanup älterer. Kein "universal zero
downtime" versprechen — nur: das arbeitende Release wird nicht zerstört, bevor der Ersatz antwortet.

### B5. Projekt-Variablen + Secret-Safety
`src/lib/projectVars.ts` + Tabelle `project_variables`. Plain-Variablen + verschlüsselte Secrets (crypto.ts
generalisieren, **nicht** duplizieren), Build-/Runtime-Scopes, write-only Anzeige nach Save, Redaction
überall, Expected-Name-Discovery aus `.env.example`/Framework-Konventionen/Analyse-Output,
Readiness-Anzeige die fehlende Variablen benennt ohne Werte zu zeigen. AI darf Namen vorschlagen, nie
Werte erfinden.

### B6. Public- vs. Internal-Only-Projekte
Pro Projekt: Public (Traefik-Router, Domain, TLS) oder Internal (kein Router/Cert, approbiertes
Docker-Netzwerk + stabile interne Service-Adresse). Netzwerke validieren, nie still beliebige Host-
Netzwerke anhängen.

### B7. Bounded AI-Deployment-Guardian
`src/lib/ai.ts` restriktiv machen: nur Build-Command, Start-Command, Port, benötigte Env-Namen,
Dockerfile/Build-Metadaten, Health-Pfad. Regeln: alle bekannten Secrets redacten, **max 2** Repair-
Versuche pro Release, Diagnose+akzeptierte Änderungen+Ergebnis als Release-Evidence speichern, unsupported
Actions ablehnen, **keine** Source-Commits, **keine** beliebigen Shell-Kommandos, keine unbounded Loop.

### B8. Mobile-First PWA-Operator-Surface
Installierbare responsive Web-Surface (Manifest + Service-Worker, `src/app/`): Appliance-Health,
Projekt-State, aktive URL/interne Adresse, aktuelles Release+Commit, letzter Fehler, Deploy/Redeploy,
Restart, Rollback, Stop, Live-Logs. Große Touch-Targets, Confirmations für destruktive Aktionen. **Kein**
Browser-Terminal, **keine** native App.

### B9. Deterministische Diagnostics
`src/lib/diagnostics.ts` (nutzt `discovery.ts`): eine Appliance-Diagnostics-Action (Provider-Metadata,
Disk/Memory, Docker-Connectivity, Proxy/Netzwerk-Discovery, MYTHIC-Service-State, Domain/Cert-State) +
eine Projekt-Diagnostics-Action (Repo-Erreichbarkeit, benötigte Var-Namen, DNS-Readiness, Build-Prereqs,
Candidate-Container-State, Health-Endpoint, Runtime-Logs). Rückgabe `pass|warn|fail` + eine Recovery-
Aktion. AI darf erklären, nicht ersetzen.

---

## 6. Workstream C — P1 (nur bei klar verbleibendem Budget)

- **C1 Branch-/PR-Previews:** Preview-Subdomain je Branch/Commit, ersetzt nie Production, optional
  Passwort, Expiry+Cleanup, GitHub-Status-URL nur bei echter Auth.
- **C2 Stabile lokale Operator-API:** eng-scoped Actions (inspect/list/health/stream/deploy/restart/
  rollback/stop) als Fundament für spätere MCP/Android/Telegram-Clients — **kein** voller MCP-Server jetzt.
- **C3 Weiterer Provider-Adapter:** erst wenn Hetzner-Pfad + Adapter-Boundary komplett; genau einer, nicht
  mehrere halbfertige.
- **C4 Optional Image-Advisory:** nur wenn Trivy verfügbar/aktiviert; Report als Release-Evidence, Warnung
  bei high/critical; LLM-Erklärung nie als abgeschlossene Vuln-Reparatur darstellen; Scanning optional.

---

## 7. Datenmodell-Referenz (additive SQLite-Tabellen)

Aus FABLE_FINAL_RUN §8. Alle über `migrate()` in `src/lib/db.ts`, mit `schema_migrations`-Versionstabelle.
Verschlüsselte Wertfelder kompatibel zur bestehenden AES-256-GCM-Impl (`iv`/`tag`/`data`, s. `llm_providers`).

- **`installations`** — `id, schema_version, provider, provider_resource_id, public_ip, hostname, base_domain, exposure_mode, mythic_version, host_fingerprint, provisioned_at, bootstrap_consumed_at`
- **`projects`** — `id, name, repo_url, branch, production_domain, exposure_mode, internal_network, auto_deploy, active_release_id, previous_release_id, created_at, updated_at`
- **`releases`** — `id, project_id, commit_sha, branch, image_name, container_id, status, trigger_type, trigger_ref, analysis_json, health_json, repair_json, failure_summary, url, created_at, started_at, finished_at, promoted_at`
- **`release_events`** — `id, release_id, sequence, kind, phase, message, metadata_json, created_at`
- **`project_variables`** — `id, project_id, name, scope, is_secret, {iv,tag,data}, created_at, updated_at`
- **`webhook_deliveries`** — `provider, delivery_id, project_id, commit_sha, received_at, result`

**Bootstrap-Contract (Go↔TS, versioniert)** — FABLE_FINAL_RUN §4.12: `schema_version, installation_id,
provider, provider_resource_id, public_ip, hostname, base_domain, exposure_mode, mythic_version,
encrypted_brain_config?, admin_token_hash|secure_injection_ref, provisioned_at, host_fingerprint`.
MYTHIC konsumiert einmalig → `installations`-Row + First-Run-State → als consumed markieren.

---

## 8. Empfohlene Ausführungsreihenfolge (25 Schritte → konkrete Deliverables)

Direkt aus FABLE_FINAL_RUN §10, gemappt auf Dateien:

1. Baseline einfrieren, Provisioner↔MYTHIC-Seam identifizieren → `host.go` Interface-Skizze.
2. Versionierten Bootstrap-Payload definieren (§7) → `provisioner/bootstrap.go` + `src/lib/bootstrap.ts`.
3. Provisioner → resumbare State-Machine + verschlüsseltes Journal → `statemachine.go`, `journal.go`.
4. SSH-Key-vor-Server-Create + Provider-Ressourcen-Cleanup korrigieren → `mode_cloud.go`.
5. Hetzner Capability-Discovery + Empfehlung + Kostenvorschau → `provider_hetzner.go`.
6. Cloud-Firewall + Host-Baseline → `firewall.go`, Host-Baseline in `MythicInstaller`.
7. Pinned Release + Checksum → `release.go`.
8. Embedded loopback-only Browser-Launcher + Modusauswahl + Brain/Hands → `launcher.go` + `go:embed` UI.
9. Automated Hetzner-DNS + guided resumbarer Fallback → `dns.go`.
10. Browser-Handover + One-Time-Admin-Consume + First-Login → `handover.go` erweitern + TS First-Run.
11. Appliance-Lifecycle-Actions → `lifecycle.go`.
12. Installation-Persistenz in MYTHIC → `installations`-Tabelle + `src/lib/installations.ts`.
13. Project/Release/ReleaseEvent-Storage → `projects.ts`, `releases.ts`, Tabellen.
14. Legacy-Deployment-Records importieren → Migration in `db.ts`.
15. Deployment um eindeutige Candidate-Releases refactoren → `engine.ts`, `docker.ts`.
16. Health-gated Promotion + Rollback + Image-Retention → `engine.ts`, `docker.ts`.
17. Durable Log-Storage + reconnectable Streaming → `release_events` + Stream-Route.
18. Projekt-Variablen + Secrets + Redaction → `projectVars.ts`.
19. GitHub-Webhook-Auto-Deploy → `api/webhooks/github/route.ts`.
20. Internal-Only-Projekt-Mode → `docker.ts` Netzwerk-Logik.
21. Appliance- + Projekt-Diagnostics → `diagnostics.ts`.
22. Dashboard + PWA-Control-Surface → `src/app/` + Manifest/SW.
23. AI-Repair um strukturierte Release-Evidence beschränken → `ai.ts`.
24. P1 nur bei Budget.
25. README + Memory-Bank auf implementierte Realität aktualisieren (context.md Session-History-Zeile).

**Pragmatische Slice-Empfehlung, falls "schnell" wörtlich zu nehmen ist:** Schritte 1–3 + A2 (Homelab)
liefern die kleinste kohärente, sofort nützliche Einheit (Nutzer kann eigene Maschine bespielen), ohne
Cloud-Komplexität — genau der von PROVISIONER_ENTRY_MODES §6 vorgegebene Startpunkt.

---

## 9. Kompatibilität & Migration (nicht verhandelbar)

- Root-Quickstart, Simulation-Mode, bestehendes Provisioner-Verhalten (hinter neue State-Machine/Launcher
  gezogen), bestehende Verifikationsdateien, `/api/deployments` (via Adapter/Kompat-Wrapper bis UI migriert),
  BYOK-Settings **alle erhalten**. Laufende Deployments während Migration **nicht** stoppen.
  Provisioner-CLI wo praktikabel kompatibel halten.
- Verschlüsselung/Crypto-Boundary generalisieren, **nie** duplizieren.

---

## 10. Verifikation — wie man den Fortschritt bestätigt (Sanity-Gate, keine Test-Suite)

Nach jedem Workstream-Schritt:

```bash
bun install
bun typecheck
bun lint
bun run build
cd provisioner && go build ./... && go vet ./...
```

Funktionale Sichtprüfung ohne neue Tests:
- **Provisioner:** `go run . --provider mock ...` (Mock-Adapter existiert) durch die neuen States fahren;
  Homelab-Modus gegen einen lokalen SSH-Container/`--dry-run` prüfen; Launcher: `go run .` ohne Args →
  loopback-Port + Modusauswahl im Browser.
- **MYTHIC:** `bun run build` + Simulation-Mode (kein Docker/nixpacks nötig): Projekt anlegen, Release
  durch `queued→…→promoted` beobachten, Rollback auf vorheriges Release, Webhook mit gültiger/ungültiger
  HMAC-Signatur, Secret-Redaction in Logs, Diagnostics-Action `pass|warn|fail`.
- Migrationen gegen eine Kopie einer bestehenden `mythic.db` fahren → bestehende Deployments erscheinen als
  importierte Projekte/Releases, nichts geht verloren.

Bestehende `provisioner/stages_test.go` **nicht** ausführen/umschreiben, solange sie baut.

---

## 10b. Workstream D — Aufgeschobene / ausgeklammerte Teile (jetzt vollständig geplant)

Diese Teile hatte die Roadmap als "Seam only", "P1", "nur bei Budget" oder Grenzfall markiert. Sie werden
hier vollständig ausgeplant, damit ein ausführendes LLM sie **nicht neu interpretieren** muss. Reihenfolge:
erst wenn die jeweilige Voraussetzung (in Klammern) erfüllt ist. Jeder Punkt bleibt an die Non-Goals (§11)
gebunden — die kleinste interne Abstraktion, nicht die Nachbarkategorie.

### D1. Overlay-Netzwerk-Exposure — Tailscale/WireGuard-Seam (Voraussetzung: A2 Homelab-Exposure steht)
Homelab-Exposure-Option #4 (PROVISIONER_ENTRY_MODES §2). **Nur Seam, kein VPN-Produkt.**
- Neue Datei `provisioner/exposure_overlay.go`: Interface `OverlayProvider { Detect() bool; JoinCommand() string; ServiceAddress() (host string, err error) }`.
- Implementiere **Detection + Guided-Attach**, nicht Setup: erkenne vorhandenes `tailscale`/`wg` auf dem Host (über `HostInspector`), und wenn vorhanden, konfiguriere MYTHIC's `AccessConfigurator` auf die Overlay-Adresse (Tailscale MagicDNS-Name bzw. WG-Peer-IP) statt LAN/Public.
- Wenn **nicht** vorhanden: ehrlicher Guided-State `ACTION_REQUIRED_OVERLAY` mit exakten manuellen Schritten (Copy-Buttons), analog zu Guided-DNS. **Nicht** automatisch Tailscale installieren/authen.
- Handover zeigt die reale Zugriffsart ("erreichbar nur über Tailnet X"); niemals global-trusted HTTPS vortäuschen.
- Grenze: kein Key-Management, kein ACL-Editor, kein Exit-Node/Subnet-Router-Setup.

### D2. Cloudflare-DNS-Adapter (Voraussetzung: A8 Hetzner-DNS komplett)
Zweiter DNS-Adapter hinter der bestehenden `dns.go`-Boundary (FABLE_FINAL_RUN §4.7 Priorität 2).
- `provisioner/dns_cloudflare.go` implementiert dasselbe `DNSAdapter`-Interface wie Hetzner: `DiscoverZones()`, `PlanRecords()`, `ApplyRecords()`, `AwaitConvergence()`.
- **Nur DNS-scoped Token** (Zone.DNS Edit) akzeptieren — Full-Account-Credential ablehnen, in der UI erklären warum.
- Zonen-Discovery nur zugängliche Zonen; exakte A-Records **vor** Mutation zeigen; alte/neue Werte journaln (`dns_records` im Journal); auf Konvergenz warten vor TLS-Health.
- Adapter-Auswahl automatisch nach Zonen-Match; bei Ambiguität Nutzer wählen lassen. Keine dritte Provider-Integration in diesem Lauf.

### D3. Release-Signatur-Verifikation (Voraussetzung: A6 Checksum-Pfad steht)
Optionale zweite Vertrauensschicht in `provisioner/release.go` (FABLE_FINAL_RUN §4.6).
- Wenn Release-Signaturen vorhanden (z. B. `minisign`/`cosign`-Detached-Signatur neben dem Artefakt): Public-Key im Binary embedden (`go:embed`), Signatur **vor** Checksum-Nutzung prüfen; bei Mismatch harter Abbruch.
- Wenn keine Signatur vorhanden: Checksum genügt, aber im Handover `signature_verified: false` protokollieren (ehrlich, nicht als "verified" ausgeben).
- Dev-Override-Channel: Signatur-Skip erlaubt, aber sichtbar als "unverified development input" markiert (bereits in A6 gefordert).
- **Kein** eigenes PKI/Key-Rotation-System bauen — nur Verifikation gegen einen gepinnten Public Key.

### D4. Zukünftiger restricted Host-Agent — dokumentierter Seam (Voraussetzung: A0 Interfaces stehen)
FABLE_FINAL_RUN §4.14: Docker-Socket-Design bleibt für diesen Lauf, aber die Grenze wird explizit.
- **Jetzt umsetzen:** Alle Host-Control-Operationen hinter **eine** interne Schnittstelle `HostControl` (in `host.go`) bündeln; UI-/Route-Code greift **nie** direkt auf Docker/SSH zu.
- **Jetzt dokumentieren, nicht bauen:** In `provisioner/host.go` + `provisioner/README.md` den Replacement-Seam beschreiben: `HostControl` ist heute Docker-socket-backed, künftig durch einen restricted Agent (schmales, auditierbares On-Host-Binary mit least-privilege) ersetzbar, ohne Aufrufer zu ändern.
- Akzeptanz: ein `grep` findet keinen direkten `dockerode`/`docker.sock`/`ssh`-Zugriff außerhalb der `HostControl`-Implementierung.

### D5. Gmail/Gemini Import-Helper — eng, read-only, optional (Voraussetzung: **alle** Pflicht-Provisioner-Items aus §4 fertig)
PROVISIONER_ENTRY_MODES §4 + FABLE §... — P1 **at most**, außerhalb des Kern-Pfades. Nur unter **allen**
folgenden Constraints bauen; wenn eine Bedingung nicht erfüllbar ist, den Helper weglassen:
- explizite Nutzeraktion; **read-only** Autorisierung; enge provider-spezifische Suche (z. B. "Hetzner Server erstellt"); Nutzer wählt die **exakte** Nachricht bevor Inhalt konsumiert wird; extrahierte Werte werden zur Bestätigung angezeigt; **keine** breite Mailbox-Ingestion; **kein** Gmail-Inhalt von MYTHIC an ein externes LLM; Token sofort nach Import widerrufbar/entfernbar; **niemals** der einzige Recovery-Pfad.
- Umsetzung als isoliertes Modul `provisioner/import_gmail.go` mit hartem Feature-Flag (default aus); MYTHIC-Kern hat keine Gmail-Abhängigkeit. **Kein** Gmail-OAuth als Installationsvoraussetzung.
- Da die sichere Hetzner-Sequenz (A3) emailed Root-Passwörter eliminiert, ist dieser Helper reine Komfort-Funktion — bei knappem Budget streichen.

### D6. P1-Vollausbau (Voraussetzung: alle P0-A + P0-B strukturell fertig; FABLE_FINAL_RUN §6)

**D6.1 Branch-/PR-Previews** (`src/lib/previews.ts` + `engine.ts`):
- Preview-Release je Branch/Commit mit generierter Subdomain (`<branch-slug>--<project>.<base-domain>`); nutzt dieselbe Candidate-Release-Maschinerie (B4), aber promotet **nie** Production.
- Optionaler Passwortschutz (Traefik BasicAuth-Middleware-Label); Expiry-Policy + Cleanup-Job (TTL, konfigurierbar); GitHub-Status/Deployment-URL **nur** wenn echte Auth vorhanden (B2), sonst weglassen.
- Preview-Images teilen die Retention-Policy (B4), zählen aber separat.

**D6.2 Stabile lokale Operator-API** (`src/app/api/operator/**`, loopback/Token-gated):
- Eng-scoped Actions: `inspect appliance`, `list projects/releases`, `health/diagnostics`, `stream logs`, `deploy/redeploy`, `restart`, `rollback`, `stop` — dünne Wrapper über bestehende Lib-Funktionen, **keine** neue Business-Logik.
- Versioniertes JSON-Schema (`/api/operator/v1/...`) als Fundament für spätere MCP/CUE/Android/Telegram-Clients. **Kein** MCP-Server, **keine** Bots in diesem Lauf.
- Auth: lokaler Operator-Token (aus dem Settings-Store, crypto.ts) — nicht öffentlich exponieren.

**D6.3 Weiterer Provider-Adapter** (nur wenn Hetzner-Pfad + Adapter-Boundary komplett):
- Genau **einen** zusätzlichen (z. B. Cloud-Provider mit klarer API), der das vollständige `Provider`-Interface (`provider.go`) inkl. Capability-Discovery (A4), Firewall (A5) und SSH-Key-vor-Create (A3) erfüllt.
- Akzeptanz: derselbe State-Machine-Durchlauf grün wie Hetzner. **Keine** mehreren halbfertigen Provider ("kein Logo-Sammeln").

**D6.4 Optional Image-Advisory** (`src/lib/imageScan.ts`, nur wenn Trivy verfügbar/aktiviert):
- Nach erfolgreichem Build (B4) optional Trivy-Scan; Report als `release_events`-Evidence (B3) speichern; Warnung bei high/critical im Release-Detail + PWA.
- LLM darf den Report **erklären**, aber nie als abgeschlossene Vuln-Reparatur darstellen. Scanning bleibt optional; Zero-Config-Pfad läuft ohne Trivy.

### D7. Offene Abstimmungspunkte (aus §12, jetzt entschieden)
- **Verschlüsselungs-Envelope Go↔TS:** Gemeinsames Format `{iv, tag, data}` (Base64), AES-256-GCM, key aus run-spezifischem Passphrase-Derivat (Provisioner-Journal) bzw. `MYTHIC_SECRET` (MYTHIC). In einem kurzen `docs/crypto-envelope.md` festhalten, damit beide Seiten identisch (de)serialisieren.
- **Journal-Verschlüsselung:** run-spezifischer Key aus Passphrase (Argon2id/scrypt); Provider-Token/Private-Keys nie im Journal, auch nicht verschlüsselt, wenn sie nach dem Schritt nicht mehr gebraucht werden — dann sofort verwerfen.



Multi-Tenant-SaaS-Billing, Orgs/Team-Permissions, DB-Provisioning/Backups, Service-Marketplace,
Kubernetes, Serverless/Fluid-Compute, CDN, Multi-Cloud-Fleet, native Mobile-App, Telegram-Bot,
Browser-Terminal, generische WordPress/n8n/ERPNext/Voice-Agent-Fälle, AI-generiertes Compose aus Prosa,
WAF/ML-Resource-Prediction, Source-Code-Editing durch Deploy-AI, weiteres Landing-Redesign, hosted
Control-Plane, generisches Server-Admin-Panel. Bei nötigem Seam: kleinste interne Abstraktion.

---

## 12. Zuvor ausgeklammerte Punkte — jetzt vollständig in Workstream D geplant

Alle vormals aufgeschobenen/„nur bei Budget"-Punkte sind jetzt ausformuliert (§10b):

- **Cloudflare-DNS** → **D2** (nach A8 Hetzner-DNS).
- **Release-Signatur-Verifikation** → **D3** (nach A6 Checksum).
- **Overlay-Netzwerk / Tailscale-WireGuard-Seam** → **D1** (Detection + Guided-Attach, kein VPN-Produkt).
- **Zukünftiger restricted Host-Agent** → **D4** (Seam jetzt bündeln, Agent nicht bauen).
- **Gmail/Gemini Import-Helper** → **D5** (P1-at-most, nur unter allen Constraints).
- **P1 komplett** (Previews, lokale Operator-API, weiterer Provider, Image-Advisory) → **D6**.
- **Crypto-Envelope Go↔TS + Journal-Verschlüsselung** → **D7** (entschieden: `{iv,tag,data}` AES-256-GCM).

**Bewusst NICHT geplant** (echte Non-Goals aus §11, nicht nur aufgeschoben — dürfen nicht gebaut werden):
Multi-Tenant/Billing, Orgs/Teams, DB-Provisioning/Backups, Marketplace, Kubernetes, Serverless/CDN,
Multi-Cloud-Fleet, native Mobile-App, Telegram-Bot, Browser-Terminal, WAF/ML-Prediction,
Source-Code-Editing durch Deploy-AI, Landing-Redesign, hosted Control-Plane, general Admin-Panel.
