"""Authentication and profile routes."""

from datetime import datetime
from typing import Any, Dict

from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.exceptions import BadRequest

from server.core import DEFAULT_PREFERENCES, decode_token, get_or_create_user, merge_preferences


def register_auth_routes(bp: Blueprint, database) -> None:
    users = database["users"]

    @bp.before_request
    def authenticate_request() -> None:
        if request.method == "OPTIONS":
            return ("", 204)

        if current_app.config.get("DISABLE_AUTH"):
            payload = {
                "sub": "dev|local",
                "email": "dev@local",
                "email_verified": True,
                "name": "Dev User",
            }
        else:
            payload = decode_token(current_app.config["AUTH_SETTINGS"])

        g.current_token = payload
        g.current_user = get_or_create_user(users, payload)

    @bp.get("/me")
    def get_me():
        user = g.current_user
        return jsonify(
            {
                "userId": str(user["_id"]),
                "email": user.get("email"),
                "name": user.get("name"),
                "preferences": user.get("preferences", DEFAULT_PREFERENCES),
            }
        )

    @bp.patch("/me")
    def update_me():
        user = g.current_user
        payload = request.get_json(silent=True) or {}

        updates: Dict[str, Any] = {}
        if "name" in payload:
            if payload["name"] is not None and not isinstance(payload["name"], str):
                raise BadRequest("name must be a string")
            updates["name"] = payload["name"]
        if "preferences" in payload:
            if not isinstance(payload["preferences"], dict):
                raise BadRequest("preferences must be an object")
            merged = merge_preferences(
                user.get("preferences", DEFAULT_PREFERENCES), payload["preferences"]
            )
            updates["preferences"] = merged

        if not updates:
            return jsonify(
                {
                    "userId": str(user["_id"]),
                    "email": user.get("email"),
                    "name": user.get("name"),
                    "preferences": user.get("preferences", DEFAULT_PREFERENCES),
                }
            )

        updates["updated_at"] = datetime.utcnow()
        database["users"].update_one({"_id": user["_id"]}, {"$set": updates})
        user.update(updates)
        return jsonify(
            {
                "userId": str(user["_id"]),
                "email": user.get("email"),
                "name": user.get("name"),
                "preferences": user.get("preferences", DEFAULT_PREFERENCES),
            }
        )

    @bp.get("/status")
    def get_status():
        user = g.current_user
        accounts = database["accounts"]
        has_account = (
            accounts.count_documents({"userId": user["_id"], "account_type": "credit_card"}) > 0
        )
        return jsonify({"hasAccount": has_account})

    @bp.post("/auth/resend-verification")
    def resend_verification():
        return ("", 204)
