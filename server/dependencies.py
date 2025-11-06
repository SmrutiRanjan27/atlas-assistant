"""
Dependency injection for the server application
"""


from typing import Any


from fastapi import Depends, HTTPException


from core import ConversationRepository, Settings, User, UserRepository, get_current_user
from core.auth import security
from services.chat import ChatService
from services.agent_manager import AgentManager




class DependencyProvider:
    """Container for application dependencies"""
   
    def __init__(self):
        self.settings: Settings | None = None
        self.user_repository: UserRepository | None = None
        self.conversation_repository: ConversationRepository | None = None
        self.search_agent: Any = None
        self.chat_service: ChatService | None = None
        self.agent_manager: AgentManager | None = None
   
    def set_settings(self, settings: Settings) -> None:
        self.settings = settings
   
    def set_user_repository(self, repository: UserRepository) -> None:
        self.user_repository = repository
   
    def set_conversation_repository(self, repository: ConversationRepository) -> None:
        self.conversation_repository = repository
   
    def set_search_agent(self, agent: Any) -> None:
        self.search_agent = agent
   
    def set_chat_service(self, service: ChatService) -> None:
        self.chat_service = service
   
    def set_agent_manager(self, manager: AgentManager | None) -> None:
        self.agent_manager = manager




# Global dependency provider instance
_provider = DependencyProvider()




def get_dependency_provider() -> DependencyProvider:
    """Get the global dependency provider"""
    return _provider




def get_settings() -> Settings:
    """Get application settings"""
    settings = _provider.settings
    if settings is None:
        raise RuntimeError("Application settings are not initialized.")
    return settings




def get_user_repository() -> UserRepository:
    """Get user repository"""
    repository = _provider.user_repository
    if repository is None:
        raise RuntimeError("User repository is not initialized.")
    return repository




def get_conversation_repository() -> ConversationRepository:
    """Get conversation repository"""
    repository = _provider.conversation_repository
    if repository is None:
        raise RuntimeError("Conversation repository is not initialized.")
    return repository




def get_search_agent() -> Any:
    """Get search agent"""
    agent = _provider.search_agent
    if agent is None:
        raise RuntimeError("Search agent is not initialized.")
    return agent




def get_chat_service() -> ChatService:
    """Get chat service"""
    service = _provider.chat_service
    if service is None:
        raise RuntimeError("Chat service is not initialized.")
    return service




def get_agent_manager() -> AgentManager:
    manager = _provider.agent_manager
    if manager is None:
        raise RuntimeError("Agent manager is not initialized.")
    return manager




async def get_current_user_dep(
    credentials=Depends(security),
    user_repo: UserRepository = Depends(get_user_repository),
) -> User:
    """Get current authenticated user"""
    return await get_current_user(credentials, user_repo)