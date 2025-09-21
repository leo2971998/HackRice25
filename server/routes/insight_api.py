# server/routes/insight_api.py
from __future__ import annotations
from flask import Blueprint, request, jsonify, g, current_app as app
from services.insights import compare_windows, overspend_reasons

insights_bp = Blueprint("insights_api", __name__)

@insights_bp.get("/api/insights/overspend")
def overspend():
    window = request.args.get("window", "MTD")
    return jsonify(overspend_reasons(app.config["MONGO_DB"], g.current_user["_id"], window=window))

@insights_bp.get("/api/insights/delta")
def delta():
    window = request.args.get("window", "MTD")
    return jsonify(compare_windows(app.config["MONGO_DB"], g.current_user["_id"], this_window=window))

@insights_bp.get("/api/insights/subscriptions")
def subs():
    return jsonify(top_subscriptions_by_annual_burn(app.config["MONGO_DB"], g.current_user["_id"]))
