from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


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


# User schemas
class User(BaseModel):
    id: str
    username: str
    email: str
    name: str
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    username: str
    email: str
    name: str
    password: str = Field(..., min_length=1)


class UserLogin(BaseModel):
    username: str
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=1)


class Token(BaseModel):
    access_token: str
    token_type: str


class UserInDB(User):
    hashed_password: str
