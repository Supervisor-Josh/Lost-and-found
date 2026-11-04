# Campus Finds — University Lost & Found

Campus Finds is a mobile-first lost-and-found application for a university
community. Students can browse verified reports without an account, report
items, submit claims, and receive in-app notifications about possible matches.
Administrators review reports and claims before they are published or resolved.

## Features

### Community

- **Public browsing:** Anyone can browse verified community reports without
  logging in. Results are paginated 24 reports at a time, with Previous and
  Next controls when more reports are available.
- **Search and filters:** Search report titles and descriptions; filter by
  lost/found status, category, location, and date range.
- **Lost/found reports:** Signed-in users can report an item with a title,
  description, category, date, and location.
- **Item photos:** Add an optional JPEG, PNG, or WebP image (up to 5 MB) from
  your device or capture one using a supported device camera. Camera access
  requires browser permission and HTTPS or localhost. Browse images can be
  expanded to a full-screen view.
- **Claims:** A signed-in user can submit identifying details to claim a
  verified found item. An administrator reviews the claim.
- **Match alerts:** When reports are approved, the app checks for likely
  lost/found matches and creates in-app notifications for both reporters.
- **Claim updates:** The claimant receives a notification when a claim is
  approved or rejected.
- **Multiple signed-in users:** Each login receives its own expiring bearer
  token. Users can use separate devices or browser sessions at the same time.
- **Light and dark themes:** Use the sun/moon control in the top bar. The
  preference is remembered in the browser.
- **Responsive interface:** Mobile bottom navigation and touch-friendly forms
  adapt to smaller screens; desktop uses a full top navigation.
- **Admin review:** Reports stay private until approved. Claims are reviewed
  separately. A shared local development key protects the review endpoints.

### Authentication and account notes

- Create an account with a name, email, phone number, and password (minimum 8
  characters). Existing users sign in with their email and password.
- Passwords are stored as bcrypt hashes; the original password is never
  returned by the API.
- Sign-in lasts up to seven days. The browser keeps the token in
  `sessionStorage` for that tab/session. Signing out removes it from that
  browser session.
- Configure the same `LOST_FOUND_AUTH_SECRET` on every backend process serving
  this app. Keep it private and stable; changing it invalidates existing
  sessions.
- The prototype does not yet verify university email domains or provide
  password-reset, email-delivery, or production administrator accounts. The
  development admin key is not a substitute for production admin
  authentication.

## Requirements

- Python 3.10 or later with `pip`
- Node.js 20.19+ or 22.12+ with npm
- DB Browser for SQLite is optional and only needed to inspect the database

SQLite is included with Python. You do not need to install or run MySQL or
another database server.

## Run locally

Open two terminals in the project root (`Lost-and-found`).

### 1. Start the backend

Create and activate a virtual environment, then install Python dependencies.

**PowerShell:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
$env:LOST_FOUND_AUTH_SECRET = python -c "import secrets; print(secrets.token_urlsafe(48))"
$env:LOST_FOUND_ADMIN_KEY = python -c "import secrets; print(secrets.token_urlsafe(32))"
Write-Output "Authentication secret: $env:LOST_FOUND_AUTH_SECRET"
Write-Output "Admin key: $env:LOST_FOUND_ADMIN_KEY"
python -m uvicorn backend.main:app --reload
```

**Git Bash:**

```bash
python -m venv .venv
source .venv/Scripts/activate
python -m pip install -r backend/requirements.txt
export LOST_FOUND_AUTH_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export LOST_FOUND_ADMIN_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
echo "Authentication secret: $LOST_FOUND_AUTH_SECRET"
echo "Admin key: $LOST_FOUND_ADMIN_KEY"
python -m uvicorn backend.main:app --reload

