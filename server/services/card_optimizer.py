from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from datetime import date

@dataclass
class Candidate:
    card_id: str
    display: str
    effective_rate: float
    est_reward_cents: int
    reasons: List[str]
    actions: List[Dict[str, Any]]

def quarter_of(d: date) -> str:
    q = (d.month - 1)//3 + 1
    return f"{d.year}Q{q}"

def rate_for_category(card: Dict[str, Any], category: Optional[str]) -> float:
    if not category:
        return float(card.get("base_rate", 0.0))
    for r in card.get("category_rates", []):
        if r.get("category") == category:
            return float(r.get("rate", 0.0))
    return float(card.get("base_rate", 0.0))

def score_single_transaction(
        card: Dict[str, Any],
        user_card: Optional[Dict[str, Any]],
        *,
        merchant: Optional[str],
        category: Optional[str],
        amount_cents: int,
        today: Optional[date] = None,
) -> Tuple[float, int, List[str], List[Dict[str, Any]]]:
    import math
    from datetime import date as _date
    today = today or _date.today()
    reasons: List[str] = []
    actions: List[Dict[str, Any]] = []

    # Merchant override (exact match)
    if merchant and card.get("merchant_overrides"):
        for mo in card["merchant_overrides"]:
            if mo.get("merchant") and mo["merchant"].upper() == merchant.upper():
                r = float(mo.get("rate", 0.0))
                reasons.append(f"Merchant override {merchant}: {r*100:.0f}%")
                reward = math.floor(amount_cents * r)
                return r, reward, reasons, actions

    base_rate = float(card.get("base_rate", 0.0))

    # Rotating categories (with activation + cap blend)
    rotating = card.get("rotating")
    if rotating and category:
        q = quarter_of(today)
        cats_this_q = rotating.get("quarters", {}).get(q, [])
        if category in cats_this_q:
            user_rot = (user_card or {}).get("rotating", {}).get(q, {})
            if user_rot.get("activated", False):
                cap_usd = float(rotating.get("caps", {}).get("amount_usd", 0))
                hi = float(rotating.get("rate", 0.0))
                reasons.append(f"Rotating {category} at {hi*100:.0f}% (activated)")
                # Pull cap usage
                rem_cents = None
                for c in (user_card or {}).get("caps", []):
                    if c.get("scope") == "rotating":
                        cap_cents = int(c.get("cap_cents", int(cap_usd*100)))
                        used_cents = int(c.get("used_cents", 0))
                        rem_cents = max(0, cap_cents - used_cents)
                        break
                if rem_cents is None:
                    rem_cents = int(cap_usd*100)

                hi_part = min(amount_cents, rem_cents)
                lo_part = max(0, amount_cents - rem_cents)
                reward = int(hi_part * hi + lo_part * base_rate)
                eff = reward/amount_cents if amount_cents > 0 else 0.0
                if rem_cents <= 0:
                    reasons.append("Rotating cap maxed — overflow at base rate")
                return eff, reward, reasons, actions
            else:
                actions.append({"type": "activate_rotating", "card_id": card["_id"], "quarter": q})
                reasons.append("Rotating eligible but not activated — activate to earn bonus")

    # Non-rotating category
    cat_rate = rate_for_category(card, category)
    if category and cat_rate > base_rate:
        reasons.append(f"Category {category} at {cat_rate*100:.0f}%")
        reward = int(amount_cents * cat_rate)
        return cat_rate, reward, reasons, actions

    # Base rate
    if base_rate > 0:
        reasons.append(f"Base rate {base_rate*100:.0f}%")
    reward = int(amount_cents * base_rate)
    return base_rate, reward, reasons, actions

def best_cards(
        *,
        amount_cents: int,
        merchant: Optional[str],
        category: Optional[str],
        card_catalog: List[Dict[str, Any]],
        user_cards: List[Dict[str, Any]],
) -> List[Candidate]:
    by_id = {uc.get("card_id"): uc for uc in user_cards}
    rows: List[Candidate] = []
    for card in card_catalog:
        uc = by_id.get(card["_id"])  # may be None if user hasn’t linked it yet
        eff, rew, reasons, actions = score_single_transaction(
            card, uc, merchant=merchant, category=category, amount_cents=amount_cents
        )
        display = (uc or {}).get("nickname") or f'{card.get("issuer")} {card.get("product")}'
        rows.append(Candidate(
            card_id=card["_id"],
            display=display,
            effective_rate=eff,
            est_reward_cents=rew,
            reasons=reasons,
            actions=actions,
        ))
    rows.sort(key=lambda r: (r.est_reward_cents, r.effective_rate), reverse=True)
    return rows
