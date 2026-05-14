# 🎼 JAM Session — Digital Nomads FLN

A lightweight web app for jam session members to register their name, instruments, and the songs they play. Built for the **Digital Nomads FLN** community.

**Live App:** [https://dnomads-jam-fln.duckdns.org](https://dnomads-jam-fln.duckdns.org)

---

## ✨ Features

- Add members with their name, instruments, and song repertoire
- View, edit, or remove profiles from the crew grid
- Filter the crew by instrument and search by members or songs
- Songbook tab that groups all registered songs and shows who can play each instrument
- Bandbook tab that groups songs by artist/band from `Artist - Song` titles
- Instant Band breakdowns for a song, with clickable badges for members that open profiles without leaving Songbook or Bandbook
- iTunes-powered song autocomplete when adding repertoire, while still allowing custom titles
- Song-first data model: add a song once, assign multiple instruments to it
- Server-side validation for duplicate names, unknown instruments, blank song titles, and songs without instruments
- Safer frontend rendering for user-provided names, band names, and song titles
- Fully responsive and mobile-friendly

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
├── database.py       # SQLite helpers (CRUD operations)
├── requirements.txt  # Python dependencies
├── jam.db            # Local SQLite database (gitignored)
├── frontend/
│   ├── index.html    # Single-page app shell
│   ├── style.css     # Styling
│   └── app.js        # All UI logic (rendering, modals, API calls)
├── scripts/
│   ├── migrate_table_to_members.py  # Rename legacy DB table from musicians to members
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

# 4. Start the development server
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

Current coverage focuses on API validation, database helpers, Songbook/Bandbook grouping, frontend escaping, and dataset encoding helpers.

---

## 🌐 API Reference

All endpoints are prefixed with `/api`.

| Method   | Endpoint                    | Description                   |
|----------|-----------------------------|-------------------------------|
| `GET`    | `/api/members`              | List all members              |
| `POST`   | `/api/members`              | Add a profile to members      |
| `PUT`    | `/api/members/{member_id}` | Update one profile            |
| `DELETE` | `/api/members/{member_id}` | Remove one profile            |

### Members Payload

```json
{
  "name":     "Carlos",
  "colorIdx": 0,
  "roles":    ["guitarist", "singer"],
  "songs": {
    "Wonderwall":   ["guitarist"],
    "Sweet Child":  ["guitarist", "singer"]
  }
}
```

### Validation Rules

- `name` is required and must be unique case-insensitively.
- `roles` must include at least one known instrument.
- Song titles must contain visible text after sanitization.
- Remaster-only song suffixes like `(Remastered)` and `- 2014 Remaster` are removed so Songbook grouping stays clean.
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

# 2. SSH into the server and pull the update
gcloud compute ssh jam-session-vm --zone=us-west1-b
cd /var/www/jam-session
sudo git pull
```

The Nginx + systemd setup means the app is automatically served and restarts on reboot. No manual service restart is needed for frontend-only changes.

---

## 🗄 Database

- **Engine:** SQLite
- **Local development DB:** `./jam.db`
- **Production DB:** `/var/www/jam-session/jam.db` on `jam-session-vm`
- **Schema:**

```sql
CREATE TABLE members (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    colorIdx  INTEGER DEFAULT 0,
    roles     TEXT NOT NULL DEFAULT '[]',   -- JSON array of role IDs
    songs     TEXT NOT NULL DEFAULT '{}',   -- JSON dict: song -> [role IDs]
    joinedAt  TEXT NOT NULL
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

Existing names in members can be normalized to the app's title-case convention with:

```bash
./scripts/migrate_names_title_case.py ./jam.db
```

Existing song titles can be normalized to remove remaster-only variants with:

```bash
./scripts/migrate_song_titles.py ./jam.db
```

Older databases with a `musicians` table are migrated to `members` automatically on app startup. You can also run the table migration manually:

```bash
./scripts/migrate_table_to_members.py ./jam.db
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
| `v1.2.0` | Songbook and Bandbook polish, profile links from song/band breakdowns, safer frontend rendering, stricter API validation, frontend unit tests |
| `v1.1.0` | Songbook/Bandbook views, members search improvements, iTunes autocomplete, dynamic section titles |
| `v1.0.0` | Initial production release — song-first data model, live on GCP |

---

## 🤝 Contributing

This is an internal tool for the Digital Nomads FLN community. Feel free to open issues or pull requests for improvements.
