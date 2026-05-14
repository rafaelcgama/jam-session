import re
import unicodedata
import uuid
from datetime import date
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import database

# ── Initialise DB on startup ──────────────────────────────────────────────────
database.init_db()

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="JAM Session API",
    description="Who plays what at the jam session.",
    version="1.0.0",
)


# ── Schemas ───────────────────────────────────────────────────────────────────
class MemberIn(BaseModel):
    name: str
    colorIdx: int = 0
    roles: list[str]
    songs: dict[str, list[str]] = Field(default_factory=dict)


VALID_ROLE_IDS = {
    "singer",
    "guitarist",
    "bassist",
    "drummer",
    "keys",
    "harmonica",
    "violinist",
    "flutist",
    "ukulele",
    "horn",
    "cello",
    "saxophone",
    "percussion",
    "accordion",
    "banjo",
    "synth",
}
CUSTOM_ROLE_PREFIX = "other:"


# ── API routes (must be declared BEFORE the static-file mount) ────────────────

@app.get("/api/members", summary="List all members")
def get_members():
    """Return all members with their roles and songs."""
    return database.get_all()


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


def sanitize_song_key(key: str) -> str:
    """Sanitize 'Artist - Title' or 'Title' and remove remaster-only editions."""
    normalized_key = remove_song_edition_suffix(key)
    parts = []
    for part in normalized_key.split("-"):
        normalized_part = title_preserving_contractions(remove_song_edition_suffix(part))
        if normalized_part:
            parts.append(normalized_part)
    return " - ".join(parts)


def title_case_name(name: str) -> str:
    """Normalize names in members for consistent display and duplicate checks."""
    ascii_name = "".join(c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c))
    return " ".join(part.title() for part in ascii_name.strip().split())


def normalize_role_id(role_id: str) -> str:
    role_id = role_id.strip()
    if role_id in VALID_ROLE_IDS:
        return role_id
    if role_id == "other":
        raise HTTPException(status_code=400, detail="Other instrument name is required")
    if role_id.lower().startswith(CUSTOM_ROLE_PREFIX):
        label = title_case_name(role_id[len(CUSTOM_ROLE_PREFIX):])
        if not label:
            raise HTTPException(status_code=400, detail="Other instrument name is required")
        return f"{CUSTOM_ROLE_PREFIX}{label}"
    raise HTTPException(status_code=400, detail=f"Unknown role: {role_id}")


def unique_roles(role_ids: list[str]) -> list[str]:
    """Validate and de-duplicate role IDs while preserving the user's order."""
    roles: list[str] = []
    for role_id in role_ids:
        normalized_role_id = normalize_role_id(role_id)
        if normalized_role_id not in roles:
            roles.append(normalized_role_id)
    return roles


def sanitize_songs(songs: dict[str, list[str]]) -> dict[str, list[str]]:
    sanitized: dict[str, list[str]] = {}
    for raw_title, role_ids in songs.items():
        title = sanitize_song_key(raw_title)
        if not title:
            raise HTTPException(status_code=400, detail="Song title is required")
        if not role_ids:
            raise HTTPException(status_code=400, detail=f"At least one instrument is required for '{title}'")

        roles = unique_roles(role_ids)
        if title not in sanitized:
            sanitized[title] = []
        for role_id in roles:
            if role_id not in sanitized[title]:
                sanitized[title].append(role_id)

    return sanitized


def merge_song_roles(profile_roles: list[str], songs: dict[str, list[str]]) -> list[str]:
    roles = list(profile_roles)
    for song_roles in songs.values():
        for role_id in song_roles:
            if role_id not in roles:
                roles.append(role_id)
    return roles

@app.post("/api/members", status_code=201, summary="Add a profile to members")
def create_member(data: MemberIn):
    """Register a profile in members."""
    name = title_case_name(data.name)
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not data.roles:
        raise HTTPException(status_code=400, detail="At least one role is required")

    if database.name_exists(name):
        raise HTTPException(status_code=409, detail=f'"{name}" is already in the session')

    roles = unique_roles(data.roles)
    sanitized_songs = sanitize_songs(data.songs)
    roles = merge_song_roles(roles, sanitized_songs)

    member = {
        "id":       str(uuid.uuid4()),
        "name":     name,
        "colorIdx": data.colorIdx,
        "roles":    roles,
        "songs":    sanitized_songs,
        "joinedAt": str(date.today()),
    }
    return database.create(member)


@app.put("/api/members/{member_id}", summary="Update one profile")
def update_member(member_id: str, data: MemberIn):
    """Edit one profile's name, roles, or songs."""
    if not database.get_by_id(member_id):
        raise HTTPException(status_code=404, detail="Member not found")

    name = title_case_name(data.name)
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not data.roles:
        raise HTTPException(status_code=400, detail="At least one role is required")
    if database.name_exists(name, exclude_id=member_id):
        raise HTTPException(status_code=409, detail=f'"{name}" is already in the session')

    roles = unique_roles(data.roles)
    sanitized_songs = sanitize_songs(data.songs)
    roles = merge_song_roles(roles, sanitized_songs)

    return database.update(member_id, {
        "name":     name,
        "colorIdx": data.colorIdx,
        "roles":    roles,
        "songs":    sanitized_songs,
    })


@app.delete("/api/members/{member_id}", summary="Remove one profile")
def delete_member(member_id: str):
    """Remove one profile from members."""
    if not database.get_by_id(member_id):
        raise HTTPException(status_code=404, detail="Member not found")
    database.delete(member_id)
    return {"success": True}


# ── Serve frontend (index.html, style.css, app.js) from frontend/ ────────────
# This MUST come after all API routes.
app.mount("/", StaticFiles(directory=Path(__file__).parent / "frontend", html=True), name="frontend")


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
