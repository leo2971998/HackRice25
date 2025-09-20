"""Core utilities for Swipe Coach server."""

from .config import load_environment, get_auth_settings
from .database import get_mongo_client, get_database, ensure_indexes
from .security import decode_token
from .users import DEFAULT_PREFERENCES, get_or_create_user, merge_preferences
from .utils import (
    calculate_money_moments,
    calculate_summary,
    format_card_row,
    parse_window_days,
    validate_object_id,
)

__all__ = [
    "load_environment",
    "get_auth_settings",
    "get_mongo_client",
    "get_database",
    "ensure_indexes",
    "decode_token",
    "DEFAULT_PREFERENCES",
    "get_or_create_user",
    "merge_preferences",
    "calculate_money_moments",
    "calculate_summary",
    "format_card_row",
    "parse_window_days",
    "validate_object_id",
]
