from __future__ import annotations


import asyncio
from contextlib import AsyncExitStack
from typing import Any, Optional


from agents.orchestrator import (
    compile_agent,
    create_async_postgres_checkpointer,
    create_async_postgres_store,
)




class AgentManager:
    """Manage lifecycle and refresh of LangGraph agent resources."""


    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self._stack: AsyncExitStack = AsyncExitStack()
        self._lock = asyncio.Lock()
        self._agent: Optional[Any] = None


    async def _build_agent_locked(self) -> Any:
        checkpointer = await self._stack.enter_async_context(
            create_async_postgres_checkpointer(self._database_url)
        )
        store = await self._stack.enter_async_context(
            create_async_postgres_store(self._database_url)
        )
        return compile_agent(checkpointer, store)


    async def get_agent(self) -> Any:
        """Return a ready agent, creating one if needed."""
        async with self._lock:
            if self._agent is None:
                self._agent = await self._build_agent_locked()
            return self._agent


    async def refresh_agent(self) -> Any:
        """Dispose of existing resources and provision a fresh agent."""
        async with self._lock:
            await self._stack.aclose()
            self._stack = AsyncExitStack()
            self._agent = await self._build_agent_locked()
            return self._agent


    async def aclose(self) -> None:
        """Clean up any managed resources."""
        async with self._lock:
            await self._stack.aclose()
            self._agent = None