"""
Unit tests for the Jam Session API.

Run with:
    pytest tests/ -v
"""
import json
import pytest
from fastapi.testclient import TestClient

# ── Override DB path to use an in-memory / temp DB during tests ──────────────
import database
import tempfile
from pathlib import Path

@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    """Each test gets its own empty SQLite database."""
    tmp_db = tmp_path / "test_jam.db"
    monkeypatch.setattr(database, "DB_PATH", tmp_db)
    database.init_db()
    yield
    # Clean up is automatic since tmp_path is ephemeral


# ── Import app AFTER patching ─────────────────────────────────────────────────
from main import app

@pytest.fixture
def client():
    return TestClient(app)


# ── Helper ────────────────────────────────────────────────────────────────────
def create_musician(client, name="Carlos", roles=None, songs=None):
    payload = {
        "name": name,
        "colorIdx": 0,
        "roles": roles or ["guitarist"],
        "songs": songs or {"Wonderwall": ["guitarist"]},
    }
    return client.post("/api/musicians", json=payload)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/musicians
# ─────────────────────────────────────────────────────────────────────────────
class TestListMusicians:
    def test_returns_empty_list_initially(self, client):
        res = client.get("/api/musicians")
        assert res.status_code == 200
        assert res.json() == []

    def test_returns_all_musicians(self, client):
        create_musician(client, name="Carlos")
        create_musician(client, name="Sofia")
        res = client.get("/api/musicians")
        assert res.status_code == 200
        assert len(res.json()) == 2


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/musicians
# ─────────────────────────────────────────────────────────────────────────────
class TestCreateMusician:
    def test_creates_musician_with_valid_data(self, client):
        res = create_musician(client, name="Carlos", roles=["guitarist", "singer"])
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "Carlos"
        assert "guitarist" in body["roles"]
        assert "singer" in body["roles"]
        assert "id" in body
        assert "joinedAt" in body

    def test_creates_musician_with_songs(self, client):
        songs = {"Wonderwall": ["guitarist"], "Sweet Child": ["guitarist", "singer"]}
        res = create_musician(client, name="Carlos", songs=songs)
        assert res.status_code == 201
        assert res.json()["songs"] == songs

    def test_rejects_empty_name(self, client):
        res = client.post("/api/musicians", json={"name": "  ", "roles": ["guitarist"], "songs": {}})
        assert res.status_code == 400
        assert "Name is required" in res.json()["detail"]

    def test_rejects_empty_roles(self, client):
        res = client.post("/api/musicians", json={"name": "Carlos", "roles": [], "songs": {}})
        assert res.status_code == 400
        assert "role" in res.json()["detail"].lower()

    def test_rejects_duplicate_name(self, client):
        create_musician(client, name="Carlos")
        res = create_musician(client, name="Carlos")
        assert res.status_code == 409
        assert "already in the session" in res.json()["detail"]

    def test_duplicate_check_is_case_insensitive(self, client):
        create_musician(client, name="Carlos")
        res = create_musician(client, name="carlos")
        assert res.status_code == 409

    def test_strips_whitespace_from_name(self, client):
        res = client.post("/api/musicians", json={"name": "  Carlos  ", "roles": ["guitarist"], "songs": {}})
        assert res.status_code == 201
        assert res.json()["name"] == "Carlos"


# ─────────────────────────────────────────────────────────────────────────────
# PUT /api/musicians/{id}
# ─────────────────────────────────────────────────────────────────────────────
class TestUpdateMusician:
    def test_updates_musician_name(self, client):
        musician_id = create_musician(client, name="Carlos").json()["id"]
        res = client.put(f"/api/musicians/{musician_id}", json={
            "name": "Karl", "colorIdx": 0, "roles": ["guitarist"], "songs": {}
        })
        assert res.status_code == 200
        assert res.json()["name"] == "Karl"

    def test_updates_roles_and_songs(self, client):
        musician_id = create_musician(client).json()["id"]
        updated_songs = {"Bohemian Rhapsody": ["guitarist", "singer"]}
        res = client.put(f"/api/musicians/{musician_id}", json={
            "name": "Carlos", "colorIdx": 0,
            "roles": ["guitarist", "singer"],
            "songs": updated_songs,
        })
        assert res.status_code == 200
        body = res.json()
        assert "singer" in body["roles"]
        assert body["songs"] == updated_songs

    def test_returns_404_for_unknown_id(self, client):
        res = client.put("/api/musicians/nonexistent-id", json={
            "name": "Carlos", "colorIdx": 0, "roles": ["guitarist"], "songs": {}
        })
        assert res.status_code == 404

    def test_rejects_empty_name_on_update(self, client):
        musician_id = create_musician(client).json()["id"]
        res = client.put(f"/api/musicians/{musician_id}", json={
            "name": "", "colorIdx": 0, "roles": ["guitarist"], "songs": {}
        })
        assert res.status_code == 400

    def test_rejects_empty_roles_on_update(self, client):
        musician_id = create_musician(client).json()["id"]
        res = client.put(f"/api/musicians/{musician_id}", json={
            "name": "Carlos", "colorIdx": 0, "roles": [], "songs": {}
        })
        assert res.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/musicians/{id}
# ─────────────────────────────────────────────────────────────────────────────
class TestDeleteMusician:
    def test_deletes_existing_musician(self, client):
        musician_id = create_musician(client).json()["id"]
        res = client.delete(f"/api/musicians/{musician_id}")
        assert res.status_code == 200
        assert res.json()["success"] is True
        # Verify it's gone
        musicians = client.get("/api/musicians").json()
        assert all(m["id"] != musician_id for m in musicians)

    def test_returns_404_for_unknown_id(self, client):
        res = client.delete("/api/musicians/nonexistent-id")
        assert res.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# Database layer unit tests
# ─────────────────────────────────────────────────────────────────────────────
class TestDatabase:
    def test_name_exists_returns_false_when_empty(self):
        assert database.name_exists("Carlos") is False

    def test_name_exists_returns_true_after_insert(self):
        from datetime import date
        import uuid
        musician = {
            "id": str(uuid.uuid4()),
            "name": "Carlos",
            "colorIdx": 0,
            "roles": ["guitarist"],
            "songs": {},
            "joinedAt": str(date.today()),
        }
        database.create(musician)
        assert database.name_exists("Carlos") is True

    def test_name_exists_exclude_id_allows_same_name(self):
        from datetime import date
        import uuid
        mid = str(uuid.uuid4())
        musician = {
            "id": mid,
            "name": "Carlos",
            "colorIdx": 0,
            "roles": ["guitarist"],
            "songs": {},
            "joinedAt": str(date.today()),
        }
        database.create(musician)
        # Should NOT count itself as a duplicate when updating
        assert database.name_exists("Carlos", exclude_id=mid) is False

    def test_get_by_id_returns_none_for_unknown(self):
        assert database.get_by_id("does-not-exist") is None

    def test_parse_musician_deserialises_json_fields(self):
        from datetime import date
        import uuid
        mid = str(uuid.uuid4())
        musician = {
            "id": mid,
            "name": "Ana",
            "colorIdx": 2,
            "roles": ["singer", "guitarist"],
            "songs": {"Hey Jude": ["singer"]},
            "joinedAt": str(date.today()),
        }
        database.create(musician)
        result = database.get_by_id(mid)
        assert isinstance(result["roles"], list)
        assert isinstance(result["songs"], dict)
        assert result["roles"] == ["singer", "guitarist"]
        assert result["songs"] == {"Hey Jude": ["singer"]}
