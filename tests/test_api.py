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
from domain import normalize_member_name, sanitize_song_key

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


class TestAppMetadata:
    def test_openapi_reports_current_version(self, client):
        res = client.get("/openapi.json")
        assert res.status_code == 200
        assert res.json()["info"]["version"] == "1.4.0"


# ── Helper ────────────────────────────────────────────────────────────────────
def create_member(client, name="Carlos", roles=None, songs=None):
    payload = {
        "name": name,
        "roles": roles or ["guitarist"],
        "songs": songs or {"Wonderwall": ["guitarist"]},
    }
    return client.post("/api/members", json=payload)


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/members
# ─────────────────────────────────────────────────────────────────────────────
class TestListMembers:
    def test_returns_empty_list_initially(self, client):
        res = client.get("/api/members")
        assert res.status_code == 200
        assert res.json() == []

    def test_returns_all_members(self, client):
        create_member(client, name="Carlos")
        create_member(client, name="Sofia")
        res = client.get("/api/members")
        assert res.status_code == 200
        assert len(res.json()) == 2


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/members
# ─────────────────────────────────────────────────────────────────────────────
class TestCreateMember:
    def test_creates_member_with_valid_data(self, client):
        res = create_member(client, name="Carlos", roles=["guitarist", "singer"])
        assert res.status_code == 201
        body = res.json()
        assert body["name"] == "Carlos"
        assert "guitarist" in body["roles"]
        assert "singer" in body["roles"]
        assert "id" in body
        assert "joinedAt" in body
        assert set(body) == {"id", "name", "roles", "songs", "joinedAt"}

    def test_creates_member_with_songs(self, client):
        songs = {"Wonderwall": ["guitarist"], "Sweet Child": ["guitarist", "singer"]}
        res = create_member(client, name="Carlos", songs=songs)
        assert res.status_code == 201
        assert res.json()["songs"] == songs

    def test_rejects_empty_name(self, client):
        res = client.post("/api/members", json={"name": "  ", "roles": ["guitarist"], "songs": {}})
        assert res.status_code == 400
        assert "Name is required" in res.json()["detail"]

    def test_rejects_empty_roles(self, client):
        res = client.post("/api/members", json={"name": "Carlos", "roles": [], "songs": {}})
        assert res.status_code == 400
        assert "role" in res.json()["detail"].lower()

    def test_rejects_duplicate_name(self, client):
        create_member(client, name="Carlos")
        res = create_member(client, name="Carlos")
        assert res.status_code == 409
        assert "already in the session" in res.json()["detail"]

    def test_duplicate_check_is_case_insensitive(self, client):
        create_member(client, name="Carlos")
        res = create_member(client, name="carlos")
        assert res.status_code == 409

    def test_strips_whitespace_from_name(self, client):
        res = client.post("/api/members", json={"name": "  Carlos  ", "roles": ["guitarist"], "songs": {}})
        assert res.status_code == 201
        assert res.json()["name"] == "Carlos"

    def test_normalizes_member_name_to_title_case(self, client):
        res = client.post("/api/members", json={"name": "  paula   santos  ", "roles": ["singer"], "songs": {}})
        assert res.status_code == 201
        assert res.json()["name"] == "Paula Santos"

    def test_strips_accents_when_normalizing_member_name(self, client):
        res = client.post("/api/members", json={"name": "  zazá  ", "roles": ["singer"], "songs": {}})
        assert res.status_code == 201
        assert res.json()["name"] == "Zaza"

    def test_rejects_unknown_profile_role(self, client):
        res = client.post("/api/members", json={"name": "Carlos", "roles": ["triangle"], "songs": {}})
        assert res.status_code == 400
        assert "Unknown role" in res.json()["detail"]

    def test_accepts_custom_other_instrument(self, client):
        res = client.post("/api/members", json={
            "name": "Carlos",
            "roles": ["other:cavaco elétrico"],
            "songs": {"Untitled Jam": ["other:cavaco elétrico"]},
        })
        assert res.status_code == 201
        assert res.json()["roles"] == ["other:Cavaco Eletrico"]
        assert res.json()["songs"] == {"Untitled Jam": ["other:Cavaco Eletrico"]}

    def test_rejects_bare_other_instrument(self, client):
        res = client.post("/api/members", json={
            "name": "Carlos",
            "roles": ["other"],
            "songs": {},
        })
        assert res.status_code == 400
        assert "Other instrument name is required" in res.json()["detail"]

    def test_rejects_unknown_song_role(self, client):
        res = client.post("/api/members", json={
            "name": "Carlos",
            "roles": ["guitarist"],
            "songs": {"Wonderwall": ["guitarist", "triangle"]},
        })
        assert res.status_code == 400
        assert "Unknown role" in res.json()["detail"]

    def test_rejects_blank_song_title(self, client):
        res = client.post("/api/members", json={
            "name": "Carlos",
            "roles": ["guitarist"],
            "songs": {" - ": ["guitarist"]},
        })
        assert res.status_code == 400
        assert "Song title is required" in res.json()["detail"]

    def test_deduplicates_roles_and_sanitised_song_keys(self, client):
        res = client.post("/api/members", json={
            "name": "Carlos",
            "roles": ["guitarist", "guitarist"],
            "songs": {
                "radiohead - creep": ["guitarist"],
                "Radiohead - Creep": ["singer", "guitarist"],
            },
        })
        assert res.status_code == 201
        assert res.json()["roles"] == ["guitarist", "singer"]
        assert res.json()["songs"] == {"Radiohead - Creep": ["guitarist", "singer"]}

    def test_normalizes_remastered_song_editions(self, client):
        res = client.post("/api/members", json={
            "name": "Carlos",
            "roles": ["guitarist"],
            "songs": {
                "oasis - don't look back in anger (remastered)": ["guitarist"],
                "Oasis - Don't Look Back In Anger": ["singer"],
                "Oasis - Don't Look Back In Anger - 2014 Remaster": ["bassist"],
            },
        })
        assert res.status_code == 201
        assert res.json()["roles"] == ["guitarist", "singer", "bassist"]
        assert res.json()["songs"] == {"Oasis - Don't Look Back In Anger": ["guitarist", "singer", "bassist"]}

    def test_preserves_hyphens_inside_song_titles(self, client):
        res = client.post("/api/members", json={
            "name": "Carlos",
            "roles": ["guitarist"],
            "songs": {"ac/dc - back-in-black": ["guitarist"]},
        })
        assert res.status_code == 201
        assert res.json()["songs"] == {"Ac/Dc - Back-In-Black": ["guitarist"]}

    def test_adds_song_roles_to_profile_roles(self, client):
        res = client.post("/api/members", json={
            "name": "Carlos",
            "roles": ["singer"],
            "songs": {"Wonderwall": ["guitarist"]},
        })
        assert res.status_code == 201
        assert res.json()["roles"] == ["singer", "guitarist"]


