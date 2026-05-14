import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from dataclasses import dataclass


SESSION_COOKIE_NAME = "jam_session_auth"
DEFAULT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class AuthUser:
    email: str
    is_admin: bool = False


def normalize_email(email: str | None) -> str:
    return str(email or "").strip().lower()


def is_valid_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email))


def admin_email() -> str:
    return normalize_email(os.getenv("JAM_SESSION_ADMIN_EMAIL", "admin@jam.local"))


def admin_password() -> str:
    return os.getenv("JAM_SESSION_ADMIN_PASSWORD", "admin-jam-session")


def session_secret() -> str:
    return os.getenv("JAM_SESSION_SECRET", "dev-session-secret-change-me")


def session_max_age_seconds() -> int:
    raw_value = os.getenv("JAM_SESSION_COOKIE_MAX_AGE_SECONDS")
    if not raw_value:
        return DEFAULT_SESSION_MAX_AGE_SECONDS
    try:
        return max(60, int(raw_value))
    except ValueError:
        return DEFAULT_SESSION_MAX_AGE_SECONDS


def cookie_secure() -> bool:
    return os.getenv("JAM_SESSION_COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes", "on"}


def hash_password(password: str) -> str:
    clean_password = str(password or "")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", clean_password.encode("utf-8"), salt.encode("ascii"), 120_000)
    return f"pbkdf2_sha256$120000${salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str | None) -> bool:
    clean_password = str(password or "")
    parts = str(stored_hash or "").split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    try:
        iterations = int(parts[1])
        salt = parts[2]
        expected = parts[3]
    except (TypeError, ValueError):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", clean_password.encode("utf-8"), salt.encode("ascii"), iterations)
    return hmac.compare_digest(digest.hex(), expected)


def verify_admin_login(email: str, password: str) -> AuthUser | None:
    clean_email = normalize_email(email)
    clean_password = str(password or "")
    if clean_email == admin_email() and hmac.compare_digest(clean_password, admin_password()):
        return AuthUser(email=clean_email, is_admin=True)
    return None


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _signature(payload: str) -> str:
    digest = hmac.new(session_secret().encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()
    return _b64encode(digest)


def create_session_token(user: AuthUser) -> str:
    payload = {
        "email": user.email,
        "isAdmin": user.is_admin,
        "iat": int(time.time()),
    }
    payload_b64 = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    return f"{payload_b64}.{_signature(payload_b64)}"


def parse_session_token(token: str | None) -> AuthUser | None:
    try:
        payload_b64, signature = str(token or "").split(".", 1)
    except ValueError:
        return None

    if not hmac.compare_digest(signature, _signature(payload_b64)):
        return None

    try:
        payload = json.loads(_b64decode(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return None

    issued_at = payload.get("iat")
    if not isinstance(issued_at, int) or time.time() - issued_at > session_max_age_seconds():
        return None

    email = normalize_email(payload.get("email"))
    if not is_valid_email(email):
        return None

    return AuthUser(email=email, is_admin=bool(payload.get("isAdmin")))
