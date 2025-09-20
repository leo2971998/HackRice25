"""User helpers used across routes."""

from datetime import datetime
from typing import Any, Dict, Optional

from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError
from werkzeug.exceptions import Unauthorized

DEFAULT_PREFERENCES: Dict[str, Any] = {
    "timezone": "America/Chicago",
    "currency": "USD",
    "theme": "system",
    "privacy": {"blurAmounts": False},
    "notifications": {"monthly_summary": True, "new_recommendation": True},
}


def merge_preferences(existing: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    merged = {**existing}
    for key, value in updates.items():
        if key not in DEFAULT_PREFERENCES:
            continue
        if isinstance(value, dict) and isinstance(DEFAULT_PREFERENCES[key], dict):
            merged[key] = merge_preferences(existing.get(key, DEFAULT_PREFERENCES[key]), value)
        else:
            merged[key] = value
    return merged


def get_or_create_user(users: Collection, payload: Dict[str, Any]) -> Dict[str, Any]:
    auth0_id = payload.get("sub")
    if not auth0_id:
        raise Unauthorized("Token missing subject")

    email = payload.get("email")
    name = payload.get("name") or (
        email.split("@")[0] if isinstance(email, str) and "@" in email else None
    )
    email_verified = bool(payload.get("email_verified"))

    user_doc: Optional[Dict[str, Any]] = users.find_one({"auth0_id": auth0_id})
    if user_doc is None:
        new_user = {
            "auth0_id": auth0_id,
            "email": email,
            "name": name,
            "preferences": DEFAULT_PREFERENCES,
            "email_verified": email_verified,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        try:
            result = users.insert_one(new_user)
        except DuplicateKeyError:
            user_doc = users.find_one({"auth0_id": auth0_id})
        else:
            new_user["_id"] = result.inserted_id
            user_doc = new_user
    else:
        updates: Dict[str, Any] = {}
        if email and user_doc.get("email") != email:
            updates["email"] = email
        if name and user_doc.get("name") != name:
            updates["name"] = name
        if user_doc.get("email_verified") != email_verified:
            updates["email_verified"] = email_verified
        if updates:
            updates["updated_at"] = datetime.utcnow()
            users.update_one({"_id": user_doc["_id"]}, {"$set": updates})
            user_doc.update(updates)

        if "preferences" not in user_doc:
            users.update_one({"_id": user_doc["_id"]}, {"$set": {"preferences": DEFAULT_PREFERENCES}})
            user_doc["preferences"] = DEFAULT_PREFERENCES

    if user_doc is None:
        raise Unauthorized("Unable to load profile")

    return user_doc
