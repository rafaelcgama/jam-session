#!/usr/bin/env python3
import sqlite3
import sys
from pathlib import Path

LEGACY_TABLE_NAME = "musicians"
TABLE_NAME = "members"


def migrate_db(db_path: Path) -> None:
    if not db_path.exists():
        print(f"Error: Database {db_path} does not exist.")
        sys.exit(1)

    with sqlite3.connect(db_path) as conn:
        legacy_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (LEGACY_TABLE_NAME,),
        ).fetchone()
        members_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (TABLE_NAME,),
        ).fetchone()

        if members_table:
            print(f"Database already uses '{TABLE_NAME}': {db_path}")
            return

        if not legacy_table:
            print(f"Error: neither '{TABLE_NAME}' nor '{LEGACY_TABLE_NAME}' exists in {db_path}.")
            sys.exit(1)

        conn.execute(f"ALTER TABLE {LEGACY_TABLE_NAME} RENAME TO {TABLE_NAME}")
        conn.commit()

    print(f"Renamed '{LEGACY_TABLE_NAME}' table to '{TABLE_NAME}' in {db_path}.")


if __name__ == "__main__":
    target_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / "jam.db"
    migrate_db(target_path)
