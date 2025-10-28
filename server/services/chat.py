from __future__ import annotations

import json
import inspect
from typing import Any, AsyncGenerator, Dict, List, Optional
from uuid import uuid4

from langchain_core.messages import HumanMessage

from core import (
    ConversationMessage,
    ConversationRepository,
    extract_text,
    normalise_for_json,
    serialise_langchain_messages,
)


class ChatService:
    def __init__(self, agent: Any, conversations: ConversationRepository) -> None:
        if agent is None:
            raise RuntimeError("Search agent must be initialised before use.")
        self._agent = agent
        self._conversations = conversations

    async def stream_responses(
        self, message: str, user_id: str, checkpoint_id: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        conversations = self._conversations
        agent = self._agent

        new_conversation = False
        if checkpoint_id is None:
            checkpoint_id = str(uuid4())
            new_conversation = True

        await conversations.ensure(checkpoint_id, user_id)

        if new_conversation:
            yield self._encode(
                {
                    "type": "checkpoint",
                    "checkpoint_id": checkpoint_id,
                }
            )

        await conversations.maybe_update_title(checkpoint_id, message)

        config = {"configurable": {"thread_id": checkpoint_id, "user_id": user_id}}
        events = agent.astream_events(
            {"messages": [HumanMessage(content=message)]},
            config,
            version="v2",
        )

        accumulated_response: List[str] = []
        final_response_sent = False

        async for event in events:
            event_type = event.get("event")
            metadata = event.get("metadata", {}) or {}
            data = event.get("data", {}) or {}
            node_name = metadata.get("langgraph_node") or metadata.get("node") or metadata.get("name")

            if event_type == "on_chat_model_stream" and node_name == "chatbot":
                chunk_text = extract_text(data.get("chunk"))
                if chunk_text:
                    accumulated_response.append(chunk_text)
                    yield self._encode(
                        {
                            "type": "response_chunk",
                            "text": chunk_text,
                            "checkpoint_id": checkpoint_id,
                        }
                    )
                continue

            if event_type == "on_chat_model_end" and node_name == "chatbot":
                final_text = extract_text(data.get("output") or data.get("outputs"))
                if not final_text:
                    final_text = "".join(accumulated_response)
                final_text = final_text or ""
                if final_text.strip():
                    yield self._encode(
                        {
                            "type": "final_response",
                            "text": final_text,
                            "checkpoint_id": checkpoint_id,
                        }
                    )
                final_response_sent = True
                await conversations.touch(checkpoint_id)
                continue

            if event_type == "on_tool_start":
                tool_name = event.get("name") or node_name
                tool_input = normalise_for_json(data.get("input"))
                yield self._encode(
                    {
                        "type": "tool_call",
                        "tool_name": tool_name,
                        "input": tool_input,
                        "checkpoint_id": checkpoint_id,
                    }
                )
                continue

            if event_type == "on_tool_end":
                tool_name = event.get("name") or node_name
                tool_output_raw = data.get("output") or data.get("outputs")
                tool_output = normalise_for_json(getattr(tool_output_raw, "content", tool_output_raw))
                yield self._encode(
                    {
                        "type": "tool_result",
                        "tool_name": tool_name,
                        "output": tool_output,
                        "checkpoint_id": checkpoint_id,
                    }
                )
                await conversations.touch(checkpoint_id)
                continue

            if event_type == "on_chain_error":
                error_payload = data.get("error") or data.get("exception") or "Unknown error"
                yield self._encode(
                    {
                        "type": "error",
                        "message": str(error_payload),
                        "checkpoint_id": checkpoint_id,
                    }
                )
                return

        if not final_response_sent and accumulated_response:
            final_text = "".join(accumulated_response)
            if final_text.strip():
                await conversations.touch(checkpoint_id)
                yield self._encode(
                    {
                        "type": "final_response",
                        "text": final_text,
                        "checkpoint_id": checkpoint_id,
                    }
                )

        yield self._encode(
            {
                "type": "done",
                "checkpoint_id": checkpoint_id,
            }
        )

    @staticmethod
    def _encode(payload: Dict[str, Any]) -> str:
        return json.dumps(payload)


async def fetch_conversation_messages(agent: Any, conversation_id: str) -> List[ConversationMessage]:
    if agent is None:
        return []

    config = {"configurable": {"thread_id": conversation_id}}
    state = None

    getter_async = getattr(agent, "aget_state", None)
    if callable(getter_async):
        try:
            state = await getter_async(config)
        except Exception:
            state = None

    if state is None:
        getter_sync = getattr(agent, "get_state", None)
        if callable(getter_sync):
            try:
                state = getter_sync(config)
            except Exception:
                state = None

    if state is None:
        return []

    if hasattr(state, "values"):
        raw_messages = state.values.get("messages")
    elif isinstance(state, dict):
        raw_messages = state.get("messages")
    else:
        raw_messages = None

    if not raw_messages:
        return []

    return serialise_langchain_messages(raw_messages)


async def delete_conversation_state(agent: Any, conversation_id: str) -> None:
    if agent is None:
        return
    config = {"configurable": {"thread_id": conversation_id}}
    try:
        delete_methods = [
            getattr(agent, "adelete_state", None),
            getattr(agent, "delete_state", None),
        ]
        for method in delete_methods:
            if callable(method):
                result = method(config)
                if inspect.isawaitable(result):
                    await result
                return

        checkpointer = getattr(agent, "checkpointer", None)
        if checkpointer:
            async_delete_thread = getattr(checkpointer, "adelete_thread", None)
            if callable(async_delete_thread):
                await async_delete_thread(conversation_id)
                return
            async_delete = getattr(checkpointer, "adelete", None)
            if callable(async_delete):
                await async_delete(config)
                return
            sync_delete_thread = getattr(checkpointer, "delete_thread", None)
            if callable(sync_delete_thread):
                sync_delete_thread(conversation_id)
                return
            sync_delete = getattr(checkpointer, "delete", None)
            if callable(sync_delete):
                sync_delete(config)
    except Exception:
        # Ignore checkpoint cleanup failures to avoid blocking API responses.
        return


async def delete_conversation_memories(agent: Any, conversation_id: str, user_id: str) -> None:
    """Best-effort removal of vector/kv memories scoped to this conversation.

    We store per-conversation memories under the namespace ("users", user_id, "memory", conversation_id).
    This attempts several likely deletion methods to support different store implementations.
    """
    if agent is None:
        return
    try:
        store = getattr(agent, "store", None)
        if not store:
            return
        ns = ("users", user_id, "memory", conversation_id)

        # Try namespaced deletion helpers first
        for method_name in ("adelete_namespace", "delete_namespace", "aclear_namespace", "clear_namespace"):
            method = getattr(store, method_name, None)
            if callable(method):
                result = method(ns)
                if inspect.isawaitable(result):
                    await result
                return

        # Fallback: iterate known keys returned by search and delete one-by-one
        search_method = getattr(store, "asearch", None) or getattr(store, "search", None)
        delete_method = getattr(store, "adelete", None) or getattr(store, "delete", None)
        if callable(search_method) and callable(delete_method):
            try:
                results = search_method(ns, query="", limit=1000)
                if inspect.isawaitable(results):
                    results = await results
                for item in results or []:
                    key = getattr(item, "key", None) or (item.get("key") if isinstance(item, dict) else None)
                    if key:
                        res = delete_method(ns, key)
                        if inspect.isawaitable(res):
                            await res
            except Exception:
                pass
    except Exception:
        # Ignore store cleanup failures to avoid blocking API responses.
        return
