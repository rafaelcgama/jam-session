import sqlite3
import json
import os
from pathlib import Path

DB_PATH = Path(os.getenv("JAM_DB_PATH", Path(__file__).parent / "jam.db"))
TABLE_NAME = "members"
USERS_TABLE_NAME = "users"
ACTIVE_MEMBER_COLUMNS = ("id", "name", "email", "roles", "songs", "joined_at")
CREATE_MEMBERS_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS members (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        email      TEXT,
        roles      TEXT NOT NULL DEFAULT '[]',
        songs      TEXT NOT NULL DEFAULT '{}',
        joined_at  TEXT NOT NULL
    )
"""
CREATE_USERS_TABLE_SQL = """
    CREATE TABLE IF NOT EXISTS users (
        email          TEXT PRIMARY KEY,
        password_hash  TEXT NOT NULL,
        created_at     TEXT NOT NULL
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
        conn.execute(CREATE_USERS_TABLE_SQL)
        cursor = conn.execute(f"PRAGMA table_info({TABLE_NAME})")
        columns = {r["name"] for r in cursor.fetchall()}
        if "email" not in columns:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN email TEXT")
        if "joined_at" not in columns:
            conn.execute(f"ALTER TABLE {TABLE_NAME} ADD COLUMN joined_at TEXT")

        cursor = conn.execute(f"PRAGMA table_info({USERS_TABLE_NAME})")
        user_columns = {r["name"] for r in cursor.fetchall()}
        if "password_hash" not in user_columns:
            conn.execute(f"ALTER TABLE {USERS_TABLE_NAME} ADD COLUMN password_hash TEXT")
        if "created_at" not in user_columns:
            conn.execute(f"ALTER TABLE {USERS_TABLE_NAME} ADD COLUMN created_at TEXT")

        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_name_lower ON {TABLE_NAME}(LOWER(name))")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{TABLE_NAME}_email_lower ON {TABLE_NAME}(LOWER(email))")
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{USERS_TABLE_NAME}_email_lower ON {USERS_TABLE_NAME}(LOWER(email))")
        conn.commit()


# ── Queries ──────────────────────────────────────────────────────────────────

def get_all() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT {', '.join(ACTIVE_MEMBER_COLUMNS)} FROM {TABLE_NAME} ORDER BY joined_at ASC, name ASC"
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
            f"INSERT INTO {TABLE_NAME} (id, name, email, roles, songs, joined_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                member["id"],
                member["name"],
                member.get("email"),
                json.dumps(member["roles"]),
                json.dumps(member["songs"]),
                member["joined_at"],
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


def get_user_by_email(email: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT email, password_hash, created_at FROM {USERS_TABLE_NAME} WHERE LOWER(email) = LOWER(?)",
            (email,),
        ).fetchone()
    return dict(row) if row else None


def create_user(email: str, password_hash: str, created_at: str) -> dict:
    with get_connection() as conn:
        conn.execute(
            f"INSERT INTO {USERS_TABLE_NAME} (email, password_hash, created_at) VALUES (?, ?, ?)",
            (email, password_hash, created_at),
        )
        conn.commit()
    return get_user_by_email(email)
