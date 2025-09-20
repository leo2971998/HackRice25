import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional, Tuple

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

from server.routes import register_home_routes, register_rewards_routes
from server.utils import parse_window_days, validate_object_id  # use shared utils

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

logger = logging.getLogger("server.app")


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
    users.create_index([("auth0_id", ASCENDING)], unique=True)
    users.create_index([("email", ASCENDING)], unique=True, sparse=True)

    accounts = database["accounts"]
    accounts.create_index([("userId", ASCENDING)])
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
        now = datetime.now(timezone.utc)
        new_user = {
            "auth0_id": auth0_id,
            "email": email,
            "name": name,
            "preferences": DEFAULT_PREFERENCES,
            "email_verified": email_verified,
            "created_at": now,
            "updated_at": now,
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
            updates["updated_at"] = datetime.now(timezone.utc)
            users.update_one({"_id": user_doc["_id"]}, {"$set": updates})
            user_doc.update(updates)

        if "preferences" not in user_doc:
            users.update_one({"_id": user_doc["_id"]}, {"$set": {"preferences": DEFAULT_PREFERENCES}})
            user_doc["preferences"] = DEFAULT_PREFERENCES

    if user_doc is None:
        raise Unauthorized("Unable to load profile")

    return user_doc


def validate_object_id_param(value: str) -> ObjectId:
    try:
        return validate_object_id(value)
    except Exception as exc:  # pragma: no cover
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
        "lastSynced": (
            last_sync.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
            if isinstance(last_sync, datetime) else None
        ),
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
                    "body": f"About {share:.0%} of your recent spending went to {top_category[0]}.",
                    "type": "alert",
                }
            )
        else:
            moments.append(
                {
                    "id": "moment-balance",
                    "title": "Nice balance",
                    "body": f"No single category dominated — {top_category[0]} was your largest area.",
                    "type": "win",
                }
            )

    avg_daily = total / window_days if window_days > 0 else 0
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
                "body": f"You visited {top_merchant[0]} {top_merchant[1]} times recently.",
                "type": "tip",
            }
        )

    return moments[:3]


