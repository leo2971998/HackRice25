"""Gemini helper utilities for generating explanations."""

from __future__ import annotations

import os
from typing import Dict, Iterable

import requests


MODEL = "gemini-2.5-flash"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def _build_endpoint(api_key: str) -> str:
    return f"{BASE_URL}/{MODEL}:generateContent?key={api_key}"


def _format_prompt(user_mix: Dict[str, float], card_names: Iterable[str]) -> Dict[str, object]:
    cards_list = ", ".join(card_names)
    prompt_text = (
        "User category mix (percent of monthly spend): "
        f"{user_mix}. Give 3 short bullets explaining why these cards fit: "
        f"{cards_list}. Avoid exact APRs/terms; keep generic."
    )
    return {"contents": [{"parts": [{"text": prompt_text}]}]}


def explain_recommendations(user_mix: Dict[str, float], card_names: Iterable[str]) -> str:
    """Return a brief explanation for the recommended cards.

    The Gemini API is optional—if a key is not configured or the request fails we simply
    return an empty string so the deterministic scoring still works.
    """

    card_names = list(card_names)
    if not card_names:
        return ""

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return ""

    try:
        response = requests.post(
            _build_endpoint(api_key),
            json=_format_prompt(user_mix, card_names),
            timeout=15,
        )
        response.raise_for_status()
    except requests.RequestException:
        return ""

    try:
        data = response.json()
    except ValueError:
        return ""

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        return ""

    return text

