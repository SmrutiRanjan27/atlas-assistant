"""
Refactored main server application with improved structure
"""


from __future__ import annotations


from contextlib import AsyncExitStack, asynccontextmanager
from typing import AsyncGenerator, Optional


import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


from core import (
    ConversationRepository,
    Settings,
    UserRepository,
)
from dependencies import get_dependency_provider
from routes import auth, chat, conversations
from services.chat import ChatService
from services.agent_manager import AgentManager




@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager with proper dependency injection"""
    settings = Settings.load()
    resource_stack = AsyncExitStack()
    pool: Optional[asyncpg.Pool] = None
    provider = get_dependency_provider()


    try:
        # Initialize database connection pool
        pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=settings.pool_min_size,
            max_size=settings.pool_max_size,
        )
       
        # Initialize repositories
        users = UserRepository(pool)
        await users.initialise()
       
        conversations = ConversationRepository(pool, settings.default_title)
        await conversations.initialise()


        # Initialize LangGraph components with automatic refresh
        agent_manager = AgentManager(settings.database_url)
        resource_stack.push_async_callback(agent_manager.aclose)
        agent = await agent_manager.get_agent()


        # Initialize services
        chat_service = ChatService(
            agent,
            conversations,
            user_repository=users,
            agent_refresh=agent_manager.refresh_agent,
            on_agent_updated=provider.set_search_agent,
        )


        # Set up dependency injection
        provider.set_settings(settings)
        provider.set_user_repository(users)
        provider.set_conversation_repository(conversations)
        provider.set_search_agent(agent)
        provider.set_agent_manager(agent_manager)
        provider.set_chat_service(chat_service)


        # Store resource stack for cleanup
        application.state.resource_stack = resource_stack
        application.state.db_pool = pool


        yield
    finally:
        # Clean up dependencies
        provider.set_chat_service(None)
        provider.set_search_agent(None)
        provider.set_conversation_repository(None)
        provider.set_user_repository(None)
        provider.set_settings(None)
        provider.set_agent_manager(None)
       
        # Clean up application state
        if hasattr(application.state, 'db_pool'):
            application.state.db_pool = None
        if hasattr(application.state, 'resource_stack'):
            application.state.resource_stack = None


        # Close database pool
        if pool is not None:
            try:
                await pool.close()
            except Exception:
                pass


        # Close resource stack
        try:
            await resource_stack.aclose()
        except Exception:
            pass




def create_app() -> FastAPI:
    """Create and configure the FastAPI application"""
    app = FastAPI(
        title="Atlas Assistant API",
        description="A streaming chat interface powered by LangGraph",
        version="1.0.0",
        lifespan=lifespan
    )


    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Type"],
    )


    # Include route modules
    app.include_router(auth.router)
    app.include_router(chat.router)
    app.include_router(conversations.router)


    return app




# Create the application instance
app = create_app()