"""
Conversation routes for the server application
"""

from typing import List
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status

from core import (
    ConversationCreateRequest,
    ConversationDetail,
    ConversationRepository,
    ConversationSummary,
    Settings,
    User,
)
from dependencies import (
    get_conversation_repository,
    get_current_user_dep,
    get_search_agent,
    get_settings,
)
from services.chat import delete_conversation_state, fetch_conversation_messages

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("", response_model=ConversationSummary, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    request: ConversationCreateRequest,
    current_user: User = Depends(get_current_user_dep),
    repository: ConversationRepository = Depends(get_conversation_repository),
    settings: Settings = Depends(get_settings),
) -> ConversationSummary:
    """Create a new conversation"""
    conversation_id = str(uuid4())
    title = request.title.strip() if request.title else settings.default_title

    await repository.ensure(conversation_id, current_user.id, title=title)
    summary = await repository.get(conversation_id, current_user.id)
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create conversation."
        )
    return summary


@router.get("", response_model=List[ConversationSummary])
async def list_conversations(
    current_user: User = Depends(get_current_user_dep),
    repository: ConversationRepository = Depends(get_conversation_repository),
) -> List[ConversationSummary]:
    """List all conversations for the current user"""
    return await repository.list(current_user.id)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user_dep),
    repository: ConversationRepository = Depends(get_conversation_repository),
    agent=Depends(get_search_agent),
) -> ConversationDetail:
    """Get detailed conversation by ID"""
    conversation_id_str = str(conversation_id)

    summary = await repository.get(conversation_id_str, current_user.id)
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    messages = await fetch_conversation_messages(agent, conversation_id_str)
    return ConversationDetail(
        id=summary.id,
        title=summary.title,
        created_at=summary.created_at,
        updated_at=summary.updated_at,
        messages=messages,
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: UUID,
    current_user: User = Depends(get_current_user_dep),
    repository: ConversationRepository = Depends(get_conversation_repository),
    agent=Depends(get_search_agent),
) -> Response:
    """Delete a conversation by ID"""
    conversation_id_str = str(conversation_id)

    summary = await repository.get(conversation_id_str, current_user.id)
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found."
        )

    await repository.delete(conversation_id_str, current_user.id)
    await delete_conversation_state(agent, conversation_id_str)
    return Response(status_code=status.HTTP_204_NO_CONTENT)