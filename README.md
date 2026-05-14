# 🎼 JAM Session — Digital Nomads FLN

A lightweight web app for jam session members to register their name, instruments, and the songs they play. Built for the **Digital Nomads FLN** community.

**Live App:** [https://dnomads-jam-fln.duckdns.org](https://dnomads-jam-fln.duckdns.org)

**Member Instructions:** [MEMBER_GUIDE.md](MEMBER_GUIDE.md)

---

## ✨ Features

- Add members with their instruments and song repertoire
- Search and filter the crew by member, song, or instrument
- Use Apple Music autocomplete to add songs consistently
- Add custom instruments through the `Other` option
- Browse the Songbook to see who can play each song and instrument
- Browse the Bandbook to group songs by artist or band
- Open member profiles from the crew, Songbook, or Bandbook
- Log in with email before entering the app; only the profile owner or admin can edit/remove a profile

---

## 🏗 Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Backend    | Python 3.11 · FastAPI · Uvicorn   |
| Database   | SQLite (single-file, zero config) |
| Frontend   | Vanilla HTML · CSS · JavaScript   |
| Server     | Nginx (reverse proxy) · GCP e2-micro VM |
| SSL        | Let's Encrypt via Certbot         |
| Domain     | DuckDNS                           |

---

## 📁 Project Structure

```
jam-session/
├── main.py           # FastAPI app & API routes
├── auth.py           # Login/session helpers
├── database.py       # SQLite helpers (CRUD operations)
├── domain.py         # Shared backend validation and normalization rules
├── requirements.txt  # Python dependencies
├── jam.db            # Local SQLite database (gitignored)
├── frontend/
│   ├── index.html    # Single-page app shell
│   ├── style.css     # Styling
│   └── app.js        # All UI logic (rendering, modals, API calls)
├── scripts/
│   ├── backup_prod_db.sh           # Create timestamped VM-side production DB backups
│   ├── restore_prod_db.sh          # Restore a production DB backup and restart the app
│   ├── migrate_names_title_case.py  # Normalize existing names in members
│   ├── migrate_song_titles.py       # Normalize existing song titles in members
│   ├── pull_prod_db.sh              # Refresh local jam.db from production when needed
│   └── pull_prod_snapshot.sh        # Refresh prod-jam.db snapshot for DataGrip
└── tests/
    ├── frontend.test.js  # Frontend unit tests using Node's built-in test runner
    ├── test_api.py       # Backend unit & integration tests
    └── test_frontend.py  # Pytest wrapper for the frontend test suite
```

---

## 🚀 Running Locally

### Prerequisites
- Python 3.11+
- `pip`

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/rafaelcgama/jam-session.git
cd jam-session

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Optional local login settings
export JAM_SESSION_ADMIN_EMAIL="admin@jam.local"
export JAM_SESSION_ADMIN_PASSWORD="admin-jam-session"
export JAM_SESSION_SECRET="change-me-for-production"

# 5. Start the development server
python main.py
```

The app will be available at **[http://localhost:3000](http://localhost:3000)**.

---

## 🧪 Running Tests

Tests use `pytest` with FastAPI's `TestClient`. Each backend test runs against an isolated, ephemeral SQLite database so your real data is never touched. Frontend unit tests use Node's built-in test runner and are invoked by `pytest`.

```bash
# Install test dependencies (first time only)
pip install -r requirements.txt

# Run all backend and frontend tests
pytest tests/ -v

# Run only frontend unit tests
node --test tests/frontend.test.js

# Check JavaScript syntax
node --check frontend/app.js

# Run with a coverage report
pytest tests/ -v --tb=short
```

Current coverage focuses on login/session behavior, owner/admin authorization, API validation, database helpers, domain normalization, Songbook/Bandbook grouping, custom instruments, frontend rendering helpers, and API error handling.

---

## 🌐 API Reference

All endpoints are prefixed with `/api`.

| Method   | Endpoint                    | Description                   |
|----------|-----------------------------|-------------------------------|
| `GET`    | `/api/session`              | Return current login state    |
| `POST`   | `/api/login`                | Log in with email/password    |
| `POST`   | `/api/register`             | Create a member login         |
| `POST`   | `/api/logout`               | Clear the login session       |
| `GET`    | `/api/members`              | List all members              |
| `POST`   | `/api/members`              | Add a profile to members      |
| `PUT`    | `/api/members/{member_id}` | Update one profile            |
| `DELETE` | `/api/members/{member_id}` | Remove one profile            |

All member endpoints require a logged-in session cookie. A member can manage only profiles created while logged in with that same email. The admin account can manage all profiles.

### Members Payload

```json
{
  "name":     "Carlos",
  "roles":    ["guitarist", "singer"],
  "songs": {
    "Wonderwall":   ["guitarist"],
    "Sweet Child":  ["guitarist", "singer"]
  }
}
```

Responses include `canManage`, a boolean used by the frontend to show or hide edit controls for the current session. The stored owner email is not returned publicly.

### Login Configuration

The login portal is intentionally lightweight for launch. Members create their own email/password login from the portal. That email becomes the owner of any profile they create.

| Environment variable | Purpose | Local default |
|----------------------|---------|---------------|
| `JAM_SESSION_ADMIN_EMAIL` | Admin login email | `admin@jam.local` |
| `JAM_SESSION_ADMIN_PASSWORD` | Admin password | `admin-jam-session` |
| `JAM_SESSION_SECRET` | Signs browser session cookies | `dev-session-secret-change-me` |
| `JAM_SESSION_COOKIE_SECURE` | Set to `true` when served over HTTPS | unset / false |

Before production launch, set real values for the admin password and `JAM_SESSION_SECRET`.

### Validation Rules

- `name` is required and must be unique case-insensitively.
- `roles` must include at least one known instrument.
- Custom instruments are stored as `other:Instrument Name` and display with the clef icon.
- Member and custom instrument names are title-cased and simplified to ASCII for consistency.
- Song titles must contain visible text after sanitization.
- Remaster-only song suffixes like `(Remastered)` and `- 2014 Remaster` are removed so Songbook grouping stays clean.
- Hyphens inside song titles are preserved; only the first `Artist - Song` delimiter is used for normalization.
- Every song must include at least one known instrument.
- Duplicate role IDs are removed while preserving order.
- Song instruments are merged into the profile's role list so profile cards and song breakdowns stay consistent.

---

## 🚢 Deployment

The app is deployed on a **Google Cloud e2-micro** instance (Always Free tier).

### Deploy a code update

```bash
# 1. Push changes to GitHub from your local machine
git add .
git commit -m "your message"
git push origin main

# 2. Back up production data before deploying
./scripts/backup_prod_db.sh

# 3. SSH into the server and pull the update
gcloud compute ssh jam-session-vm --zone=us-west1-b
cd /var/www/jam-session
sudo git pull

# 4. Restart only when backend code or startup migrations changed
sudo systemctl restart jam-session
```

The Nginx + systemd setup means the app is automatically served and restarts on reboot. No manual service restart is needed for frontend-only changes, but backend code and database startup migrations need the service restart above.

Production should define real login values in the service environment:

```bash
JAM_SESSION_ADMIN_EMAIL="your-admin-email@example.com"
JAM_SESSION_ADMIN_PASSWORD="admin-password"
JAM_SESSION_SECRET="long-random-secret"
JAM_SESSION_COOKIE_SECURE="true"
```

---

## 🗄 Database

- **Engine:** SQLite
- **Local development DB:** `./jam.db`
- **Production DB:** `/var/www/jam-session/jam.db` on `jam-session-vm`
- **Schema:**

```sql
CREATE TABLE members (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT,                        -- normalized member login email
    roles      TEXT NOT NULL DEFAULT '[]',  -- JSON array of role IDs
    songs      TEXT NOT NULL DEFAULT '{}',  -- JSON dict: song -> [role IDs]
    joined_at  TEXT NOT NULL
);

CREATE TABLE users (
    email          TEXT PRIMARY KEY,
    password_hash  TEXT NOT NULL,
    created_at     TEXT NOT NULL
);
```

### Local vs Production Data

Local development and production use separate SQLite files:

- Local app at `http://localhost:3000` reads `./jam.db`.
- Live app at `https://dnomads-jam-fln.duckdns.org` reads `/var/www/jam-session/jam.db` on the VM.
- The files do not sync automatically.
- Local test data should never be pushed back over production data.

When you want local development to reflect the latest live data, pull a fresh production snapshot down:

```bash
./scripts/pull_prod_db.sh
```

The script:

- backs up the current local database under `.db_backups/jam.db.backup.YYYYMMDDHHMMSS`
- copies the live production DB from the VM
- validates the downloaded SQLite file with `PRAGMA integrity_check`
- replaces only the local `jam.db`
- removes the temporary DB copy from the VM

This is an intentional one-way refresh from production to local. It keeps costs at zero while keeping development data separate by default.

### Production Backups and Restore

The production database is not stored in Git. It lives on the VM at `/var/www/jam-session/jam.db`, so code changes should not erase member data.

Before risky work or any deploy, create a VM-side backup:

```bash
./scripts/backup_prod_db.sh
```

Backups are stored on the VM under `/var/www/jam-session/.db_backups/` as timestamped files like:

```text
jam.db.backup.YYYYMMDDHHMMSS
```

By default, the backup script keeps the newest 30 backups. Override that with:

```bash
JAM_SESSION_KEEP_BACKUPS=60 ./scripts/backup_prod_db.sh
```

List available production backups:

```bash
./scripts/restore_prod_db.sh --list
```

Restore the newest backup and restart the service:

```bash
./scripts/restore_prod_db.sh
```

Restore a specific backup:

```bash
./scripts/restore_prod_db.sh jam.db.backup.YYYYMMDDHHMMSS
```

The restore script first creates a `jam.db.pre-restore.TIMESTAMP` safety copy of the current DB before replacing it.

Existing names in members can be normalized to the app's simple ASCII title-case convention with:

```bash
./scripts/migrate_names_title_case.py ./jam.db
```

Existing song titles can be normalized to remove remaster-only variants with:

```bash
./scripts/migrate_song_titles.py ./jam.db
```

Run the same script on production only after deploying matching application code:

```bash
ssh jam-session-vm
cd /var/www/jam-session
./scripts/migrate_names_title_case.py ./jam.db
```

### DataGrip Setup

You can keep two SQLite data sources in DataGrip:

| DataGrip data source | File | Purpose |
|----------------------|------|---------|
| `Jam Session Local` | `./jam.db` | Local development and testing data |
| `Jam Session Production Snapshot` | `./prod-jam.db` | Refreshable copy of live production data |

Create the local DataGrip source from:

```text
/Users/rafaelcgama/Projects/jam-session/jam.db
```

Create the production snapshot source from:

```text
/Users/rafaelcgama/Projects/jam-session/prod-jam.db
```

To refresh only the production snapshot for DataGrip without touching your local development DB:

```bash
./scripts/pull_prod_snapshot.sh
```

This updates `prod-jam.db` from the VM. In DataGrip, refresh the data source/table after running the script.

> **⚠️ Important:** Never delete or overwrite `jam.db` on the production server. Any structural schema changes must be handled via a migration script, not by dropping the database.

---

## 🔖 Versioning

| Version | Description                                             |
|---------|---------------------------------------------------------|
| `v1.4.0` | Launch hardening: clean member schema, production backup/restore scripts, resilient member parsing, frontend robustness fixes, custom-instrument normalization consistency, and broader tests |
| `v1.3.0` | Custom instruments, cleaner song grouping, profile links from repertoire views, shared validation rules, and broader frontend/backend tests |
| `v1.2.0` | Songbook and Bandbook polish, profile links from song and band breakdowns, stricter API validation, and frontend tests |
| `v1.1.0` | Songbook/Bandbook views, search improvements, and Apple Music autocomplete |
| `v1.0.0` | Initial production release — song-first data model, live on GCP |

---

## 🤝 Contributing

This is an internal tool for the Digital Nomads FLN community. Feel free to open issues or pull requests for improvements.
