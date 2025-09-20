"""Deterministic credit card scoring utilities."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Sequence


def _format_rewards(rewards: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    formatted: List[Dict[str, Any]] = []
    for reward in rewards or []:
        category = reward.get("category")
        rate = reward.get("rate")
        if not category or rate is None:
            continue
        entry: Dict[str, Any] = {
            "category": str(category),
            "rate": float(rate),
        }
        if reward.get("cap_monthly") is not None:
            try:
                entry["cap_monthly"] = float(reward["cap_monthly"])
            except (TypeError, ValueError):
                pass
        formatted.append(entry)
    return formatted


def _format_welcome_offer(offer: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if not offer:
        return None
    formatted: Dict[str, Any] = {}
    if offer.get("bonus_value_usd") is not None:
        try:
            formatted["bonus_value_usd"] = float(offer["bonus_value_usd"])
        except (TypeError, ValueError):
            pass
    if offer.get("min_spend") is not None:
        try:
            formatted["min_spend"] = float(offer["min_spend"])
        except (TypeError, ValueError):
            pass
    if offer.get("window_days") is not None:
        try:
            formatted["window_days"] = int(offer["window_days"])
        except (TypeError, ValueError):
            pass
    return formatted or None


def score_card(
    card: Dict[str, Any],
    category_mix: Dict[str, float],
    monthly_total: float,
    window_days: int,
) -> Dict[str, Any]:
    base_rate = float(card.get("base_cashback") or 0.0)
    base_reward_monthly = base_rate * monthly_total

    rewards = _format_rewards(card.get("rewards", []))
    bonus_details: List[Dict[str, Any]] = []
    bonus_total_monthly = 0.0
    for reward in rewards:
        category = reward["category"]
        rate = reward["rate"]
        bonus_rate = max(rate - base_rate, 0.0)
        category_share = category_mix.get(category, 0.0)
        category_spend = monthly_total * category_share
        cap = reward.get("cap_monthly")
        eligible_spend = min(category_spend, cap) if isinstance(cap, (int, float)) else category_spend
        bonus_amount = bonus_rate * eligible_spend
        bonus_total_monthly += bonus_amount
        bonus_details.append(
            {
                "category": category,
                "rate": rate,
                "cap_monthly": cap,
                "eligible_spend_monthly": round(eligible_spend, 2),
                "monthly_amount": round(bonus_amount, 2),
                "annual_amount": round(bonus_amount * 12, 2),
            }
        )

    monthly_reward = base_reward_monthly + bonus_total_monthly
    annual_reward = monthly_reward * 12

    welcome_offer = _format_welcome_offer(card.get("welcome_offer"))
    welcome_value = 0.0
    if welcome_offer:
        bonus_value = float(welcome_offer.get("bonus_value_usd") or 0.0)
        min_spend = float(welcome_offer.get("min_spend") or 0.0)
        offer_window = int(welcome_offer.get("window_days") or window_days or 0)
        if bonus_value > 0:
            if min_spend > 0 and monthly_total > 0 and offer_window > 0:
                spend_available = monthly_total * (offer_window / 30)
                progress = min(spend_available / min_spend, 1.0)
                welcome_value = bonus_value * progress
            else:
                welcome_value = bonus_value
        annual_reward += welcome_value
    else:
        welcome_offer = None

    annual_fee = float(card.get("annual_fee") or 0.0)
    net_value = annual_reward - annual_fee

    highlights: List[str] = []
    for bonus in sorted(bonus_details, key=lambda item: item["monthly_amount"], reverse=True):
        if bonus["monthly_amount"] <= 0:
            continue
        highlights.append(
            f"{bonus['rate'] * 100:.1f}% back on {bonus['category']} up to ${bonus['eligible_spend_monthly']:.0f}/mo"
        )
    if welcome_value > 0 and welcome_offer:
        offer_window = welcome_offer.get("window_days") or window_days
        min_spend = welcome_offer.get("min_spend")
        spend_text = f"${min_spend:,.0f}" if isinstance(min_spend, (int, float)) and min_spend else "the required amount"
        highlights.append(
            f"Intro bonus worth ~${welcome_value:,.0f} if you spend {spend_text} in {offer_window} days"
        )
    if not highlights and base_rate > 0 and monthly_total > 0:
        highlights.append(
            f"{base_rate * 100:.1f}% back on about ${monthly_total:,.0f} in monthly spend"
        )

    return {
        "id": str(card.get("_id")) if card.get("_id") else None,
        "slug": card.get("slug"),
        "product_name": card.get("product_name"),
        "issuer": card.get("issuer"),
        "network": card.get("network"),
        "link_url": card.get("link_url"),
        "foreign_tx_fee": card.get("foreign_tx_fee"),
        "base_cashback": base_rate,
        "annual_fee": annual_fee,
        "annual_reward": round(annual_reward, 2),
        "monthly_reward": round(monthly_reward, 2),
        "net": round(net_value, 2),
        "active": bool(card.get("active", True)),
        "rewards": rewards,
        "welcome_offer": welcome_offer,
        "breakdown": {
            "monthly_spend": round(monthly_total, 2),
            "base": {
                "rate": base_rate,
                "monthly_amount": round(base_reward_monthly, 2),
                "annual_amount": round(base_reward_monthly * 12, 2),
            },
            "bonuses": bonus_details,
            "welcome": {
                "value": round(welcome_value, 2),
                "min_spend": welcome_offer.get("min_spend") if welcome_offer else None,
                "window_days": welcome_offer.get("window_days") if welcome_offer else None,
            }
            if welcome_value > 0
            else None,
        },
        "highlights": highlights,
    }


def score_catalog(
    cards: Sequence[Dict[str, Any]],
    category_mix: Dict[str, float],
    monthly_total: float,
    window_days: int,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    if monthly_total <= 0 or not category_mix:
        return []

    scored = [score_card(card, category_mix, monthly_total, window_days) for card in cards]
    scored.sort(key=lambda item: item["net"], reverse=True)
    if limit > 0:
        return scored[:limit]
    return scored

