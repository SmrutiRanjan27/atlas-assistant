# Perplexity Clone

A streaming chat interface powered by LangGraph with modern architecture and clean code structure.

## 🏗️ Architecture Overview

This project follows a modular architecture with clear separation of concerns:

### Client (Next.js + TypeScript)
- **Feature-based organization** with dedicated folders for types, services, hooks, and components
- **Service layer** for API communication and business logic
- **Custom hooks** with single responsibility principle
- **Utility functions** for reusable logic
- **Type safety** with comprehensive TypeScript interfaces

### Server (FastAPI + Python)
- **Modular routing** with domain-specific route files
- **Dependency injection** with proper container pattern
- **Service layer** for business logic
- **Repository pattern** for data access
- **Clean separation** of concerns across layers

## 📁 Project Structure

```
perplexity-clone/
├── client/                     # Next.js frontend application
│   ├── app/                   # Next.js app router
│   │   ├── globals.css
│   │   ├── layout.tsx         # Root layout component
│   │   └── page.tsx           # Main chat page
│   ├── components/            # Reusable UI components
│   │   ├── ChatComposer.tsx   # Message input component
│   │   ├── ChatFeed.tsx       # Messages display component
│   │   ├── ChatHeader.tsx     # Chat header with actions
│   │   ├── ChatHistoryPanel.tsx # Sidebar with conversation history
│   │   ├── ChatMessage.tsx    # Individual message component
│   │   ├── ChatStatusIndicator.tsx # Streaming status indicator
│   │   ├── MarkdownContent.tsx # Markdown rendering component
│   │   ├── ProtectedRoute.tsx  # Authentication wrapper
│   │   ├── ToolEventCard.tsx  # Tool execution display
│   │   └── UserProfile.tsx    # User profile component
│   ├── contexts/              # React contexts
│   │   └── AuthContext.tsx    # Authentication context
│   ├── hooks/                 # Custom React hooks
│   │   ├── useActiveConversation.ts # Active conversation management
│   │   ├── useConversations.ts # Conversations list management
│   │   ├── useChatPage.ts     # Original comprehensive hook
│   │   └── useChatPageRefactored.ts # New refactored hook
│   ├── lib/                   # Core utilities
│   │   ├── auth.ts           # Authentication utilities
│   │   └── debug.ts          # Debug utilities
│   ├── services/              # API service layer
│   │   ├── chat.ts           # Chat streaming service
│   │   ├── conversation.ts    # Conversation management service
│   │   └── index.ts          # Service exports
│   ├── types/                 # TypeScript type definitions
│   │   ├── auth.ts           # Authentication types
│   │   ├── chat.ts           # Chat-related types
│   │   ├── conversation.ts    # Conversation types
│   │   ├── tool.ts           # Tool-related types
│   │   └── index.ts          # Type exports
│   ├── utils/                 # Utility functions
│   │   └── chat.ts           # Chat-related utilities
│   └── package.json
├── server/                    # FastAPI backend application
│   ├── core/                 # Core business logic
│   │   ├── __init__.py       # Core exports
│   │   ├── auth.py           # Authentication logic
│   │   ├── config.py         # Configuration management
│   │   ├── conversations.py   # Conversation repository
│   │   ├── message_utils.py   # Message utilities
│   │   └── schemas.py        # Pydantic models
│   ├── routes/               # API route modules
│   │   ├── __init__.py
│   │   ├── auth.py           # Authentication endpoints
│   │   ├── chat.py           # Chat streaming endpoints
│   │   └── conversations.py  # Conversation management endpoints
│   ├── search_agent/         # LangGraph agent implementation
│   │   ├── __init__.py
│   │   └── agent.py          # Search agent logic
│   ├── services/             # Service layer
│   │   ├── __init__.py
│   │   └── chat.py           # Chat service implementation
│   ├── app.py                # Original monolithic app
│   ├── app_refactored.py     # New refactored app
│   ├── dependencies.py       # Dependency injection container
│   └── requirements.txt
└── docker-compose.yml        # Docker compose configuration
```

