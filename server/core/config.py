"""Configuration helpers for the Flask application."""

import os
from typing import Any, Dict

try:  # pragma: no cover - optional dependency
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None  # type: ignore


def load_environment() -> None:
    """Load environment variables from a .env file when available."""
    if load_dotenv is not None:
        load_dotenv()


def get_auth_settings() -> Dict[str, str]:
    """Return Auth0 configuration derived from environment variables."""
    domain = os.environ.get("AUTH0_DOMAIN")
    audience = os.environ.get("AUTH0_AUDIENCE")
    if not domain or not audience:
        raise RuntimeError("AUTH0_DOMAIN and AUTH0_AUDIENCE must be set")
    issuer = f"https://{domain}/"
    return {
        "domain": domain,
        "audience": audience,
        "issuer": issuer,
        "jwks_url": f"{issuer}.well-known/jwks.json",
    }
