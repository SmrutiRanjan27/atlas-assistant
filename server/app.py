import inspect
import json
import os
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID, uuid4

import asyncpg
from contextlib import AsyncExitStack

from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from pydantic import BaseModel

from search_agent.agent import compile_agent, create_async_postgres_checkpointer

app = FastAPI()
app.state.search_agent = None
app.state.checkpointer = None
app.state.resource_stack = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type"],
)

DATABASE_URL = os.getenv("DATABASE_URL")
POOL_MIN_SIZE = int(os.getenv("DB_POOL_MIN_SIZE", "1"))
POOL_MAX_SIZE = int(os.getenv("DB_POOL_MAX_SIZE", "5"))
DEFAULT_TITLE = "New Chat"


class ChatRequest(BaseModel):
    message: str
    checkpoint_id: Optional[str] = None


class ConversationCreateRequest(BaseModel):
    title: Optional[str] = None


class ConversationSummary(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ConversationMessage(BaseModel):
    kind: Literal["message", "tool"]
    role: Literal["user", "assistant", "tool"]
    content: str = ""
    tool_name: Optional[str] = None
    tool_status: Optional[Literal["start", "complete", "error"]] = None
    tool_call_id: Optional[str] = None
    tool_input: Optional[Any] = None
    tool_output: Optional[Any] = None


class ConversationDetail(ConversationSummary):
    messages: List[ConversationMessage]


async def _init_conversation_table(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id UUID PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            """
        )


async def _get_db_pool() -> asyncpg.Pool:
    pool: Optional[asyncpg.Pool] = getattr(app.state, "db_pool", None)
    if pool is None:
        raise RuntimeError("Database pool has not been initialised.")
    return pool


@app.on_event("startup")
async def startup_event() -> None:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL must be configured in the environment for persistence.")

    app.state.resource_stack = AsyncExitStack()

    app.state.db_pool = await asyncpg.create_pool(
        DATABASE_URL,
        min_size=POOL_MIN_SIZE,
        max_size=POOL_MAX_SIZE,
    )
    await _init_conversation_table(app.state.db_pool)

    checkpointer = await app.state.resource_stack.enter_async_context(
        create_async_postgres_checkpointer(DATABASE_URL)
    )
    app.state.search_agent = compile_agent(checkpointer)
    app.state.checkpointer = checkpointer


@app.on_event("shutdown")
async def shutdown_event() -> None:
    pool: Optional[asyncpg.Pool] = getattr(app.state, "db_pool", None)
    if pool is not None:
        await pool.close()
    resource_stack: Optional[AsyncExitStack] = getattr(app.state, "resource_stack", None)
    if resource_stack is not None:
        await resource_stack.aclose()
        app.state.resource_stack = None
    app.state.search_agent = None
    app.state.checkpointer = None


def _extract_text(payload: Any) -> str:
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


def _normalise_for_json(value: Any) -> Any:
    """Ensure complex tool payloads can be serialised."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_normalise_for_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _normalise_for_json(val) for key, val in value.items()}
    if hasattr(value, "model_dump"):
        return _normalise_for_json(value.model_dump())
    if hasattr(value, "dict"):
        return _normalise_for_json(value.dict())
    try:
        return json.loads(value) if isinstance(value, str) else str(value)
    except (TypeError, ValueError):
        return str(value)


async def _ensure_conversation(pool: asyncpg.Pool, conversation_id: str, title: Optional[str] = None) -> None:
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT 1 FROM conversations WHERE id = $1", conversation_id)
        if existing:
            return
        await conn.execute(
            "INSERT INTO conversations (id, title) VALUES ($1, $2)",
            conversation_id,
            title or DEFAULT_TITLE,
        )


async def _maybe_update_title(pool: asyncpg.Pool, conversation_id: str, message: str) -> None:
    trimmed = (message or "").strip()
    if not trimmed:
        return
    suggested = trimmed[:80]
    async with pool.acquire() as conn:
        current_title = await conn.fetchval("SELECT title FROM conversations WHERE id = $1", conversation_id)
        if current_title and current_title != DEFAULT_TITLE:
            return
        await conn.execute(
            "UPDATE conversations SET title = $2, updated_at = NOW() WHERE id = $1",
            conversation_id,
            suggested,
        )


async def _touch_conversation(pool: asyncpg.Pool, conversation_id: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
            conversation_id,
        )


async def _list_conversations(pool: asyncpg.Pool) -> List[ConversationSummary]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, title, created_at, updated_at
            FROM conversations
            ORDER BY updated_at DESC
            """
        )
    return [
        ConversationSummary(
            id=str(row["id"]),
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        for row in rows
    ]


async def _get_conversation(pool: asyncpg.Pool, conversation_id: str) -> Optional[ConversationSummary]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, title, created_at, updated_at FROM conversations WHERE id = $1",
            conversation_id,
        )
    if not row:
        return None
    return ConversationSummary(
        id=str(row["id"]),
        title=row["title"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


async def _delete_conversation_record(pool: asyncpg.Pool, conversation_id: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM conversations WHERE id = $1", conversation_id)


async def _delete_conversation_state(conversation_id: str) -> None:
    agent = getattr(app.state, "search_agent", None)
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
        pass


async def _fetch_conversation_messages(conversation_id: str) -> List[ConversationMessage]:
    agent = getattr(app.state, "search_agent", None)
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

    serialised: List[ConversationMessage] = []
    pending_tools: Dict[str, ConversationMessage] = {}
    for item in raw_messages:
        if isinstance(item, HumanMessage):
            content = _extract_text(item).strip()
            if content:
                serialised.append(
                    ConversationMessage(kind="message", role="user", content=content)
                )
        elif isinstance(item, AIMessage):
            content = _extract_text(item).strip()
            if content:
                serialised.append(
                    ConversationMessage(kind="message", role="assistant", content=content)
                )
            tool_calls = getattr(item, "tool_calls", None) or item.additional_kwargs.get("tool_calls")
            if tool_calls:
                for call in tool_calls:
                    call_name = call.get("name") or "tool"
                    call_id = call.get("id") or f"{call_name}-{len(pending_tools)}"
                    call_args = _normalise_for_json(call.get("args"))
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
            normalised_output = _normalise_for_json(item.content)
            content = _extract_text(item).strip()
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


async def generate_chat_responses(message: str, checkpoint_id: Optional[str] = None):
    agent = getattr(app.state, "search_agent", None)
    if agent is None:
        raise RuntimeError("Search agent is not initialised.")
    pool = await _get_db_pool()
    new_conversation = False

    if checkpoint_id is None:
        checkpoint_id = str(uuid4())
        new_conversation = True

    await _ensure_conversation(pool, checkpoint_id)

    if new_conversation:
        yield json.dumps(
            {
                "type": "checkpoint",
                "checkpoint_id": checkpoint_id,
            }
        )

    await _maybe_update_title(pool, checkpoint_id, message)

    config = {
        "configurable": {
            "thread_id": checkpoint_id,
        }
    }

    events = agent.astream_events(
        {
            "messages": [HumanMessage(content=message)],
        },
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
            chunk_text = _extract_text(data.get("chunk"))
            if chunk_text:
                accumulated_response.append(chunk_text)
                yield json.dumps(
                    {
                        "type": "response_chunk",
                        "text": chunk_text,
                        "checkpoint_id": checkpoint_id,
                    }
                )
            continue

        if event_type == "on_chat_model_end" and node_name == "chatbot":
            final_text = _extract_text(data.get("output") or data.get("outputs"))
            if not final_text:
                final_text = "".join(accumulated_response)
            final_text = final_text or ""
            if final_text.strip():
                yield json.dumps(
                    {
                        "type": "final_response",
                        "text": final_text,
                        "checkpoint_id": checkpoint_id,
                    }
                )
            final_response_sent = True
            await _touch_conversation(pool, checkpoint_id)
            continue

        if event_type == "on_tool_start":
            tool_name = event.get("name") or node_name
            tool_input = _normalise_for_json(data.get("input"))
            yield json.dumps(
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
            tool_output = _normalise_for_json(getattr(tool_output_raw, "content", tool_output_raw))
            yield json.dumps(
                {
                    "type": "tool_result",
                    "tool_name": tool_name,
                    "output": tool_output,
                    "checkpoint_id": checkpoint_id,
                }
            )
            await _touch_conversation(pool, checkpoint_id)
            continue

        if event_type == "on_chain_error":
            error_payload = data.get("error") or data.get("exception") or "Unknown error"
            yield json.dumps(
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
            await _touch_conversation(pool, checkpoint_id)
            yield json.dumps(
                {
                    "type": "final_response",
                    "text": final_text,
                    "checkpoint_id": checkpoint_id,
                }
            )

    yield json.dumps(
        {
            "type": "done",
            "checkpoint_id": checkpoint_id,
        }
    )


@app.post("/chat/stream")
async def stream_chat_responses(request: ChatRequest):
    async def event_stream():
        async for payload in generate_chat_responses(request.message, request.checkpoint_id):
            yield f"{payload}\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
    )


@app.post("/conversations", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
async def create_conversation(request: ConversationCreateRequest) -> ConversationSummary:
    pool = await _get_db_pool()
    conversation_id = str(uuid4())
    title = request.title.strip() if request.title else DEFAULT_TITLE
    await _ensure_conversation(pool, conversation_id, title=title)
    summary = await _get_conversation(pool, conversation_id)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create conversation.")
    return summary


@app.get("/conversations", response_model=List[ConversationSummary])
async def list_conversations() -> List[ConversationSummary]:
    pool = await _get_db_pool()
    return await _list_conversations(pool)


@app.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: UUID) -> ConversationDetail:
    pool = await _get_db_pool()
    conversation_id_str = str(conversation_id)
    summary = await _get_conversation(pool, conversation_id_str)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    messages = await _fetch_conversation_messages(conversation_id_str)
    return ConversationDetail(
        id=summary.id,
        title=summary.title,
        created_at=summary.created_at,
        updated_at=summary.updated_at,
        messages=messages,
    )


@app.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: UUID) -> Response:
    pool = await _get_db_pool()
    conversation_id_str = str(conversation_id)
    summary = await _get_conversation(pool, conversation_id_str)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    await _delete_conversation_record(pool, conversation_id_str)
    await _delete_conversation_state(conversation_id_str)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
