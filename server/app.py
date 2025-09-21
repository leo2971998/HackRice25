import os
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from bson import ObjectId
from flask import Blueprint, Flask, jsonify, request, g
from flask_cors import CORS
from jose import jwt
from jose.exceptions import JWTError
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import CollectionInvalid, DuplicateKeyError, OperationFailure
import requests
from werkzeug.exceptions import BadRequest, Forbidden, NotFound, Unauthorized

from llm.gemini import explain_recommendations, generate_chat_response
from services.rewards import compute_month_earnings, normalize_mix
from services.scoring import score_catalog
from services.spend import aggregate_spend_details, build_category_rules, compute_user_mix, load_transactions
from mock_transactions import generate_mock_transactions  # add at top of file or near other imports


try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None


JWKS_CACHE: Dict[str, Any] = {"keys": []}
DEFAULT_PREFERENCES: Dict[str, Any] = {
    "timezone": "America/Chicago",
    "currency": "USD",
    "theme": "system",
    "privacy": {"blurAmounts": False},
    "notifications": {"monthly_summary": True, "new_recommendation": True},
}



def safe_create_index(coll, keys, **opts):
    """
    Create an index but gracefully:
    - ignore IndexOptionsConflict (code 85),
    - handle IndexKeySpecsConflict (code 86) by dropping the conflicting named index
      and recreating it with the requested options.
    """
    from pymongo.errors import OperationFailure

    requested_name = opts.get("name")
    try:
        return coll.create_index(keys, **opts)
    except OperationFailure as e:
        code = getattr(e, "code", None)

        # Already exists with different options but different auto-name (OK to ignore)
        if code == 85:  # IndexOptionsConflict
            return None

        # Same name exists but options differ (e.g., unique vs non-unique) -> drop & recreate
        if code == 86:  # IndexKeySpecsConflict
            # If a name was not provided, infer Mongo's auto-generated name
            if not requested_name:
                # Mongo's default name format matches what the error shows (e.g., "userId_1_product_slug_1")
                # Build it deterministically the same way:
                parts = []
                for k, direction in keys:
                    parts.append(f"{k}_{int(direction)}")
                requested_name = "_".join(parts)

            try:
                if requested_name:
                    coll.drop_index(requested_name)
                else:
                    # last resort: drop all indexes with same key pattern
                    info = coll.index_information()
                    for name, spec in info.items():
                        if spec.get("key") == keys:
                            coll.drop_index(name)
                # retry create
                return coll.create_index(keys, **opts)
            except OperationFailure:
                # if drop or recreate still fails, re-raise original for visibility
                raise e

        # anything else: bubble up
        raise

def load_environment() -> None:
    if load_dotenv is not None:
        load_dotenv()


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


def ensure_indexes(database) -> None:
    """
    Build the same logical indexes your app expects, but:
    - use deterministic names where you already have custom ones, and
    - ignore 'already exists with different name' conflicts.
    """
    # users
    users = database["users"]
    # unique auth0_id (simple, no partials/sparse mixing)
    safe_create_index(users, [("auth0_id", ASCENDING)], unique=True)
    # unique email but allow many null/missing (use sparse like your working file)
    safe_create_index(users, [("email", ASCENDING)], unique=True, sparse=True)

    # accounts
    accounts = database["accounts"]
    # your DB already had this as "accounts_userId", so match it explicitly
    safe_create_index(accounts, [("userId", ASCENDING)], name="accounts_userId")

    # composite unique+sparse index your monolith matched exactly by name
    safe_create_index(
        accounts,
        [("userId", ASCENDING), ("account_type", ASCENDING), ("account_mask", ASCENDING)],
        unique=True,
        sparse=True,
        name="userId_1_account_type_1_account_mask_1",
    )

    # allow quick lookup for cards created from mandates
    safe_create_index(
        accounts,
        [("userId", ASCENDING), ("card_product_id", ASCENDING)],
        sparse=True,
    )

    safe_create_index(
        accounts,
        [("userId", ASCENDING), ("card_product_slug", ASCENDING)],
        sparse=True,
    )

    # transactions
    tx = database["transactions"]
    safe_create_index(tx, [("userId", ASCENDING), ("date", DESCENDING)])
    safe_create_index(tx, [("userId", ASCENDING), ("accountId", ASCENDING), ("date", DESCENDING)])

    # credit_cards
    cards = database["credit_cards"]
    safe_create_index(cards, [("issuer", ASCENDING), ("network", ASCENDING)])
    # IMPORTANT: your working monolith uses slug (NOT product_slug) and named slug_1
    safe_create_index(cards, [("slug", ASCENDING)], unique=True, name="slug_1")

    # applications
    applications = database["applications"]
    safe_create_index(
        applications,
        [("userId", ASCENDING), ("product_slug", ASCENDING)],
        unique=True,
        sparse=True,
        name="userId_1_product_slug_1",  # explicit to match/replace the conflicting one
    )

    # mandates
    mandates = database["mandates"]
    safe_create_index(
        mandates,
        [("userId", ASCENDING), ("created_at", DESCENDING)],
    )


