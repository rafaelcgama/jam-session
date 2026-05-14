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


# ── API routes (must be declared BEFORE the static-file mount) ────────────────

@app.get("/api/members", summary="List all members")
def get_members():
    """Return all members with their roles and songs."""
    return database.get_all()


def sanitize_song_key(key: str) -> str:
    """Sanitizes 'Artist - Title' or 'Title' into Title Case."""
    parts = [p.strip().title() for p in key.split("-") if p.strip()]
    return " - ".join(parts)


def title_case_name(name: str) -> str:
    """Normalize names in members for consistent display and duplicate checks."""
    return " ".join(part.title() for part in name.strip().split())


def unique_roles(role_ids: list[str]) -> list[str]:
    """Validate and de-duplicate role IDs while preserving the user's order."""
    roles: list[str] = []
    for role_id in role_ids:
        if role_id not in VALID_ROLE_IDS:
            raise HTTPException(status_code=400, detail=f"Unknown role: {role_id}")
        if role_id not in roles:
            roles.append(role_id)
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
