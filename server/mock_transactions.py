# mock_transactions.py
from __future__ import annotations
from datetime import datetime, timedelta
import hashlib, random, math
from typing import Dict, Any, List, Tuple, Optional
from pymongo.collection import Collection

# ----------- minimal merchant catalog (expand as you like) -----------
MERCHANTS: List[Dict[str, Any]] = [
    # Grocery
    {"id": "heb", "name": "H-E-B", "mcc": "5411", "category": "Grocery", "ticket_mean": 60, "ticket_std": 25, "online_ratio": 0.15, "weight": 1.5},
    {"id": "costco", "name": "Costco", "mcc": "5300", "category": "Grocery", "ticket_mean": 120, "ticket_std": 60, "online_ratio": 0.25, "weight": 1.0},
    # Dining
    {"id": "starbucks", "name": "Starbucks", "mcc": "5814", "category": "Food and Drink", "ticket_mean": 12, "ticket_std": 6, "online_ratio": 0.0, "weight": 1.3},
    {"id": "chipotle", "name": "Chipotle", "mcc": "5814", "category": "Food and Drink", "ticket_mean": 16, "ticket_std": 7, "online_ratio": 0.0, "weight": 1.0},
    {"id": "doordash", "name": "DoorDash", "mcc": "5814", "category": "Food and Drink", "ticket_mean": 34, "ticket_std": 14, "online_ratio": 1.0, "weight": 0.7},
    # Shopping
    {"id": "amazon", "name": "Amazon", "mcc": "5942", "category": "Shopping", "ticket_mean": 40, "ticket_std": 30, "online_ratio": 1.0, "weight": 1.6},
    {"id": "target", "name": "Target", "mcc": "5411", "category": "Shopping", "ticket_mean": 45, "ticket_std": 25, "online_ratio": 0.5, "weight": 1.0},
    # Gas
    {"id": "exxon", "name": "Exxon", "mcc": "5541", "category": "Gas", "ticket_mean": 45, "ticket_std": 15, "online_ratio": 0.0, "weight": 1.2},
    # Transit
    {"id": "uber", "name": "Uber", "mcc": "4121", "category": "Transit", "ticket_mean": 18, "ticket_std": 10, "online_ratio": 1.0, "weight": 0.9},
    # Bills/Subscriptions
    {"id": "spotify", "name": "Spotify", "mcc": "5735", "category": "Bills", "ticket_mean": 10.99, "ticket_std": 0.5, "online_ratio": 1.0, "weight": 0.7},
    {"id": "netflix", "name": "Netflix", "mcc": "4899", "category": "Bills", "ticket_mean": 15.49, "ticket_std": 0.5, "online_ratio": 1.0, "weight": 0.7},
    # Travel (occasional spike)
    {"id": "delta", "name": "Delta Air Lines", "mcc": "4511", "category": "Travel", "ticket_mean": 300, "ticket_std": 120, "online_ratio": 1.0, "weight": 0.25},
]

CATEGORY_WEIGHTS = {
    "Grocery": 0.25, "Food and Drink": 0.22, "Shopping": 0.20,
    "Gas": 0.12, "Transit": 0.08, "Bills": 0.09, "Travel": 0.04,
}

WEEKDAY_WEIGHT = [1.2, 0.7, 0.8, 0.9, 1.0, 1.3, 1.4]  # Sun..Sat


# ----------- util helpers -----------
def _rng(user_id: str, account_id: str, seed_version: str) -> random.Random:
    h = hashlib.sha256(f"{user_id}|{account_id}|{seed_version}".encode()).hexdigest()
    return random.Random(int(h, 16) % (2**63 - 1))

def _weighted_choice(rng: random.Random, items: List[Tuple[Any, float]]) -> Any:
    total = sum(w for _, w in items)
    r = rng.random() * total
    upto = 0.0
    for item, w in items:
        upto += w
        if r <= upto:
            return item
    return items[-1][0]

def _pick_category(rng: random.Random) -> str:
    return _weighted_choice(rng, list(CATEGORY_WEIGHTS.items()))

def _pick_merchant(rng: random.Random, category: str) -> Dict[str, Any]:
    pool = [(m, m["weight"]) for m in MERCHANTS if m["category"] == category]
    return _weighted_choice(rng, pool)

