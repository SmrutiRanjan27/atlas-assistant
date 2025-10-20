from __future__ import annotations

from typing import List, Optional

import asyncpg

from .schemas import ConversationSummary

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
"""


class ConversationRepository:
    def __init__(self, pool: asyncpg.Pool, default_title: str) -> None:
        self._pool = pool
        self._default_title = default_title

    @property
    def default_title(self) -> str:
        return self._default_title

    async def initialise(self) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(SCHEMA_SQL)

    async def ensure(self, conversation_id: str, user_id: str, title: Optional[str] = None) -> None:
        async with self._pool.acquire() as conn:
            existing = await conn.fetchval("SELECT 1 FROM conversations WHERE id = $1", conversation_id)
            if existing:
                return
            await conn.execute(
                "INSERT INTO conversations (id, user_id, title) VALUES ($1, $2, $3)",
                conversation_id,
                user_id,
                title or self._default_title,
            )

    async def maybe_update_title(self, conversation_id: str, message: str) -> None:
        trimmed = (message or "").strip()
        if not trimmed:
            return
        suggested = trimmed[:80]
        async with self._pool.acquire() as conn:
            current_title = await conn.fetchval("SELECT title FROM conversations WHERE id = $1", conversation_id)
            if current_title and current_title != self._default_title:
                return
            await conn.execute(
                "UPDATE conversations SET title = $2, updated_at = NOW() WHERE id = $1",
                conversation_id,
                suggested,
            )

    async def touch(self, conversation_id: str) -> None:
        async with self._pool.acquire() as conn:
            await conn.execute(
                "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
                conversation_id,
            )

    async def list(self, user_id: str) -> List[ConversationSummary]:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, title, created_at, updated_at
                FROM conversations
                WHERE user_id = $1
                ORDER BY updated_at DESC
                """,
                user_id,
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

    async def get(self, conversation_id: str, user_id: Optional[str] = None) -> Optional[ConversationSummary]:
        async with self._pool.acquire() as conn:
            if user_id:
                row = await conn.fetchrow(
                    "SELECT id, title, created_at, updated_at FROM conversations WHERE id = $1 AND user_id = $2",
                    conversation_id,
                    user_id,
                )
            else:
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

    async def delete(self, conversation_id: str, user_id: Optional[str] = None) -> None:
        async with self._pool.acquire() as conn:
            if user_id:
                await conn.execute("DELETE FROM conversations WHERE id = $1 AND user_id = $2", conversation_id, user_id)
            else:
                await conn.execute("DELETE FROM conversations WHERE id = $1", conversation_id)
