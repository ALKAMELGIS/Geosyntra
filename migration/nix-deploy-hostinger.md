# Nix + deploy-rs — Hostinger Ubuntu VPS

Deploy the Rust `geosyntra-api` binary to a **Hostinger Ubuntu VPS** with a **Nix multi-user layer** (not full NixOS). Uses [deploy-rs](https://github.com/serokell/deploy-rs) profiles + systemd.

## Prerequisites

| Step | Command |
|------|---------|
| VPS | Ubuntu 22.04+ with SSH (root or sudo) |
| Nix on VPS | `sudo bash scripts/install-nix-hostinger.sh` |
| Local | Nix 2.11+ with flakes enabled |
| SSH key | Passwordless SSH to VPS as deploy user |

## Environment (local)

```bash
export GEOSYNTRA_DEPLOY_HOST=46.202.183.152    # or api.geosyntra.org
export GEOSYNTRA_DEPLOY_USER=root                # Hostinger VPS root; shared hosting uses u245840661
export GEOSYNTRA_DEPLOY_PORT=22                  # shared hosting SSH often 65002
```

Values mirror `hostinger.secrets.env` / `VPS_*` keys used by `scripts/vps-deploy.mjs`.

## Build & deploy

```bash
cd Geosyntra

# Build API package locally
nix build .#geosyntra-api

# Deploy profile + systemd unit to VPS
nix run .#deploy -- .#hostinger-vps --skip-checks
```

## VPS configuration

On first deploy, the activation script creates:

| Path | Purpose |
|------|---------|
| `/etc/geosyntra/api.env` | Secrets (`DATABASE_URL`, `JWT_SECRET`, `APP_ORIGIN`, …) |
| `/etc/systemd/system/geosyntra-api.service` | systemd unit |
| `/var/lib/geosyntra-api` | Working directory |

Edit `/etc/geosyntra/api.env` on the VPS, then:

```bash
systemctl restart geosyntra-api
journalctl -u geosyntra-api -f
```

Default listen: `0.0.0.0:3001` (`GEOSYNTRA_BIND_HOST`, `GEOSYNTRA_API_PORT`). Point nginx (`scripts/nginx-api.conf`) at `127.0.0.1:3001`.

### Staging (Axum parity gate, `:3003`)

Run Axum beside Express during Task 18:

```bash
export GEOSYNTRA_DEPLOY_HOST=46.202.183.152
scripts/deploy-axum-staging.sh
```

| Path | Purpose |
|------|---------|
| `/etc/geosyntra/api-staging.env` | Staging secrets (`GEOSYNTRA_API_PORT=3003`) |
| `/etc/systemd/system/geosyntra-api-staging.service` | Staging unit |
| `/var/lib/geosyntra-api-staging` | Working directory |

Compare stacks (both must be running):

```bash
EXPRESS_URL=http://127.0.0.1:3001 AXUM_URL=http://127.0.0.1:3003 scripts/compare-api-parity.sh
```

### Dioxus web on staging (Task 24.3)

Axum staging serves the Dioxus `dx` release bundle when `GEOSYNTRA_WEB_DIST` is set (same port as API — `:3003`).

**Local build:**

```bash
bash scripts/build-dioxus-web.sh
# bundle → target/dx/geosyntra-web/release/web/public
```

**Deploy API + web to VPS:**

```bash
export GEOSYNTRA_DEPLOY_HOST=46.202.183.152
scripts/deploy-axum-staging.sh          # Axum binary + systemd
scripts/deploy-dioxus-staging.sh        # rsync web bundle + restart staging
```

| Path | Purpose |
|------|---------|
| `/var/lib/geosyntra-api-staging/web/public` | Dioxus static (index.html, wasm, assets) |
| `GEOSYNTRA_WEB_DIST` in `/etc/geosyntra/api-staging.env` | Points Axum at the bundle above |

**Smoke against staging** (web and API on the same origin):

```bash
GEOSYNTRA_WEB_URL=http://YOUR_VPS:3003 \
GEOSYNTRA_API_URL=http://YOUR_VPS:3003 \
bash scripts/smoke-dioxus-web.sh
```

Ensure `CORS_ORIGINS` / `APP_ORIGIN` in `api-staging.env` include the staging app URL if behind nginx/TLS.

**Redis (Task 23.6):** optional `REDIS_URL=redis://127.0.0.1:6379/0` in `api-staging.env` for shared auth cache across restarts/replicas.

## Production cutover (Task 27)

**Pre-merge gates (local):**

```bash
bash scripts/check-route-parity.sh
bash scripts/run-api-integration-tests.sh
bash scripts/dev-dioxus-with-axum.sh          # terminal 1
bash scripts/smoke-dioxus-web.sh              # terminal 2
```

**Cutover steps** (after merge `feature/axum-migration` → `main`):

| Step | Action |
|------|--------|
| 1 | `bash scripts/build-dioxus-web.sh` |
| 2 | `export GEOSYNTRA_DEPLOY_HOST=…` |
| 3 | `nix run .#deploy -- .#hostinger-vps --skip-checks` (Axum production `:3001`) |
| 4 | `bash scripts/deploy-dioxus-production.sh` (rsync web bundle + `GEOSYNTRA_WEB_DIST`) |
| 5 | Set `APP_ORIGIN` / `CORS_ORIGINS` to production app URL in `/etc/geosyntra/api.env` |
| 6 | `GEOSYNTRA_WEB_URL=https://api.geosyntra.org GEOSYNTRA_API_URL=https://api.geosyntra.org bash scripts/smoke-dioxus-web.sh` |
| 7 | Stop Express / PM2; nginx already proxies `:3001` (`scripts/nginx-api.conf`) |

Production web + API share one origin when `GEOSYNTRA_WEB_DIST` is set — Axum serves Dioxus static and `/api/*` on the same port.

### Rollback runbook

If Axum + Dioxus production fails smoke or critical regressions appear:

| Step | Action |
|------|--------|
| 1 | Restore Express on `:3001` (PM2 or legacy `npm run vps:deploy`) |
| 2 | Unset or comment `GEOSYNTRA_WEB_DIST` in `/etc/geosyntra/api.env` if Axum left running |
| 3 | `systemctl stop geosyntra-api` (or repoint nginx to Express only) |
| 4 | Re-enable React static / GitHub Pages redirect if web UI was cut over |
| 5 | Staging Axum on `:3003` remains available for parity debugging |

**Time-to-rollback target:** nginx `proxy_pass` back to Express `:3001` + PM2 restart (< 5 min).

## Flake outputs
|--------|-------------|
| `packages.x86_64-linux.geosyntra-api` | Release binary |
| `packages.x86_64-linux.geosyntra-api-systemd` | Activation script |
| `deploy.nodes.hostinger-vps` | deploy-rs node |
| `deploy.nodes.hostinger-vps.profiles.geosyntra-api-staging` | Staging Axum on `:3003` |
| `apps.deploy` | `deploy` CLI |
| `nixosModules.geosyntra-api` | Optional NixOS module (not used on Ubuntu VPS) |

## Migration from Node deploy

| Legacy | Nix/deploy-rs |
|--------|---------------|
| `npm run vps:deploy` | `nix run .#deploy -- .#hostinger-vps` |
| PM2 / Node tarball | systemd + Nix profile |
| `/opt/geosyntra-api` | Nix store + `/var/lib/geosyntra-api` |

Express remains production on `main` until **Task 27 cutover**; run Axum on `:3003` beside Express on the feature branch until then.
