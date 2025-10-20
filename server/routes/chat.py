"""
Chat routes for the server application
"""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from core import ChatRequest, User
from dependencies import get_chat_service, get_current_user_dep
from services.chat import ChatService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/stream")
async def stream_chat_responses(
    request: ChatRequest, 
    current_user: User = Depends(get_current_user_dep),
    chat_service: ChatService = Depends(get_chat_service),
):
    """Stream chat responses for a message"""
    async def event_stream():
        async for payload in chat_service.stream_responses(
            request.message, 
            current_user.id, 
            request.checkpoint_id
        ):
            yield f"{payload}\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
    )