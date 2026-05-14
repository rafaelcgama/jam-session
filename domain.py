import re
import unicodedata

STANDARD_ROLE_IDS = (
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
)

VALID_ROLE_IDS = set(STANDARD_ROLE_IDS)
CUSTOM_ROLE_PREFIX = "other:"

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

SONG_DELIMITER_RE = re.compile(r"\s+-\s+")
CONTRACTION_RE = re.compile(r"\b([A-Za-z]+)'(S|T|RE|VE|LL|D|M)\b")


class DomainValidationError(ValueError):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def title_preserving_contractions(value: str) -> str:
    titled = str(value or "").lower().title()
    return CONTRACTION_RE.sub(lambda match: f"{match.group(1)}'{match.group(2).lower()}", titled)


def strip_accents(value: str) -> str:
    return "".join(
        ch
        for ch in unicodedata.normalize("NFKD", str(value or ""))
        if not unicodedata.combining(ch)
    )


def normalize_member_name(name: str) -> str:
    """Normalize display names to simple ASCII title case."""
    ascii_name = strip_accents(name)
    return " ".join(title_preserving_contractions(part) for part in ascii_name.strip().split())


def normalize_instrument_name(name: str) -> str:
    return normalize_member_name(name)


def remove_song_edition_suffix(value: str) -> str:
    previous = str(value or "").strip()
    while True:
        normalized = REMOVED_SONG_EDITION_RE.sub("", previous).strip()
        if normalized == previous:
            return normalized
        previous = normalized


def split_song_key(value: str) -> list[str]:
    match = SONG_DELIMITER_RE.search(value)
    if not match:
        return [value]
    return [value[:match.start()], value[match.end():]]


def sanitize_song_key(key: str) -> str:
    """Normalize 'Artist - Title' or 'Title' and remove remaster-only editions."""
    normalized_key = remove_song_edition_suffix(key)
    if not normalized_key.strip(" -–—"):
        return ""
    parts = []
    for part in split_song_key(normalized_key):
        normalized_part = title_preserving_contractions(remove_song_edition_suffix(part))
        if normalized_part:
            parts.append(normalized_part)
    return " - ".join(parts)


def normalize_role_id(role_id: str) -> str:
    role_id = str(role_id or "").strip()
    if role_id in VALID_ROLE_IDS:
        return role_id
    if role_id == "other":
        raise DomainValidationError("Other instrument name is required")
    if role_id.lower().startswith(CUSTOM_ROLE_PREFIX):
        label = normalize_instrument_name(role_id[len(CUSTOM_ROLE_PREFIX):])
        if not label:
            raise DomainValidationError("Other instrument name is required")
        return f"{CUSTOM_ROLE_PREFIX}{label}"
    raise DomainValidationError(f"Unknown role: {role_id}")


def unique_roles(role_ids: list[str]) -> list[str]:
    """Validate and de-duplicate role IDs while preserving the user's order."""
    roles: list[str] = []
    for role_id in role_ids:
        normalized_role_id = normalize_role_id(role_id)
        if normalized_role_id not in roles:
            roles.append(normalized_role_id)
    return roles


def merge_roles(existing: list[str], incoming: list[str]) -> list[str]:
    merged = list(existing)
    for role_id in incoming:
        if role_id not in merged:
            merged.append(role_id)
    return merged


def sanitize_songs(songs: dict[str, list[str]]) -> dict[str, list[str]]:
    sanitized: dict[str, list[str]] = {}
    for raw_title, role_ids in songs.items():
        title = sanitize_song_key(raw_title)
        if not title:
            raise DomainValidationError("Song title is required")
        if not role_ids:
            raise DomainValidationError(f"At least one instrument is required for '{title}'")

        roles = unique_roles(role_ids)
        sanitized[title] = merge_roles(sanitized.get(title, []), roles)

    return sanitized


def merge_song_roles(profile_roles: list[str], songs: dict[str, list[str]]) -> list[str]:
    roles = list(profile_roles)
    for song_roles in songs.values():
        roles = merge_roles(roles, song_roles)
    return roles