def ensure_collections(database) -> None:
    """Create required collections if they do not already exist."""

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



def merge_preferences(existing: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    merged = {**existing}
    for key, value in updates.items():
        if key not in DEFAULT_PREFERENCES:
            continue
        if isinstance(value, dict) and isinstance(DEFAULT_PREFERENCES[key], dict):
            merged[key] = merge_preferences(existing.get(key, DEFAULT_PREFERENCES[key]), value)
        else:
            merged[key] = value
    return merged


def get_or_create_user(users: Collection, payload: Dict[str, Any]) -> Dict[str, Any]:
    auth0_id = payload.get("sub")
    if not auth0_id:
        raise Unauthorized("Token missing subject")

    email = payload.get("email")
    name = payload.get("name") or (email.split("@")[0] if isinstance(email, str) and "@" in email else None)
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
        if name and user_doc.get("name") != name:
            updates["name"] = name
        if user_doc.get("email_verified") != email_verified:
            updates["email_verified"] = email_verified
        if updates:
            updates["updated_at"] = datetime.utcnow()
            users.update_one({"_id": user_doc["_id"]}, {"$set": updates})
            user_doc.update(updates)

        if "preferences" not in user_doc:
            users.update_one({"_id": user_doc["_id"]}, {"$set": {"preferences": DEFAULT_PREFERENCES}})
            user_doc["preferences"] = DEFAULT_PREFERENCES

    if user_doc is None:
        raise Unauthorized("Unable to load profile")

    return user_doc


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
        doc.get("card_product_slug")
        or doc.get("product_slug")
        or doc.get("card_slug")
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
        "created_at": created_at.isoformat().replace("+00:00", "Z")
        if isinstance(created_at, datetime)
        else None,
        "updated_at": updated_at.isoformat().replace("+00:00", "Z")
        if isinstance(updated_at, datetime)
        else None,
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
    moments = []
    top_category = None
    if by_category:
        top_category = max(by_category.items(), key=lambda item: item[1])
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
        merchant = txn.get("merchant_id") or txn.get("description_clean") or txn.get("description") or "Merchant"
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


def create_app() -> Flask:
    load_environment()
    app = Flask(__name__)

    # ✅ Local dev switch (set DISABLE_AUTH=1 in your .env)
    disable_auth = os.environ.get("DISABLE_AUTH", "0").lower() in ("1", "true")

    # Only load Auth0 settings if we actually need them
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
    ensure_indexes(database)
    ensure_collections(database)

    app.config.update(
        AUTH_SETTINGS=app_settings,
        MONGO_CLIENT=mongo_client,
        MONGO_DB=database,
        DISABLE_AUTH=disable_auth,
    )

    # Pass in one mongo doc that represents a transaction
    # The goal is to return a new dict that matches what the app expects
    def normalize_transactions(doc: Dict[str, Any]) -> Dict[str, Any]:
        # shallow copy of the doc, we dont change what is coming from mongo
        out = dict(doc)
        # all edits will go ingto out

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
        # 1. Check explicit override
        ov = (doc.get("overrides") or {})
        if isinstance(ov, dict) and ov.get("treatAs"):
            raw = str(ov["treatAs"]).strip().lower()
            return CATEGORY_ALIAS.get(raw, doc["overrides"]["treatAs"])

        # 2. Check primaryCategory
        if doc.get("primaryCategory"):
            raw = str(doc["primaryCategory"]).strip().lower()
            return CATEGORY_ALIAS.get(raw, doc["primaryCategory"])

        # 3. Check MCC mapping
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

        rate = float(rule.get("rate", base) or base)  # percent back as decimal, example 0.04
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

        # blended percent if over cap
        return (cap_val * rate + (spend - cap_val) * base) / spend





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

        rewards_payload = []
        for reward in data.get("rewards", []) or []:
            category = reward.get("category")
            rate = reward.get("rate")
            if not category or rate is None:
                continue
            reward_entry: Dict[str, Any] = {
                "category": str(category),
                "rate": float(rate),
            }
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
    def authenticate_request() -> None:
        # ✅ Always let CORS preflight through
        if request.method == "OPTIONS":
            return ("", 204)

        if app.config["DISABLE_AUTH"]:
            # ✅ Local dev user
            payload = {
                "sub": "dev|local",
                "email": "dev@local",
                "email_verified": True,
                "name": "Dev User",
            }
            g.current_token = payload
            g.current_user = get_or_create_user(database["users"], payload)
            return

        # Normal Auth0 path
        payload = decode_token(app.config["AUTH_SETTINGS"])
        g.current_token = payload
        g.current_user = get_or_create_user(database["users"], payload)

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

    @api_bp.get("/spend/summary")
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

    @api_bp.get("/money-moments")
    def money_moments():
        user = g.current_user
        window_days = parse_window_days(30)
        card_object_ids = parse_card_ids_query()

        txns = load_transactions(database, user["_id"], window_days, card_object_ids)
        moments = list(calculate_money_moments(window_days, txns))
        return jsonify(moments)

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
            return jsonify(
                {
                    "mix": normalized_mix,
                    "monthly_spend": round(monthly_total, 2),
                    "windowDays": window_days,
                    "cards": [],
                    "explanation": "",
                }
            )

        catalog_cards = list(database["credit_cards"].find({"active": True}))
        if not catalog_cards:
            return jsonify(
                {
                    "mix": normalized_mix,
                    "monthly_spend": round(monthly_total, 2),
                    "windowDays": window_days,
                    "cards": [],
                    "explanation": "",
                }
            )

        scored_cards = score_catalog(catalog_cards, normalized_mix, monthly_total, window_days, limit=limit)

        explanation = ""
        if include_explain and scored_cards:
            top_names = [card.get("product_name") for card in scored_cards[:3] if card.get("product_name")]
            if top_names:
                explanation = explain_recommendations(normalized_mix, top_names)

        return jsonify(
            {
                "mix": normalized_mix,
                "monthly_spend": round(monthly_total, 2),
                "windowDays": window_days,
                "cards": scored_cards,
                "explanation": explanation,
            }
        )

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

            account_matchers: List[Any] = []
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

            account_updates = {
                "issuer": issuer_name,
                "network": product.get("network"),
                "nickname": product_name,
                "card_product_id": product_id,
                "card_product_slug": product.get("slug"),
                "status": "Applied",
                "applied_at": now,
                "updated_at": now,
            }

            if existing_account:
                database["accounts"].update_one(
                    {"_id": existing_account["_id"]},
                    {"$set": account_updates, "$setOnInsert": {"created_at": existing_account.get("created_at", now)}},
                )
            else:
                account_document = {
                    "userId": user["_id"],
                    "account_type": "credit_card",
                    "issuer": issuer_name,
                    "network": product.get("network"),
                    "nickname": product_name,
                    "account_mask": "",
                    "card_product_id": product_id,
                    "card_product_slug": product.get("slug"),
                    "status": "Applied",
                    "applied_at": now,
                    "created_at": now,
                    "updated_at": now,
                }
                database["accounts"].insert_one(account_document)

            database["mandates"].update_one(
                {"_id": mandate["_id"]},
                {"$set": {"status": "executed", "updated_at": now}},
            )

            return jsonify({"id": mandate_id, "status": "executed", "result": "card_applied"})

        raise BadRequest("no executor for this mandate")

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

        return (
            jsonify({"status": "ok", "applicationId": str(result.inserted_id)}),
            201,
        )

    @api_bp.post("/chat")
    def chat_with_finbot():
        user = g.current_user
        payload = request.get_json(force=True) or {}

        new_message = payload.get("newMessage")
        if not isinstance(new_message, str) or not new_message.strip():
            raise BadRequest("newMessage is required")
        message_text = new_message.strip()

        history_payload = payload.get("history")
        history: List[Dict[str, str]] = []
        if isinstance(history_payload, list):
            for entry in history_payload[-20:]:
                if not isinstance(entry, dict):
                    continue
                author = entry.get("author")
                content = entry.get("content")
                if author not in ("user", "assistant"):
                    continue
                if not isinstance(content, str) or not content.strip():
                    continue
                history.append(
                    {
                        "author": author,
                        "content": content.strip(),
                        "timestamp": entry.get("timestamp"),
                    }
                )

        window_days = 90
        mix, total_spend, _ = compute_user_mix(database, user["_id"], window_days, None)

        if total_spend > 0 and window_days > 0:
            monthly_total = (total_spend / window_days) * 30
        elif mix:
            monthly_total = 1000.0
        else:
            monthly_total = 0.0

        recommendations: List[Dict[str, Any]] = []
        if mix and monthly_total > 0:
            catalog_cards = list(database["credit_cards"].find({"active": True}))
            if catalog_cards:
                scored = score_catalog(
                    catalog_cards,
                    mix,
                    monthly_total,
                    window_days,
                    limit=3,
                )
                for card in scored[:3]:
                    recommendations.append(
                        {
                            "product_name": card.get("product_name"),
                            "issuer": card.get("issuer"),
                            "net": card.get("net"),
                            "slug": card.get("slug"),
                        }
                    )

        response_text = generate_chat_response(mix, recommendations, history, message_text)
        timestamp = datetime.utcnow().isoformat(timespec="seconds") + "Z"

        return jsonify({"reply": response_text, "timestamp": timestamp})

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
        
        return jsonify({
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
                    "account_type": card.get("account_type", "N/A")
                }
                for card in all_cards[:10]  # Limit to first 10 for debugging
            ],
            "user_cards": [format_card_row(card) for card in user_cards]
        })

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
        except:
            raise BadRequest("Invalid card_id format")
            
        # Find the card
        card = database["accounts"].find_one({
            "_id": card_object_id,
            "account_type": "credit_card"
        })
        
        if not card:
            raise NotFound("Card not found")
            
        # Update the card to belong to the current user
        database["accounts"].update_one(
            {"_id": card_object_id},
            {
                "$set": {
                    "userId": user["_id"],
                    "updated_at": datetime.utcnow()
                }
            }
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
            value = mapped_payload.get(key if field != "mask" else "account_mask")
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
        try:
            # Immediately backfill this new account with lively synthetic history
            from mock_transactions import generate_mock_transactions
            generate_mock_transactions(
                database,
                str(user["_id"]),
                str(result.inserted_id),
                N=15,          # tweak for hackathon feel
                days=60,        # last 60 days
                seed_version="v1",
            )
        except Exception as e:
            # don't fail card creation if mock generation hiccups
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
            product = database["credit_cards"].find_one({"issuer": card.get("issuer"), "product_name": card.get("nickname")})
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

        # read inputs from JSON (POST) or query params (GET)
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            merchant = (data.get("merchant") or "").strip()
            spend = float(data.get("assumedMonthlySpend") or 150)
            selected_ids = data.get("selectedCardIds") or []
        else:
            merchant = (request.args.get("merchant") or "").strip()
            spend = float(request.args.get("spend") or 150)
            selected_ids = request.args.getlist("selectedCardIds")

        if not merchant:
            raise BadRequest("merchant is required")

        # normalize merchant -> category
        m = database["merchants"].find_one({"$or":[{"name":merchant},{"aliases":merchant},{"slug":merchant.lower()}]})
        if not m:
            raise NotFound("Merchant not found")
        category = normalize_merchant_category(m)

        # user cards + products
        pipeline = [
            {"$match": {"userId": user["_id"], "account_type": "credit_card"}},
            {"$lookup": {"from":"credit_cards","localField":"card_product_id","foreignField":"slug","as":"product"}},
            {"$unwind": "$product"},
        ]
        # optional filter by selected ids
        try:
            obj_ids = [ObjectId(x) for x in selected_ids] if selected_ids else []
            if obj_ids:
                pipeline.insert(0, {"$match": {"_id": {"$in": obj_ids}}})
        except Exception:
            pass

        owned_rows = list(database["accounts"].aggregate(pipeline))

        # score owned
        owned = []
        for row in owned_rows:
            prod = row["product"]
            pct = float(earn_percent_for_product(prod, category, spend))
            owned.append({
                "accountId": str(row["_id"]),
                "nickname": row.get("nickname") or prod.get("product_name"),
                "issuer": row.get("issuer") or prod.get("issuer"),
                "rewardRateText": f"{int(round(pct*100))}% {category}",
                "percentBack": pct,
            })
        best_owned = max(owned, key=lambda x: x["percentBack"]) if owned else None
        best_owned_pct = float(best_owned["percentBack"]) if best_owned else 0.0

        # alternatives not owned
        owned_slugs = {row["product"]["slug"] for row in owned_rows}
        alts = []
        for prod in database["credit_cards"].find({"active": True, "slug": {"$nin": list(owned_slugs)}}):
            pct = float(earn_percent_for_product(prod, category, spend))
            diff = max(0.0, pct - best_owned_pct)
            est = round(diff * spend, 2) if spend else None
            alts.append({
                "id": prod.get("slug"),
                "name": prod.get("product_name"),
                "issuer": prod.get("issuer"),
                "rewardRateText": f"{int(round(pct*100))}% {category}",
                "percentBack": pct,
                "estSavingsMonthly": est,
            })
        alts.sort(key=lambda x: x["percentBack"], reverse=True)
        alts = sorted(alts, key=lambda x: x["percentBack"], reverse=True)[:3]

        return jsonify({
            "merchant": m.get("name"),
            "category": category,
            "assumedMonthlySpend": spend,
            "bestOwned": best_owned,
            "youHaveThisCard": bool(best_owned),
            "alternatives": alts
        })
    
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

        # call your generator (expects strings; pass ObjectIds as strings)
        inserted = generate_mock_transactions(
            app.config["MONGO_DB"],
            str(user["_id"]),
            str(account_oid),
            N=N,
            days=days,
            seed_version=seed_version,
        )
        return jsonify({"ok": True, "inserted": inserted})




    app.register_blueprint(api_bp)

    


    return app


if __name__ == "__main__":
    # Create and run the Flask app directly (use Flask CLI in production)
    app = create_app()
    port = int(os.environ.get("PORT", "8000"))
    debug = os.environ.get("FLASK_DEBUG", "1") in ("1", "true", "True")
    app.run(host="0.0.0.0", port=port, debug=debug)