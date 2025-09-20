"""Catalog management routes."""

from datetime import datetime
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError
from werkzeug.exceptions import BadRequest


def format_catalog_product(doc: Dict[str, Any]) -> Dict[str, Any]:
    rewards = [
        {
            "category": reward.get("category"),
            "rate": float(reward.get("rate", 0.0) or 0.0),
            "cap_monthly": float(reward["cap_monthly"]) if reward.get("cap_monthly") is not None else None,
        }
        for reward in doc.get("rewards", [])
        if reward.get("category")
    ]

    welcome_offer = doc.get("welcome_offer") or {}
    formatted_welcome = None
    if welcome_offer:
        formatted_welcome = {}
        if welcome_offer.get("bonus_value_usd") is not None:
            formatted_welcome["bonus_value_usd"] = float(welcome_offer.get("bonus_value_usd", 0.0) or 0.0)
        if welcome_offer.get("min_spend") is not None:
            formatted_welcome["min_spend"] = float(welcome_offer.get("min_spend", 0.0) or 0.0)
        if welcome_offer.get("window_days") is not None:
            formatted_welcome["window_days"] = int(welcome_offer.get("window_days") or 0)
        if not formatted_welcome:
            formatted_welcome = None

    last_updated = doc.get("last_updated")
    if isinstance(last_updated, datetime):
        last_updated_value = last_updated.isoformat().replace("+00:00", "Z")
    else:
        last_updated_value = last_updated

    return {
        "id": str(doc.get("_id")) if doc.get("_id") else None,
        "slug": doc.get("slug"),
        "product_name": doc.get("product_name"),
        "issuer": doc.get("issuer"),
        "network": doc.get("network"),
        "annual_fee": float(doc.get("annual_fee", 0.0) or 0.0),
        "base_cashback": float(doc.get("base_cashback", 0.0) or 0.0),
        "rewards": rewards,
        "welcome_offer": formatted_welcome,
        "foreign_tx_fee": float(doc.get("foreign_tx_fee", 0.0) or 0.0),
        "link_url": doc.get("link_url"),
        "active": bool(doc.get("active", True)),
        "last_updated": last_updated_value,
    }


def prepare_catalog_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    required_fields = ["slug", "product_name", "issuer"]
    for field in required_fields:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            raise BadRequest(f"{field} is required")

    link_url = data.get("link_url")
    if isinstance(link_url, str):
        link_url = link_url.strip() or None
    elif link_url is not None:
        link_url = str(link_url)

    payload: Dict[str, Any] = {
        "slug": data["slug"].strip(),
        "product_name": data["product_name"].strip(),
        "issuer": data["issuer"].strip(),
        "network": (data.get("network") or "").strip() or None,
        "annual_fee": float(data.get("annual_fee", 0.0) or 0.0),
        "base_cashback": float(data.get("base_cashback", 0.0) or 0.0),
        "foreign_tx_fee": float(data.get("foreign_tx_fee", 0.0) or 0.0),
        "link_url": link_url,
        "active": bool(data.get("active", True)),
    }

    rewards_payload: List[Dict[str, Any]] = []
    for reward in data.get("rewards", []) or []:
        category = reward.get("category")
        rate = reward.get("rate")
        if not category or rate is None:
            continue
        reward_entry: Dict[str, Any] = {
            "category": str(category),
            "rate": float(rate),
        }
        if reward.get("cap_monthly") is not None:
            try:
                reward_entry["cap_monthly"] = float(reward["cap_monthly"])
            except (TypeError, ValueError):
                pass
        rewards_payload.append(reward_entry)
    payload["rewards"] = rewards_payload

    welcome = data.get("welcome_offer") or {}
    welcome_payload: Dict[str, Any] = {}
    if welcome.get("bonus_value_usd") is not None:
        try:
            welcome_payload["bonus_value_usd"] = float(welcome["bonus_value_usd"])
        except (TypeError, ValueError):
            pass
    if welcome.get("min_spend") is not None:
        try:
            welcome_payload["min_spend"] = float(welcome["min_spend"])
        except (TypeError, ValueError):
            pass
    if welcome.get("window_days") is not None:
        try:
            welcome_payload["window_days"] = int(welcome["window_days"])
        except (TypeError, ValueError):
            pass
    if welcome_payload:
        payload["welcome_offer"] = welcome_payload

    return payload


def register_catalog_routes(bp: Blueprint, database) -> None:
    @bp.get("/cards/catalog")
    def list_catalog_cards():
        active_param = request.args.get("active")
        query: Dict[str, Any] = {}
        if active_param is not None:
            active_value = str(active_param).lower() in ("1", "true", "yes")
            query["active"] = active_value

        cards_cursor = database["credit_cards"].find(query).sort("product_name", ASCENDING)
        return jsonify([format_catalog_product(card) for card in cards_cursor])

    @bp.post("/cards/catalog")
    def create_catalog_cards():
        payload = request.get_json(force=True)
        collection = database["credit_cards"]
        now = datetime.utcnow()

        if isinstance(payload, list):
            documents = [prepare_catalog_payload(item) for item in payload if isinstance(item, dict)]
            if not documents:
                raise BadRequest("payload must contain at least one catalog entry")
            for document in documents:
                document.setdefault("active", True)
                document["last_updated"] = now
            try:
                result = collection.insert_many(documents)
            except DuplicateKeyError as exc:
                raise BadRequest("duplicate catalog slug") from exc
            inserted = list(collection.find({"_id": {"$in": result.inserted_ids}}))
            return jsonify([format_catalog_product(doc) for doc in inserted]), 201

        if not isinstance(payload, dict):
            raise BadRequest("Invalid payload")

        document = prepare_catalog_payload(payload)
        document.setdefault("active", True)
        document["last_updated"] = now
        try:
            result = collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise BadRequest("duplicate catalog slug") from exc
        created = collection.find_one({"_id": result.inserted_id})
        if created is None:
            raise BadRequest("Unable to create catalog entry")
        return jsonify(format_catalog_product(created)), 201
