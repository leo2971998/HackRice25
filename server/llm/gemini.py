"""Gemini helper utilities for generating explanations."""

from __future__ import annotations

import os
from typing import Dict, Iterable, List

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


def _format_spend_mix(user_spend_mix: Dict[str, float]) -> str:
    if not user_spend_mix:
        return "No recent spending information."
    parts = []
    for category, share in sorted(user_spend_mix.items(), key=lambda item: item[1], reverse=True):
        try:
            percent = f"{float(share):.0%}"
        except (TypeError, ValueError):
            percent = str(share)
        parts.append(f"{category}: {percent}")
    return ", ".join(parts)


def _format_recommendations(recommendations: List[Dict[str, object]]) -> str:
    if not recommendations:
        return "No card recommendations available yet."

    lines = []
    for rec in recommendations:
        name = str(rec.get("product_name") or rec.get("slug") or "Card")
        issuer = rec.get("issuer")
        issuer_text = f" ({issuer})" if issuer else ""
        net = rec.get("net")
        net_text = ""
        try:
            net_value = float(net) if net is not None else None
        except (TypeError, ValueError):
            net_value = None
        if net_value is not None:
            net_text = f" · est. annual net ${net_value:,.0f}"
        lines.append(f"- {name}{issuer_text}{net_text}")
    return "\n".join(lines)


def _build_chat_contents(system_prompt: str, history: List[Dict[str, str]], new_message: str) -> Dict[str, object]:
    conversation_lines: List[str] = []
    for entry in history:
        content = str(entry.get("content") or "").strip()
        if not content:
            continue
        author = entry.get("author")
        speaker = "User" if author == "user" else "FinBot"
        conversation_lines.append(f"{speaker}: {content}")

    prompt_sections = [system_prompt.strip()]
    if conversation_lines:
        prompt_sections.append("Conversation so far:\n" + "\n".join(conversation_lines))
    prompt_sections.append(f"User: {new_message.strip()}\nFinBot:")

    prompt_text = "\n\n".join(section for section in prompt_sections if section)

    return {"contents": [{"parts": [{"text": prompt_text}]}]}


def generate_chat_response(
    user_spend_mix: Dict[str, float],
    recommendations: List[Dict[str, object]],
    history: List[Dict[str, str]],
    new_message: str,
) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Flow Coach chat is currently unavailable."

    system_prompt = f"""
You are FinBot, a friendly assistant for the Swipe Coach app. Your goal is to help users understand their spending and card recommendations.
Do not provide financial advice. Keep responses concise and helpful.

User financial context:
- Spending mix (last 90 days): {_format_spend_mix(user_spend_mix)}
- Top card recommendations:
{_format_recommendations(recommendations)}

If information is missing, acknowledge it and offer general guidance about how Swipe Coach can help.
"""

    try:
        response = requests.post(
            _build_endpoint(api_key),
            json=_build_chat_contents(system_prompt, history, new_message),
            timeout=20,
        )
        response.raise_for_status()
    except requests.RequestException:
        return "Flow Coach is momentarily offline. Please try again in a bit."

    try:
        data = response.json()
    except ValueError:
        return "Flow Coach couldn't process that just now."

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError, TypeError):
        return "Flow Coach didn't catch that—could you rephrase?"

    return text