def create_app() -> Flask:
    load_environment()
    app = Flask(__name__)

    # Logging (optional)
    if not logger.handlers:
        logging.basicConfig(level=logging.INFO)

    app_settings = get_auth_settings()

    CORS(
        app,
        resources={r"/api/*": {"origins": "*"}},
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization"],
        expose_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    )

    @app.before_request
    def _short_circuit_options():
        if request.method == "OPTIONS":
            return ("", 204)

    # ---- DB ----
    mongo_client = get_mongo_client()
    database = get_database(mongo_client)
    ensure_indexes(database)

    app.config.update(
        AUTH_SETTINGS=app_settings,
        MONGO_CLIENT=mongo_client,
        MONGO_DB=database,
    )

    api_bp = Blueprint("api", __name__, url_prefix="/api")

    # Explicit preflight responder so OPTIONS always returns 2xx
    @api_bp.route("/<path:_any>", methods=["OPTIONS"])
    def _preflight(_any):
        return ("", 204)

    # Auth (bypass OPTIONS)
    @api_bp.before_request
    def authenticate_request() -> None:
        if request.method == "OPTIONS":
            return
        payload = decode_token(app_settings)
        g.current_token = payload
        user_doc = get_or_create_user(database["users"], payload)
        g.current_user = user_doc

    # --- Mount your modular routes ---
    register_home_routes(api_bp, database)
    register_rewards_routes(api_bp, database)

    # -------- Core user + cards + moments --------
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
        updates["updated_at"] = datetime.now(timezone.utc)
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
        has_account = database["accounts"].count_documents({"userId": user["_id"], "account_type": "credit_card"}) > 0
        return jsonify({"hasAccount": has_account})

    @api_bp.post("/auth/resend-verification")
    def resend_verification():
        return ("", 204)

    @api_bp.get("/money-moments")
    def money_moments():
        user = g.current_user
        # Accept both ?window and ?windowDays
        window_days = parse_window_days(default_days=30)
        card_ids = request.args.getlist("cardIds")

        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
        txn_filter: Dict[str, Any] = {"userId": user["_id"], "date": {"$gte": cutoff}}

        if card_ids:
            try:
                object_ids = [validate_object_id(cid) for cid in card_ids]
                if object_ids:
                    txn_filter["accountId"] = {"$in": object_ids}
            except Exception:
                pass

        txns = list(database["transactions"].find(txn_filter))
        moments = list(calculate_money_moments(window_days, txns))
        return jsonify(moments)

    @api_bp.get("/cards")
    def list_cards():
        user = g.current_user
        cards = (
            database["accounts"]
            .find({"userId": user["_id"], "account_type": "credit_card"})
            .sort("nickname", ASCENDING)
        )
        output = []
        for card in cards:
            last4 = card.get("last4")
            mask = card.get("account_mask") or ""
            if not last4 and mask:
                digits = "".join(ch for ch in mask if ch.isdigit())
                last4 = digits[-4:] if digits else None
            output.append(
                {
                    "_id": str(card["_id"]),
                    "issuer": card.get("issuer", ""),
                    "nickname": card.get("nickname"),
                    "network": card.get("network"),
                    "last4": last4 or "",
                    "account_mask": mask or None,
                    "expiry_month": card.get("expiry_month"),
                    "expiry_year": card.get("expiry_year"),
                }
            )
        return jsonify(output)

    @api_bp.get("/cards/debug")
    def debug_cards():
        user = g.current_user
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
                    "userId": str(card.get("userId", "")),
                    "nickname": card.get("nickname"),
                    "issuer": card.get("issuer"),
                    "account_type": card.get("account_type"),
                } for card in all_cards[:10]
            ],
            "user_cards": [format_card_row(card) for card in user_cards],
        })

    @api_bp.post("/cards/import")
    def import_existing_card():
        user = g.current_user
        payload = request.get_json(silent=True) or {}
        card_id = payload.get("card_id")
        if not card_id:
            raise BadRequest("card_id is required")
        card_object_id = validate_object_id_param(card_id)

        card = database["accounts"].find_one({"_id": card_object_id, "account_type": "credit_card"})
        if not card:
            raise NotFound("Card not found")

        database["accounts"].update_one(
            {"_id": card_object_id},
            {"$set": {"userId": user["_id"], "updated_at": datetime.now(timezone.utc)}},
        )
        return jsonify({"id": str(card_object_id), "message": "Card imported successfully"}), 200

    def get_card_or_404(card_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
        card = database["accounts"].find_one(
            {"_id": validate_object_id_param(card_id), "userId": user["_id"], "account_type": "credit_card"}
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
        product = None
        if not detail.get("productName") and card.get("card_product_id"):
            product = database["credit_cards"].find_one({"_id": card.get("card_product_id")}) or \
                      database["credit_cards"].find_one({"product_id": card.get("card_product_id")})
        if not product and card.get("card_product_id"):
            product = database["credit_cards"].find_one({"card_product_id": card.get("card_product_id")})
        if not product:
            product = database["credit_cards"].find_one({"issuer": card.get("issuer"), "product_name": card.get("nickname")})
        if product:
            detail["productName"] = product.get("product_name")
            detail["features"] = product.get("features", [])
        window_days = 30
        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
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

    @api_bp.post("/cards")
    def add_card():
        user = g.current_user
        body = request.get_json(silent=True) or {}

        if "full_card_number" in body:
            return jsonify({"error": "Do not send full card number"}), 400

        issuer = body.get("issuer")
        last4 = body.get("last4")
        account_mask = body.get("account_mask")
        nickname = body.get("nickname")
        network = body.get("network")
        expiry_month = body.get("expiry_month")
        expiry_year = body.get("expiry_year")

        if not issuer or not last4 or not account_mask:
            return jsonify({"error": "issuer, last4, and account_mask are required"}), 400

        def _to_int_or_none(value):
            if value in (None, ""):
                return None
            try:
                return int(value)
            except (TypeError, ValueError):
                return None

        now = datetime.now(timezone.utc)
        document = {
            "userId": user["_id"],
            "account_type": "credit_card",
            "issuer": issuer,
            "nickname": nickname,
            "network": network,
            "last4": str(last4)[-4:],
            "account_mask": account_mask,
            "expiry_month": _to_int_or_none(expiry_month),
            "expiry_year": _to_int_or_none(expiry_year),
            "status": "active",
            "created_at": now,
            "updated_at": now,
        }

        result = database["accounts"].insert_one(document)
        created = {
            "_id": str(result.inserted_id),
            "issuer": issuer,
            "nickname": nickname,
            "network": network,
            "last4": str(last4)[-4:],
            "account_mask": account_mask,
            "expiry_month": document.get("expiry_month"),
            "expiry_year": document.get("expiry_year"),
        }
        return jsonify(created), 201

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
        updates["updated_at"] = datetime.now(timezone.utc)
        database["accounts"].update_one({"_id": card["_id"]}, {"$set": updates})
        card.update(updates)
        return jsonify(format_card_row(card))

    @api_bp.delete("/cards/<card_id>")
    def delete_card(card_id: str):
        user = g.current_user
        card = get_card_or_404(card_id, user)
        database["accounts"].delete_one({"_id": card["_id"]})
        return ("", 204)

    app.register_blueprint(api_bp)

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

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", "5001"))
    debug = os.environ.get("FLASK_DEBUG", "1") in ("1", "true", "True")
    app.run(host="0.0.0.0", port=port, debug=debug)
