"""Helper utilities used across route modules."""

from typing import List, Optional

from bson import ObjectId
from flask import request

from server.core import validate_object_id


def parse_card_ids_query() -> Optional[List[ObjectId]]:
    """Parse cardIds query parameters into ObjectId instances."""
    card_ids = request.args.getlist("cardIds")
    if not card_ids:
        return None
    object_ids: List[ObjectId] = []
    for card_id in card_ids:
        try:
            object_ids.append(validate_object_id(card_id))
        except Exception:
            continue
    return object_ids or None