# ─────────────────────────────────────────────────────────────────────────────
# PUT /api/members/{id}
# ─────────────────────────────────────────────────────────────────────────────
class TestUpdateMember:
    def test_updates_member_name(self, client):
        member_id = create_member(client, name="Carlos").json()["id"]
        res = client.put(f"/api/members/{member_id}", json={
            "name": "karl lager", "roles": ["guitarist"], "songs": {}
        })
        assert res.status_code == 200
        assert res.json()["name"] == "Karl Lager"

    def test_updates_roles_and_songs(self, client):
        member_id = create_member(client).json()["id"]
        updated_songs = {"Bohemian Rhapsody": ["guitarist", "singer"]}
        res = client.put(f"/api/members/{member_id}", json={
            "name": "Carlos",
            "roles": ["guitarist", "singer"],
            "songs": updated_songs,
        })
        assert res.status_code == 200
        body = res.json()
        assert "singer" in body["roles"]
        assert body["songs"] == updated_songs

    def test_returns_404_for_unknown_id(self, client):
        res = client.put("/api/members/nonexistent-id", json={
            "name": "Carlos", "roles": ["guitarist"], "songs": {}
        })
        assert res.status_code == 404

    def test_rejects_empty_name_on_update(self, client):
        member_id = create_member(client).json()["id"]
        res = client.put(f"/api/members/{member_id}", json={
            "name": "", "roles": ["guitarist"], "songs": {}
        })
        assert res.status_code == 400

    def test_rejects_empty_roles_on_update(self, client):
        member_id = create_member(client).json()["id"]
        res = client.put(f"/api/members/{member_id}", json={
            "name": "Carlos", "roles": [], "songs": {}
        })
        assert res.status_code == 400

    def test_rejects_duplicate_name_on_update(self, client):
        create_member(client, name="Carlos")
        sofia_id = create_member(client, name="Sofia").json()["id"]

        res = client.put(f"/api/members/{sofia_id}", json={
            "name": "carlos", "roles": ["singer"], "songs": {}
        })

        assert res.status_code == 409
        assert "already in the session" in res.json()["detail"]


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/members/{id}
# ─────────────────────────────────────────────────────────────────────────────
class TestDeleteMember:
    def test_deletes_existing_member(self, client):
        member_id = create_member(client).json()["id"]
        res = client.delete(f"/api/members/{member_id}")
        assert res.status_code == 200
        assert res.json()["success"] is True
        # Verify it's gone
        members = client.get("/api/members").json()
        assert all(m["id"] != member_id for m in members)

    def test_returns_404_for_unknown_id(self, client):
        res = client.delete("/api/members/nonexistent-id")
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
        member = {
            "id": str(uuid.uuid4()),
            "name": "Carlos",
            "roles": ["guitarist"],
            "songs": {},
            "joinedAt": str(date.today()),
        }
        database.create(member)
        assert database.name_exists("Carlos") is True

    def test_name_exists_exclude_id_allows_same_name(self):
        from datetime import date
        import uuid
        mid = str(uuid.uuid4())
        member = {
            "id": mid,
            "name": "Carlos",
            "roles": ["guitarist"],
            "songs": {},
            "joinedAt": str(date.today()),
        }
        database.create(member)
        # Should NOT count itself as a duplicate when updating
        assert database.name_exists("Carlos", exclude_id=mid) is False

    def test_get_by_id_returns_none_for_unknown(self):
        assert database.get_by_id("does-not-exist") is None

    def test_parse_member_deserialises_json_fields(self):
        from datetime import date
        import uuid
        mid = str(uuid.uuid4())
        member = {
            "id": mid,
            "name": "Ana",
            "roles": ["singer", "guitarist"],
            "songs": {"Hey Jude": ["singer"]},
            "joinedAt": str(date.today()),
        }
        database.create(member)
        result = database.get_by_id(mid)
        assert isinstance(result["roles"], list)
        assert isinstance(result["songs"], dict)
        assert result["roles"] == ["singer", "guitarist"]
        assert result["songs"] == {"Hey Jude": ["singer"]}

    def test_parse_member_falls_back_when_json_columns_are_malformed(self):
        with database.get_connection() as conn:
            conn.execute(
                "INSERT INTO members (id, name, roles, songs, joinedAt) VALUES (?, ?, ?, ?, ?)",
                ("bad-json", "Ana", "not-json", '"not-a-dict"', "2026-05-14"),
            )

        result = database.get_by_id("bad-json")

        assert result["roles"] == []
        assert result["songs"] == {}


class TestDomainNormalization:
    def test_normalize_member_name_strips_accents(self):
        assert normalize_member_name("  maria   joão  ") == "Maria Joao"

    def test_sanitize_song_key_splits_only_on_artist_title_delimiter(self):
        assert sanitize_song_key("ac/dc - back-in-black") == "Ac/Dc - Back-In-Black"
