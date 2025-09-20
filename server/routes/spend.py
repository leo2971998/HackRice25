"""Spend and merchant insights routes."""

from typing import Any, Dict

from flask import Blueprint, g, jsonify, request
from werkzeug.exceptions import BadRequest

from server.core import calculate_money_moments, parse_window_days
from server.services.spend import (
    aggregate_spend_details,
    build_category_rules,
    load_transactions,
)

from .helpers import parse_card_ids_query


def register_spend_routes(bp: Blueprint, database) -> None:
    @bp.get("/spend/summary")
    def spend_summary():
        user = g.current_user
        window_days = parse_window_days(30)
        card_object_ids = parse_card_ids_query()

        transactions = load_transactions(database, user["_id"], window_days, card_object_ids)
        summary = aggregate_spend_details(transactions)

        accounts_count = database["accounts"].count_documents(
            {"userId": user["_id"], "account_type": "credit_card"}
        )
        categories = [
            {"name": row["key"], "total": row["amount"]}
            for row in summary["categories"]
        ]
        return jsonify(
            {
                "stats": {
                    "totalSpend": summary["total"],
                    "txns": summary["transaction_count"],
                    "accounts": accounts_count,
                },
                "byCategory": categories,
            }
        )

    @bp.get("/merchants")
    def merchants():
        user = g.current_user
        window_days = parse_window_days(30)
        limit_raw = request.args.get("limit", 8)

        try:
            limit = int(limit_raw)
        except (TypeError, ValueError):
            raise BadRequest("limit must be an integer")
        if limit <= 0:
            raise BadRequest("limit must be positive")

        card_object_ids = parse_card_ids_query()
        transactions = load_transactions(database, user["_id"], window_days, card_object_ids)
        rules = build_category_rules(database["merchant_categories"].find({}))
        breakdown = aggregate_spend_details(transactions, rules)
        ordered = breakdown["merchants"]
        return jsonify(
            [
                {
                    "id": merchant["name"],
                    "name": merchant["name"],
                    "category": merchant["category"],
                    "count": merchant["count"],
                    "total": merchant["amount"],
                    "logoUrl": merchant.get("logoUrl", ""),
                }
                for merchant in ordered[:limit]
            ]
        )

    @bp.get("/spend/details")
    def spend_details():
        user = g.current_user
        window_days = parse_window_days(30)
        card_object_ids = parse_card_ids_query()

        transactions = load_transactions(database, user["_id"], window_days, card_object_ids)
        rules = build_category_rules(database["merchant_categories"].find({}))
        breakdown = aggregate_spend_details(transactions, rules)

        return jsonify(
            {
                "windowDays": window_days,
                "total": breakdown["total"],
                "transactionCount": breakdown["transaction_count"],
                "categories": breakdown["categories"],
                "merchants": [
                    {
                        "name": merchant["name"],
                        "category": merchant["category"],
                        "amount": merchant["amount"],
                        "count": merchant["count"],
                        "logoUrl": merchant.get("logoUrl", ""),
                    }
                    for merchant in breakdown["merchants"]
                ],
            }
        )

    @bp.get("/money-moments")
    def money_moments():
        user = g.current_user
        window_days = parse_window_days(30)
        card_object_ids = parse_card_ids_query()

        txns = load_transactions(database, user["_id"], window_days, card_object_ids)
        moments = list(calculate_money_moments(window_days, txns))
        return jsonify(moments)