```

Both values are displayed for local setup: enter the admin key in the app's
Admin tab, and keep the authentication secret private. Save the authentication
secret somewhere secure so you can set the **same value** when restarting the
backend or running multiple backend processes; changing it invalidates existing
login tokens. You can choose your own private values instead, but the auth
secret must be at least 32 characters.

The API and interactive API docs are available at:

- <http://127.0.0.1:8000>
- <http://127.0.0.1:8000/docs>

The SQLite database and tables are created automatically when the backend
starts. The database is `backend\lost_and_found.sqlite3`.

### 2. Start the frontend

In the second terminal, from the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually <http://localhost:5173>).

### 3. Use the app

- Browse reports immediately without creating an account.
- Open **Account** to create an account or switch to **Log in** for an existing
  account.
- Sign in to submit reports, claim found items, and see personal notifications.
- Open **Admin**, enter the `LOST_FOUND_ADMIN_KEY` from the backend terminal,
  and load the review queue to approve/reject reports or claims.
- Use the sun/moon icon in the header to change the theme.

## Use on a phone on the same Wi-Fi

For development testing on a phone, find the computer's local IPv4 address
(for example `192.168.1.25`) and substitute it below. Both devices must be on
the same trusted Wi-Fi network. Allow the ports through the computer's firewall
only on a trusted private network.

Set the frontend API URL before starting Vite:

**PowerShell (in the frontend terminal):**

```powershell
$env:VITE_API_BASE_URL = "http://192.168.1.25:8000"
npm run dev -- --host 0.0.0.0
```

**Git Bash (in the frontend terminal):**

```bash
export VITE_API_BASE_URL="http://192.168.1.25:8000"
npm run dev -- --host 0.0.0.0
```

In the backend terminal, add the phone-accessible frontend origin to CORS, then
start/restart Uvicorn listening on the local network:

**PowerShell:**

```powershell
$env:LOST_FOUND_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.25:5173"
python -m uvicorn backend.main:app --reload --host 0.0.0.0
```

**Git Bash:**

```bash
export LOST_FOUND_CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.25:5173"
python -m uvicorn backend.main:app --reload --host 0.0.0.0
```

Visit `http://192.168.1.25:5173` on the phone. Replace the sample address with
the computer's actual address. Do not expose this development server directly
to the public internet.

## Database and DB Browser for SQLite

DB Browser is a visual editor/viewer for the SQLite file; it does not run the
database server. The backend reads and writes the database directly.

1. Start the backend once to create the database.
2. Open **DB Browser for SQLite**.
3. Choose **Open Database** and select
   `Lost-and-found\backend\lost_and_found.sqlite3`.
4. Choose **Browse Data** and select `users`, `items`, `claims`, or
   `notifications`.
5. Refresh DB Browser to see recent changes.

SQLite uses WAL mode and a busy timeout to better handle simultaneous readers
and short concurrent writes. For a substantially larger production service,
plan a move to a server database such as PostgreSQL.

## Project layout

```text
Lost-and-found/
├── backend/
│   ├── database.py       # Engine (SQLite / PostgreSQL) and request sessions
│   ├── main.py           # FastAPI routes, auth, matching, and moderation
│   ├── models.py         # SQLAlchemy tables and relationships
│   ├── schemas.py        # API request and response validation
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # App screens, navigation, and API calls
│   │   ├── App.css       # Responsive light/dark theme styles
│   │   └── main.jsx      # React entry point
│   └── package.json      # npm scripts and dependencies
├── .env.example          # Environment variables template
├── requirements.txt      # Root Python dependencies for cloud PaaS
└── README.md
```

## Main API routes

The API is documented interactively at `/docs` while the backend is running.
Personal routes require `Authorization: Bearer <access_token>`; admin routes
require `X-Admin-Key`.

| Method | Route | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Service health & database connectivity probe |
| `GET` | `/items/` | Public | Browse and filter approved reports; supports `skip` and `limit` pagination |
| `GET` | `/items/{item_id}` | Public | Read one approved report |
| `GET` | `/items/{item_id}/photo` | Public | View a verified report photo |
| `POST` | `/users/` | Public | Register and receive a signed-in session |
| `POST` | `/auth/login` | Public | Sign in with an existing email and password |
| `POST` | `/items/` | Signed in | Submit a lost/found report |
| `POST` | `/items/{item_id}/photo` | Signed in, report owner | Upload the report photo |
| `POST` | `/items/{item_id}/claims/` | Signed in | Submit proof to claim a found item |
| `GET` | `/users/{user_id}/notifications/` | That user | View personal alerts |
| `PATCH` | `/users/{user_id}/notifications/{notification_id}/read` | That user | Mark an alert as read |
| `GET` | `/admin/items/` | Admin key | List reports for verification |
| `GET` | `/admin/items/{item_id}/photo` | Admin key | View a pending report photo |
| `PATCH` | `/admin/items/{item_id}/verification` | Admin key | Approve or reject a report |
| `GET` | `/admin/claims/` | Admin key | List claims awaiting review |
| `PATCH` | `/admin/claims/{claim_id}` | Admin key | Approve or reject a claim |

## Useful commands

Run these from their respective directories:

```text
Backend API:        python -m uvicorn backend.main:app --reload
Frontend dev:       npm run dev
Frontend lint:      npm run lint
Frontend build:     npm run build
```

The frontend's API defaults to `http://localhost:8000`. To use another API
address, set `VITE_API_BASE_URL` before starting Vite.

