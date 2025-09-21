import re
from datetime import datetime
from typing import Any, Dict, List, Tuple

from pymongo.database import Database

NORMALIZATION_RULES: List[Tuple[str, str]] = [
    (r"CHASE\s*#?\d+", "CHASE"),
    (r"AMZN\s*Mktp\s*.*", "AMAZON"),
    (r"UBER\s*\*EATS.*", "UBER EATS"),
    (r"SQ\s*\*.*", "SQUARE"),
    (r"WALMART\s*#?\d+", "WALMART"),
    (r"PAYPAL\s*\*(.+)", r"PAYPAL \1"),
    (r"NETFLIX\.COM.*", "NETFLIX"),
    (r"ATT\s*\*BILL.*", "AT&T"),
    (r"SPOTIFY.*", "SPOTIFY"),
]


def normalize_merchant_name(raw_name: str) -> str:
    """Apply heuristic rules to clean up a raw merchant string."""
    if not isinstance(raw_name, str):
        return "Unknown Merchant"

    for pattern, replacement in NORMALIZATION_RULES:
        if re.search(pattern, raw_name, re.IGNORECASE):
            return re.sub(pattern, replacement, raw_name, flags=re.IGNORECASE).strip()

    cleaned = re.sub(r"[^\w\s]", "", raw_name)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.upper().strip()


def get_or_create_merchant(db: Database, normalized_name: str) -> Dict[str, Any]:
    """Find or create a canonical merchant by normalized name."""
    merchants = db["merchants"]
    merchant = merchants.find_one({"canonical_name": normalized_name})
    if merchant:
        return merchant

    result = merchants.insert_one(
        {
            "canonical_name": normalized_name,
            "synonyms": [],
            "regexes": [],
            "created_at": datetime.utcnow(),
        }
    )
    return {"_id": result.inserted_id, "canonical_name": normalized_name}


__all__ = ["get_or_create_merchant", "normalize_merchant_name", "NORMALIZATION_RULES"]
