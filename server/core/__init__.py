"""Shared backend primitives."""

from .auth import (
    UserRepository,
    authenticate_user,
    create_access_token,
    get_current_user,
)
from .config import Settings
from .conversations import ConversationRepository
from .message_utils import extract_text, normalise_for_json, serialise_langchain_messages
from .schemas import (
    ChatRequest,
    ConversationCreateRequest,
    ConversationDetail,
    ConversationMessage,
    ConversationSummary,
    Token,
    User,
    UserCreate,
    UserLogin,
    UserUpdate,
)

__all__ = [
    "Token",
    "User",
    "UserCreate",
    "UserLogin",
    "UserUpdate",
    "UserRepository",
    "authenticate_user",
    "create_access_token",
    "get_current_user",
    "Settings",
    "ConversationRepository",
    "extract_text",
    "normalise_for_json",
    "serialise_langchain_messages",
    "ChatRequest",
    "ConversationCreateRequest",
    "ConversationDetail",
    "ConversationMessage",
    "ConversationSummary",
]
