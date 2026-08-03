"""Input validation shared across API boundaries.

PLAN.md S6: usernames are interpolated into upstream URLs and Redis keys,
so they must be validated at every entry point — the gateway validates too,
but the ML service must survive direct hostile input (defense in depth).
"""

from __future__ import annotations

import re

# Matches both Lichess and Chess.com username rules (letters, digits,
# underscore, hyphen; 2-32 chars). Anything else is rejected outright —
# no path separators, spaces, newlines, or URL metacharacters can reach
# httpx URL construction or Redis key composition.
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{2,32}$")

VALID_SOURCES = ("lichess", "chesscom")


def validate_username(username: str) -> str:
    """Return the username if safe, else raise ValueError."""
    if not isinstance(username, str) or not _USERNAME_RE.fullmatch(username):
        raise ValueError(
            "Invalid username: 2-32 characters, letters/digits/underscore/hyphen only"
        )
    return username


def validate_source(source: str) -> str:
    if source not in VALID_SOURCES:
        raise ValueError(f"Invalid source: must be one of {VALID_SOURCES}")
    return source
