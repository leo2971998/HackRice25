import os
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo  # Py3.9+; falls back to UTC below if missing
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
import random
from bson import ObjectId
from flask import Blueprint, Flask, jsonify, request, g
from flask_cors import CORS
from jose import jwt
from jose.exceptions import JWTError
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import CollectionInvalid, DuplicateKeyError
import requests
from werkzeug.exceptions import BadRequest, Forbidden, NotFound, Unauthorized
import smtplib
from email.message import EmailMessage
from calendar import monthrange
# LLM + services
from llm.gemini import explain_recommendations, generate_chat_response
from services.rewards import compute_month_earnings, normalize_mix
from services.scoring import score_catalog
from services.spend import (
    aggregate_spend_details,
    build_category_rules,
    compute_user_mix,
    load_transactions,
)
from services.insights import compare_windows, overspend_reasons, category_deep_dive

from mock_transactions import generate_mock_transactions
from db import ensure_indexes, init_db
from routes.recurring import recurring_bp
from routes.cards_best import cards_best_bp
from routes.insight_api import insights_bp
try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None


JWKS_CACHE: Dict[str, Any] = {"keys": []}
# app.py
DEFAULT_PREFERENCES = {
    "timezone": "America/Chicago",
    "currency": "USD",
    "theme": "system",
    "privacy": {"blurAmounts": False},
    "notifications": {"monthly_summary": True, "new_recommendation": True},
    # NEW:
    "budgets": {"monthlyTotal": None, "byCategory": {}},
}


DEFAULT_CASHBACK_SCENARIOS: List[Dict[str, Any]] = [
    {
        "_id": "iphone-upgrade",
        "label": "Upgrade to a new iPhone",
        "description": "Pick up the latest smartphone for a personal splurge.",
        "category": "Electronics",
        "amount": 999.0,
    },
    {
        "_id": "weekend-getaway",
        "label": "Book a weekend getaway",
        "description": "Flights and hotel for a quick escape with a friend.",
        "category": "Travel",
        "amount": 650.0,
    },
    {
        "_id": "family-grocery-stockup",
        "label": "Family grocery restock",
        "description": "Weekly groceries and essentials for the household.",
        "category": "Groceries",
        "amount": 320.0,
    },
    {
        "_id": "celebration-dinner",
        "label": "Celebrate with a dinner out",
        "description": "Treat the crew to a nice restaurant night.",
        "category": "Food and Drink",
        "amount": 180.0,
    },
]


# -------------------------
# Infra helpers
def load_environment() -> None:
    if load_dotenv is not None:
        load_dotenv()
def _fmt_currency(v: float) -> str:
    try:
        return f"${float(v):,.0f}"
    except Exception:
        return str(v)

def _delta_to_markdown(delta: dict) -> str:
    w = int(delta.get("windowDays", 30))
    this_total = _fmt_currency(delta.get("this", {}).get("total", 0))
    prior_total = _fmt_currency(delta.get("prior", {}).get("total", 0))
    diff = float(delta.get("deltaTotal", 0) or 0)
    sign = "▲" if diff > 0 else ("▼" if diff < 0 else "•")
    diff_txt = _fmt_currency(abs(diff))
    lines = [
        f"**Spending change (last {w} days vs prior {w})**",
        "",
        f"- This window: **{this_total}**",
        f"- Prior window: **{prior_total}**",
        f"- Net change: **{sign} {diff_txt}**",
    ]
    movers = delta.get("topCategoryIncreases", [])
    if movers:
        lines.append("")
        lines.append("**Top category increases**")
        for r in movers[:5]:
            lines.append(f"- **{r['name']}**: +{_fmt_currency(r['increase'])} (now { _fmt_currency(r['current']) })")
    merchants = delta.get("topMerchantIncreases", [])
    if merchants:
        lines.append("")
        lines.append("**Merchants driving the increase**")
        for r in merchants[:5]:
            lines.append(f"- **{r['name']}**: +{_fmt_currency(r['change'])}")
    lines.append("")
    lines.append("_Want to dig into a specific category or merchant?_")
    return "\n".join(lines)
def _category_dive_to_markdown(cat_data: dict) -> str:
    cat = cat_data.get("category", "This category")
    w = int(cat_data.get("windowDays", 30))
    this_total = _fmt_currency(cat_data.get("thisTotal", 0))
    prior_total = _fmt_currency(cat_data.get("priorTotal", 0))
    d = float(cat_data.get("delta", 0) or 0)
    sign = "▲" if d > 0 else ("▼" if d < 0 else "•")
    diff_txt = _fmt_currency(abs(d))

    lines = [
        f"**{cat} — last {w} vs prior {w}**",
        "",
        f"- This window: **{this_total}**",
        f"- Prior window: **{prior_total}**",
        f"- Net change: **{sign} {diff_txt}**",
    ]

    merchants = cat_data.get("topMerchants", [])
    if merchants:
        lines.append("")
        lines.append("**Top merchants**")
        for m in merchants:
            lines.append(f"- **{m['name']}**: { _fmt_currency(m['amount']) } ({m['count']}×)")

    lines.append("")
    lines.append("_Ask: ‘show recent transactions in this category’ or ‘best card for this category.’_")
    return "\n".join(lines)

def _budget_markdown(monthly_total: float, mix_rows: list[dict]) -> str:
    # take your normalized mix rows (key/amount/pct) and allocate
    if monthly_total <= 0 or not mix_rows:
        return "I couldn't detect recent spend to base a budget on. Try again after a few transactions."
    # build list of tuples (name, pct)
    # mix_rows can be from aggregate_spend_details(categories) or compute_user_mix -> we expect keys "key" & "pct"
    pairs = []
    for r in mix_rows:
        name = r.get("key") or r.get("name") or "Other"
        pct = float(r.get("pct", 0) or 0)
        if pct > 0:
            pairs.append((str(name), pct))
    # normalize in case they don't sum to 1
    total_pct = sum(p for _, p in pairs) or 1.0
    alloc = []
    for name, pct in pairs:
        amt = round(monthly_total * (pct / total_pct))
        alloc.append((name, amt))
    # limit to 6 lines + other
    alloc.sort(key=lambda x: x[1], reverse=True)
    top = alloc[:6]
    residue = max(0, round(monthly_total - sum(a for _, a in top)))
    md = [f"Based on your last **30** days, your estimated monthly spend is **{_fmt_currency(monthly_total)}**.",
          "",
          "Here’s a simple starting budget split by your actual spending mix:"]
    for name, amt in top:
        md.append(f"* **{name}**: ~{_fmt_currency(amt)}")
    if residue > 0:
        md.append(f"* **Other**: ~{_fmt_currency(residue)}")
    md.append("")
    md.append("_We can tweak any category — tell me which to raise or lower._")
    return "\n".join(md)
def month_bounds(month_str: Optional[str]) -> Tuple[datetime, datetime, str]:
    """
    month_str 'YYYY-MM' -> (start, end, normalized_str)
    """
    now = datetime.utcnow()
    if not month_str:
        year, month = now.year, now.month
    else:
        try:
            year, month = map(int, month_str.split("-", 1))
        except Exception:
            raise BadRequest("month must be 'YYYY-MM'")
    start = datetime(year, month, 1)
    # first day of next month
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)
    return start, end, f"{year:04d}-{month:02d}"

def _demo_random_last4(db, user_id) -> str:
    """Pick a 4-digit string not already used by this user's credit cards."""
    taken = {
        a.get("account_mask")
        for a in db["accounts"].find({"userId": user_id, "account_type": "credit_card"}, {"account_mask": 1})
        if isinstance(a.get("account_mask"), str) and a.get("account_mask")
    }
    # try a few times; worst case allow a dupe
    for _ in range(100):
        s = f"{random.randint(0, 9999):04d}"
        if s not in taken:
            return s
    return f"{random.randint(0, 9999):04d}"


def calc_month_spend(db, user_id: ObjectId, start: datetime, end: datetime) -> float:
    """
    Sum positive amounts for the month.
    """
    rows = db["transactions"].find(
        {"userId": user_id, "date": {"$gte": start, "$lt": end}},
        {"amount": 1},
    )
    total = 0.0
    for r in rows:
        try:
            amt = float(r.get("amount", 0) or 0)
        except Exception:
            amt = 0.0
        if amt > 0:
            total += amt
    return round(total, 2)


def check_and_notify_budget(db, user, month_str: str) -> Dict[str, any]:
    start, end, mkey = month_bounds(month_str)
    budget_doc = db["budgets"].find_one({"userId": user["_id"], "month": mkey})
    budget = float(budget_doc.get("amount", 0) if budget_doc else 0)
    spend = calc_month_spend(db, user["_id"], start, end)
    over = budget > 0 and spend > budget

    if over and budget_doc and not budget_doc.get("notified"):
        subj = f"Budget alert for {mkey}"
        body = (
            f"Hi {user.get('name') or 'there'},\n\n"
            f"Your spending this month has exceeded your budget.\n\n"
            f"Budget: ${budget:,.2f}\n"
            f"Spend:  ${spend:,.2f}\n\n"
            f"— SwipeCoach"
        )
        send_email_smtp(user.get("email") or "", subj, body)
        db["budgets"].update_one(
            {"_id": budget_doc["_id"]},
            {"$set": {"notified": True, "updated_at": datetime.utcnow()}},
        )

    pct = (spend / budget) if budget > 0 else 0.0
    return {
        "month": mkey,
        "budget": round(budget, 2),
        "spend": spend,
        "remaining": round(max(0.0, budget - spend), 2) if budget > 0 else None,
        "percent": round(pct, 4),
        "over": over,
        "notified": bool(budget_doc.get("notified")) if budget_doc else False,
    }

def get_auth_settings() -> Dict[str, str]:
    domain = os.environ.get("AUTH0_DOMAIN")
    audience = os.environ.get("AUTH0_AUDIENCE")
    if not domain or not audience:
        raise RuntimeError("AUTH0_DOMAIN and AUTH0_AUDIENCE must be set")
    issuer = f"https://{domain}/"
    return {
        "domain": domain,
        "audience": audience,
        "issuer": issuer,
        "jwks_url": f"{issuer}.well-known/jwks.json",
    }


def get_mongo_client() -> MongoClient:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI must be set")
    return MongoClient(uri, tlsAllowInvalidCertificates=False)


def get_database(client: MongoClient):
    db_name = os.environ.get("MONGODB_DB")
    if db_name:
        return client[db_name]
    database = client.get_default_database()
    if database is None:
        raise RuntimeError("Database name must be provided via connection string or MONGODB_DB")
    return database


def fetch_jwks(jwks_url: str) -> Dict[str, Any]:
    response = requests.get(jwks_url, timeout=5)
    response.raise_for_status()
    return response.json()


