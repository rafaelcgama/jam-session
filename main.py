import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import auth
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
    version="1.4.0",
    lifespan=lifespan,
)


# ── Schemas ───────────────────────────────────────────────────────────────────
class MemberIn(BaseModel):
    name: str
    roles: list[str]
    songs: dict[str, list[str]] = Field(default_factory=dict)


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    email: str
    password: str


def http_domain_error(exc: DomainValidationError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.detail)


def session_payload(user: auth.AuthUser | None) -> dict:
    if not user:
        return {"authenticated": False, "email": None, "isAdmin": False}
    return {"authenticated": True, "email": user.email, "isAdmin": user.is_admin}


def set_session_cookie(response: Response, user: auth.AuthUser) -> None:
    response.set_cookie(
        key=auth.SESSION_COOKIE_NAME,
        value=auth.create_session_token(user),
        httponly=True,
        secure=auth.cookie_secure(),
        samesite="lax",
        max_age=auth.session_max_age_seconds(),
    )


def get_optional_user(request: Request) -> auth.AuthUser | None:
    return auth.parse_session_token(request.cookies.get(auth.SESSION_COOKIE_NAME))


def require_user(request: Request) -> auth.AuthUser:
    user = get_optional_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Log in to manage profiles")
    return user


def can_manage_member(member: dict, user: auth.AuthUser | None) -> bool:
    if not user:
        return False
    if user.is_admin:
        return True
    return auth.normalize_email(member.get("email")) == user.email


def member_response(member: dict, user: auth.AuthUser | None = None) -> dict:
    visible_member = {key: value for key, value in member.items() if key != "email"}
    visible_member["canManage"] = can_manage_member(member, user)
    return visible_member


# ── API routes (must be declared BEFORE the static-file mount) ────────────────

@app.post("/api/login", summary="Login portal")
def login(data: LoginIn, response: Response):
    email = auth.normalize_email(data.email)
    if not auth.is_valid_email(email):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = auth.verify_admin_login(email, data.password)
    if not user:
        saved_user = database.get_user_by_email(email)
        if saved_user and auth.verify_password(data.password, saved_user.get("password_hash")):
            user = auth.AuthUser(email=email, is_admin=False)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    set_session_cookie(response, user)
    return session_payload(user)


@app.post("/api/register", status_code=201, summary="Create a member login")
def register(data: RegisterIn, response: Response):
    email = auth.normalize_email(data.email)
    password = str(data.password or "")
    if not auth.is_valid_email(email):
        raise HTTPException(status_code=400, detail="Valid email is required")
    if email == auth.admin_email():
        raise HTTPException(status_code=400, detail="Use the admin login for this email")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if database.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    database.create_user(email, auth.hash_password(password), str(date.today()))
    user = auth.AuthUser(email=email, is_admin=False)
    set_session_cookie(response, user)
    return session_payload(user)


@app.post("/api/logout", summary="Log out")
def logout(response: Response):
    response.delete_cookie(
        key=auth.SESSION_COOKIE_NAME,
        secure=auth.cookie_secure(),
        samesite="lax",
    )
    return {"success": True}


@app.get("/api/session", summary="Current login session")
def get_session(request: Request):
    return session_payload(get_optional_user(request))


@app.get("/api/members", summary="List all members")
def get_members(user: auth.AuthUser = Depends(require_user)):
    """Return all members with their roles and songs."""
    return [member_response(member, user) for member in database.get_all()]


@app.post("/api/members", status_code=201, summary="Add a profile to members")
def create_member(data: MemberIn, user: auth.AuthUser = Depends(require_user)):
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
        "id":         str(uuid.uuid4()),
        "name":       name,
        "email":      user.email,
        "roles":      roles,
        "songs":      sanitized_songs,
        "joined_at":  str(date.today()),
    }
    return member_response(database.create(member), user)


@app.put("/api/members/{member_id}", summary="Update one profile")
def update_member(member_id: str, data: MemberIn, user: auth.AuthUser = Depends(require_user)):
    """Edit one profile's name, roles, or songs."""
    member = database.get_by_id(member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if not can_manage_member(member, user):
        raise HTTPException(status_code=403, detail="Only the profile owner or admin can modify this profile")

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

    updated = database.update(member_id, {
        "name":     name,
        "roles":    roles,
        "songs":    sanitized_songs,
    })
    return member_response(updated, user)


@app.delete("/api/members/{member_id}", summary="Remove one profile")
def delete_member(member_id: str, user: auth.AuthUser = Depends(require_user)):
    """Remove one profile from members."""
    member = database.get_by_id(member_id)
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if not can_manage_member(member, user):
        raise HTTPException(status_code=403, detail="Only the profile owner or admin can modify this profile")

    database.delete(member_id)
    return {"success": True}


# ── Serve frontend (index.html, style.css, app.js) from frontend/ ────────────
# This MUST come after all API routes.
app.mount("/", StaticFiles(directory=Path(__file__).parent / "frontend", html=True), name="frontend")


# ── Run ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