## Deployment readiness checklist

The app can be built and hosted, but the current configuration is a local
development prototype, not a production-ready service. Use these stages before
making it available to a campus community.

### 1. Choose and prepare the hosting architecture

- Decide on the public domain, expected traffic, operating region, service
  owner, and who will respond to outages and security reports.
- Host the Vite frontend as a static site and the FastAPI backend as a separate
  HTTPS service, or use another architecture that supports both processes.
  Configure the frontend's `VITE_API_BASE_URL` to the final API URL **at build
  time**; this value is public, so it must not contain credentials.
- Use a managed PostgreSQL database for a multi-instance or production
  deployment. This app currently hard-codes a SQLite file under `backend/`;
  container filesystems may be temporary, and SQLite is not a suitable shared
  database for multiple backend instances. Before switching databases, make
  the database URL configurable, add versioned migrations, and plan/test the
  existing SQLite data migration.
- If keeping SQLite for a small, single-instance pilot, attach durable
  persistent storage, run only one backend instance, and verify backups and
  restores. The database includes uploaded photo bytes, so account for their
  storage and backup size.

### 2. Configure production settings and secrets

- Set `LOST_FOUND_AUTH_SECRET` in the hosting provider's secret manager. It
  must be at least 32 characters and remain stable across restarts and backend
  instances. Never put it in frontend variables, source control, build logs,
  or a publicly served `.env` file.
- Do **not** use the shared `LOST_FOUND_ADMIN_KEY` as production admin
  authentication. It is a single shared key sent by the browser and cannot
  identify or audit individual administrators. Implement individual
  administrator accounts/roles (for example via a managed identity provider),
  authorization checks, and an audit trail before allowing real moderation.
  Keep the existing key only for a protected local or temporary staging setup.
- Set `LOST_FOUND_CORS_ORIGINS` to the exact deployed frontend origin(s), with
  no development origins or wildcard. Confirm preflight requests work.
- Enforce HTTPS for both frontend and API. Camera capture also requires HTTPS
  (or localhost during development); avoid mixed-content HTTP API URLs.
- Keep separate development, staging, and production configuration and
  secrets. Do not copy the repository's local `.env` into a deployment image.

### 3. Close the production security and account gaps

- Add university-email verification, password reset, and a reliable email
  delivery provider, or clearly limit the app to a trusted pilot until these
  exist.
- Add rate limits and abuse protection for registration, login, claims, and
  uploads. Review password policy, token lifetime/storage, session revocation,
  and protection against cross-site scripting. The current bearer token is
  stored in browser `sessionStorage`.
- Review every endpoint's authentication and authorization, including whether
  public item details and reporter contact information should be exposed.
  Ensure administrators can access only the intended data.
- Review upload validation, storage permissions, file size limits, retention,
  and safe image delivery. For larger usage, store images in managed object
  storage rather than database BLOBs.
- Publish a privacy notice and define consent, data-retention, account/data
  deletion, backup-retention, and incident-response procedures. This app
  stores names, email addresses, phone numbers, claims, and photos.
- Disable or protect interactive API documentation in production if it is not
  needed. Do not expose debug output or secrets in error responses or logs.

### 4. Make deploys repeatable and recoverable

- Add automated backend tests for registration/login, permissions, moderation,
  claims, uploads, pagination, and database migrations.
- In CI, install from pinned/locked dependencies, run dependency vulnerability
  checks, backend tests, and frontend lint/build, then deploy the exact
  artifact that passed checks.
- Add versioned database migrations and test them against a copy of production
  data. The current schema is created/adjusted during backend startup; do not
  rely on that as a production migration and rollback process.
- Configure health/readiness probes that check the database, structured
  application logs, error/availability monitoring, and alerts. The current
  `/` endpoint is only a welcome response, not a database readiness check.
- Automate encrypted database and image backups, set a retention policy, and
  practice restoring them. Decide how to roll back the app and handle a
  migration that cannot be rolled back.
- Deploy to staging first. Test account flows, admin review, email, CORS,
  camera/photo upload, pagination, backups, and restore using production-like
  HTTPS URLs before promoting to production.

### 5. Production smoke check

- Confirm the frontend loads over HTTPS and points to the production API.
- Create/sign in as a normal user; submit a report, upload a photo, and verify
  that moderation and claims behave correctly.
- Confirm unauthenticated users cannot use personal/admin routes and that
  moderation is restricted to authorized administrators.
- Confirm data survives a backend restart and a backup can be restored.
- Check logs and alerts, then document the service owner, support contact, and
  incident/rollback procedure.
