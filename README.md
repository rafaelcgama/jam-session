# 🎸 Jam Session — Who Plays What

A lightweight web app for jam session musicians to register their name, instruments, and the songs they play. Built for the **Digital Nomads FLN** community.

**Live App:** [https://dnomads-jam-fln.duckdns.org](https://dnomads-jam-fln.duckdns.org)

---

## ✨ Features

- Add musicians to the session with their name and instruments
- List the songs a musician plays, with the specific instrument for each song
- View, edit, or remove any musician's profile
- Search musicians by name or song
- Filter the grid by instrument
- Song-first data model — add a song once, assign multiple instruments to it
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
├── jam.db            # SQLite database (gitignored, lives on server)
├── frontend/
│   ├── index.html    # Single-page app shell
│   ├── style.css     # Styling
│   └── app.js        # All UI logic (rendering, modals, API calls)
└── tests/
    └── test_api.py   # Unit & integration tests
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

Tests use `pytest` with FastAPI's `TestClient`. Each test runs against an isolated, ephemeral SQLite database so your real data is never touched.

```bash
# Install test dependencies (first time only)
pip install -r requirements.txt

# Run all tests
pytest tests/ -v

# Run with a coverage report
pytest tests/ -v --tb=short
```

---

## 🌐 API Reference

All endpoints are prefixed with `/api`.

| Method   | Endpoint                        | Description                   |
|----------|---------------------------------|-------------------------------|
| `GET`    | `/api/musicians`                | List all musicians            |
| `POST`   | `/api/musicians`                | Add a new musician            |
| `PUT`    | `/api/musicians/{musician_id}`  | Update an existing musician   |
| `DELETE` | `/api/musicians/{musician_id}`  | Remove a musician             |

### Musician Schema

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
- **Location on server:** `/var/www/jam-session/jam.db`
- **Schema:**

```sql
CREATE TABLE musicians (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    colorIdx  INTEGER DEFAULT 0,
    roles     TEXT NOT NULL DEFAULT '[]',   -- JSON array of role IDs
    songs     TEXT NOT NULL DEFAULT '{}',   -- JSON dict: song -> [role IDs]
    joinedAt  TEXT NOT NULL
);
```

> **⚠️ Important:** Never delete `jam.db` on the production server. Any structural schema changes must be handled via a migration script, not by dropping the database.

---

## 🔖 Versioning

| Version | Description                                             |
|---------|---------------------------------------------------------|
| `v1.0.0` | Initial production release — song-first data model, live on GCP |

---

## 🤝 Contributing

This is an internal tool for the Digital Nomads FLN community. Feel free to open issues or pull requests for improvements.
