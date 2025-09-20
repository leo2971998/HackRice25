from __future__ import annotations
from typing import Iterable, Optional
from flask import request
from bson import ObjectId

def parse_window_days(
        default_days: int,
        param_names: Iterable[str] = ("window", "windowDays"),
        min_days: int = 1,
        max_days: int = 365,
) -> int:
    """
    Parse an optional window size from query params.
    Accepts either ?window= or ?windowDays=; clamps to [min_days, max_days].
    """
    raw: Optional[str] = None
    for name in param_names:
        raw = request.args.get(name)
        if raw is not None:
            break
    if raw is None:
        return default_days
    try:
        days = int(raw)
    except (TypeError, ValueError):
        return default_days
    if days < min_days:
        return min_days
    if days > max_days:
        return max_days
    return days

def validate_object_id(raw: str) -> ObjectId:
    """Validate and convert a string to a BSON ObjectId."""
    if ObjectId.is_valid(raw):
        return ObjectId(raw)
    raise ValueError(f"Invalid ObjectId: {raw!r}")
