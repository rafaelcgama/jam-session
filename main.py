import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import database
from domain import DomainValidationError, merge_song_roles, normalize_member_name, sanitize_songs, unique_roles


@asynccontextmanager
async def lifespan(_app: FastAPI):
    database.init_db()
    yield

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="JAM Session API",
    description="Who plays what at the jam session.",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Schemas ───────────────────────────────────────────────────────────────────
class MemberIn(BaseModel):
    name: str
    colorIdx: int = Field(default=0, ge=0, le=5)
    roles: list[str]
    songs: dict[str, list[str]] = Field(default_factory=dict)


def http_domain_error(exc: DomainValidationError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


# ── API routes (must be declared BEFORE the static-file mount) ────────────────

@app.get("/api/members", summary="List all members")
def get_members():
    """Return all members with their roles and songs."""
    return database.get_all()


@app.post("/api/members", status_code=201, summary="Add a profile to members")
def create_member(data: MemberIn):
    """Register a profile in members."""
    name = normalize_member_name(data.name)
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not data.roles:
        raise HTTPException(status_code=400, detail="At least one role is required")

    if database.name_exists(name):
        raise HTTPException(status_code=409, detail=f'"{name}" is already in the session')

    try:
        roles = unique_roles(data.roles)
        sanitized_songs = sanitize_songs(data.songs)
    except DomainValidationError as exc:
        raise http_domain_error(exc) from exc
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

    name = normalize_member_name(data.name)
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not data.roles:
        raise HTTPException(status_code=400, detail="At least one role is required")
    if database.name_exists(name, exclude_id=member_id):
        raise HTTPException(status_code=409, detail=f'"{name}" is already in the session')

    try:
        roles = unique_roles(data.roles)
        sanitized_songs = sanitize_songs(data.songs)
    except DomainValidationError as exc:
        raise http_domain_error(exc) from exc
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