def _sample_amount(rng: random.Random, mean: float, std: float, category: str) -> float:
    # lognormal-ish around mean/std
    mu = math.log(max(1.0, mean)) - 0.5
    sigma = 0.35 if std <= 1 else min(0.75, std / max(5.0, mean))
    amt = rng.lognormvariate(mu, sigma)
    # clamp by category
    clamps = {
        "Grocery": (10, 220), "Food and Drink": (7, 65), "Shopping": (5, 250),
        "Gas": (20, 90), "Transit": (5, 60), "Bills": (5, 150), "Travel": (80, 900),
    }
    low, high = clamps.get(category, (5, 250))
    amt = max(low, min(high, amt))
    # small flavor
    if category == "Food and Drink":
        amt *= (1.00 + 0.02 * rng.choice([-1, 0, 1, 2]))  # tips/tax wobble
    if category == "Gas" and rng.random() < 0.4:
        amt = round(amt / 5) * 5  # round dollars behavior
    return round(amt, 2)

def _reward_percent_for_account_mcc(account: Dict[str, Any], mcc: str) -> float:
    # Very simple demo mapping; replace with your real card rules.
    base = 0.01
    bonus = {
        "5411": 0.03,  # grocery
        "5814": 0.03,  # dining
        "5541": 0.03,  # gas
        "4511": 0.02,  # airlines
    }
    return max(base, bonus.get(mcc, base))


# ----------- main generator -----------
def generate_mock_transactions(
    db,
    user_id: str,
    account_id: str,
    *,
    N: int = 120,
    days: int = 60,
    seed_version: str = "v1",
    currency: str = "USD",
) -> int:
    """Create N seeded synthetic transactions for (user, account). Returns inserted/upserted count."""
    tx_col: Collection = db["transactions"]
    acct_col: Collection = db["accounts"]

    # optional: read account to respect opened_at/product
    account = acct_col.find_one({"id": account_id, "user_id": user_id}) or {}
    opened_at: datetime = account.get("opened_at") or (datetime.utcnow() - timedelta(days=365))

    rng = _rng(user_id, account_id, seed_version)
    now = datetime.utcnow()
    start = max(opened_at, now - timedelta(days=days))

    inserted = 0
    for i in range(N):
        # pick day with weekday weights
        d = start + timedelta(
            days=rng.randint(0, max(0, (now - start).days)),
        )
        # nudge to more realistic hours
        hour_pool = [(8,1),(9,2),(12,3),(17,3),(19,2),(21,1)]
        hr = _weighted_choice(rng, hour_pool)
        minute = rng.randint(0,59)
        authorized_at = d.replace(hour=hr, minute=minute, second=rng.randint(0,59), microsecond=0)

        # category -> merchant -> amount
        category = _pick_category(rng)
        m = _pick_merchant(rng, category)
        amount = _sample_amount(rng, m["ticket_mean"], m["ticket_std"], category)

        # status and posted timing
        is_refund = (rng.random() < 0.015)  # ~1–2 refunds in 60 days
        is_pending = (rng.random() < 0.10)
        status = "refund" if is_refund else ("pending" if is_pending else "posted")
        posted_at = None
        if status != "pending":
            lag_days = 0 if category in ("Bills","Transit") else rng.choice([0,0,1,1,2])
            posted_at = authorized_at + timedelta(days=lag_days)

        # channel
        channel = "online" if rng.random() < float(m["online_ratio"]) else "in_store"

        # rewards
        reward_pct = _reward_percent_for_account_mcc(account, m["mcc"])
        signed_amount = -amount if is_refund else amount
        rewards_amount = max(0.0, signed_amount) * reward_pct

        # cents + synthetic key
        amt_cents = int(round(signed_amount * 100))
        rew_cents = int(round(rewards_amount * 100))
        key_src = f"{user_id}|{account_id}|{m['id']}|{authorized_at.date()}|{round(amount)}|{seed_version}|{i}"
        synthetic_key = hashlib.sha1(key_src.encode()).hexdigest()

        doc = {
            "synthetic_key": synthetic_key,
            "is_synthetic": True,
            "seed_version": seed_version,
            "user_id": user_id,
            "account_id": account_id,
            "merchant_id": m["id"],
            "merchant_name": m["name"],
            "mcc": m["mcc"],
            "category": m["category"],
            "amount_cents": amt_cents,
            "currency": currency,
            "authorized_at": authorized_at,
            "posted_at": posted_at,
            "status": status,
            "channel": channel,
            "reward_percent": reward_pct,
            "est_rewards_amount_cents": rew_cents,
        }

        res = tx_col.update_one(
            {"synthetic_key": synthetic_key},
            {"$setOnInsert": doc},
            upsert=True,
        )
        if res.upserted_id is not None:
            inserted += 1

    return inserted
