"""
Gemini chat + intent router for Flow Coach.

- Returns structured payloads the chatbox renders:
    { "type": "best_card.result", ... }
    { "type": "insight.overspend" | "insight.delta" | "insight.subscriptions", ... }

- Or plain text:
    { "reply": "...", "timestamp": "..." }

- Also exposes `explain_recommendations` for your Recommendations UI.

Requires:
  * env GEMINI_API_KEY
  * tools.py defines TOOLS["get_best_card"], TOOLS["get_insights"] (using g.db, g.user_id)
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Tuple, Any

import requests

# --------- Config ---------
MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/models")
TIMEOUT_SEC = 20

def _endpoint(api_key: str) -> str:
    return f"{BASE_URL}/{MODEL}:generateContent?key={api_key}"

# --------- Helpers: formatting & safety ---------
PAN_PATTERN = re.compile(r"(?:\d[ -]?){13,19}")
def _luhn_valid(s: str) -> bool:
    digits = [int(c) for c in re.sub(r"\D", "", s)]
    if len(digits) < 13 or len(digits) > 19: return False
    total, parity = 0, len(digits) % 2
    for i, d in enumerate(digits):
        if i % 2 == parity:
            d *= 2
            if d > 9: d -= 9
        total += d
    return total % 10 == 0

def redact_pan(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        raw = m.group(0)
        if _luhn_valid(raw): return "[REDACTED CARD NUMBER]"
        return raw
    return PAN_PATTERN.sub(repl, text or "")

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _format_spend_mix(user_spend_mix: Dict[str, float]) -> str:
    if not user_spend_mix: return "No recent spending information."
    parts = []
    for cat, share in sorted(user_spend_mix.items(), key=lambda kv: kv[1], reverse=True):
        try:
            parts.append(f"{cat}: {float(share):.0%}")
        except Exception:
            parts.append(f"{cat}: {share}")
    return ", ".join(parts)

def _format_recommendations(recommendations: List[Dict[str, object]]) -> str:
    if not recommendations: return "No card recommendations available yet."
    lines = []
    for rec in recommendations:
        name = str(rec.get("product_name") or rec.get("slug") or "Card")
        issuer = rec.get("issuer")
        net = rec.get("net")
        net_txt = ""
        try:
            if net is not None:
                net_txt = f" · est. annual net ${float(net):,.0f}"
        except Exception:
            pass
        lines.append(f"- {name}{f' ({issuer})' if issuer else ''}{net_txt}")
    return "\n".join(lines)

def _build_chat_contents(system_prompt: str,
                         history: List[Dict[str, str]],
                         new_message: str,
                         context: Dict[str, object] | None) -> Dict[str, object]:
    conversation_lines: List[str] = []
    for entry in history:
        content = str(entry.get("content") or "").strip()
        if not content: continue
        author = entry.get("author")
        speaker = "User" if author == "user" else "FinBot"
        # Redact PANs in history to avoid echo
        conversation_lines.append(f"{speaker}: {redact_pan(content)[:2000]}")

    # keep context compact
    ctx_text = json.dumps(context or {}, separators=(",", ":"), ensure_ascii=False)
    if len(ctx_text) > 4000:
        ctx_text = ctx_text[:4000] + "…"

    pieces = [system_prompt.strip()]
    pieces.append(f"Context:\n{ctx_text}")
    if conversation_lines:
        pieces.append("Conversation so far:\n" + "\n".join(conversation_lines[-20:]))  # last 20 turns
    pieces.append(f"User: {redact_pan(new_message.strip())[:2000]}\nFinBot:")

    prompt_text = "\n\n".join(p for p in pieces if p)
    return {"contents": [{"parts": [{"text": prompt_text}]}]}

def _gemini_call(payload: Dict[str, Any]) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return "Flow Coach chat is currently unavailable."
    try:
        r = requests.post(_endpoint(api_key), json=payload, timeout=TIMEOUT_SEC)
        r.raise_for_status()
    except requests.RequestException:
        return "Flow Coach is momentarily offline. Please try again in a bit."
    try:
        data = r.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return text.strip()
    except Exception:
        return "Flow Coach did not catch that. Please rephrase."

def sanitize_llm_markdown(text: str) -> str:
    """Remove boilerplate like 'Here are 3 bullets…' but keep details."""
    if not text: return ""
    lines = text.splitlines()
    if lines:
        first = lines[0].strip().lower()
        if (first.startswith("here") or "bullet" in first) and len(first) < 120:
            lines = lines[1:]
    return "\n".join(lines).strip()

# --------- Public helper for Recommendations UI ---------
def explain_recommendations(user_mix: Dict[str, float], card_names: Iterable[str]) -> str:
    card_names = list(card_names)
    if not card_names:
        return ""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return ""
    cards_list = ", ".join(card_names)
    prompt_text = (
        "User category mix (percent of monthly spend): "
        f"{user_mix}. Give 3 short bullets explaining why these cards fit: "
        f"{cards_list}. Avoid exact APRs/terms; keep generic."
    )
    payload = {"contents": [{"parts": [{"text": prompt_text}]}]}
    try:
        r = requests.post(_endpoint(api_key), json=payload, timeout=15)
        r.raise_for_status()
        data = r.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return sanitize_llm_markdown(text)
    except Exception:
        return ""

# --------- Intent routing (tools) ----------
# Adjust this import path to your project layout:
from tools import TOOLS  # TOOLS["get_best_card"], TOOLS["get_insights"]

BEST_PAT  = re.compile(r"(best card|what card|where should i put)", re.I)
AMT_PAT   = re.compile(r"\$?\s*(\d+(?:\.\d{1,2})?)")
HEB_PAT   = re.compile(r"\b(H-?E-?B|HEB)\b", re.I)
OVER_PAT  = re.compile(r"\boverspend", re.I)
DELTA_PAT = re.compile(r"(changed.*last\s*30|last\s*30\s*days)", re.I)
SUBS_PAT  = re.compile(r"(subscriptions|annual burn)", re.I)

def _extract_amount(text: str) -> float:
    m = AMT_PAT.search(text)
    return float(m.group(1)) if m else 0.0

def _infer_merchant_category(text: str) -> Tuple[str | None, str | None]:
    """Minimal heuristics. Expand with your merchant rules if desired."""
    if HEB_PAT.search(text):
        return "H-E-B", "groceries"
    # add more patterns here…
    return None, None

# --------- Main chat entrypoint ----------
def generate_chat_response(
        user_spend_mix: Dict[str, float],
        recommendations: List[Dict[str, object]],
        history: List[Dict[str, str]],
        new_message: str,
        context: Dict[str, object] | None = None,
) -> Dict[str, Any]:
    """
    Returns either a structured payload (with 'type') or a plain text message:
      { "type": "best_card.result", ... }  OR  { "reply": "...", "timestamp": "..." }
    """
    text = (new_message or "").strip()

    # 0) Safety: redact card numbers from the incoming text before any logging
    text = redact_pan(text)

    # 1) Tool-able intents (stay inside Flow Coach chatbox as rich cards)
    if BEST_PAT.search(text):
        amount = _extract_amount(text)
        merchant, category = _infer_merchant_category(text)
        payload = TOOLS["get_best_card"]["fn"](merchant=merchant, category=category, amount=amount)
        # payload already includes {"type": "best_card.result", ...}
        return payload

    if OVER_PAT.search(text):
        return TOOLS["get_insights"]["fn"]("overspend", "MTD")

    if DELTA_PAT.search(text):
        return TOOLS["get_insights"]["fn"]("delta", "30d")

    if SUBS_PAT.search(text):
        return TOOLS["get_insights"]["fn"]("subscriptions", None)

    # 2) Plain LLM answer (contextualized by spend mix + recs)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"reply": "Flow Coach chat is currently unavailable.", "timestamp": _now_iso()}

    system_prompt = f"""
You are FinBot, a friendly assistant for the Swipe Coach app. Your goal is to help users understand their spending and card recommendations.
Do not provide financial advice. Keep responses concise and helpful.

User financial context (high level):
- Spending mix (last 90 days): {_format_spend_mix(user_spend_mix)}
- Top card recommendations:
{_format_recommendations(recommendations)}

Rules:
- If asked to choose a specific card for a single purchase, prefer calling the best-card tool (but we already route above).
- If asked for monthly changes or overspend reasons, prefer insights tools (already routed).
- Never echo or store full card numbers. If the user provides one, acknowledge and discard it.
"""

    payload = _build_chat_contents(system_prompt, history, text, context)
    reply_text = sanitize_llm_markdown(_gemini_call(payload))

    return {"reply": reply_text, "timestamp": _now_iso()}
