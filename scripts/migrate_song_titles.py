#!/usr/bin/env python3
import json
import re
import sqlite3
import sys
from pathlib import Path

TABLE_NAME = "members"

REMOVED_SONG_EDITION_RE = re.compile(
    r"""
    \s*
    (?:
      [\(\[]\s*
      (?:
        (?:\d{2,4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{2,4})?(?:\s+version)?
        |
        remaster(?:ed)?\s+version
      )
      \s*[\)\]]
      |
      [-–—]\s*
      (?:
        (?:\d{2,4}\s+)?(?:digital\s+)?remaster(?:ed)?(?:\s+\d{2,4})?(?:\s+version)?
        |
        remaster(?:ed)?\s+version
      )
    )
    \s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)

CONTRACTION_RE = re.compile(r"\b([A-Za-z]+)'(S|T|RE|VE|LL|D|M)\b")


def title_preserving_contractions(value: str) -> str:
    titled = value.title()
    return CONTRACTION_RE.sub(lambda match: f"{match.group(1)}'{match.group(2).lower()}", titled)


def remove_song_edition_suffix(value: str) -> str:
    previous = value.strip()
    while True:
        normalized = REMOVED_SONG_EDITION_RE.sub("", previous).strip()
        if normalized == previous:
            return normalized
        previous = normalized


def normalize_song_key(key: str) -> str:
    normalized_key = remove_song_edition_suffix(key)
    parts = []
    for part in normalized_key.split("-"):
        normalized_part = title_preserving_contractions(remove_song_edition_suffix(part))
        if normalized_part:
            parts.append(normalized_part)
    return " - ".join(parts)


def merge_roles(existing: list[str], incoming: list[str]) -> list[str]:
    merged = list(existing)
    for role_id in incoming:
        if role_id not in merged:
            merged.append(role_id)
    return merged


def normalize_songs(songs: dict[str, list[str]]) -> dict[str, list[str]]:
    normalized: dict[str, list[str]] = {}
    for title, roles in songs.items():
        normalized_title = normalize_song_key(title)
        if not normalized_title:
            continue
        normalized[normalized_title] = merge_roles(normalized.get(normalized_title, []), roles)
    return normalized


def migrate_db(db_path: Path) -> None:
    if not db_path.exists():
        print(f"Error: Database {db_path} does not exist.")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (TABLE_NAME,),
        ).fetchone()
        if table is None:
            print(f"Error: table '{TABLE_NAME}' does not exist in {db_path}.")
            sys.exit(1)

        rows = conn.execute(f"SELECT id, roles, songs FROM {TABLE_NAME}").fetchall()
        updated_count = 0
        for row in rows:
            roles = json.loads(row["roles"])
            songs = json.loads(row["songs"])
            normalized_songs = normalize_songs(songs)
            normalized_roles = list(roles)
            for song_roles in normalized_songs.values():
                normalized_roles = merge_roles(normalized_roles, song_roles)

            if normalized_songs != songs or normalized_roles != roles:
                conn.execute(
                    f"UPDATE {TABLE_NAME} SET roles = ?, songs = ? WHERE id = ?",
                    (json.dumps(normalized_roles), json.dumps(normalized_songs), row["id"]),
                )
                updated_count += 1

        conn.commit()
    finally:
        conn.close()

    label = "profile" if updated_count == 1 else "profiles"
    print(f"Song title migration complete. Updated {updated_count} {label} in {db_path.name}.")


if __name__ == "__main__":
    target_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent.parent / "jam.db"
    migrate_db(target_path)
