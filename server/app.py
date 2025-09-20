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
from pymongo.errors import DuplicateKeyError
import requests
from werkzeug.exceptions import BadRequest, Forbidden, NotFound, Unauthorized

from llm.gemini import explain_recommendations
from services.scoring import score_catalog
from services.spend import aggregate_spend_details, build_category_rules, compute_user_mix, load_transactions

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
    users = database["users"]
    # Omit custom names so we don't conflict with existing auto names like `auth0_id_1`, `email_1`
    users.create_index([("auth0_id", ASCENDING)], unique=True)
    users.create_index([("email", ASCENDING)], unique=True, sparse=True)

    accounts = database["accounts"]
    accounts.create_index([("userId", ASCENDING)])
    # Match existing composite index EXACTLY (includes sparse + name)
    accounts.create_index(
        [("userId", ASCENDING), ("account_type", ASCENDING), ("account_mask", ASCENDING)],
        unique=True,
        sparse=True,
        name="userId_1_account_type_1_account_mask_1",
    )

    transactions = database["transactions"]
    transactions.create_index([("userId", ASCENDING), ("date", DESCENDING)])
    transactions.create_index([("userId", ASCENDING), ("accountId", ASCENDING), ("date", DESCENDING)])

    credit_cards = database["credit_cards"]
    credit_cards.create_index([("issuer", ASCENDING), ("network", ASCENDING)])
    credit_cards.create_index([("slug", ASCENDING)], unique=True, name="slug_1")

    merchants = database["merchants"]
    merchants.create_index([("name", ASCENDING)])
    merchants.create_index([("slug", ASCENDING)])


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

    app.config.update(
        AUTH_SETTINGS=app_settings,
        MONGO_CLIENT=mongo_client,
        MONGO_DB=database,
        DISABLE_AUTH=disable_auth,
    )

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
    app.register_blueprint(api_bp)

    


    return app


if __name__ == "__main__":
    # Create and run the Flask app directly (use Flask CLI in production)
    app = create_app()
    port = int(os.environ.get("PORT", "8000"))
    debug = os.environ.get("FLASK_DEBUG", "1") in ("1", "true", "True")
    app.run(host="0.0.0.0", port=port, debug=debug)