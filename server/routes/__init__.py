"""Blueprint factory for API routes."""

from flask import Blueprint

from .applications import register_application_routes
from .auth import register_auth_routes
from .cards import register_card_routes
from .catalog import register_catalog_routes
from .chat import register_chat_routes
from .recommendations import register_recommendation_routes
from .rewards import register_reward_routes
from .spend import register_spend_routes


def create_api_blueprint(database) -> Blueprint:
    bp = Blueprint("api", __name__, url_prefix="/api")

    register_auth_routes(bp, database)
    register_spend_routes(bp, database)
    register_catalog_routes(bp, database)
    register_recommendation_routes(bp, database)
    register_application_routes(bp, database)
    register_chat_routes(bp, database)
    register_reward_routes(bp, database)
    register_card_routes(bp, database)

    return bp
