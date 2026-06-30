# GeoSyntra Hostinger VPS — dual-stack deploy and NixOS migration

Production policy (locked until Rust sign-off):

| Hostname | Stack | Port |
|----------|-------|------|
| `www.geosyntra.org` | React | nginx static |
| `api.geosyntra.org` | Express | `:3001` |
| `app.geosyntra.org` | Dioxus + Axum | `:3003` |

## Local setup (no VPS changes)

```bash
cd Geosyntra
nix profile install .#geosyntra-deploy
geosyntra-deploy --help
```

Or from dev shell: `nix develop` then `geosyntra-deploy --help`.

**Windows:** see [docs/DEPLOY-FROM-WINDOWS.md](../docs/DEPLOY-FROM-WINDOWS.md) (WSL2 recommended).

## Database namespaces (PostgreSQL on NixOS)

| Database | Stack |
|----------|-------|
| `geosyntra_express` | Express production (`api.geosyntra.org`) |
| `geosyntra_axum` | Axum preview (`app.geosyntra.org`) |

Defined in [`nix/database-namespaces.nix`](nix/database-namespaces.nix).

Local dev uses `geosyntra_dev` on `:5433` (unchanged).

## Before nixos-anywhere (mandatory)

**Pull read-only backup from Ubuntu VPS** (does not modify production):

```bash
# hostinger.secrets.env: VPS_HOST or GEOSYNTRA_DEPLOY_HOST, SSH key or VPS_ROOT_PASS
export GEOSYNTRA_DEPLOY_HOST=46.202.183.152
geosyntra-deploy backup pull
geosyntra-deploy backup list
geosyntra-deploy backup restore
```

Backup lands in `migration/vps-backup/<timestamp>/` (gitignored):

- `env/` — systemd env files, discovered `.env` files, local `hostinger.secrets.env` copy
- `data/` — sqlite, vault json, `GEOSYNTRA_DATA_DIR`, web static
- `postgres/` — per-stack dumps, full cluster inventory, `globals.sql`
- `nginx/`, `systemd/`, `letsencrypt/` — reference for post-NixOS parity
- `manifest.json` — namespace mapping for restore

Restore prep: `migration/vps-backup/restore-ready/` + `RESTORE.md`.

## Deploy commands (when you choose to deploy)

```bash
# Main production — Express only
geosyntra-deploy express

# Rust preview — app subdomain only
geosyntra-deploy staging

# Smoke Dioxus on app subdomain
geosyntra-deploy smoke dioxus --web-url https://app.geosyntra.org --api-url https://app.geosyntra.org
```

**Never** deploy Axum to `api.geosyntra.org` until cutover. deploy-rs production profile is disabled in [`nix/deploy-hostinger.nix`](nix/deploy-hostinger.nix).

## nginx (Ubuntu today)

Template: [`scripts/nginx-geosyntra-dual-stack.conf`](scripts/nginx-geosyntra-dual-stack.conf)

Install manually on VPS when ready — not applied by this repo automatically.

## NixOS install (future — destructive)

Only after `backup pull`:

```bash
geosyntra-deploy nixos install --confirm
# after reboot + restore secrets/DB:
geosyntra-deploy nixos switch
```

Flake: `nixosConfigurations.hostinger-vps`

## Secrets (sops-nix)

```bash
cp secrets/.sops.yaml.example secrets/.sops.yaml   # add age public key
cp secrets/api.yaml.example secrets/api.yaml
sops encrypt secrets/api.yaml   # after filling from backup restore-ready/
```

Separate keys: `express_env`, `axum_staging_env`.

## Future cutover

When Rust stack is ready: repoint `api.geosyntra.org` nginx to Axum, stop Express. See plan checklist in `.cursor/plans/`.
