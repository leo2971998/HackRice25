"""Chatbot interaction routes."""

from datetime import datetime
from uuid import uuid4

from flask import Blueprint, g, jsonify, request
from werkzeug.exceptions import BadRequest

from server.llm.gemini import generate_chat_response
from server.services.scoring import score_catalog
from server.services.spend import compute_user_mix, load_transactions


def register_chat_routes(bp: Blueprint, database) -> None:
    @bp.post("/chat")
    def chat():
        user = g.current_user
        payload = request.get_json(force=True) or {}

        history_payload = payload.get("history") or []
        if not isinstance(history_payload, list):
            raise BadRequest("history must be an array")

        sanitized_history = []
        for entry in history_payload:
            if not isinstance(entry, dict):
                continue
            author = entry.get("author")
            content = entry.get("content")
            timestamp = entry.get("timestamp")
            if author not in {"user", "assistant"}:
                continue
            if not isinstance(content, str) or not content.strip():
                continue
            sanitized_history.append(
                {
                    "author": author,
                    "content": content.strip(),
                    "timestamp": timestamp if isinstance(timestamp, str) else None,
                }
            )

        new_message = payload.get("newMessage")
        if not isinstance(new_message, str) or not new_message.strip():
            raise BadRequest("newMessage is required")
        new_message_text = new_message.strip()

        window_days = 90
        transactions = load_transactions(database, user["_id"], window_days, None)
        spend_mix, total_window_spend, transactions = compute_user_mix(
            database,
            user["_id"],
            window_days,
            None,
            transactions=transactions,
        )

        monthly_total = 0.0
        if total_window_spend > 0 and window_days > 0:
            monthly_total = (total_window_spend / window_days) * 30

        catalog_cards = list(database["credit_cards"].find({"active": True}))
        recommendations = []
        if spend_mix and monthly_total > 0 and catalog_cards:
            recommendations = score_catalog(
                catalog_cards,
                spend_mix,
                monthly_total,
                window_days,
                limit=3,
            )

        assistant_text = generate_chat_response(
            spend_mix,
            recommendations,
            sanitized_history,
            new_message_text,
        )

        assistant_message = {
            "id": str(uuid4()),
            "author": "assistant",
            "content": assistant_text,
            "timestamp": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        }
        return jsonify({"message": assistant_message})
