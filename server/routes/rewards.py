from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple
from collections import defaultdict

from flask import Blueprint, jsonify, request, g
from pymongo.collection import Collection

from server.utils import parse_window_days


def _normalize_rate(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        rate = float(value)
        # If someone stored "4" for 4% or "0.04", handle both
        if rate > 1:
            return rate / 100.0
        return rate
    return default


def _extract_rate(rule: Dict[str, Any], default: float = 0.0) -> float:
    for key in ("rate", "multiplier", "earn_rate", "cashback", "value"):
        if key in rule:
            return _normalize_rate(rule.get(key), default)
    return default


def _extract_cap(rule: Dict[str, Any]) -> float | None:
    for key in ("cap", "limit", "monthly_cap", "monthlyCap", "max_spend"):
        value = rule.get(key)
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
    return None


def _resolve_card_key(document: Dict[str, Any]) -> str | None:
    for key in ("card_id", "cardId", "card_product_id", "cardProductId", "product_id", "productId", "_id"):
        if key in document and document[key] is not None:
            return str(document[key])
    name = document.get("product_name") or document.get("name")
    if isinstance(name, str) and name.strip():
        return name
    return None


def _card_display_name(document: Dict[str, Any]) -> str:
    for key in ("product_name", "name", "card_name", "nickname"):
        value = document.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return "Card"


def _card_issuer(document: Dict[str, Any]) -> str:
    for key in ("issuer", "bank", "issuer_name"):
        value = document.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return "Unknown"


def _card_annual_fee(document: Dict[str, Any]) -> float:
    for key in ("annual_fee", "annualFee", "af"):
        value = document.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


def _card_base_rate(card: Dict[str, Any], rules: List[Dict[str, Any]]) -> float:
    for key in ("base_rate", "baseRate", "everywhere_rate", "flat_rate"):
        if key in card:
            return _normalize_rate(card.get(key), 0.0)
    for rule in rules:
        scope = str(rule.get("scope") or rule.get("type") or "").lower()
        if scope in {"base", "everywhere", "default", "flat"}:
            return _extract_rate(rule, 0.0)
        if not rule.get("category") and not rule.get("merchant"):
            return _extract_rate(rule, 0.0)
    return 0.01


def _period_fee(annual_fee: float, window_days: int) -> float:
    if annual_fee <= 0:
        return 0.0
    return (annual_fee / 12.0) * (window_days / 30.0)


def _annualize(value: float, window_days: int) -> float:
    if window_days <= 0:
        return value
    return value * (365.0 / float(window_days))


def _card_reason_strings(
        card: Dict[str, Any],
        category_breakdown: Dict[str, Dict[str, float]],
        base_rate: float,
) -> List[str]:
    reasons: List[str] = []
    sorted_categories = sorted(
        ((cat, data) for cat, data in category_breakdown.items() if data.get("rewards", 0) > 0),
        key=lambda item: item[1]["rewards"],
        reverse=True,
    )
    for cat, data in sorted_categories[:2]:
        spend = data.get("spend", 0)
        rewards = data.get("rewards", 0)
        if spend > 0 and rewards > 0:
            rate = (rewards / spend) * 100
            reasons.append(f"{rate:.0f}% back on {cat.lower()}")
    if not reasons and base_rate > 0:
        reasons.append(f"{base_rate * 100:.0f}% back everywhere")

    annual_fee = _card_annual_fee(card)
    if annual_fee > 0:
        reasons.append(f"${annual_fee:.0f} annual fee")
    else:
        reasons.append("no annual fee")
    return reasons[:3]


def _summarize_rewards(
        card: Dict[str, Any],
        card_rules: Dict[str, Any],
        spend_by_category: Dict[str, float],
        spend_by_merchant: Dict[str, float],
        merchant_categories: Dict[str, str],
        window_days: int,
) -> Tuple[float, Dict[str, Dict[str, float]], float]:
    category_rules: List[Dict[str, Any]] = card_rules.get("category", [])
    merchant_rules: List[Dict[str, Any]] = card_rules.get("merchant", [])
    general_rules: List[Dict[str, Any]] = card_rules.get("general", [])

    base_rate = _card_base_rate(card, general_rules)

    remaining_by_category = defaultdict(float, {cat: float(amount) for cat, amount in spend_by_category.items()})
    category_breakdown: Dict[str, Dict[str, float]] = defaultdict(lambda: {"spend": 0.0, "rewards": 0.0})
    total_rewards = 0.0

    for rule in category_rules:
        category = rule.get("category") or rule.get("category_name") or rule.get("categoryName")
        if not isinstance(category, str):
            continue
        category = category.strip()
        if not category:
            continue
        spend = remaining_by_category.get(category, 0.0)
        if spend <= 0:
            continue
        cap = _extract_cap(rule)
        applicable = min(spend, cap) if cap else spend
        if applicable <= 0:
            continue
        rate = _extract_rate(rule, base_rate)
        reward = applicable * rate
        total_rewards += reward
        category_breakdown[category]["spend"] += applicable
        category_breakdown[category]["rewards"] += reward
        remaining_by_category[category] = max(spend - applicable, 0.0)

    for rule in merchant_rules:
        merchant = (
                rule.get("merchant")
                or rule.get("merchant_id")
                or rule.get("merchantId")
                or rule.get("merchantName")
        )
        if not isinstance(merchant, str):
            continue
        merchant = merchant.strip()
        if not merchant:
            continue
        spend = spend_by_merchant.get(merchant, 0.0)
        if spend <= 0:
            continue
        cap = _extract_cap(rule)
        applicable = min(spend, cap) if cap else spend
        if applicable <= 0:
            continue
        rate = _extract_rate(rule, base_rate)
        reward = applicable * rate
        total_rewards += reward
        category = merchant_categories.get(merchant) or rule.get("category") or "Merchant"
        category_breakdown[category]["spend"] += applicable
        category_breakdown[category]["rewards"] += reward
        remaining_by_category[category] = max(remaining_by_category.get(category, 0.0) - applicable, 0.0)

    for category, spend in list(remaining_by_category.items()):
        if spend <= 0:
            continue
        reward = spend * base_rate
        total_rewards += reward
        category_breakdown[category]["spend"] += spend
        category_breakdown[category]["rewards"] += reward

    period_fee = _period_fee(_card_annual_fee(card), window_days)
    net_rewards = total_rewards - period_fee
    return net_rewards, category_breakdown, base_rate


def register_rewards_routes(api_bp: Blueprint, database) -> None:
    transactions: Collection = database["transactions"]
    credit_cards: Collection = database["credit_cards"]
    category_rules_col: Collection = database["reward_rule_categories"]
    merchant_rules_col: Collection = database["reward_rule_merchants"]
    general_rules_col: Collection = database["reward_rules"]

    @api_bp.get("/rewards/estimate")
    def rewards_estimate():
        user = g.current_user
        window_days = parse_window_days(90)
        since = datetime.now(timezone.utc) - timedelta(days=window_days)

        match = {"userId": user["_id"], "date": {"$gte": since}}
        transactions_cursor = transactions.find(match)
        spend_by_category: Dict[str, float] = defaultdict(float)
        spend_by_merchant: Dict[str, float] = defaultdict(float)
        merchant_categories: Dict[str, str] = {}
        total_spend = 0.0
        for txn in transactions_cursor:
            amount = float(txn.get("amount", 0))
            if amount <= 0:
                continue
            total_spend += amount
            category = txn.get("category") or "Other"
            merchant = txn.get("merchant_id") or txn.get("description_clean") or txn.get("description") or "Merchant"
            spend_by_category[category] += amount
            spend_by_merchant[merchant] += amount
            merchant_categories.setdefault(merchant, category)

        period_spend = round(total_spend, 2)

        cards = list(credit_cards.find({}))
        if not cards or period_spend <= 0:
            return jsonify(
                {
                    "periodSpend": period_spend,
                    "estimatedRewards": 0.0,
                    "bestCard": None,
                    "byCategory": [],
                }
            )

        category_rules = defaultdict(list)
        for rule in category_rules_col.find({}):
            key = _resolve_card_key(rule)
            if key:
                category_rules[key].append(rule)

        merchant_rules = defaultdict(list)
        for rule in merchant_rules_col.find({}):
            key = _resolve_card_key(rule)
            if key:
                merchant_rules[key].append(rule)

        general_rules = defaultdict(list)
        for rule in general_rules_col.find({}):
            key = _resolve_card_key(rule)
            if key:
                general_rules[key].append(rule)

        card_results = []
        for card in cards:
            card_key = _resolve_card_key(card)
            if not card_key:
                continue
            rules = {
                "category": category_rules.get(card_key, []),
                "merchant": merchant_rules.get(card_key, []),
                "general": general_rules.get(card_key, []),
            }
            net_rewards, category_breakdown, base_rate = _summarize_rewards(
                card,
                rules,
                spend_by_category,
                spend_by_merchant,
                merchant_categories,
                window_days,
            )
            annual_value = _annualize(net_rewards, window_days)
            card_results.append(
                {
                    "card": card,
                    "card_key": card_key,
                    "net_rewards": net_rewards,
                    "annual_value": annual_value,
                    "category_breakdown": category_breakdown,
                    "base_rate": base_rate,
                }
            )

        if not card_results:
            return jsonify(
                {
                    "periodSpend": period_spend,
                    "estimatedRewards": 0.0,
                    "bestCard": None,
                    "byCategory": [],
                }
            )

        best = max(card_results, key=lambda item: item["net_rewards"])
        breakdown_rows = [
            {
                "category": category,
                "spend": round(data.get("spend", 0.0), 2),
                "estRewards": round(data.get("rewards", 0.0), 2),
            }
            for category, data in sorted(
                best["category_breakdown"].items(),
                key=lambda item: item[1].get("rewards", 0),
                reverse=True,
            )
            if data.get("spend", 0) > 0
        ]

        best_card_doc = best["card"]
        best_card_payload = {
            "id": best.get("card_key"),
            "name": _card_display_name(best_card_doc),
            "issuer": _card_issuer(best_card_doc),
        }

        return jsonify(
            {
                "periodSpend": period_spend,
                "estimatedRewards": round(max(best["net_rewards"], 0.0), 2),
                "bestCard": best_card_payload,
                "byCategory": breakdown_rows,
            }
        )

    @api_bp.get("/rewards/recommendations")
    def rewards_recommendations():
        user = g.current_user
        window_days = parse_window_days(90)
        since = datetime.now(timezone.utc) - timedelta(days=window_days)
        top_param = request.args.get("top", "5")
        try:
            top_n = int(top_param)
        except (TypeError, ValueError):
            top_n = 5
        top_n = max(1, min(top_n, 10))

        match = {"userId": user["_id"], "date": {"$gte": since}}
        transactions_cursor = transactions.find(match)
        spend_by_category: Dict[str, float] = defaultdict(float)
        spend_by_merchant: Dict[str, float] = defaultdict(float)
        merchant_categories: Dict[str, str] = {}
        total_spend = 0.0
        for txn in transactions_cursor:
            amount = float(txn.get("amount", 0))
            if amount <= 0:
                continue
            total_spend += amount
            category = txn.get("category") or "Other"
            merchant = txn.get("merchant_id") or txn.get("description_clean") or txn.get("description") or "Merchant"
            spend_by_category[category] += amount
            spend_by_merchant[merchant] += amount
            merchant_categories.setdefault(merchant, category)

        cards = list(credit_cards.find({}))
        if not cards:
            return jsonify({"ranked": []})

        category_rules = defaultdict(list)
        for rule in category_rules_col.find({}):
            key = _resolve_card_key(rule)
            if key:
                category_rules[key].append(rule)

        merchant_rules = defaultdict(list)
        for rule in merchant_rules_col.find({}):
            key = _resolve_card_key(rule)
            if key:
                merchant_rules[key].append(rule)

        general_rules = defaultdict(list)
        for rule in general_rules_col.find({}):
            key = _resolve_card_key(rule)
            if key:
                general_rules[key].append(rule)

        recommendations: List[Dict[str, Any]] = []
        for card in cards:
            card_key = _resolve_card_key(card)
            if not card_key:
                continue
            rules = {
                "category": category_rules.get(card_key, []),
                "merchant": merchant_rules.get(card_key, []),
                "general": general_rules.get(card_key, []),
            }
            net_rewards, category_breakdown, base_rate = _summarize_rewards(
                card,
                rules,
                spend_by_category,
                spend_by_merchant,
                merchant_categories,
                window_days,
            )
            annual_value = _annualize(net_rewards, window_days)
            reasons = _card_reason_strings(card, category_breakdown, base_rate)
            recommendations.append(
                {
                    "cardId": card_key,
                    "name": _card_display_name(card),
                    "issuer": _card_issuer(card),
                    "estAnnualValue": round(annual_value, 2),
                    "reasons": reasons,
                }
            )

        ranked = sorted(recommendations, key=lambda item: item["estAnnualValue"], reverse=True)[:top_n]
        return jsonify({"ranked": ranked})
