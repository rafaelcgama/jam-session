import sqlite3
import json
import os
from pathlib import Path

DB_PATH = Path(os.getenv("JAM_DB_PATH", Path(__file__).parent / "jam.db"))
TABLE_NAME = "members"
ACTIVE_MEMBER_COLUMNS = ("id", "name", "roles", "songs", "joinedAt")
CREATE_MEMBERS_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS members (
        id        TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        roles     TEXT NOT NULL DEFAULT '[]',
        songs     TEXT NOT NULL DEFAULT '{}',
        joinedAt  TEXT NOT NULL
    )
"""

def get_connection() -> sqlite3.Connection:
    """Open a connection with row_factory so rows behave like dicts."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def parse_json_column(value: str, expected_type: type, fallback_factory):
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback_factory()
    return parsed if isinstance(parsed, expected_type) else fallback_factory()


def parse_member(row: sqlite3.Row) -> dict:
    """Convert a DB row into a plain dict, deserialising the JSON columns."""
    d = dict(row)
    d["roles"] = parse_json_column(d.get("roles"), list, list)
    d["songs"] = parse_json_column(d.get("songs"), dict, dict)
    return d


def init_db() -> None:
    """Create the members table when starting from a fresh database."""
    with get_connection() as conn:
        conn.execute(CREATE_MEMBERS_TABLE_SQL)
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_name_lower ON {TABLE_NAME}(LOWER(name))")
        conn.commit()


# ── Queries ──────────────────────────────────────────────────────────────────

def get_all() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT {', '.join(ACTIVE_MEMBER_COLUMNS)} FROM {TABLE_NAME} ORDER BY joinedAt ASC, name ASC"
        ).fetchall()
    return [parse_member(r) for r in rows]


def get_by_id(member_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT {', '.join(ACTIVE_MEMBER_COLUMNS)} FROM {TABLE_NAME} WHERE id = ?", (member_id,)
        ).fetchone()
    return parse_member(row) if row else None


def create(member: dict) -> dict:
    with get_connection() as conn:
        conn.execute(
            f"INSERT INTO {TABLE_NAME} (id, name, roles, songs, joinedAt) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                member["id"],
                member["name"],
                json.dumps(member["roles"]),
                json.dumps(member["songs"]),
                member["joinedAt"],
            ),
        )
        conn.commit()
    return get_by_id(member["id"])


def update(member_id: str, data: dict) -> dict:
    with get_connection() as conn:
        conn.execute(
            f"UPDATE {TABLE_NAME} SET name=?, roles=?, songs=? WHERE id=?",
            (
                data["name"],
                json.dumps(data["roles"]),
                json.dumps(data["songs"]),
                member_id,
            ),
        )
        conn.commit()
    return get_by_id(member_id)


def delete(member_id: str) -> None:
    with get_connection() as conn:
        conn.execute(f"DELETE FROM {TABLE_NAME} WHERE id = ?", (member_id,))
        conn.commit()


def name_exists(name: str, exclude_id: str | None = None) -> bool:
    with get_connection() as conn:
        if exclude_id:
            row = conn.execute(
                f"SELECT id FROM {TABLE_NAME} WHERE LOWER(name) = LOWER(?) AND id != ?",
                (name, exclude_id),
            ).fetchone()
        else:
            row = conn.execute(
                f"SELECT id FROM {TABLE_NAME} WHERE LOWER(name) = LOWER(?)",
                (name,),
            ).fetchone()
    return row is not None
