from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from flask import Blueprint, jsonify, request, g
from pymongo.collection import Collection

from server.utils import parse_window_days, validate_object_id


def _resolve_category_name(raw: Any) -> str:
    if isinstance(raw, str) and raw.strip():
        return raw
    return "Uncategorized"


def register_home_routes(api_bp: Blueprint, database) -> None:
    transactions: Collection = database["transactions"]
    accounts: Collection = database["accounts"]

    @api_bp.get("/spend/summary")
    def spend_summary():
        user = g.current_user
        window_days = parse_window_days(30)
        since = datetime.now(timezone.utc) - timedelta(days=window_days)

        match: Dict[str, Any] = {"userId": user["_id"], "date": {"$gte": since}}
        card_ids = request.args.getlist("cardIds")
        if card_ids:
            object_ids: List = []
            for raw in card_ids:
                try:
                    object_ids.append(validate_object_id(raw))
                except Exception:
                    continue
            if object_ids:
                match["accountId"] = {"$in": object_ids}

        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$category", "total": {"$sum": "$amount"}}},
            {
                "$project": {
                    "_id": 0,
                    "name": {"$ifNull": ["$_id", "Uncategorized"]},
                    "total": {"$round": ["$total", 2]},
                }
            },
            {"$sort": {"total": -1}},
        ]
        categories = list(transactions.aggregate(pipeline))
        total = sum(cat["total"] for cat in categories)

        top_five = []
        for cat in categories[:5]:
            share = round((100 * cat["total"] / total), 1) if total else 0.0
            top_five.append({"name": _resolve_category_name(cat["name"]), "total": cat["total"], "share": share})

        remaining_categories = categories[5:]
        others_total = sum(cat["total"] for cat in remaining_categories)
        others_share = round((100 * others_total / total), 1) if total else 0.0

        stats = {
            "totalSpend": round(total, 2),
            "txns": transactions.count_documents(match),
            "accounts": accounts.count_documents({"userId": user["_id"], "account_type": "credit_card"}),
        }

        return jsonify(
            {
                "stats": stats,
                "byCategory": top_five,
                "others": {
                    "total": round(others_total, 2),
                    "share": others_share,
                    "count": max(len(remaining_categories), 0),
                },
            }
        )

    @api_bp.get("/spend/merchants")
    def merchant_breakdown():
        user = g.current_user
        window_days = parse_window_days(90)
        since = datetime.now(timezone.utc) - timedelta(days=window_days)

        match: Dict[str, Any] = {"userId": user["_id"], "date": {"$gte": since}}

        category_filter = request.args.get("category")
        if category_filter:
            match["category"] = category_filter

        card_ids = request.args.getlist("cardIds")
        if card_ids:
            object_ids: List = []
            for raw in card_ids:
                try:
                    object_ids.append(validate_object_id(raw))
                except Exception:
                    continue
            if object_ids:
                match["accountId"] = {"$in": object_ids}

        limit = None
        try:
            limit_param = request.args.get("limit")
            if limit_param:
                parsed = int(limit_param)
                if parsed > 0:
                    limit = parsed
        except (TypeError, ValueError):
            limit = None

        pipeline = [
            {"$match": match},
            {
                "$group": {
                    "_id": {
                        "m": {"$ifNull": ["$description_clean", {"$ifNull": ["$merchant_id", "$description"]}]},
                        "c": "$category",
                        "s": "$subcategory",
                    },
                    "count": {"$sum": 1},
                    "total": {"$sum": "$amount"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "merchant": {"$ifNull": ["$_id.m", "Merchant"]},
                    "category": {"$ifNull": ["$_id.c", "Uncategorized"]},
                    "subcategory": {"$ifNull": ["$_id.s", "Other"]},
                    "count": 1,
                    "total": {"$round": ["$total", 2]},
                }
            },
            {"$sort": {"total": -1}},
        ]

        merchants = list(transactions.aggregate(pipeline))
        if limit is not None:
            merchants = merchants[:limit]

        return jsonify(merchants)
