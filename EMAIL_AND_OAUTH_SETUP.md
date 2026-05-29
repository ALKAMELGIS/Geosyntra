# GeoSyntra — Multi-provider OAuth + Hostinger email (SMTP, SPF, DKIM)

## 1. OAuth sign-in (Google, LinkedIn, GitHub)

The welcome wizard shows glass-style **Continue with Google / LinkedIn / GitHub** buttons. **Apple** is a disabled placeholder.

**Production (recommended):** backend-only Passport redirect flow — secrets never reach the browser.

| Provider | Start URL | Callback URL (register in provider console) |
|----------|-----------|---------------------------------------------|
| Google | `GET /api/auth/google` | `https://geosyntra.org/api/auth/google/callback` |
| LinkedIn | `GET /api/auth/linkedin` | `https://geosyntra.org/api/auth/linkedin/callback` |
| GitHub | `GET /api/auth/github` | `https://geosyntra.org/api/auth/github/callback` |

API `.env` (aliases supported):

```env
JWT_SECRET=...
SESSION_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
OAUTH_CALLBACK_ORIGIN=https://geosyntra.org
```

After login, users are redirected to `#/app/auth/oauth-callback` then the dashboard (`/satellite/indices`). HttpOnly cookies carry access + refresh JWTs.

**Local dev (popup flow — default on localhost):** register this redirect on **Google** and **LinkedIn** (same as GitHub):

`http://localhost:5173/Geosyntra/oauth-return.html`

Set in `frontend/.env` and `backend/.env`:

```env
VITE_AUTH_GOOGLE_REDIRECT_URI=http://localhost:5173/Geosyntra/oauth-return.html
VITE_AUTH_LINKEDIN_REDIRECT_URI=http://localhost:5173/Geosyntra/oauth-return.html
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5173/Geosyntra/oauth-return.html
LINKEDIN_OAUTH_REDIRECT_URI=http://localhost:5173/Geosyntra/oauth-return.html
```

**Legacy SPA popup flow** (`oauth-return.html` + `/api/auth/*/exchange`) still works for local dev.

## 2. Google & Apple (legacy popup flow)

The UI can still use **oauth-return.html** when not using server redirect. They work when the **Node API** and OAuth keys are configured.

### A. Point the static site to your API

On **GitHub Pages** (`www.geosyntra.org`), set a repository secret and rebuild:

| Secret | Example |
|--------|---------|
| `VITE_API_BASE_URL` | `https://api.geosyntra.org` (your Hostinger Node host) |

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**, then re-run **Deploy to GitHub Pages**.

### B. API server — app URL for verification links & OAuth redirect

On the **backend** `.env` (Hostinger VPS / Node app):

```env
APP_ORIGIN=https://www.geosyntra.org
APP_BASE_PATH=/
```

### C. Google OAuth (Gmail sign-in)

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → **Credentials** → **OAuth 2.0 Client ID** (Web application).
2. **Authorized redirect URIs** (must match **exactly** — character for character):

   **Local dev (Vite):**

   `http://localhost:5173/Geosyntra/oauth-return.html`

   **Production (GitHub Pages):**

   `https://www.geosyntra.org/oauth-return.html`

   (Add both if you test locally and deploy to Pages.)

3. **Authorized JavaScript origins** (same OAuth client — required for browser sign-in):

   `http://localhost:5173`

   `http://127.0.0.1:5173` (optional, if you open the app via 127.0.0.1)

4. Open the app only as **http://localhost:5173/Geosyntra/** (not 127.0.0.1) so the redirect URI matches.

5. If the app is in **Testing** mode, add your Gmail under **OAuth consent screen → Test users**.

6. API `.env`:

```env
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxxx
GOOGLE_OAUTH_REDIRECT_URI=https://www.geosyntra.org/oauth-return.html
```

No need to bake the client ID into the Pages build — the SPA loads it from `GET /api/auth/oauth/config`.

### C2. LinkedIn Sign In