def get_jwks(jwks_url: str) -> Dict[str, Any]:
    if not JWKS_CACHE["keys"]:
        JWKS_CACHE.update(fetch_jwks(jwks_url))
    return JWKS_CACHE


def get_rsa_key(token: str, jwks: Dict[str, Any]) -> Dict[str, Any]:
    unverified_header = jwt.get_unverified_header(token)
    for key in jwks.get("keys", []):
        if key.get("kid") == unverified_header.get("kid"):
            return {
                "kty": key.get("kty"),
                "kid": key.get("kid"),
                "use": key.get("use"),
                "n": key.get("n"),
                "e": key.get("e"),
            }
    raise Unauthorized("Unable to find appropriate key")


def decode_token(settings: Dict[str, str]) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise Unauthorized("Authorization header must start with Bearer")
    token = auth_header.split()[1]
    jwks = get_jwks(settings["jwks_url"])
    rsa_key = get_rsa_key(token, jwks)
    try:
        return jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=settings["audience"],
            issuer=settings["issuer"],
        )
    except JWTError as exc:  # pragma: no cover - runtime validation
        raise Unauthorized(f"Token verification failed: {exc}")


def ensure_collections(database) -> None:
    existing = set(database.list_collection_names())
    if "applications" not in existing:
        try:
            database.create_collection("applications")
        except CollectionInvalid:
            pass
    if "mandates" not in existing:
        try:
            database.create_collection("mandates")
        except CollectionInvalid:
            pass
    if "cashback_scenarios" not in existing:
        try:
            database.create_collection("cashback_scenarios")
        except CollectionInvalid:
            pass

    scenarios = database["cashback_scenarios"]
    for scenario in DEFAULT_CASHBACK_SCENARIOS:
        scenarios.update_one(
            {"_id": scenario["_id"]},
            {
                "$set": {
                    "label": scenario["label"],
                    "description": scenario.get("description"),
                    "category": scenario["category"],
                    "amount": float(scenario.get("amount", 0.0) or 0.0),
                }
            },
            upsert=True,
        )


