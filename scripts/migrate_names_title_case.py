#!/usr/bin/env python3
import sys
import sqlite3
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from domain import normalize_member_name

TABLE_NAME = "members"


def migrate_db(db_path: Path):
    if not db_path.exists():
        print(f"Error: Database {db_path} does not exist.")
        sys.exit(1)

    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    try:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        table = cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (TABLE_NAME,),
        ).fetchone()
        if table is None:
            print(f"Error: table '{TABLE_NAME}' does not exist in {db_path}.")
            sys.exit(1)

        rows = cursor.execute(f"SELECT id, name FROM {TABLE_NAME}").fetchall()
        seen_names: dict[str, str] = {}
        for row in rows:
            new_name = normalize_member_name(row["name"])
            key = new_name.casefold()
            if key in seen_names and seen_names[key] != row["id"]:
                print(f"Error: migration would create duplicate member name '{new_name}'.")
                sys.exit(1)
            seen_names[key] = row["id"]

        updated_count = 0
        for row in rows:
            member_id = row["id"]
            old_name = row["name"]
            new_name = normalize_member_name(old_name)

            if old_name != new_name:
                print(f"Updating name: '{old_name}' -> '{new_name}'")
                cursor.execute(f"UPDATE {TABLE_NAME} SET name = ? WHERE id = ?", (new_name, member_id))
                updated_count += 1

        conn.commit()
    finally:
        conn.close()

    label = "member" if updated_count == 1 else "members"
    print(f"Migration complete. Updated {updated_count} {label} in {db_path.name}.\n")


if __name__ == "__main__":
    # If a path is provided as an argument, use it; otherwise default to ../jam.db
    target_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / "jam.db"
    migrate_db(target_path)
