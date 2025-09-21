from datetime import datetime, timedelta
from typing import Any, Dict, List

import statistics
from bson import ObjectId
from pymongo.database import Database

CADENCE_BUCKETS = {
    "yearly": (360, 370),
    "quarterly": (85, 95),
    "monthly": (28, 32),
    "biweekly": (13, 16),
    "weekly": (6, 8),
}


def detect_recurring_for_user(db: Database, user_id: ObjectId) -> List[Dict[str, Any]]:
    """Analyze a user's transactions to detect recurring merchants."""
    txns = db["transactions"]
    groups = db["recurring_groups"]
    future = db["future_transactions"]
    now = datetime.utcnow()

    pipeline = [
        {"$match": {"user_id": user_id, "merchant_name_norm": {"$ne": None}}},
        {"$sort": {"posted_at": 1}},
        {
            "$group": {
                "_id": "$merchant_name_norm",
                "txns": {
                    "$push": {"_id": "$_id", "posted_at": "$posted_at", "amount": "$amount"}
                },
                "merchant_id": {"$first": "$merchant_id"},
            }
        },
    ]
    merchant_groups = list(txns.aggregate(pipeline))

    detected_groups: List[Dict[str, Any]] = []

    for group in merchant_groups:
        if len(group["txns"]) < 3:
            continue

        dates = [txn["posted_at"] for txn in group["txns"]]
        amounts = [abs(txn["amount"]) for txn in group["txns"]]
        deltas = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        if not deltas:
            continue

        median_interval = statistics.median(deltas)
        amount_median = statistics.median(amounts)
        amount_stddev = statistics.stdev(amounts) if len(amounts) > 1 else 0
        variance_pct = (amount_stddev / amount_median) if amount_median else 0

        detected_period = None
        for period, (min_days, max_days) in CADENCE_BUCKETS.items():
            if min_days <= median_interval <= max_days:
                detected_period = period
                break

        if not detected_period or variance_pct >= 0.30:
            continue

        last_txn = group["txns"][-1]
        last_seen_at = last_txn["posted_at"]
        next_expected_at = last_seen_at + timedelta(days=median_interval)

        group_doc = {
            "user_id": user_id,
            "merchant_id": group["merchant_id"],
            "period": detected_period,
            "typical_amount": amount_median,
            "variance_pct": variance_pct,
            "last_seen_at": last_seen_at,
            "next_expected_at": next_expected_at,
            "confidence": 0.85,
            "updated_at": now,
        }
        result = groups.update_one(
            {"user_id": user_id, "merchant_id": group["merchant_id"]},
            {"$set": group_doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if result.upserted_id is not None:
            group_id = result.upserted_id
        else:
            existing = groups.find_one({"user_id": user_id, "merchant_id": group["merchant_id"]})
            group_id = existing["_id"] if existing else None

        if group_id and next_expected_at > now:
            future_doc = {
                "user_id": user_id,
                "merchant_id": group["merchant_id"],
                "recurring_group_id": group_id,
                "amount_predicted": amount_median,
                "expected_at": next_expected_at,
                "status": "predicted",
                "explain": f"{detected_period.capitalize()}, median ${amount_median:.2f} (±{variance_pct:.0%})",
                "confidence": 0.85,
            }
            future.update_one(
                {"recurring_group_id": group_id, "expected_at": next_expected_at},
                {"$set": future_doc, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )

        detected_groups.append({"merchant": group["_id"], "period": detected_period})

    return detected_groups


__all__ = ["detect_recurring_for_user", "CADENCE_BUCKETS"]
