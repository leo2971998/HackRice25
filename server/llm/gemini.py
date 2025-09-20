"""Gemini helper utilities for generating explanations."""

from __future__ import annotations

import os
from typing import Dict, Iterable, List, Sequence

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


def _format_spend_mix(spend_mix: Dict[str, float]) -> str:
    if not spend_mix:
        return "No recent spend mix available."
    parts = []
    for category, share in sorted(spend_mix.items(), key=lambda item: item[1], reverse=True):
        parts.append(f"{category}: {share * 100:.1f}%")
    return ", ".join(parts)


def _format_recommendations(recommendations: Sequence[Dict[str, object]]) -> str:
    if not recommendations:
        return "No personalized card recommendations yet."
    lines: List[str] = []
    for card in recommendations:
        name = str(card.get("product_name") or card.get("slug") or "Card")
        issuer = card.get("issuer")
        net_value = card.get("net")
        highlight = card.get("highlights")
        summary_bits = [name]
        if issuer:
            summary_bits.append(f"by {issuer}")
        if isinstance(net_value, (int, float)):
            summary_bits.append(f"est. net ${float(net_value):,.0f}/yr")
        if isinstance(highlight, list) and highlight:
            summary_bits.append(f"key perk: {highlight[0]}")
        lines.append(" • ".join(summary_bits))
    return "\n".join(lines)


def _build_chat_payload(system_prompt: str, history: Sequence[Dict[str, str]], new_message: str) -> Dict[str, object]:
    contents: List[Dict[str, object]] = []
    for message in history:
        author = message.get("author")
        content = message.get("content")
        if not content:
            continue
        role = "user" if author == "user" else "model"
        contents.append({"role": role, "parts": [{"text": str(content)}]})
    contents.append({"role": "user", "parts": [{"text": new_message}]})

    return {
        "system_instruction": {"parts": [{"text": system_prompt}]},
        "contents": contents,
    }


def generate_chat_response(
    user_spend_mix: Dict[str, float],
    recommendations: Sequence[Dict[str, object]],
    history: Sequence[Dict[str, str]],
    new_message: str,
) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Chat is currently unavailable."

    spend_mix_text = _format_spend_mix(user_spend_mix)
    recommendations_text = _format_recommendations(recommendations)

    system_prompt = (
        "You are FinBot, a friendly assistant for the Swipe Coach app."
        " Help users make sense of their spending and card recommendations."
        " Do not provide financial advice or instructions that require a professional."
        " Keep responses concise, specific, and easy to scan.\n\n"
        "User context:\n"
        f"• Spending mix (last 90 days): {spend_mix_text}\n"
        f"• Top card recommendations: {recommendations_text}\n\n"
        "Respond in a helpful, encouraging tone."
    )

    payload = _build_chat_payload(system_prompt, history, new_message)

    try:
        response = requests.post(_build_endpoint(api_key), json=payload, timeout=20)
        response.raise_for_status()
    except requests.RequestException:
        return "I’m still syncing your finances—try again in a moment."

    try:
        data = response.json()
    except ValueError:
        return "I had trouble reading that response. Please try again."

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        return "I didn’t catch that—mind asking again?"

    return text or "Let’s try that again with a different question."

