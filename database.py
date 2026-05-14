import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "jam.db"
TABLE_NAME = "members"
LEGACY_TABLE_NAME = "musicians"

def get_connection() -> sqlite3.Connection:
    """Open a connection with row_factory so rows behave like dicts."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def parse_member(row: sqlite3.Row) -> dict:
    """Convert a DB row into a plain dict, deserialising the JSON columns."""
    d = dict(row)
    d["roles"] = json.loads(d["roles"])
    d["songs"] = json.loads(d["songs"])
    return d


def init_db() -> None:
    """Create or migrate the members table."""
    with get_connection() as conn:
        legacy_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (LEGACY_TABLE_NAME,),
        ).fetchone()
        members_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (TABLE_NAME,),
        ).fetchone()

        if legacy_table and not members_table:
            conn.execute(f"ALTER TABLE {LEGACY_TABLE_NAME} RENAME TO {TABLE_NAME}")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS members (
                id        TEXT PRIMARY KEY,
                name      TEXT NOT NULL,
                colorIdx  INTEGER DEFAULT 0,
                roles     TEXT NOT NULL DEFAULT '[]',
                songs     TEXT NOT NULL DEFAULT '{}',
                joinedAt  TEXT NOT NULL
            )
        """)
        conn.commit()


# ── Queries ──────────────────────────────────────────────────────────────────

def get_all() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM {TABLE_NAME} ORDER BY joinedAt ASC, name ASC"
        ).fetchall()
    return [parse_member(r) for r in rows]


def get_by_id(member_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            f"SELECT * FROM {TABLE_NAME} WHERE id = ?", (member_id,)
        ).fetchone()
    return parse_member(row) if row else None


def create(member: dict) -> dict:
    with get_connection() as conn:
        conn.execute(
            f"INSERT INTO {TABLE_NAME} (id, name, colorIdx, roles, songs, joinedAt) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                member["id"],
                member["name"],
                member["colorIdx"],
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
            f"UPDATE {TABLE_NAME} SET name=?, colorIdx=?, roles=?, songs=? WHERE id=?",
            (
                data["name"],
                data["colorIdx"],
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
