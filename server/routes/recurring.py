from datetime import datetime
from typing import Any, Dict

from bson import ObjectId
from flask import Blueprint, jsonify, request, g
from pymongo.database import Database

from server.db import get_db
from server.recurring import detect_recurring_for_user

recurring_bp = Blueprint("recurring", __name__)


def _current_user_id() -> ObjectId:
    return g.current_user["_id"]


def _now_utc() -> datetime:
    return datetime.utcnow()


def _oid(value: str) -> ObjectId:
    return ObjectId(value)


@recurring_bp.get("/api/recurring")
def get_recurring_groups():
    db: Database = get_db()
    user_id = _current_user_id()

    pipeline = [
        {"$match": {"user_id": user_id}},
        {
            "$lookup": {
                "from": "merchants",
                "localField": "merchant_id",
                "foreignField": "_id",
                "as": "merchant_info",
            }
        },
        {"$unwind": "$merchant_info"},
        {"$sort": {"next_expected_at": 1}},
    ]
    cursor = db["recurring_groups"].aggregate(pipeline)

    results = []
    for doc in cursor:
        results.append(
            {
                "_id": str(doc["_id"]),
                "merchant_name": doc.get("merchant_info", {}).get("canonical_name"),
                "period": doc.get("period"),
                "typical_amount": doc.get("typical_amount"),
                "next_expected_at": doc.get("next_expected_at"),
                "confidence": doc.get("confidence"),
            }
        )
    return jsonify({"ok": True, "recurring": results})


@recurring_bp.get("/api/upcoming")
def upcoming():
    db: Database = get_db()
    user_id = _current_user_id()

    query = {"user_id": user_id, "expected_at": {"$gte": _now_utc()}}
    cursor = db["future_transactions"].find(query).sort("expected_at", 1)

    items = []
    for doc in cursor:
        items.append(
            {
                "_id": str(doc["_id"]),
                "merchant_id": str(doc["merchant_id"]),
                "amount_predicted": doc.get("amount_predicted"),
                "expected_at": doc.get("expected_at"),
                "confidence": doc.get("confidence"),
                "explain": doc.get("explain"),
            }
        )
    return jsonify({"ok": True, "upcoming": items})


@recurring_bp.post("/api/recurring/scan")
def scan_recurring():
    db: Database = get_db()
    user_id = _current_user_id()

    results = detect_recurring_for_user(db, user_id)
    return jsonify({"ok": True, "scanned": len(results), "results": results})


@recurring_bp.post("/api/transactions/relabel")
def relabel_transaction():
    db: Database = get_db()
    user_id = _current_user_id()
    body: Dict[str, Any] = request.get_json(force=True, silent=False) or {}

    txn_id = body.get("txn_id")
    merchant_canonical = body.get("merchant_canonical")
    category_l1 = body.get("category_l1")
    category_l2 = body.get("category_l2")

    if not txn_id or not merchant_canonical:
        return jsonify({"ok": False, "error": "txn_id and merchant_canonical required"}), 400

    merchants = db["merchants"]
    merchant = merchants.find_one({"canonical_name": merchant_canonical})
    if merchant:
        merchant_id = merchant["_id"]
    else:
        merchant_id = merchants.insert_one(
            {
                "canonical_name": merchant_canonical,
                "synonyms": [],
                "regexes": [],
                "created_at": _now_utc(),
            }
        ).inserted_id

    txns = db["transactions"]
    result = txns.update_one(
        {"_id": _oid(txn_id), "user_id": user_id},
        {
            "$set": {
                "merchant_id": merchant_id,
                "merchant_name_norm": merchant_canonical,
                "category_l1": category_l1,
                "category_l2": category_l2,
                "updated_at": _now_utc(),
            }
        },
    )

    if result.matched_count == 0:
        return jsonify({"ok": False, "error": "transaction not found for user"}), 404

    return jsonify({"ok": True, "updated": 1, "merchant_id": str(merchant_id)})


__all__ = ["recurring_bp"]
