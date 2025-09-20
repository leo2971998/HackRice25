"""Application flow routes."""

import re
from datetime import datetime

from flask import Blueprint, g, jsonify, request
from werkzeug.exceptions import BadRequest, NotFound

from server.core import validate_object_id

ACTIVE_STATUSES = {"started", "submitted", "approved"}
SLUG_PATTERN = re.compile(r"^[a-z0-9-]+$")


def _validate_slug(slug: str) -> str:
    if not isinstance(slug, str) or not slug.strip():
        raise BadRequest("slug is required")
    slug = slug.strip()
    if not SLUG_PATTERN.fullmatch(slug):
        raise BadRequest("invalid slug")
    return slug


def register_application_routes(bp: Blueprint, database) -> None:
    @bp.post("/applications")
    def start_application():
        user = g.current_user
        payload = request.get_json(force=True)
        slug = _validate_slug(payload.get("slug", ""))

        prod = database["credit_cards"].find_one({"slug": slug, "active": True})
        if not prod:
            raise BadRequest("unknown product slug")

        existing = database["applications"].find_one(
            {
                "userId": user["_id"],
                "product_slug": slug,
                "status": {"$in": list(ACTIVE_STATUSES)},
            }
        )
        if existing:
            return jsonify({"id": str(existing["_id"]), "status": existing["status"]}), 200

        now = datetime.utcnow()
        app_doc = {
            "userId": user["_id"],
            "product_slug": slug,
            "card_product_id": prod["_id"],
            "status": "started",
            "created_at": now,
            "updated_at": now,
        }
        res = database["applications"].insert_one(app_doc)
        return jsonify({"id": str(res.inserted_id), "status": "started"}), 201

    @bp.post("/applications/approve")
    def approve_application():
        user = g.current_user
        payload = request.get_json(force=True)
        app_id = payload.get("application_id")
        if not app_id:
            raise BadRequest("application_id is required")

        app_doc = database["applications"].find_one(
            {"_id": validate_object_id(app_id), "userId": user["_id"]}
        )
        if not app_doc:
            raise NotFound("application not found")

        prod = database["credit_cards"].find_one({"_id": app_doc["card_product_id"]})
        if not prod:
            raise NotFound("catalog product missing")

        existing = database["accounts"].find_one(
            {"userId": user["_id"], "account_type": "credit_card", "card_product_id": prod["_id"]}
        )
        now = datetime.utcnow()
        if not existing:
            database["accounts"].insert_one(
                {
                    "userId": user["_id"],
                    "account_type": "credit_card",
                    "nickname": prod.get("product_name"),
                    "issuer": prod.get("issuer"),
                    "network": prod.get("network"),
                    "account_mask": "",
                    "expiry_month": None,
                    "expiry_year": None,
                    "card_product_id": prod["_id"],
                    "card_product_slug": prod.get("slug"),
                    "status": "Applied",
                    "applied_at": now,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        else:
            update_fields = {}
            if not existing.get("applied_at"):
                update_fields["applied_at"] = now
            if existing.get("status") != "Applied":
                update_fields["status"] = "Applied"
            if existing.get("card_product_slug") != prod.get("slug"):
                update_fields["card_product_slug"] = prod.get("slug")
            if update_fields:
                update_fields["updated_at"] = now
                database["accounts"].update_one({"_id": existing["_id"]}, {"$set": update_fields})

        database["applications"].update_one(
            {"_id": app_doc["_id"]}, {"$set": {"status": "approved", "updated_at": now}}
        )
        return jsonify({"ok": True})