## ✨ Key Improvements

### Client-Side Refactoring

1. **Type Organization**
   - Extracted all types into dedicated files by domain
   - Centralized type exports for easy importing
   - Improved type safety across the application

2. **Service Layer**
   - Created dedicated service classes for API communication
   - Separated business logic from UI components
   - Improved error handling and authentication flow

3. **Hook Decomposition**
   - Broke down the massive `useChatPage` hook into smaller, focused hooks
   - `useConversations` - manages conversation list operations
   - `useActiveConversation` - manages current conversation state
   - Improved testability and maintainability

4. **Utility Functions**
   - Extracted reusable functions into utility modules
   - Improved code reuse and reduced duplication
   - Better separation of pure functions from React logic

### Server-Side Refactoring

1. **Modular Routing**
   - Split monolithic `app.py` into domain-specific route modules
   - `routes/auth.py` - authentication endpoints
   - `routes/chat.py` - chat streaming endpoints
   - `routes/conversations.py` - conversation management endpoints

2. **Dependency Injection**
   - Created a proper dependency injection container
   - Replaced FastAPI state-based dependencies with clean DI pattern
   - Improved testability and configuration management

3. **Service Layer**
   - Maintained existing service patterns but improved organization
   - Better separation between routes, services, and repositories
   - Cleaner error handling and logging

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ for the client
- Python 3.11+ for the server
- PostgreSQL database
- OpenAI API key
- Tavily API key (for web search)

### Environment Variables

#### Server (.env)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/perplexity_clone
DB_POOL_MIN_SIZE=1
DB_POOL_MAX_SIZE=5
OPENAI_API_KEY=your_openai_api_key
TAVILY_API_KEY=your_tavily_api_key
SECRET_KEY=your_jwt_secret_key
```

#### Client (.env.local)
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Installation & Running

#### Using Docker (Recommended)
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

#### Manual Setup

##### Server
```bash
cd server
pip install -r requirements.txt

# Run with original app
uvicorn app:app --reload --host 0.0.0.0 --port 8000

# OR run with refactored app
uvicorn app_refactored:app --reload --host 0.0.0.0 --port 8000
```

##### Client
```bash
cd client
npm install
npm run dev
```

## 🔄 Migration Guide

To use the refactored structure:

1. **Client**: Update imports in `app/page.tsx` to use the new `useChatPageRefactored` hook
2. **Server**: Switch the uvicorn command to use `app_refactored:app`
3. **Types**: Import types from the new centralized `types/` directory
4. **Services**: Use the new service classes for API calls

## 🏃‍♂️ Development

### Running Tests
```bash
# Client tests
cd client
npm test

# Server tests
cd server
pytest
```

### Linting
```bash
# Client
cd client
npm run lint

# Server
cd server
ruff check .
```

## 📝 API Documentation

Once the server is running, visit:
- **Interactive docs**: http://localhost:8000/docs
- **OpenAPI spec**: http://localhost:8000/openapi.json

## 🔧 Configuration

The application uses environment-based configuration with validation:
- **Server**: `core/config.py` - Centralized settings management
- **Client**: Next.js environment variables for API endpoints

## 🤝 Contributing

1. Follow the established project structure
2. Use TypeScript with strict mode on the client
3. Follow Python type hints on the server
4. Add proper JSDoc/docstrings for documentation
5. Test new features thoroughly

## 📚 Technologies Used

### Client
- **Next.js 14** - React framework with app router
- **TypeScript** - Type safety and developer experience
- **Tailwind CSS** - Utility-first CSS framework
- **React Context** - State management for authentication

### Server
- **FastAPI** - High-performance async Python web framework
- **LangGraph** - LLM workflow orchestration
- **PostgreSQL** - Primary database
- **asyncpg** - Async PostgreSQL driver
- **Pydantic** - Data validation and serialization

### AI/ML
- **OpenAI GPT** - Language model for chat responses
- **Tavily** - Web search API for real-time information
- **LangChain** - LLM application framework

## 📄 License

This project is licensed under the MIT License.