from __future__ import annotations

import json
from typing import Any, Dict, Iterable, List

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from .schemas import ConversationMessage


def extract_text(payload: Any) -> str:
    """Best-effort conversion of model/tool payloads to plain text."""
    if payload is None:
        return ""
    content = getattr(payload, "content", payload)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        fragments: List[str] = []
        for part in content:
            if isinstance(part, str):
                fragments.append(part)
            elif isinstance(part, dict):
                if part.get("type") == "text" and part.get("text"):
                    fragments.append(str(part["text"]))
            else:
                text_part = getattr(part, "text", None)
                if text_part:
                    fragments.append(str(text_part))
        return "".join(fragments)
    if isinstance(content, dict):
        text_value = content.get("text")
        if isinstance(text_value, str):
            return text_value
    return str(content)


def normalise_for_json(value: Any) -> Any:
    """Ensure complex tool payloads can be serialised."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [normalise_for_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): normalise_for_json(val) for key, val in value.items()}
    if hasattr(value, "model_dump"):
        return normalise_for_json(value.model_dump())
    if hasattr(value, "dict"):
        return normalise_for_json(value.dict())
    try:
        return json.loads(value) if isinstance(value, str) else str(value)
    except (TypeError, ValueError):
        return str(value)


def serialise_langchain_messages(raw_messages: Iterable[Any]) -> List[ConversationMessage]:
    serialised: List[ConversationMessage] = []
    pending_tools: Dict[str, ConversationMessage] = {}

    for item in raw_messages:
        if isinstance(item, HumanMessage):
            content = extract_text(item).strip()
            if content:
                serialised.append(
                    ConversationMessage(kind="message", role="user", content=content)
                )
        elif isinstance(item, AIMessage):
            content = extract_text(item).strip()
            if content:
                serialised.append(
                    ConversationMessage(kind="message", role="assistant", content=content)
                )
            tool_calls = getattr(item, "tool_calls", None) or item.additional_kwargs.get("tool_calls")
            if tool_calls:
                for call in tool_calls:
                    call_name = call.get("name") or "tool"
                    call_id = call.get("id") or f"{call_name}-{len(pending_tools)}"
                    call_args = normalise_for_json(call.get("args"))
                    message = ConversationMessage(
                        kind="tool",
                        role="tool",
                        tool_name=call_name,
                        tool_status="start",
                        tool_call_id=call_id,
                        tool_input=call_args,
                    )
                    serialised.append(message)
                    pending_tools[call_id] = message
        elif isinstance(item, ToolMessage):
            call_id = getattr(item, "tool_call_id", None) or ""
            tool_name = getattr(item, "name", None) or "tool"
            normalised_output = normalise_for_json(item.content)
            content = extract_text(item).strip()
            if call_id and call_id in pending_tools:
                start_message = pending_tools.pop(call_id)
                start_message.tool_status = "complete"
                start_message.tool_output = normalised_output
                start_message.tool_name = tool_name or start_message.tool_name
                if content:
                    start_message.content = content
            else:
                serialised.append(
                    ConversationMessage(
                        kind="tool",
                        role="tool",
                        content=content,
                        tool_name=tool_name,
                        tool_status="complete",
                        tool_call_id=call_id or None,
                        tool_output=normalised_output,
                    )
                )
    return serialised
