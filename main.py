import uuid
from datetime import date
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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
class MusicianIn(BaseModel):
    name: str
    colorIdx: int = 0
    roles: list[str]
    songs: dict[str, list[str]] = {}


# ── API routes (must be declared BEFORE the static-file mount) ────────────────

@app.get("/api/musicians", summary="List all musicians")
def get_musicians():
    """Return every musician with their roles and songs."""
    return database.get_all()


@app.post("/api/musicians", status_code=201, summary="Add a new musician")
def create_musician(data: MusicianIn):
    """Register a new member of the jam session."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not data.roles:
        raise HTTPException(status_code=400, detail="At least one role is required")
    if database.name_exists(name):
        raise HTTPException(status_code=409, detail=f'"{name}" is already in the session')

    musician = {
        "id":       str(uuid.uuid4()),
        "name":     name,
        "colorIdx": data.colorIdx,
        "roles":    data.roles,
        "songs":    data.songs,
        "joinedAt": str(date.today()),
    }
    return database.create(musician)


@app.put("/api/musicians/{musician_id}", summary="Update a musician's profile")
def update_musician(musician_id: str, data: MusicianIn):
    """Edit an existing musician's name, roles, or songs."""
    if not database.get_by_id(musician_id):
        raise HTTPException(status_code=404, detail="Musician not found")

    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not data.roles:
        raise HTTPException(status_code=400, detail="At least one role is required")

    return database.update(musician_id, {
        "name":     name,
        "colorIdx": data.colorIdx,
        "roles":    data.roles,
        "songs":    data.songs,
    })


@app.delete("/api/musicians/{musician_id}", summary="Remove a musician")
def delete_musician(musician_id: str):
    """Remove a member from the jam session."""
    if not database.get_by_id(musician_id):
        raise HTTPException(status_code=404, detail="Musician not found")
    database.delete(musician_id)
    return {"success": True}


# ── Serve frontend (index.html, style.css, app.js) from frontend/ ────────────
# This MUST come after all API routes.
app.mount("/", StaticFiles(directory=Path(__file__).parent / "frontend", html=True), name="frontend")


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
