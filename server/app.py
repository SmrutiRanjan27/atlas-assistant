from __future__ import annotations

from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any, AsyncGenerator, List, Optional
from uuid import UUID, uuid4

import asyncpg
from fastapi import FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from search_agent.agent import compile_agent, create_async_postgres_checkpointer

from core import (
    ChatRequest,
    ConversationCreateRequest,
    ConversationDetail,
    ConversationRepository,
    ConversationSummary,
    Settings,
)
from services.chat import (
    ChatService,
    delete_conversation_state,
    fetch_conversation_messages,
)


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    settings = Settings.load()
    resource_stack = AsyncExitStack()
    pool: Optional[asyncpg.Pool] = None

    try:
        pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=settings.pool_min_size,
            max_size=settings.pool_max_size,
        )
        conversations = ConversationRepository(pool, settings.default_title)
        await conversations.initialise()

        checkpointer = await resource_stack.enter_async_context(
            create_async_postgres_checkpointer(settings.database_url)
        )
        agent = compile_agent(checkpointer)
        chat_service = ChatService(agent, conversations)

        application.state.settings = settings
        application.state.resource_stack = resource_stack
        application.state.db_pool = pool
        application.state.conversations = conversations
        application.state.checkpointer = checkpointer
        application.state.search_agent = agent
        application.state.chat_service = chat_service

        yield
    finally:
        if hasattr(application.state, "chat_service"):
            application.state.chat_service = None
        if hasattr(application.state, "search_agent"):
            application.state.search_agent = None
        if hasattr(application.state, "checkpointer"):
            application.state.checkpointer = None
        if hasattr(application.state, "conversations"):
            application.state.conversations = None
        if hasattr(application.state, "db_pool"):
            application.state.db_pool = None
        if hasattr(application.state, "resource_stack"):
            application.state.resource_stack = None
        if hasattr(application.state, "settings"):
            application.state.settings = None

        if pool is not None:
            try:
                await pool.close()
            except Exception:
                pass

        try:
            await resource_stack.aclose()
        except Exception:
            pass


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type"],
)


def _get_chat_service() -> ChatService:
    service = getattr(app.state, "chat_service", None)
    if service is None:
        raise RuntimeError("Chat service is not initialised.")
    return service


def _get_conversation_repository() -> ConversationRepository:
    repository = getattr(app.state, "conversations", None)
    if repository is None:
        raise RuntimeError("Conversation repository is not initialised.")
    return repository


def _get_search_agent() -> Any:
    agent = getattr(app.state, "search_agent", None)
    if agent is None:
        raise RuntimeError("Search agent is not initialised.")
    return agent


def _get_settings() -> Settings:
    settings = getattr(app.state, "settings", None)
    if settings is None:
        raise RuntimeError("Application settings are not initialised.")
    return settings


@app.post("/chat/stream")
async def stream_chat_responses(request: ChatRequest):
    chat_service = _get_chat_service()

    async def event_stream():
        async for payload in chat_service.stream_responses(request.message, request.checkpoint_id):
            yield f"{payload}\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
    )


@app.post("/conversations", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
async def create_conversation(request: ConversationCreateRequest) -> ConversationSummary:
    repository = _get_conversation_repository()
    settings = _get_settings()
    conversation_id = str(uuid4())
    title = request.title.strip() if request.title else settings.default_title

    await repository.ensure(conversation_id, title=title)
    summary = await repository.get(conversation_id)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create conversation.")
    return summary


@app.get("/conversations", response_model=List[ConversationSummary])
async def list_conversations() -> List[ConversationSummary]:
    repository = _get_conversation_repository()
    return await repository.list()


@app.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: UUID) -> ConversationDetail:
    repository = _get_conversation_repository()
    agent = _get_search_agent()
    conversation_id_str = str(conversation_id)

    summary = await repository.get(conversation_id_str)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    messages = await fetch_conversation_messages(agent, conversation_id_str)
    return ConversationDetail(
        id=summary.id,
        title=summary.title,
        created_at=summary.created_at,
        updated_at=summary.updated_at,
        messages=messages,
    )


@app.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: UUID) -> Response:
    repository = _get_conversation_repository()
    agent = _get_search_agent()
    conversation_id_str = str(conversation_id)

    summary = await repository.get(conversation_id_str)
    if summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    await repository.delete(conversation_id_str)
    await delete_conversation_state(agent, conversation_id_str)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