1. [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) → your app → **Auth** tab.
2. Under **OAuth 2.0 settings** → **Authorized redirect URLs for your app**, add (exact):

   `http://localhost:5173/Geosyntra/oauth-return.html`

   `https://www.geosyntra.org/oauth-return.html`

3. Enable **Sign In with LinkedIn using OpenID Connect** (Products tab) if the app uses `openid profile email` scopes.
4. API `.env`: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_OAUTH_REDIRECT_URI` (same redirect URI as Google popup flow).

### D. Apple Sign In

1. [Apple Developer](https://developer.apple.com/) → Identifiers → **Services ID** (Sign in with Apple).
2. Domains: `www.geosyntra.org` — Return URL: `https://www.geosyntra.org/oauth-return.html`
3. API `.env`:

```env
APPLE_OAUTH_CLIENT_ID=com.your.bundle.service
APPLE_OAUTH_TEAM_ID=XXXXXXXXXX
APPLE_OAUTH_KEY_ID=XXXXXXXXXX
APPLE_OAUTH_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
APPLE_OAUTH_REDIRECT_URI=https://www.geosyntra.org/oauth-return.html
```

Restart the API after changing env vars.

---

## 2. Verification email via Hostinger SMTP (not PHP `mail()`)

Registration uses `backend/server/authEmail.js`: **Resend** (if `RESEND_API_KEY` is set) or **SMTP** (Hostinger).

### A. Create a mailbox on Hostinger

1. **hPanel → Emails** → create e.g. `noreply@geosyntra.org` (or `auth@geosyntra.org`).
2. Note the mailbox password.

### B. API `.env` — Hostinger SMTP

```env
# Prefer SMTP on Hostinger (disable Resend if you only use SMTP)
# RESEND_API_KEY=

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@geosyntra.org
SMTP_PASS=your-mailbox-password
SMTP_FROM=Geosyntra <noreply@geosyntra.org>

APP_ORIGIN=https://www.geosyntra.org
APP_BASE_PATH=/
```

Alternative (TLS on port 587):

```env
SMTP_PORT=587
SMTP_SECURE=false
```

Restart the Node API. Check: `GET https://YOUR_API/api/auth/email/status` → `{ "configured": true, "provider": "smtp" }`.

### C. SPF (DNS)

In **Hostinger → DNS** for `geosyntra.org`, add a **TXT** record:

| Type | Name | Value |
|------|------|--------|
| TXT | `@` | `v=spf1 include:_spf.mail.hostinger.com ~all` |

(If Hostinger shows a ready-made SPF value in **Emails → DNS / Email records**, use that instead.)

### D. DKIM (DNS)

1. **hPanel → Emails → Domain** → **DNS records** / **Authenticate email**.
2. Copy the **DKIM** TXT record Hostinger provides (name often `hostingermail1._domainkey` or similar).
3. Add it as **TXT** in DNS. Propagation can take up to 24 hours.

### E. DMARC (recommended)

| Type | Name | Value |
|------|------|--------|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@geosyntra.org` |

### F. Troubleshooting

| Symptom | Fix |
|---------|-----|
| No email at all | `email/status` shows `configured: false` → set SMTP_* on API host |
| Email in spam | Complete SPF + DKIM; use `SMTP_FROM` same domain as `SMTP_USER` |
| Link goes to wrong site | Set `APP_ORIGIN` + `APP_BASE_PATH=/` |
| Sign-up works but no mail on Pages only | Pages has no SMTP — mail is sent only by the **API** server |

---

## 3. Quick checklist

- [ ] Node API running on Hostinger with persistent `AGRI_DATA_DIR` / `AGRI_USER_DB_PATH`
- [ ] `VITE_API_BASE_URL` secret set for GitHub Pages build
- [ ] `APP_ORIGIN=https://www.geosyntra.org`, `APP_BASE_PATH=/`
- [ ] Hostinger SMTP env vars on API
- [ ] SPF + DKIM TXT records in DNS
- [ ] Google redirect URI: `https://www.geosyntra.org/oauth-return.html`
- [ ] Apple return URL matches
- [ ] Hard refresh site (Ctrl+F5) after deploy
