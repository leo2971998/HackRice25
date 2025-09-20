"""Routes for managing linked credit cards."""

from datetime import datetime, timedelta
from typing import Any, Dict

from flask import Blueprint, g, jsonify, request
from pymongo import ASCENDING
from werkzeug.exceptions import BadRequest, NotFound

from server.core import calculate_summary, format_card_row, validate_object_id


def register_card_routes(bp: Blueprint, database) -> None:
    @bp.get("/cards")
    def list_cards():
        user = g.current_user
        cards = (
            database["accounts"]
            .find({"userId": user["_id"], "account_type": "credit_card"})
            .sort("nickname", ASCENDING)
        )
        return jsonify([format_card_row(card) for card in cards])

    @bp.get("/cards/debug")
    def debug_cards():
        user = g.current_user
        all_cards = list(database["accounts"].find({"account_type": "credit_card"}))
        user_cards = list(database["accounts"].find({"userId": user["_id"], "account_type": "credit_card"}))

        return jsonify(
            {
                "user_id": str(user["_id"]),
                "user_email": user.get("email"),
                "total_cards_in_db": len(all_cards),
                "user_cards_count": len(user_cards),
                "all_cards_preview": [
                    {
                        "id": str(card["_id"]),
                        "userId": str(card.get("userId", "N/A")),
                        "nickname": card.get("nickname", "N/A"),
                        "issuer": card.get("issuer", "N/A"),
                        "account_type": card.get("account_type", "N/A"),
                    }
                    for card in all_cards[:10]
                ],
                "user_cards": [format_card_row(card) for card in user_cards],
            }
        )

    @bp.post("/cards/import")
    def import_existing_card():
        user = g.current_user
        payload = request.get_json(silent=True) or {}
        card_id = payload.get("card_id")

        if not card_id:
            raise BadRequest("card_id is required")

        try:
            card_object_id = validate_object_id(card_id)
        except NotFound:
            raise BadRequest("Invalid card_id format")

        card = database["accounts"].find_one(
            {"_id": card_object_id, "account_type": "credit_card"}
        )
        if not card:
            raise NotFound("Card not found")

        database["accounts"].update_one(
            {"_id": card_object_id},
            {"$set": {"userId": user["_id"], "updated_at": datetime.utcnow()}},
        )

        return jsonify({"id": str(card_object_id), "message": "Card imported successfully"}), 200

    @bp.post("/cards")
    def add_card():
        user = g.current_user
        payload = request.get_json(silent=True) or {}

        required_fields = ["issuer", "network", "mask", "expiry_month", "expiry_year"]
        mapped_payload = {
            "nickname": payload.get("nickname"),
            "issuer": payload.get("issuer"),
            "network": payload.get("network"),
            "account_mask": payload.get("mask") or payload.get("account_mask"),
            "expiry_month": payload.get("expiry_month"),
            "expiry_year": payload.get("expiry_year"),
            "card_product_id": payload.get("card_product_id"),
            "card_product_slug": payload.get("card_product_slug"),
            "status": payload.get("status", "Active"),
        }
        for field in required_fields:
            key = "account_mask" if field == "mask" else field
            value = mapped_payload.get(key)
            if value in (None, ""):
                raise BadRequest(f"{field} is required")

        last4 = mapped_payload["account_mask"]
        if isinstance(last4, str):
            last4 = last4.strip()
        if not isinstance(last4, str) or len(last4) != 4 or not last4.isdigit():
            raise BadRequest("mask (last4) must be 4 digits")

        try:
            expiry_month = int(mapped_payload["expiry_month"])
        except (TypeError, ValueError):
            raise BadRequest("expiry_month must be a number")
        if expiry_month < 1 or expiry_month > 12:
            raise BadRequest("expiry_month must be between 1 and 12")

        try:
            expiry_year = int(mapped_payload["expiry_year"])
        except (TypeError, ValueError):
            raise BadRequest("expiry_year must be a number")
        current_year = datetime.utcnow().year
        if expiry_year < current_year or expiry_year > current_year + 20:
            raise BadRequest("expiry_year must be within a valid range")

        nickname = mapped_payload["nickname"]
        if nickname is not None:
            if not isinstance(nickname, str):
                raise BadRequest("nickname must be a string")
            nickname = nickname.strip() or None

        card_product_id = mapped_payload.get("card_product_id")
        if isinstance(card_product_id, str):
            card_product_id = card_product_id.strip() or None
        elif card_product_id is not None:
            raise BadRequest("card_product_id must be a string")

        card_product_slug = mapped_payload.get("card_product_slug")
        if isinstance(card_product_slug, str):
            card_product_slug = card_product_slug.strip() or None
        elif card_product_slug is not None:
            raise BadRequest("card_product_slug must be a string")

        status = mapped_payload.get("status")
        if status is not None and not isinstance(status, str):
            raise BadRequest("status must be a string")

        now = datetime.utcnow()
        document = {
            "userId": user["_id"],
            "account_type": "credit_card",
            "nickname": nickname,
            "issuer": mapped_payload["issuer"],
            "network": mapped_payload["network"],
            "account_mask": last4,
            "expiry_month": expiry_month,
            "expiry_year": expiry_year,
            "card_product_id": card_product_id,
            "card_product_slug": card_product_slug,
            "status": status or "Active",
            "last_sync": payload.get("last_sync"),
            "applied_at": payload.get("applied_at"),
            "created_at": now,
            "updated_at": now,
        }
        if isinstance(document["last_sync"], str):
            try:
                document["last_sync"] = datetime.fromisoformat(document["last_sync"].replace("Z", "+00:00"))
            except ValueError:
                document["last_sync"] = now
        result = database["accounts"].insert_one(document)
        return jsonify({"id": str(result.inserted_id)}), 201

    def get_card_or_404(card_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
        card = database["accounts"].find_one(
            {"_id": validate_object_id(card_id), "userId": user["_id"], "account_type": "credit_card"}
        )
        if not card:
            raise NotFound("Card not found")
        return card

    @bp.get("/cards/<card_id>")
    def card_details(card_id: str):
        user = g.current_user
        card = get_card_or_404(card_id, user)
        detail = format_card_row(card)
        detail["mask"] = card.get("account_mask", "")
        detail["productName"] = card.get("productName")
        product = None
        if not detail.get("productName") and card.get("card_product_id"):
            product = database["credit_cards"].find_one({"_id": card.get("card_product_id")})
            if not product:
                product = database["credit_cards"].find_one({"product_id": card.get("card_product_id")})
        if not product and card.get("card_product_id"):
            product = database["credit_cards"].find_one({"card_product_id": card.get("card_product_id")})
        if not product:
            product = database["credit_cards"].find_one(
                {"issuer": card.get("issuer"), "product_name": card.get("nickname")}
            )
        if product:
            detail["productName"] = product.get("product_name")
            detail["features"] = product.get("features", [])
            detail["cardProductSlug"] = product.get("slug")
        window_days = 30
        cutoff = datetime.utcnow() - timedelta(days=window_days)
        txns = list(
            database["transactions"].find(
                {"userId": user["_id"], "accountId": card["_id"], "date": {"$gte": cutoff}}
            )
        )
        total, count, by_category = calculate_summary(txns)
        detail["summary"] = {
            "windowDays": window_days,
            "spend": round(total, 2),
            "txns": count,
            "byCategory": [
                {"name": name, "total": round(value, 2)}
                for name, value in sorted(by_category.items(), key=lambda item: item[1], reverse=True)
            ],
        }
        return jsonify(detail)

    @bp.patch("/cards/<card_id>")
    def update_card(card_id: str):
        user = g.current_user
        card = get_card_or_404(card_id, user)
        payload = request.get_json(silent=True) or {}
        updates: Dict[str, Any] = {}
        if "nickname" in payload:
            if payload["nickname"] is not None and not isinstance(payload["nickname"], str):
                raise BadRequest("nickname must be a string")
            updates["nickname"] = payload["nickname"]
        if "card_product_id" in payload:
            if payload["card_product_id"] is not None and not isinstance(payload["card_product_id"], str):
                raise BadRequest("card_product_id must be a string")
            updates["card_product_id"] = payload["card_product_id"]
        if "card_product_slug" in payload:
            if payload["card_product_slug"] is not None and not isinstance(payload["card_product_slug"], str):
                raise BadRequest("card_product_slug must be a string")
            updates["card_product_slug"] = payload["card_product_slug"]
        if "status" in payload:
            if payload["status"] is not None and not isinstance(payload["status"], str):
                raise BadRequest("status must be a string")
            updates["status"] = payload["status"]
        if "applied_at" in payload:
            updates["applied_at"] = payload["applied_at"]
        if not updates:
            return jsonify(format_card_row(card))
        updates["updated_at"] = datetime.utcnow()
        database["accounts"].update_one({"_id": card["_id"]}, {"$set": updates})
        card.update(updates)
        return jsonify(format_card_row(card))

    @bp.delete("/cards/<card_id>")
    def delete_card(card_id: str):
        user = g.current_user
        card = get_card_or_404(card_id, user)
        database["accounts"].delete_one({"_id": card["_id"]})
        return ("", 204)