# -------------------------
# User helpers
# -------------------------
def _deep_merge_whitelist(existing: Dict[str, Any], updates: Dict[str, Any], allowed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deep-merge `updates` into `existing`, but only for keys present in `allowed`.
    `allowed` is the shape (DEFAULT_PREFERENCES at the root; nested dicts at deeper levels).
    """
    merged = dict(existing) if isinstance(existing, dict) else {}
    for key, value in (updates or {}).items():
        # alias singular -> plural
        key_norm = "budgets" if key == "budget" else key

        if key_norm not in allowed:
            continue

        allowed_sub = allowed[key_norm]
        if isinstance(value, dict) and isinstance(allowed_sub, dict):
            base = existing.get(key_norm, allowed_sub) if isinstance(existing, dict) else allowed_sub
            merged[key_norm] = _deep_merge_whitelist(base, value, allowed_sub)
        else:
            merged[key_norm] = value
    return merged

def merge_preferences(existing: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    # existing behavior but using the deep, shape-aware function
    return _deep_merge_whitelist(existing or DEFAULT_PREFERENCES, updates or {}, DEFAULT_PREFERENCES)


def get_or_create_user(users: Collection, payload: Dict[str, Any]) -> Dict[str, Any]:
    auth0_id = payload.get("sub")
    if not auth0_id:
        raise Unauthorized("Token missing subject")

    email = payload.get("email")
    name = payload.get("name") or (
        email.split("@")[0] if isinstance(email, str) and "@" in email else None
    )
    email_verified = bool(payload.get("email_verified"))

    user_doc: Optional[Dict[str, Any]] = users.find_one({"auth0_id": auth0_id})
    if user_doc is None:
        new_user = {
            "auth0_id": auth0_id,
            "email": email,
            "name": name,
            "preferences": DEFAULT_PREFERENCES,
            "email_verified": email_verified,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        try:
            result = users.insert_one(new_user)
        except DuplicateKeyError:
            user_doc = users.find_one({"auth0_id": auth0_id})
        else:
            new_user["_id"] = result.inserted_id
            user_doc = new_user
    else:
        updates: Dict[str, Any] = {}

        if email and user_doc.get("email") != email:
            updates["email"] = email

        # ✅ Only set name from token if the user has no name yet.
        #    Do NOT overwrite a user-changed name.
        token_name = payload.get("name") or (email.split("@")[0] if isinstance(email, str) and "@" in email else None)
        if not user_doc.get("name") and token_name:
            updates["name"] = token_name

        if user_doc.get("email_verified") != email_verified:
            updates["email_verified"] = email_verified

        if updates:
            updates["updated_at"] = datetime.utcnow()
            users.update_one({"_id": user_doc["_id"]}, {"$set": updates})
            user_doc.update(updates)

        # also keep the fallback to set DEFAULT_PREFERENCES if missing
        if "preferences" not in user_doc:
            users.update_one({"_id": user_doc["_id"]}, {"$set": {"preferences": DEFAULT_PREFERENCES}})
            user_doc["preferences"] = DEFAULT_PREFERENCES

    if user_doc is None:
        raise Unauthorized("Unable to load profile")
    return user_doc


# -------------------------
# Spend + LLM helpers
# -------------------------


def build_llm_context(database, user_id: ObjectId, window_days: int = 90, card_object_ids=None) -> Dict[str, Any]:
    """
    Produce a small JSON packet Gemini can use.
    Keep it < ~2–3 KB. No PII beyond first name if you want.
    """
    txns = load_transactions(database, user_id, window_days, card_object_ids)
    breakdown = aggregate_spend_details(txns)

    # top categories and merchants
    top_cats = breakdown["categories"][:6]
    top_merchants = breakdown["merchants"][:10]

    # simple recurring guess: same merchant seen >= 3 times
    rec = [m for m in top_merchants if m["count"] >= 3]

    # estimate monthly spend from window
    monthly_est = 0.0
    if window_days > 0 and breakdown["total"] > 0:
        monthly_est = round((breakdown["total"] / window_days) * 30, 2)

    # owned cards (lightweight)
    owned = list(database["accounts"].find(
        {"userId": user_id, "account_type": "credit_card"},
        {"_id": 1, "issuer": 1, "network": 1, "nickname": 1, "card_product_slug": 1}
    ))
    owned_cards = [{
        "accountId": str(c["_id"]),
        "issuer": c.get("issuer"),
        "network": c.get("network"),
        "nickname": c.get("nickname"),
        "product_slug": c.get("card_product_slug"),
    } for c in owned]

    return {
        "window_days": window_days,
        "total_spend_window": breakdown["total"],
        "monthly_spend_estimate": monthly_est,
        "top_categories": [
            {"name": c["key"], "total": c["amount"], "pct": round(c["pct"], 4), "count": c["count"]}
            for c in top_cats
        ],
        "top_merchants": [
            {"name": m["name"], "category": m["category"], "total": m["amount"], "count": m["count"]}
            for m in top_merchants
        ],
        "recurring_merchants": [{"name": m["name"], "count": m["count"]} for m in rec],
        "owned_cards": owned_cards,
    }



def parse_window_days(default: int = 30) -> int:
    raw = request.args.get("window", default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise BadRequest("window must be an integer")
    if value <= 0:
        raise BadRequest("window must be positive")
    return value


def validate_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:  # pragma: no cover - defensive
        raise NotFound("Resource not found") from exc


def format_card_row(doc: Dict[str, Any]) -> Dict[str, Any]:
    expires = None
    if doc.get("expiry_year") and doc.get("expiry_month"):
        expires = f"{int(doc['expiry_year']):04d}-{int(doc['expiry_month']):02d}"
    last_sync = doc.get("last_sync")
    applied_at = doc.get("applied_at")
    if isinstance(applied_at, datetime):
        applied_at_value: Optional[str] = applied_at.isoformat().replace("+00:00", "Z")
    else:
        applied_at_value = str(applied_at) if applied_at else None

    card_product_id = doc.get("card_product_id")
    if isinstance(card_product_id, ObjectId):
        card_product_id_value: Optional[str] = str(card_product_id)
    elif isinstance(card_product_id, str) and card_product_id:
        card_product_id_value = card_product_id
    else:
        card_product_id_value = None

    card_product_slug = (
            doc.get("card_product_slug") or doc.get("product_slug") or doc.get("card_slug")
    )
    if isinstance(card_product_slug, str) and card_product_slug.strip():
        card_product_slug_value: Optional[str] = card_product_slug.strip()
    else:
        card_product_slug_value = None

    return {
        "id": str(doc["_id"]),
        "nickname": doc.get("nickname") or doc.get("issuer") or "Card",
        "issuer": doc.get("issuer", ""),
        "network": doc.get("network"),
        "mask": doc.get("account_mask", ""),
        "type": doc.get("account_type", "credit_card"),
        "expires": expires,
        "status": doc.get("status", "Active"),
        "lastSynced": last_sync.isoformat().replace("+00:00", "Z") if isinstance(last_sync, datetime) else None,
        "appliedAt": applied_at_value,
        "cardProductId": card_product_id_value,
        "cardProductSlug": card_product_slug_value,
    }


def format_mandate(doc: Dict[str, Any]) -> Dict[str, Any]:
    created_at = doc.get("created_at")
    updated_at = doc.get("updated_at")
    return {
        "id": str(doc["_id"]),
        "type": doc.get("type", ""),
        "status": doc.get("status", "pending_approval"),
        "data": doc.get("data", {}),
        "created_at": created_at.isoformat().replace("+00:00", "Z") if isinstance(created_at, datetime) else None,
        "updated_at": updated_at.isoformat().replace("+00:00", "Z") if isinstance(updated_at, datetime) else None,
    }


def calculate_summary(transactions: Iterable[Dict[str, Any]]) -> Tuple[float, int, Dict[str, float]]:
    total = 0.0
    count = 0
    by_category: Dict[str, float] = {}
    for txn in transactions:
        amount = float(txn.get("amount", 0))
        category = txn.get("category") or "Uncategorized"
        total += amount
        count += 1
        by_category[category] = by_category.get(category, 0.0) + amount
    return total, count, by_category


def calculate_money_moments(window_days: int, txns: Iterable[Dict[str, Any]]) -> Iterable[Dict[str, Any]]:
    txns_list = list(txns)
    if not txns_list:
        return []

    total, count, by_category = calculate_summary(txns_list)
    moments: List[Dict[str, Any]] = []
    top_category = max(by_category.items(), key=lambda item: item[1]) if by_category else None
    if top_category and total > 0:
        share = (top_category[1] / total) if total else 0
        if share >= 0.55:
            moments.append(
                {
                    "id": "moment-focus",
                    "title": "Spotlight on your spending",
                    "body": f"About {share:.0%} of your recent spending went to {top_category[0]}. A small budget tweak could help balance things out.",
                    "type": "alert",
                }
            )
        else:
            moments.append(
                {
                    "id": "moment-balance",
                    "title": "Nice balance",
                    "body": f"No single category dominated—{top_category[0]} was your largest area, but spending stayed well distributed.",
                    "type": "win",
                }
            )

    avg_daily = total / window_days
    if avg_daily > 0:
        moments.append(
            {
                "id": "moment-daily",
                "title": "Daily pace",
                "body": f"You're averaging ${avg_daily:,.2f} per day over the last {window_days} days.",
                "type": "tip",
            }
        )

    repeat_merchants: Dict[str, int] = {}
    for txn in txns_list:
        merchant = (
                txn.get("merchant_id")
                or txn.get("description_clean")
                or txn.get("description")
                or "Merchant"
        )
        repeat_merchants[merchant] = repeat_merchants.get(merchant, 0) + 1
    top_merchant = max(repeat_merchants.items(), key=lambda item: item[1]) if repeat_merchants else None
    if top_merchant and top_merchant[1] >= 3:
        moments.append(
            {
                "id": "moment-merchant",
                "title": "Frequent stop spotted",
                "body": f"You visited {top_merchant[0]} {top_merchant[1]} times recently. If it's a favorite, consider setting a spending goal for it.",
                "type": "tip",
            }
        )

    return moments[:3]


# -------------------------
# App factory
# -------------------------

def create_app() -> Flask:
    load_environment()
    app = Flask(__name__)

    # Local dev switch (set DISABLE_AUTH=1 in .env)
    disable_auth = os.environ.get("DISABLE_AUTH", "0").lower() in ("1", "true")
    app_settings = None if disable_auth else get_auth_settings()

    allowed_origin = os.environ.get("CLIENT_ORIGIN", "http://localhost:5173").rstrip("/")
    CORS(
        app,
        resources={r"/api/*": {"origins": [allowed_origin, "http://127.0.0.1:5173"]}},
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Type"],
    )

    mongo_client = get_mongo_client()
    database = get_database(mongo_client)
    init_db(database)
    ensure_indexes(database)
    ensure_collections(database)

    app.config.update(
        AUTH_SETTINGS=app_settings,
        MONGO_CLIENT=mongo_client,
        MONGO_DB=database,
        DISABLE_AUTH=disable_auth,
    )

    def _set_current_user():
        """Populate g.current_user for ALL routes (blueprint or not)."""
    # Always let CORS preflight through
        if request.method == "OPTIONS":
            return ("", 204)

        # If already set (by another hook), do nothing
        if getattr(g, "current_user", None) is not None:
            return

        if app.config.get("DISABLE_AUTH", False):
            # Local dev user
            payload = {
                "sub": "dev|local",
                "email": "dev@local",
                "email_verified": True,
                "name": "Dev User",
            }
        else:
            payload = decode_token(app.config["AUTH_SETTINGS"])

        g.current_token = payload
        g.current_user = get_or_create_user(database["users"], payload)

        # NEW: make db + user_id available to ALL blueprints/endpoints
        g.db = database
        g.user_id = g.current_user["_id"]

    # Register the hook for all routes
    app.before_request(_set_current_user)


# ---------- Normalizers & maps ----------
    def normalize_transactions(doc: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(doc)
        if "userId" not in out:
            uid = out.get("user_id")
            out["userId"] = ObjectId(uid) if isinstance(uid, str) else uid
        if "amount" not in out:
            cents = out.get("amount_cents")
            out["amount"] = round(float(cents or 0) / 100.0, 2)
        if "date" not in out:
            date_val = out.get("posted_at") or out.get("authorized_at")
            out["date"] = date_val
        return out

    MCC_TO_CATEGORY = {
        "5411": "Groceries",
        "5499": "Groceries",
        "5812": "Food and Drink",
        "5814": "Food and Drink",
    }
    CATEGORY_ALIAS = {
        "dining": "Food and Drink",
        "restaurant": "Food and Drink",
        "restaurants": "Food and Drink",
        "grocery": "Groceries",
        "groceries": "Groceries",
        "travel": "Travel",
        "pharmacy": "Drugstores",
        "drugstore": "Drugstores",
        "entertainment": "Entertainment",
        "streaming": "Streaming",
        "transit": "Transportation",
    }

    def normalize_merchant_category(doc: Dict[str, Any]) -> str:
        ov = (doc.get("overrides") or {})
        if isinstance(ov, dict) and ov.get("treatAs"):
            raw = str(ov["treatAs"]).strip().lower()
            return CATEGORY_ALIAS.get(raw, doc["overrides"]["treatAs"])  # return original label if no alias
        if doc.get("primaryCategory"):
            raw = str(doc["primaryCategory"]).strip().lower()
            return CATEGORY_ALIAS.get(raw, doc["primaryCategory"])
        mcc = str(doc.get("mcc") or "")
        if mcc in MCC_TO_CATEGORY:
            return MCC_TO_CATEGORY[mcc]
        return "Other"

    def earn_percent_for_product(product: Dict[str, Any], category: str, monthly_spend: float) -> float:
        base = float(product.get("base_cashback", 0.0) or 0.0)
        rules = product.get("rewards") or []
        rule = next((r for r in rules if r.get("category") == category), None)
        if not rule:
            return base
        rate = float(rule.get("rate", base) or base)  # e.g. 0.04
        cap = rule.get("cap_monthly")
        if not cap:
            return rate
        try:
            cap_val = float(cap)
        except Exception:
            return rate
        spend = float(monthly_spend or 0)
        if spend <= 0:
            return rate
        if spend <= cap_val:
            return rate
        return (cap_val * rate + (spend - cap_val) * base) / spend

    # ---------- Blueprint ----------
    api_bp = Blueprint("api", __name__, url_prefix="/api")

    def parse_card_ids_query() -> Optional[List[ObjectId]]:
        card_ids = request.args.getlist("cardIds")
        if not card_ids:
            return None
        object_ids: List[ObjectId] = []
        for card_id in card_ids:
            try:
                object_ids.append(validate_object_id(card_id))
            except Exception:
                continue
        return object_ids or None

    def format_catalog_product(doc: Dict[str, Any]) -> Dict[str, Any]:
        rewards = [
            {
                "category": reward.get("category"),
                "rate": float(reward.get("rate", 0.0) or 0.0),
                "cap_monthly": float(reward["cap_monthly"]) if reward.get("cap_monthly") is not None else None,
            }
            for reward in doc.get("rewards", [])
            if reward.get("category")
        ]
        welcome_offer = doc.get("welcome_offer") or {}
        formatted_welcome = None
        if welcome_offer:
            formatted_welcome = {}
            if welcome_offer.get("bonus_value_usd") is not None:
                formatted_welcome["bonus_value_usd"] = float(welcome_offer.get("bonus_value_usd", 0.0) or 0.0)
            if welcome_offer.get("min_spend") is not None:
                formatted_welcome["min_spend"] = float(welcome_offer.get("min_spend", 0.0) or 0.0)
            if welcome_offer.get("window_days") is not None:
                formatted_welcome["window_days"] = int(welcome_offer.get("window_days") or 0)
            if not formatted_welcome:
                formatted_welcome = None
        last_updated = doc.get("last_updated")
        if isinstance(last_updated, datetime):
            last_updated_value = last_updated.isoformat().replace("+00:00", "Z")
        else:
            last_updated_value = last_updated
        return {
            "id": str(doc.get("_id")) if doc.get("_id") else None,
            "slug": doc.get("slug"),
            "product_name": doc.get("product_name"),
            "issuer": doc.get("issuer"),
            "network": doc.get("network"),
            "annual_fee": float(doc.get("annual_fee", 0.0) or 0.0),
            "base_cashback": float(doc.get("base_cashback", 0.0) or 0.0),
            "rewards": rewards,
            "welcome_offer": formatted_welcome,
            "foreign_tx_fee": float(doc.get("foreign_tx_fee", 0.0) or 0.0),
            "link_url": doc.get("link_url"),
            "active": bool(doc.get("active", True)),
            "last_updated": last_updated_value,
        }

    def prepare_catalog_payload(data: Dict[str, Any]) -> Dict[str, Any]:
        required_fields = ["slug", "product_name", "issuer"]
        for field in required_fields:
            value = data.get(field)
            if not isinstance(value, str) or not value.strip():
                raise BadRequest(f"{field} is required")
        link_url = data.get("link_url")
        if isinstance(link_url, str):
            link_url = link_url.strip() or None
        elif link_url is not None:
            link_url = str(link_url)
        payload: Dict[str, Any] = {
            "slug": data["slug"].strip(),
            "product_name": data["product_name"].strip(),
            "issuer": data["issuer"].strip(),
            "network": (data.get("network") or "").strip() or None,
            "annual_fee": float(data.get("annual_fee", 0.0) or 0.0),
            "base_cashback": float(data.get("base_cashback", 0.0) or 0.0),
            "foreign_tx_fee": float(data.get("foreign_tx_fee", 0.0) or 0.0),
            "link_url": link_url,
            "active": bool(data.get("active", True)),
        }
        rewards_payload: List[Dict[str, Any]] = []
        for reward in data.get("rewards", []) or []:
            category = reward.get("category")
            rate = reward.get("rate")
            if not category or rate is None:
                continue
            reward_entry: Dict[str, Any] = {"category": str(category), "rate": float(rate)}
            if reward.get("cap_monthly") is not None:
                try:
                    reward_entry["cap_monthly"] = float(reward["cap_monthly"])
                except (TypeError, ValueError):
                    pass
            rewards_payload.append(reward_entry)
        payload["rewards"] = rewards_payload
        welcome = data.get("welcome_offer") or {}
        welcome_payload: Dict[str, Any] = {}
        if welcome.get("bonus_value_usd") is not None:
            try:
                welcome_payload["bonus_value_usd"] = float(welcome["bonus_value_usd"])
            except (TypeError, ValueError):
                pass
        if welcome.get("min_spend") is not None:
            try:
                welcome_payload["min_spend"] = float(welcome["min_spend"])
            except (TypeError, ValueError):
                pass
        if welcome.get("window_days") is not None:
            try:
                welcome_payload["window_days"] = int(welcome["window_days"])
            except (TypeError, ValueError):
                pass
        if welcome_payload:
            payload["welcome_offer"] = welcome_payload
        return payload

    @api_bp.before_request
    def authenticate_request():
        # Let CORS preflight through
        if request.method == "OPTIONS":
            return ("", 204)

        # If app-level hook already set the user, do nothing
        if getattr(g, "current_user", None) is not None:
            return

        # In dev, you can just rely on the app-level hook; do nothing here
        if app.config.get("DISABLE_AUTH", False):
            return

        # Otherwise, enforce real auth (keep your JWKS/userinfo logic as needed)
        settings = app.config["AUTH_SETTINGS"]
        claims = decode_token(settings)

        # (Optional) Best-effort /userinfo fetch here if you want the email:
        try:
            if not claims.get("email"):
                auth_header = request.headers.get("Authorization", "")
                token = auth_header.split()[1] if auth_header.lower().startswith("bearer ") else None
                if token:
                    ui = requests.get(f"https://{settings['domain']}/userinfo",
                                      headers={"Authorization": f"Bearer {token}"}, timeout=5)
                    if ui.ok:
                        profile = ui.json()
                        claims.setdefault("email", profile.get("email"))
                        claims.setdefault("email_verified", profile.get("email_verified"))
                        if profile.get("name") and not claims.get("name"):
                            claims["name"] = profile["name"]
        except Exception:
            pass

        g.current_token = claims
        g.current_user = get_or_create_user(app.config["MONGO_DB"]["users"], claims)
        g.db = app.config["MONGO_DB"]
        g.user_id = g.current_user["_id"]



    # -------- me / status --------
    @api_bp.get("/me")
    def get_me():
        user = g.current_user
        return jsonify(
            {
                "userId": str(user["_id"]),
                "email": user.get("email"),
                "name": user.get("name"),
                "preferences": user.get("preferences", DEFAULT_PREFERENCES),
            }
        )

    @api_bp.patch("/me")
    def update_me():
        user = g.current_user
        payload = request.get_json(silent=True) or {}
        updates: Dict[str, Any] = {}
        if "name" in payload:
            if payload["name"] is not None and not isinstance(payload["name"], str):
                raise BadRequest("name must be a string")
            updates["name"] = payload["name"]
        if "preferences" in payload:
            if not isinstance(payload["preferences"], dict):
                raise BadRequest("preferences must be an object")
            merged = merge_preferences(user.get("preferences", DEFAULT_PREFERENCES), payload["preferences"])
            updates["preferences"] = merged
        if not updates:
            return jsonify(
                {
                    "userId": str(user["_id"]),
                    "email": user.get("email"),
                    "name": user.get("name"),
                    "preferences": user.get("preferences", DEFAULT_PREFERENCES),
                }
            )
        updates["updated_at"] = datetime.utcnow()
        database["users"].update_one({"_id": user["_id"]}, {"$set": updates})
        user.update(updates)
        return jsonify(
            {
                "userId": str(user["_id"]),
                "email": user.get("email"),
                "name": user.get("name"),
                "preferences": user.get("preferences", DEFAULT_PREFERENCES),
            }
        )

    @api_bp.get("/status")
    def get_status():
        user = g.current_user
        accounts = database["accounts"]
        has_account = accounts.count_documents({"userId": user["_id"], "account_type": "credit_card"}) > 0
        return jsonify({"hasAccount": has_account})

    @api_bp.post("/auth/resend-verification")
    def resend_verification():
        return ("", 204)

    # -------- spend summary / details --------
    @api_bp.get("/spend/summary")
    def spend_summary():
        user = g.current_user
        window_days = parse_window_days(30)
        card_object_ids = parse_card_ids_query()

        debug_log = app.debug or os.environ.get("LOG_SUMMARY_DEBUG", "").lower() in ("1", "true")
        if debug_log:
            print("\n--- DEBUG: /api/spend/summary endpoint hit ---")
            print(f"--- DEBUG: Querying for userId: {user['_id']}")
            if card_object_ids:
                print(f"--- DEBUG: Filtering for cardIds: {[str(oid) for oid in card_object_ids]}")
            else:
                print("--- DEBUG: No card filter applied (all user cards).")

        transactions = load_transactions(database, user["_id"], window_days, card_object_ids)
        if debug_log:
            print(f"--- DEBUG: Found {len(transactions)} transactions matching the criteria.")

        summary = aggregate_spend_details(transactions)
        accounts_count = database["accounts"].count_documents(
            {"userId": user["_id"], "account_type": "credit_card"}
        )
        categories = [{"name": row["key"], "total": row["amount"]} for row in summary["categories"]]
        response_data = {
            "stats": {
                "totalSpend": summary["total"],
                "txns": summary["transaction_count"],
                "accounts": accounts_count,
            },
            "byCategory": categories,
        }
        if debug_log:
            print(f"--- DEBUG: Sending response data to homepage: {response_data}\n")
        return jsonify(response_data)

    @api_bp.get("/spend/details")
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
                        "name": m["name"],
                        "category": m["category"],
                        "amount": m["amount"],
                        "count": m["count"],
                        "logoUrl": m.get("logoUrl", ""),
                    }
                    for m in breakdown["merchants"]
                ],
            }
        )

    @api_bp.get("/transactions")
    def list_transactions():
        user = g.current_user
        window_days = parse_window_days(30)
        card_object_ids = parse_card_ids_query()
        transactions = load_transactions(database, user["_id"], window_days, card_object_ids)

        account_ids: Set[ObjectId] = set()
        for txn in transactions:
            account_id = txn.get("accountId")
            if isinstance(account_id, ObjectId):
                account_ids.add(account_id)
            elif isinstance(account_id, str):
                try:
                    account_ids.add(ObjectId(account_id))
                except Exception:
                    continue

        account_lookup: Dict[str, Dict[str, Any]] = {}
        if account_ids:
            for account in database["accounts"].find({"_id": {"$in": list(account_ids)}}):
                account_lookup[str(account["_id"])] = account

        total_spend = 0.0
        rows: List[Dict[str, Any]] = []
        for txn in transactions:
            amount = float(txn.get("amount", 0) or 0)
            total_spend += max(amount, 0.0)

            when = txn.get("date")
            if isinstance(when, datetime):
                posted_at = when.isoformat().replace("+00:00", "Z")
            else:
                posted_at = str(when) if when else None

            merchant_name = (
                txn.get("merchant_name_norm")
                or txn.get("merchant_name")
                or txn.get("merchant_id")
                or txn.get("description_clean")
                or txn.get("description")
                or "Merchant"
            )

            account_id = txn.get("accountId")
            account_key = None
            if isinstance(account_id, ObjectId):
                account_key = str(account_id)
            elif isinstance(account_id, str):
                account_key = account_id

            account_doc = account_lookup.get(account_key) if account_key else None
            account_name = None
            if account_doc:
                account_name = (
                    account_doc.get("nickname")
                    or account_doc.get("issuer")
                    or account_doc.get("account_mask")
                )

            rows.append(
                {
                    "id": str(txn.get("_id")),
                    "date": posted_at,
                    "merchantName": merchant_name,
                    "merchantId": str(txn.get("merchant_id")) if txn.get("merchant_id") else None,
                    "description": txn.get("description")
                    or txn.get("description_clean")
                    or merchant_name,
                    "category": txn.get("category")
                    or txn.get("category_l1")
                    or txn.get("category_l2")
                    or "Uncategorized",
                    "amount": round(amount, 2),
                    "accountId": account_key,
                    "accountName": account_name,
                    "status": txn.get("status"),
                    "logoUrl": txn.get("logoUrl") or txn.get("merchant_logo"),
                }
            )

        return jsonify(
            {
                "windowDays": window_days,
                "total": round(total_spend, 2),
                "transactionCount": len(rows),
                "transactions": rows,
            }
        )

    @api_bp.get("/merchants")
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

    @api_bp.get("/money-moments")
    def money_moments():
        user = g.current_user
        window_days = parse_window_days(30)
        card_object_ids = parse_card_ids_query()
        txns = load_transactions(database, user["_id"], window_days, card_object_ids)
        moments = list(calculate_money_moments(window_days, txns))
        return jsonify(moments)

    # -------- catalog --------
    @api_bp.get("/cards/catalog")
    def list_catalog_cards():
        active_param = request.args.get("active")
        query: Dict[str, Any] = {}
        if active_param is not None:
            active_value = str(active_param).lower() in ("1", "true", "yes")
            query["active"] = active_value
        cards_cursor = database["credit_cards"].find(query).sort("product_name", ASCENDING)
        return jsonify([format_catalog_product(card) for card in cards_cursor])

    @api_bp.post("/cards/catalog")
    def create_catalog_cards():
        payload = request.get_json(force=True)
        collection = database["credit_cards"]
        now = datetime.utcnow()
        if isinstance(payload, list):
            documents = [prepare_catalog_payload(item) for item in payload if isinstance(item, dict)]
            if not documents:
                raise BadRequest("payload must contain at least one catalog entry")
            for document in documents:
                document.setdefault("active", True)
                document["last_updated"] = now
            try:
                result = collection.insert_many(documents)
            except DuplicateKeyError as exc:
                raise BadRequest("duplicate catalog slug") from exc
            inserted = list(collection.find({"_id": {"$in": result.inserted_ids}}))
            return jsonify([format_catalog_product(doc) for doc in inserted]), 201
        if not isinstance(payload, dict):
            raise BadRequest("Invalid payload")
        document = prepare_catalog_payload(payload)
        document.setdefault("active", True)
        document["last_updated"] = now
        try:
            result = collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise BadRequest("duplicate catalog slug") from exc
        created = collection.find_one({"_id": result.inserted_id})
        if created is None:
            raise BadRequest("Unable to create catalog entry")
        return jsonify(format_catalog_product(created)), 201

    # -------- recommendations (bulk) --------
    @api_bp.post("/recommendations")
    def recommendations():
        user = g.current_user
        payload = request.get_json(silent=True) or {}
        try:
            window_days = int(payload.get("window") or 90)
        except (TypeError, ValueError):
            raise BadRequest("window must be an integer")
        if window_days <= 0:
            raise BadRequest("window must be positive")
        try:
            limit = int(payload.get("limit", 5))
        except (TypeError, ValueError):
            raise BadRequest("limit must be an integer")
        include_explain = bool(payload.get("include_explain", True))

        monthly_spend_value = None
        if payload.get("monthly_spend") is not None:
            try:
                monthly_spend_value = float(payload.get("monthly_spend"))
            except (TypeError, ValueError):
                raise BadRequest("monthly_spend must be a number")

        raw_card_ids = payload.get("card_ids") or payload.get("cardIds") or []
        card_object_ids: Optional[List[ObjectId]] = None
        if isinstance(raw_card_ids, list):
            parsed_ids: List[ObjectId] = []
            for value in raw_card_ids:
                try:
                    parsed_ids.append(validate_object_id(value))
                except Exception:
                    continue
            if parsed_ids:
                card_object_ids = parsed_ids

        transactions = load_transactions(database, user["_id"], window_days, card_object_ids)
        breakdown = aggregate_spend_details(transactions)
        total_window_spend = breakdown["total"]

        raw_mix = payload.get("category_mix")
        normalized_mix: Dict[str, float] = {}
        if isinstance(raw_mix, dict):
            sanitized: Dict[str, float] = {}
            for key, value in raw_mix.items():
                try:
                    numeric = float(value)
                except (TypeError, ValueError):
                    continue
                if numeric <= 0:
                    continue
                sanitized[str(key)] = numeric
            mix_total = sum(sanitized.values())
            if mix_total > 0:
                normalized_mix = {key: val / mix_total for key, val in sanitized.items()}

        if not normalized_mix:
            normalized_mix, total_window_spend, transactions = compute_user_mix(
                database,
                user["_id"],
                window_days,
                card_object_ids,
                transactions=transactions,
            )

        if monthly_spend_value is not None:
            monthly_total = max(monthly_spend_value, 0.0)
        else:
            if total_window_spend > 0 and window_days > 0:
                monthly_total = (total_window_spend / window_days) * 30
            elif normalized_mix:
                monthly_total = 1000.0
            else:
                monthly_total = 0.0

        if not normalized_mix or monthly_total <= 0:
            return jsonify({
                "mix": normalized_mix,
                "monthly_spend": round(monthly_total, 2),
                "windowDays": window_days,
                "cards": [],
                "explanation": "",
            })

        catalog_cards = list(database["credit_cards"].find({"active": True}))
        if not catalog_cards:
            return jsonify({
                "mix": normalized_mix,
                "monthly_spend": round(monthly_total, 2),
                "windowDays": window_days,
                "cards": [],
                "explanation": "",
            })

        scored_cards = score_catalog(catalog_cards, normalized_mix, monthly_total, window_days, limit=limit)

        explanation = ""
        if include_explain and scored_cards:
            top_names = [card.get("product_name") for card in scored_cards[:3] if card.get("product_name")]
            if top_names:
                explanation = explain_recommendations(normalized_mix, top_names)

        return jsonify({
            "mix": normalized_mix,
            "monthly_spend": round(monthly_total, 2),
            "windowDays": window_days,
            "cards": scored_cards,
            "explanation": explanation,
        })

    # -------- mandates --------
    @api_bp.post("/ap2/mandates")
    def ap2_create_mandate():
        user = g.current_user
        payload = request.get_json(force=True) or {}
        raw_type = payload.get("type")
        if not isinstance(raw_type, str) or not raw_type.strip():
            raise BadRequest("type is required")
        mandate_type = raw_type.strip().lower()
        if mandate_type not in ("intent", "cart", "payment"):
            raise BadRequest("invalid type")
        data = payload.get("data") or {}
        if not isinstance(data, dict):
            raise BadRequest("data must be an object")
        now = datetime.utcnow()
        document = {
            "userId": user["_id"],
            "type": mandate_type,
            "data": data,
            "status": "pending_approval",
            "signed_by": [],
            "created_at": now,
            "updated_at": now,
        }
        result = database["mandates"].insert_one(document)
        created = database["mandates"].find_one({"_id": result.inserted_id})
        if created is None:
            raise BadRequest("Unable to create mandate")
        return jsonify(format_mandate(created)), 201

    @api_bp.post("/ap2/mandates/<mandate_id>/approve")
    def ap2_approve_mandate(mandate_id: str):
        user = g.current_user
        object_id = validate_object_id(mandate_id)
        mandate = database["mandates"].find_one({"_id": object_id, "userId": user["_id"]})
        if not mandate:
            raise NotFound("Mandate not found")

        status = mandate.get("status")
        if status in ("approved", "executed"):
            return jsonify({"id": mandate_id, "status": status})
        if status == "declined":
            raise BadRequest("mandate was declined")

        now = datetime.utcnow()
        database["mandates"].update_one(
            {"_id": mandate["_id"]},
            {
                "$set": {"status": "approved", "updated_at": now},
                "$push": {"signed_by": {"userId": user["_id"], "at": now}},
            },
        )
        updated = database["mandates"].find_one({"_id": mandate["_id"]})
        return jsonify({"id": mandate_id, "status": "approved", "updated_at": format_mandate(updated)["updated_at"]})

    @api_bp.post("/ap2/mandates/<mandate_id>/decline")
    def ap2_decline_mandate(mandate_id: str):
        user = g.current_user
        object_id = validate_object_id(mandate_id)
        mandate = database["mandates"].find_one({"_id": object_id, "userId": user["_id"]})
        if not mandate:
            raise NotFound("Mandate not found")

        if mandate.get("status") == "executed":
            raise BadRequest("mandate already executed")

        now = datetime.utcnow()
        database["mandates"].update_one(
            {"_id": mandate["_id"]},
            {"$set": {"status": "declined", "updated_at": now}},
        )
        return jsonify({"id": mandate_id, "status": "declined"})

    def _lookup_credit_card_by_reference(slug: Optional[str], product_id: Any):
        if slug:
            product = database["credit_cards"].find_one({"slug": slug})
            if product:
                return product
        if isinstance(product_id, ObjectId):
            product = database["credit_cards"].find_one({"_id": product_id})
            if product:
                return product
        if isinstance(product_id, str) and product_id:
            # try string representation of object id first
            try:
                object_id = ObjectId(product_id)
                product = database["credit_cards"].find_one({"_id": object_id})
                if product:
                    return product
            except Exception:
                pass
            product = database["credit_cards"].find_one({"slug": product_id})
            if product:
                return product
        return None

    @api_bp.post("/ap2/mandates/<mandate_id>/execute")
    def ap2_execute_mandate(mandate_id: str):
        user = g.current_user
        object_id = validate_object_id(mandate_id)
        mandate = database["mandates"].find_one({"_id": object_id, "userId": user["_id"]})
        if not mandate:
            raise NotFound("Mandate not found")

        if mandate.get("status") != "approved":
            raise BadRequest("mandate not approved")

        mandate_type = (mandate.get("type") or "").lower()
        payload = mandate.get("data") or {}
        if not isinstance(payload, dict):
            payload = {}

        intent = (payload.get("intent") or payload.get("type") or "").lower()

        if mandate_type == "intent" and intent == "apply_card":
            slug_value = None
            for key in ("product_slug", "slug"):
                candidate = payload.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    slug_value = candidate.strip()
                    break
            if not slug_value:
                raise BadRequest("product_slug required")

            product = _lookup_credit_card_by_reference(slug_value, payload.get("card_product_id"))
            if not product:
                raise BadRequest("unknown product_slug")

            now = datetime.utcnow()

            application = database["applications"].find_one(
                {
                    "userId": user["_id"],
                    "product_slug": slug_value,
                }
            )

            product_name = payload.get("product_name") or product.get("product_name")
            issuer_name = payload.get("issuer") or product.get("issuer")

            application_updates = {
                "product_name": product_name,
                "issuer": issuer_name,
                "card_product_id": product.get("_id"),
                "updated_at": now,
                "status": "approved",
            }

            if application:
                database["applications"].update_one(
                    {"_id": application["_id"]},
                    {
                        "$set": {**application_updates, "applied_at": now},
                        "$setOnInsert": {"created_at": now},
                    },
                )
            else:
                application_document = {
                    "userId": user["_id"],
                    "product_slug": slug_value,
                    "status": "approved",
                    "created_at": now,
                    "updated_at": now,
                    "applied_at": now,
                    "product_name": product_name,
                    "issuer": issuer_name,
                    "card_product_id": product.get("_id"),
                }
                database["applications"].insert_one(application_document)

            account_matchers = []
            product_id = product.get("_id")
            if product_id:
                account_matchers.append({"card_product_id": product_id})
                account_matchers.append({"card_product_id": str(product_id)})
            account_matchers.append({"card_product_slug": slug_value})

            existing_account = database["accounts"].find_one(
                {
                    "userId": user["_id"],
                    "account_type": "credit_card",
                    "$or": account_matchers,
                }
            )

            # Demo fake artifact fields
            last4 = _demo_random_last4(database, user["_id"])
            exp_month = random.randint(1, 12)
            exp_year = datetime.utcnow().year + random.randint(3, 6)

            account_updates = {
                "issuer": issuer_name,
                "network": product.get("network"),
                "nickname": product_name,
                "card_product_id": product_id,
                "card_product_slug": product.get("slug"),
                "status": "Active",              # <- demo: instantly active
                "account_mask": last4,           # <- demo: fake last-4 for UI
                "expiry_month": exp_month,       # <- optional demo
                "expiry_year": exp_year,         # <- optional demo
                "applied_at": now,
                "updated_at": now,
            }

            if existing_account:
                database["accounts"].update_one(
                    {"_id": existing_account["_id"]},
                    {
                        "$set": account_updates,
                        "$setOnInsert": {"created_at": existing_account.get("created_at", now)},
                    },
                )
                account_id = existing_account["_id"]
            else:
                account_document = {
                    "userId": user["_id"],
                    "account_type": "credit_card",
                    **account_updates,
                    "account_mask": last4,   # make sure it's present on insert
                    "created_at": now,
                }
                result = database["accounts"].insert_one(account_document)
                account_id = result.inserted_id

            # Seed demo transactions so the card has activity
            try:
                generate_mock_transactions(
                    database,
                    str(user["_id"]),
                    str(account_id),
                    N=20,
                    days=45,
                    seed_version="v1",
                )
            except Exception as e:
                app.logger.warning(f"mock generation failed for account {account_id}: {e}")

            # Mark mandate executed
            database["mandates"].update_one(
                {"_id": mandate["_id"]},
                {"$set": {"status": "executed", "updated_at": now}},
            )

            return jsonify({"id": mandate_id, "status": "executed", "result": "card_activated"})

        raise BadRequest("no executor for this mandate")

    # -------- applications --------
    @api_bp.post("/applications")
    def create_application():
        user = g.current_user
        payload = request.get_json(force=True) or {}

        slug = payload.get("slug")
        product_slug = payload.get("product_slug") or payload.get("productSlug")
        product_name = payload.get("product_name")
        issuer = payload.get("issuer")
        card_id_raw = payload.get("card_id") or payload.get("cardId")

        card_object_id: Optional[ObjectId] = None
        card_doc: Optional[Dict[str, Any]] = None

        if card_id_raw:
            try:
                card_object_id = validate_object_id(str(card_id_raw))
            except NotFound as exc:
                raise BadRequest("Invalid card_id format") from exc

            card_doc = database["accounts"].find_one(
                {
                    "_id": card_object_id,
                    "userId": user["_id"],
                    "account_type": "credit_card",
                }
            )
            if not card_doc:
                raise NotFound("Card not found")

        slug_value: Optional[str] = None
        for candidate in (slug, product_slug):
            if isinstance(candidate, str) and candidate.strip():
                slug_value = candidate.strip()
                break

        if not slug_value and card_doc:
            product_ref = card_doc.get("card_product_id") or card_doc.get("product_slug")
            if isinstance(product_ref, ObjectId):
                product_ref = str(product_ref)
            if isinstance(product_ref, str) and product_ref.strip():
                slug_value = product_ref.strip()

        catalog_product: Optional[Dict[str, Any]] = None
        if slug_value:
            catalog_product = database["credit_cards"].find_one({"slug": slug_value})

        if not catalog_product and card_doc:
            product_ref = card_doc.get("card_product_id")
            if isinstance(product_ref, ObjectId):
                catalog_product = database["credit_cards"].find_one({"_id": product_ref})
            elif isinstance(product_ref, str) and product_ref.strip():
                catalog_product = database["credit_cards"].find_one({"slug": product_ref.strip()})

        if not slug_value and catalog_product:
            slug_candidate = catalog_product.get("slug") or catalog_product.get("product_slug")
            if isinstance(slug_candidate, str) and slug_candidate.strip():
                slug_value = slug_candidate.strip()

        if not slug_value:
            raise BadRequest("Provide card_id or product_slug")

        if card_doc and not product_name:
            product_name = card_doc.get("productName") or card_doc.get("nickname")
        if card_doc and not issuer:
            issuer = card_doc.get("issuer")

        if catalog_product:
            product_name = product_name or catalog_product.get("product_name")
            issuer = issuer or catalog_product.get("issuer")

        if not isinstance(product_name, str) or not product_name.strip():
            raise BadRequest("product_name is required")
        if not isinstance(issuer, str) or not issuer.strip():
            raise BadRequest("issuer is required")

        document: Dict[str, Any] = {
            "userId": user["_id"],
            "product_slug": slug_value,
            "product_name": product_name.strip(),
            "issuer": issuer.strip(),
            "status": "started",
            "applied_at": datetime.utcnow(),
        }

        if catalog_product and catalog_product.get("network"):
            document["network"] = catalog_product.get("network")
        if card_object_id is not None:
            document["card_id"] = card_object_id

        result = database["applications"].insert_one(document)

        return jsonify({"status": "ok", "applicationId": str(result.inserted_id)}), 201

    # -------- chat --------

    @api_bp.post("/chat")
    def chat_with_finbot():
        user = g.current_user
        payload = request.get_json(force=True) or {}

        new_message = payload.get("newMessage")
        if not isinstance(new_message, str) or not new_message.strip():
            raise BadRequest("newMessage is required")
        text = new_message.strip()
        text_lc = text.lower()

        # recent context for grounding
        window_days = int(payload.get("window") or 30)
        mix, _total_spend, _txns = compute_user_mix(app.config["MONGO_DB"], user["_id"], window_days, None)
        llm_ctx = build_llm_context(app.config["MONGO_DB"], user["_id"], window_days)
        monthly_total = float(llm_ctx.get("monthly_spend_estimate") or 0.0)

        ts = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

        def respond(reply: str, payload_obj=None):
            safe = reply.strip() if isinstance(reply, str) and reply.strip() else \
                "I’m here and ready. Ask about budgets or spending changes."
            body = {"reply": safe, "timestamp": ts}
            if payload_obj is not None:
                body["payload"] = payload_obj
            return jsonify(body)

        # --------------------------
        # 0) trivial QOL: current time
        # --------------------------
        if any(k in text_lc for k in ("what time", "time is it", "current time", "what's the time", "whats the time")):
            pref_tz = (user.get("preferences") or {}).get("timezone") or "UTC"
            try:
                tz = ZoneInfo(pref_tz) if ZoneInfo else timezone.utc
            except Exception:
                tz = timezone.utc
            now_local = datetime.now(tz)
            pretty = now_local.strftime("%a, %b %d • %I:%M %p").lstrip("0")
            return respond(f"The time is **{pretty}** ({pref_tz}).")

        # --------------------------
        # 1) greeting
        # --------------------------
        if text_lc in ("hi", "hello", "hey") or text_lc.startswith(("hi ", "hello ", "hey ")):
            return respond("Hi! I can **suggest a monthly budget** or explain **why spending rose**. What would you like to do?")

        # --------------------------
        # 2) budget (markdown)
        # --------------------------
        if "budget" in text_lc or "set a budget" in text_lc or "monthly budget" in text_lc:
            if monthly_total > 0 and llm_ctx.get("top_categories"):
                reply = _budget_markdown(
                    monthly_total,
                    [{"key": c.get("name") or c.get("key"), "pct": c.get("pct", 0)} for c in llm_ctx.get("top_categories", [])],
                )
            else:
                reply = "I couldn't detect recent spend to base a budget on. Try again after a few transactions."
            return respond(reply)

        # --------------------------
        # 3) insights (markdown)
        # --------------------------
        if ("spending" in text_lc or "spend" in text_lc) and any(k in text_lc for k in ("rise", "increas", "up", "higher")):
            try:
                data = compare_windows(app.config["MONGO_DB"], user["_id"], this_window="MTD")
                return respond(_delta_to_markdown(data))
            except Exception as e:
                app.logger.warning(f"insights compare failed: {e}")
                return respond("Sorry — I couldn't fetch your insights right now.")

        # --------------------------
        # 4) CATEGORY DEEP DIVE (e.g., 'Dining', 'Groceries')
        #    Trigger if the user sends a single category word/phrase.
        # --------------------------
        CAT_ALIASES = {
            "dining": "Food and Drink",
            "food": "Food and Drink",
            "food & drink": "Food and Drink",
            "food and drink": "Food and Drink",
            "grocery": "Groceries",
            "groceries": "Groceries",
            "pharmacy": "Drugstores",
            "drugstore": "Drugstores",
            "drugstores": "Drugstores",
            "travel": "Travel",
            "bills": "Bills",
            "shopping": "Shopping",
            "entertainment": "Entertainment",
            "transit": "Transportation",
            "transport": "Transportation",
            "transportation": "Transportation",
            "home improvement": "Home Improvement",
        }

        # very light heuristic: short message that looks like a category
        if len(text_lc) <= 30:
            normalized = CAT_ALIASES.get(text_lc.strip(), None)
            if normalized or text_lc in CAT_ALIASES:
                cat = normalized or CAT_ALIASES[text_lc]
                try:
                    dive = category_deep_dive(app.config["MONGO_DB"], user["_id"], category_name=cat, this_window=window_days)
                    sign = "▲" if float(dive["delta"]) > 0 else ("▼" if float(dive["delta"]) < 0 else "•")
                    md = [
                        f"**{cat} deep dive (last {dive['windowDays']} days vs prior {dive['windowDays']})**",
                        "",
                        f"- This window: **${dive['thisTotal']:,.0f}**",
                        f"- Prior window: **${dive['priorTotal']:,.0f}**",
                        f"- Net change: **{sign} ${abs(float(dive['delta'])):,.0f}**",
                    ]
                    if dive.get("topMerchants"):
                        md.append("")
                        md.append("**Top merchants in this category**")
                        for m in dive["topMerchants"]:
                            md.append(f"- **{m['name']}**: ${m['amount']:,.0f} ({m['count']} txns)")
                    md.append("")
                    md.append("_Ask for a specific merchant if you want me to break it down further._")
                    return respond("\n".join(md))
                except Exception as e:
                    app.logger.warning(f"category deep dive failed: {e}")
                    return respond(f"Sorry — I couldn't analyze **{cat}** right now.")

        # --------------------------
        # 5) general Q&A → LLM fallback (more robust)
        # --------------------------
        history = []
        for h in (payload.get("history") or [])[-20:]:
            if isinstance(h, dict) and h.get("author") in ("user", "assistant") and isinstance(h.get("content"), str):
                history.append({"author": h["author"], "content": h["content"], "timestamp": h.get("timestamp")})

        # lightweight recs to prime the model
        recommendations = []
        if mix and monthly_total > 0:
            catalog_cards = list(app.config["MONGO_DB"]["credit_cards"].find({"active": True}))
            if catalog_cards:
                scored = score_catalog(catalog_cards, mix, monthly_total, window_days, limit=3)
                for c in scored[:3]:
                    recommendations.append({
                        "product_name": c.get("product_name"),
                        "issuer": c.get("issuer"),
                        "net": c.get("net"),
                        "slug": c.get("slug"),
                    })

        reply_text = ""
        try:
            reply_text = generate_chat_response(
                user_spend_mix=mix,
                recommendations=recommendations,
                history=history,
                new_message=text,
            )
        except Exception as e:
            app.logger.warning(f"LLM error: {e}")

        reply_text = (reply_text or "").strip()
        if not reply_text:
            # Last-resort friendly fallback
            return respond("I can help with **budgets** and **spending changes**. Try “Suggest a monthly budget” or “Why did spending rise?”")
        return respond(reply_text)




    # -------- rewards --------
    @api_bp.get("/rewards/estimate")
    def rewards_estimate():
        user = g.current_user
        window_days = parse_window_days(30)

        slug_param = request.args.get("cardSlug") or request.args.get("slug")
        card_id_param = request.args.get("cardId")

        account = None
        product = None

        if card_id_param:
            try:
                card_object_id = validate_object_id(card_id_param)
            except NotFound as exc:
                raise BadRequest("invalid cardId") from exc
            account = database["accounts"].find_one(
                {
                    "_id": card_object_id,
                    "userId": user["_id"],
                    "account_type": "credit_card",
                }
            )
            if not account:
                raise NotFound("Card not found")
            if not slug_param:
                slug_param = account.get("card_product_slug") or account.get("product_slug")
            product = _lookup_credit_card_by_reference(slug_param, account.get("card_product_id"))

        if slug_param and not product:
            product = _lookup_credit_card_by_reference(slug_param, None)

        if not product and slug_param:
            raise NotFound("Card product not found")

        if not product and account:
            product = _lookup_credit_card_by_reference(account.get("card_product_slug"), account.get("card_product_id"))

        if not product:
            raise BadRequest("cardSlug required")

        card_object_ids = None
        if account:
            card_object_ids = [account["_id"]]

        transactions = load_transactions(database, user["_id"], window_days, card_object_ids)
        rewards = compute_month_earnings(product, transactions)

        response = {
            "windowDays": window_days,
            "cardSlug": product.get("slug"),
            "cardName": product.get("product_name"),
            "totalCashback": rewards.get("total_cashback", 0.0),
            "totalSpend": rewards.get("total_spend", 0.0),
            "effectiveRate": rewards.get("effective_rate", 0.0),
            "baseRate": rewards.get("base_rate", 0.0),
            "byCategory": rewards.get("by_category", []),
        }

        if account:
            response["cardId"] = str(account["_id"])

        return jsonify(response)

    @api_bp.post("/rewards/compare")
    def rewards_compare():
        g.current_user  # ensure auth
        payload = request.get_json(force=True) or {}

        raw_mix = payload.get("mix") or payload.get("category_mix") or {}
        if not isinstance(raw_mix, dict):
            raise BadRequest("mix must be an object")

        mix, total = normalize_mix(raw_mix)

        try:
            window_days = int(payload.get("window") or payload.get("windowDays") or 30)
        except (TypeError, ValueError):
            window_days = 30
        if window_days <= 0:
            window_days = 30

        cards_payload = payload.get("cards") or []
        if not isinstance(cards_payload, list):
            raise BadRequest("cards must be an array")

        slugs: List[str] = []
        for entry in cards_payload:
            if isinstance(entry, str) and entry.strip():
                slugs.append(entry.strip())
            elif isinstance(entry, dict):
                slug_value = entry.get("slug") or entry.get("cardSlug")
                if isinstance(slug_value, str) and slug_value.strip():
                    slugs.append(slug_value.strip())

        if not slugs or not mix or total <= 0:
            return jsonify(
                {
                    "mix": mix,
                    "monthly_spend": round(total, 2),
                    "windowDays": window_days,
                    "cards": [],
                }
            )

        catalog_cards = list(database["credit_cards"].find({"slug": {"$in": slugs}}))
        if not catalog_cards:
            return jsonify(
                {
                    "mix": mix,
                    "monthly_spend": round(total, 2),
                    "windowDays": window_days,
                    "cards": [],
                }
            )

        scored = score_catalog(catalog_cards, mix, total, window_days, limit=len(catalog_cards))
        return jsonify(
            {
                "mix": mix,
                "monthly_spend": round(total, 2),
                "windowDays": window_days,
                "cards": scored,
            }
        )

    # -------- cards --------
    @api_bp.get("/cards")
    def list_cards():
        user = g.current_user
        cards = (
            database["accounts"]
            .find({"userId": user["_id"], "account_type": "credit_card"})
            .sort("nickname", ASCENDING)
        )
        return jsonify([format_card_row(card) for card in cards])

    @api_bp.get("/cards/debug")
    def debug_cards():
        """Debug endpoint to help troubleshoot card data issues"""
        user = g.current_user

        # Check all cards in the database
        all_cards = list(database["accounts"].find({"account_type": "credit_card"}))
        user_cards = list(database["accounts"].find({"userId": user["_id"], "account_type": "credit_card"}))

        return jsonify(
            {
                "user_id": str(user["_id"]),
                "user_email": user.get("email"),
                "total_cards_in_db": len(all_cards),
                "user_cards_count": len(user_cards),
                "all_cards_preview": [
                    {
                        "id": str(card["_id"]),
                        "userId": str(card.get("userId", "N/A")),
                        "nickname": card.get("nickname", "N/A"),
                        "issuer": card.get("issuer", "N/A"),
                        "account_type": card.get("account_type", "N/A"),
                    }
                    for card in all_cards[:10]  # Limit to first 10 for debugging
                ],
                "user_cards": [format_card_row(card) for card in user_cards],
            }
        )

    @api_bp.post("/cards/import")
    def import_existing_card():
        """Import an existing card by updating its userId to the current user"""
        user = g.current_user
        payload = request.get_json(silent=True) or {}
        card_id = payload.get("card_id")

        if not card_id:
            raise BadRequest("card_id is required")

        try:
            card_object_id = validate_object_id(card_id)
        except Exception:
            raise BadRequest("Invalid card_id format")

        # Find the card
        card = database["accounts"].find_one(
            {"_id": card_object_id, "account_type": "credit_card"}
        )
        if not card:
            raise NotFound("Card not found")

        # Update the card to belong to the current user
        database["accounts"].update_one(
            {"_id": card_object_id},
            {"$set": {"userId": user["_id"], "updated_at": datetime.utcnow()}},
        )

        return jsonify({"id": str(card_object_id), "message": "Card imported successfully"}), 200

    @api_bp.post("/cards")
    def add_card():
        user = g.current_user
        payload = request.get_json(silent=True) or {}

        required_fields = ["issuer", "network", "mask", "expiry_month", "expiry_year"]
        mapped_payload = {
            "nickname": payload.get("nickname"),
            "issuer": payload.get("issuer"),
            "network": payload.get("network"),
            "account_mask": payload.get("mask") or payload.get("account_mask"),
            "expiry_month": payload.get("expiry_month"),
            "expiry_year": payload.get("expiry_year"),
            "card_product_id": payload.get("card_product_id"),
        }
        for field in required_fields:
            key = "account_mask" if field == "mask" else field
            value = mapped_payload.get(key)
            if value in (None, ""):
                raise BadRequest(f"{field} is required")

        mask_raw = str(mapped_payload["account_mask"]).strip()
        mask_digits = "".join(ch for ch in mask_raw if ch.isdigit())
        last4 = mask_digits[-4:]
        if len(last4) != 4 or not last4.isdigit():
            raise BadRequest("mask (last4) must be 4 digits")

        try:
            expiry_month = int(mapped_payload["expiry_month"])
        except (TypeError, ValueError):
            raise BadRequest("expiry_month must be a number")
        if expiry_month < 1 or expiry_month > 12:
            raise BadRequest("expiry_month must be between 1 and 12")

        try:
            expiry_year = int(mapped_payload["expiry_year"])
        except (TypeError, ValueError):
            raise BadRequest("expiry_year must be a number")
        current_year = datetime.utcnow().year
        if expiry_year < current_year or expiry_year > current_year + 20:
            raise BadRequest("expiry_year must be within a valid range")

        nickname = mapped_payload["nickname"]
        if nickname is not None:
            if not isinstance(nickname, str):
                raise BadRequest("nickname must be a string")
            nickname = nickname.strip()
            if not nickname:
                nickname = None

        card_product_id = mapped_payload.get("card_product_id")
        if isinstance(card_product_id, str):
            card_product_id = card_product_id.strip() or None
        elif card_product_id is not None:
            raise BadRequest("card_product_id must be a string")

        document = {
            "userId": user["_id"],
            "account_type": "credit_card",
            "nickname": nickname,
            "issuer": mapped_payload["issuer"],
            "network": mapped_payload["network"],
            "account_mask": last4,
            "expiry_month": expiry_month,
            "expiry_year": expiry_year,
            "card_product_id": card_product_id,
            "status": payload.get("status", "Active"),
            "last_sync": payload.get("last_sync"),
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        if isinstance(document["last_sync"], str):
            try:
                document["last_sync"] = datetime.fromisoformat(document["last_sync"].replace("Z", "+00:00"))
            except ValueError:
                document["last_sync"] = datetime.utcnow()

        result = database["accounts"].insert_one(document)

        # try to backfill mock txns for demo
        try:
            generate_mock_transactions(
                database,
                str(user["_id"]),
                str(result.inserted_id),
                N=15,
                days=60,
                seed_version="v1",
            )
        except Exception as e:
            app.logger.warning(f"mock generation failed for account {result.inserted_id}: {e}")

        return jsonify({"id": str(result.inserted_id)}), 201

    def get_card_or_404(card_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
        card = database["accounts"].find_one(
            {"_id": validate_object_id(card_id), "userId": user["_id"], "account_type": "credit_card"}
        )
        if not card:
            raise NotFound("Card not found")
        return card

    @api_bp.get("/cards/<card_id>")
    def card_details(card_id: str):
        user = g.current_user
        card = get_card_or_404(card_id, user)
        detail = format_card_row(card)
        detail["mask"] = card.get("account_mask", "")
        detail["productName"] = card.get("productName")

        if not detail.get("productName") and card.get("card_product_id"):
            product = database["credit_cards"].find_one({"_id": card.get("card_product_id")})
            if not product:
                product = database["credit_cards"].find_one({"product_id": card.get("card_product_id")})
        else:
            product = None

        if not product and card.get("card_product_id"):
            product = database["credit_cards"].find_one({"card_product_id": card.get("card_product_id")})
        if not product:
            product = database["credit_cards"].find_one(
                {"issuer": card.get("issuer"), "product_name": card.get("nickname")}
            )

        if product:
            detail["productName"] = product.get("product_name")
            detail["features"] = product.get("features", [])

        window_days = 30
        cutoff = datetime.utcnow() - timedelta(days=window_days)
        txns = list(
            database["transactions"].find(
                {"userId": user["_id"], "accountId": card["_id"], "date": {"$gte": cutoff}}
            )
        )
        total, count, by_category = calculate_summary(txns)
        detail["summary"] = {
            "windowDays": window_days,
            "spend": round(total, 2),
            "txns": count,
            "byCategory": [
                {"name": name, "total": round(value, 2)}
                for name, value in sorted(by_category.items(), key=lambda item: item[1], reverse=True)
            ],
        }

        scenarios: List[Dict[str, Any]] = []
        if product:
            for doc in database["cashback_scenarios"].find({}).sort("label", ASCENDING):
                amount = float(doc.get("amount") or 0.0)
                category = str(doc.get("category") or "General")
                rate = earn_percent_for_product(product, category, amount)
                estimated = round(amount * rate, 2)
                scenario_id = doc.get("_id")
                scenarios.append(
                    {
                        "id": str(scenario_id),
                        "label": doc.get("label") or category,
                        "description": doc.get("description"),
                        "category": category,
                        "amount": round(amount, 2),
                        "rate": round(rate, 4),
                        "estimatedCashback": estimated,
                    }
                )
        if scenarios:
            detail["cashbackScenarios"] = scenarios
        return jsonify(detail)

    @api_bp.patch("/cards/<card_id>")
    def update_card(card_id: str):
        user = g.current_user
        card = get_card_or_404(card_id, user)
        payload = request.get_json(silent=True) or {}
        updates: Dict[str, Any] = {}
        if "nickname" in payload:
            if payload["nickname"] is not None and not isinstance(payload["nickname"], str):
                raise BadRequest("nickname must be a string")
            updates["nickname"] = payload["nickname"]
        if "card_product_id" in payload:
            if payload["card_product_id"] is not None and not isinstance(payload["card_product_id"], str):
                raise BadRequest("card_product_id must be a string")
            updates["card_product_id"] = payload["card_product_id"]
        if not updates:
            return jsonify(format_card_row(card))
        updates["updated_at"] = datetime.utcnow()
        database["accounts"].update_one({"_id": card["_id"]}, {"$set": updates})
        card.update(updates)
        return jsonify(format_card_row(card))

    @api_bp.delete("/cards/<card_id>")
    def delete_card(card_id: str):
        user = g.current_user
        card = get_card_or_404(card_id, user)
        database["accounts"].delete_one({"_id": card["_id"]})
        return ("", 204)

    # -------- misc / admin-ish --------
    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "ok"})

    @app.errorhandler(Unauthorized)
    def handle_unauthorized(error):
        response = jsonify({"error": "unauthorized", "message": str(error)})
        response.status_code = 401
        return response

    @app.errorhandler(BadRequest)
    def handle_bad_request(error):
        response = jsonify({"error": "bad_request", "message": str(error)})
        response.status_code = 400
        return response

    @app.errorhandler(Forbidden)
    def handle_forbidden(error):
        response = jsonify({"error": "forbidden", "message": str(error)})
        response.status_code = 403
        return response

    @app.errorhandler(NotFound)
    def handle_not_found(error):
        response = jsonify({"error": "not_found", "message": str(error)})
        response.status_code = 404
        return response

    # -------- utilities --------
    @api_bp.get("/merchants/all")
    def list_all_merchants():
        """
        Return all seeded merchants (not user-specific).
        Supports optional limit/offset to avoid huge payloads.
        GET /api/merchants/all?limit=1000&offset=0
        """
        db = app.config["MONGO_DB"]
        coll = db["merchants"]

        limit_raw = request.args.get("limit", 1000)
        offset_raw = request.args.get("offset", 0)

        try:
            limit = max(1, min(int(limit_raw), 5000))  # hard cap
            offset = max(0, int(offset_raw))
        except (TypeError, ValueError):
            raise BadRequest("limit/offset must be integers")

        cursor = (
            coll.find(
                {},
                {
                    "_id": 1,
                    "name": 1,
                    "slug": 1,
                    "mcc": 1,
                    "primaryCategory": 1,
                    "brandGroup": 1,
                    "aliases": 1,
                    "domains": 1,
                    "tags": 1,
                },
            )
            .sort("name", ASCENDING)
            .skip(offset)
            .limit(limit)
        )

        items = [
            {
                "id": str(doc["_id"]),
                "name": doc.get("name", ""),
                "slug": doc.get("slug", ""),
                "mcc": doc.get("mcc"),
                "primaryCategory": doc.get("primaryCategory"),
                "brandGroup": doc.get("brandGroup"),
                "aliases": doc.get("aliases", []),
                "domains": doc.get("domains", []),
                "tags": doc.get("tags", []),
            }
            for doc in cursor
        ]

        total = coll.estimated_document_count()
        return jsonify({"items": items, "total": total, "limit": limit, "offset": offset})

    @api_bp.get("/cards/with-product")
    def list_cards_with_product():
        """
        Return the current user's credit cards joined with the credit_cards catalog.
        Joins accounts.card_product_id (slug) -> credit_cards.slug
        """
        user = g.current_user
        pipeline = [
            {"$match": {"userId": user["_id"], "account_type": "credit_card"}},
            {
                "$lookup": {
                    "from": "credit_cards",
                    "localField": "card_product_id",  # slug stored in accounts
                    "foreignField": "slug",           # slug in credit_cards
                    "as": "product",
                }
            },
            {"$unwind": "$product"},
            {
                "$project": {
                    "account_id": {"$toString": "$_id"},
                    "nickname": 1,
                    "issuer": 1,
                    "network": 1,
                    "account_mask": 1,
                    "card_product_id": 1,
                    "product_slug": "$product.slug",
                    "product_name": "$product.product_name",
                    "product_issuer": "$product.issuer",
                    "base_cashback": "$product.base_cashback",
                    "rewards": "$product.rewards",
                    "annual_fee": "$product.annual_fee",
                    "active": "$product.active",
                }
            },
        ]
        rows = list(database["accounts"].aggregate(pipeline))
        return jsonify(rows)

    @api_bp.route("/recommendations/best-card", methods=["GET", "POST"])
    def best_card_for_merchant():
        user = g.current_user

        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            merchant = (data.get("merchant") or "").strip()
            spend_val = data.get("assumedMonthlySpend")
            if spend_val is None:
                spend_val = data.get("spend")  # tolerate old clients
            try:
                spend = float(spend_val or 150)
            except (TypeError, ValueError):
                spend = 150.0
        else:
            merchant = (request.args.get("merchant") or "").strip()
            try:
                spend = float(request.args.get("assumedMonthlySpend") or request.args.get("spend") or 150)
            except (TypeError, ValueError):
                spend = 150.0

        if not merchant:
            raise BadRequest("merchant is required")

        # normalize merchant -> category
        m = app.config["MONGO_DB"]["merchants"].find_one(
            {"$or": [{"name": merchant}, {"aliases": merchant}, {"slug": merchant.lower()}]}
        )
        if not m:
            raise NotFound("Merchant not found")

        def normalize_merchant_category(doc: Dict[str, Any]) -> str:
            MCC_TO_CATEGORY = {"5411": "Groceries", "5499": "Groceries", "5812": "Food and Drink", "5814": "Food and Drink"}
            CATEGORY_ALIAS = {
                "dining": "Food and Drink",
                "restaurant": "Food and Drink",
                "restaurants": "Food and Drink",
                "grocery": "Groceries",
                "groceries": "Groceries",
                "travel": "Travel",
                "pharmacy": "Drugstores",
                "drugstore": "Drugstores",
                "entertainment": "Entertainment",
                "streaming": "Streaming",
                "transit": "Transportation",
            }
            ov = (doc.get("overrides") or {})
            if isinstance(ov, dict) and ov.get("treatAs"):
                raw = str(ov["treatAs"]).strip().lower()
                return CATEGORY_ALIAS.get(raw, doc["overrides"]["treatAs"])
            if doc.get("primaryCategory"):
                raw = str(doc["primaryCategory"]).strip().lower()
                return CATEGORY_ALIAS.get(raw, doc["primaryCategory"])
            mcc = str(doc.get("mcc") or "")
            if mcc in MCC_TO_CATEGORY:
                return MCC_TO_CATEGORY[mcc]
            return "Other"

        category = normalize_merchant_category(m)

        # helper (same logic you already have in app.py)
        def earn_percent_for_product(product: Dict[str, Any], category: str, monthly_spend: float) -> float:
            base = float(product.get("base_cashback", 0.0) or 0.0)
            rules = product.get("rewards") or []
            rule = next((r for r in rules if r.get("category") == category), None)
            if not rule:
                return base
            rate = float(rule.get("rate", base) or base)
            cap = rule.get("cap_monthly")
            if not cap:
                return rate
            try:
                cap_val = float(cap)
            except Exception:
                return rate
            spend_amt = float(monthly_spend or 0)
            if spend_amt <= 0:
                return rate
            if spend_amt <= cap_val:
                return rate
            return (cap_val * rate + (spend_amt - cap_val) * base) / spend_amt

        # join owned cards with catalog
        pipeline = [
            {"$match": {"userId": user["_id"], "account_type": "credit_card"}},
            {"$lookup": {"from": "credit_cards", "localField": "card_product_id", "foreignField": "slug", "as": "product"}},
            {"$unwind": "$product"},
        ]
        owned_rows = list(app.config["MONGO_DB"]["accounts"].aggregate(pipeline))

        owned = []
        for row in owned_rows:
            prod = row["product"]
            pct = float(earn_percent_for_product(prod, category, spend))
            owned.append(
                {
                    "accountId": str(row["_id"]),
                    "nickname": row.get("nickname") or prod.get("product_name"),
                    "issuer": row.get("issuer") or prod.get("issuer"),
                    "rewardRateText": f"{int(round(pct * 100))}% {category}",
                    "percentBack": pct,
                }
            )

        best_owned = max(owned, key=lambda x: x["percentBack"]) if owned else None
        best_owned_pct = float(best_owned["percentBack"]) if best_owned else 0.0

        # alternatives not owned
        owned_slugs = {row["product"]["slug"] for row in owned_rows}
        alts = []
        for prod in app.config["MONGO_DB"]["credit_cards"].find({"active": True, "slug": {"$nin": list(owned_slugs)}}):
            pct = float(earn_percent_for_product(prod, category, spend))
            diff = max(0.0, pct - best_owned_pct)
            est = round(diff * spend, 2) if spend else None
            alts.append(
                {
                    "id": prod.get("slug"),
                    "name": prod.get("product_name"),
                    "issuer": prod.get("issuer"),
                    "rewardRateText": f"{int(round(pct * 100))}% {category}",
                    "percentBack": pct,
                    "estSavingsMonthly": est,
                }
            )
        alts.sort(key=lambda x: x["percentBack"], reverse=True)
        alts = alts[:3]

        return jsonify(
            {
                "merchant": m.get("name"),
                "category": category,
                "assumedMonthlySpend": spend,
                "bestOwned": best_owned,
                "youHaveThisCard": bool(best_owned),
                "alternatives": alts,
            }
        )


    @api_bp.post("/transactions/mock/generate")
    def generate_mock_for_account():
        """
        Generate seeded synthetic transactions for a single account.
        Body: { "account_id": "<ObjectId string>", "count": 120, "days": 60, "seed_version": "v1" }
        """
        user = g.current_user
        body = request.get_json(silent=True) or {}
        account_id_str = body.get("account_id")
        if not account_id_str:
            raise BadRequest("account_id is required")

        try:
            account_oid = validate_object_id(account_id_str)
        except Exception:
            raise BadRequest("account_id must be a valid ObjectId string")

        # ensure the account belongs to this user
        acct = app.config["MONGO_DB"]["accounts"].find_one(
            {"_id": account_oid, "userId": user["_id"], "account_type": "credit_card"}
        )
        if not acct:
            raise NotFound("Account not found")

        N = int(body.get("count", 120))
        days = int(body.get("days", 60))
        seed_version = str(body.get("seed_version", "v1"))

        inserted = generate_mock_transactions(
            app.config["MONGO_DB"],
            str(user["_id"]),
            str(account_oid),
            N=N,
            days=days,
            seed_version=seed_version,
        )
        return jsonify({"ok": True, "inserted": inserted})

    # mount blueprint
    app.register_blueprint(api_bp)
    app.register_blueprint(recurring_bp)
    app.register_blueprint(cards_best_bp)
    app.register_blueprint(insights_bp)
    return app


if __name__ == "__main__":
    # Create and run the Flask app directly (use Flask CLI in production)
    app = create_app()
    port = int(os.environ.get("PORT", "8000"))
    debug = os.environ.get("FLASK_DEBUG", "1") in ("1", "true", "True")
    app.run(host="0.0.0.0", port=port, debug=debug)

