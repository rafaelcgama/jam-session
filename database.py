import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "jam.db"

def get_connection() -> sqlite3.Connection:
    """Open a connection with row_factory so rows behave like dicts."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def parse_musician(row: sqlite3.Row) -> dict:
    """Convert a DB row into a plain dict, deserialising the JSON columns."""
    d = dict(row)
    d["roles"] = json.loads(d["roles"])
    d["songs"] = json.loads(d["songs"])
    return d


def init_db() -> None:
    """Create the table if the DB is empty."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS musicians (
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
            "SELECT * FROM musicians ORDER BY joinedAt ASC, name ASC"
        ).fetchall()
    return [parse_musician(r) for r in rows]


def get_by_id(musician_id: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM musicians WHERE id = ?", (musician_id,)
        ).fetchone()
    return parse_musician(row) if row else None


def create(musician: dict) -> dict:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO musicians (id, name, colorIdx, roles, songs, joinedAt) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                musician["id"],
                musician["name"],
                musician["colorIdx"],
                json.dumps(musician["roles"]),
                json.dumps(musician["songs"]),
                musician["joinedAt"],
            ),
        )
        conn.commit()
    return get_by_id(musician["id"])


def update(musician_id: str, data: dict) -> dict:
    with get_connection() as conn:
        conn.execute(
            "UPDATE musicians SET name=?, colorIdx=?, roles=?, songs=? WHERE id=?",
            (
                data["name"],
                data["colorIdx"],
                json.dumps(data["roles"]),
                json.dumps(data["songs"]),
                musician_id,
            ),
        )
        conn.commit()
    return get_by_id(musician_id)


def delete(musician_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM musicians WHERE id = ?", (musician_id,))
        conn.commit()


def name_exists(name: str, exclude_id: str | None = None) -> bool:
    with get_connection() as conn:
        if exclude_id:
            row = conn.execute(
                "SELECT id FROM musicians WHERE LOWER(name) = LOWER(?) AND id != ?",
                (name, exclude_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id FROM musicians WHERE LOWER(name) = LOWER(?)",
                (name,),
            ).fetchone()
    return row is not None
