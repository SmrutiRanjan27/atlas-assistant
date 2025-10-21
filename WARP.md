# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Architecture Overview

This is a **Perplexity-like AI chat application** with streaming responses, web search capabilities, and conversation management. The architecture follows a client-server pattern with AI agent integration:

### Backend (FastAPI + LangGraph)
- **Core**: FastAPI server (`server/app.py`) with async PostgreSQL connection pooling
- **AI Agent**: LangGraph-based search agent (`server/search_agent/agent.py`) using GPT-4o and Tavily search
- **Persistence**: PostgreSQL database with LangGraph checkpointer for conversation state
- **Streaming**: Real-time response streaming via Server-Sent Events using NDJSON format

### Frontend (Next.js + React)
- **Framework**: Next.js 14 with TypeScript and Tailwind CSS  
- **State Management**: Custom React hooks for chat state and conversation management
- **UI Components**: Modular chat interface with streaming message display and tool events
- **Real-time**: Handles streamed responses with tool call visualization

### Key Integration Points
- **LangGraph Agent**: Compiles a stateful graph with chatbot and tool nodes, using conditional routing
- **PostgreSQL**: Stores conversation metadata + LangGraph checkpoints for agent state persistence
- **Tavily Search**: Web search tool integrated into the agent workflow
- **Streaming Protocol**: Custom event types (response_chunk, tool_call, tool_result, etc.)

## Development Commands

### Local Development (Recommended)
```bash
# Start full stack with Docker Compose
docker compose up --build

# Access points:
# - Frontend: http://localhost:3000
# - Backend API: http://localhost:8000  
# - PostgreSQL: localhost:5432 (postgres/postgres)
```

### Frontend Development
```bash
cd client
npm install
npm run dev        # Development server
npm run build      # Production build
npm run start      # Start production server
npm run lint       # ESLint checking
```

### Backend Development
```bash
cd server
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Environment Setup
- Backend requires `DATABASE_URL` environment variable
- API keys needed: `OPENAI_API_KEY`, `TAVILY_API_KEY`, `LANGSMITH_API_KEY` (optional)
- See `server/.env.docker` for Docker Compose configuration format

## Code Structure

### Backend Architecture
- `server/app.py`: FastAPI application with lifespan management and CORS
- `server/core/`: Configuration, database models, and conversation repository
- `server/search_agent/`: LangGraph agent definition with GPT-4o + Tavily tools
- `server/services/`: Chat service handling streaming and conversation state

### Frontend Architecture  
- `client/app/`: Next.js app router with main chat interface
- `client/components/`: Modular UI components (ChatFeed, ChatComposer, etc.)
- `client/hooks/useChatPage.ts`: Central state management for chat functionality
- Real-time streaming handled via Fetch API with custom event parsing

### Database Schema
- Conversations table for metadata (id, title, timestamps)
- LangGraph checkpointer tables for agent state persistence
- Auto-initialization via `ConversationRepository.initialise()`

## Key Technical Details

### Agent Graph Structure
The LangGraph agent uses a simple but effective pattern:
- **Chatbot Node**: GPT-4o with tool binding  
- **Tools Node**: Executes Tavily search calls
- **Conditional Edge**: Routes to tools or END based on tool calls

### Streaming Implementation
- Backend streams NDJSON events over HTTP
- Frontend parses line-by-line and updates UI reactively
- Tool execution is visualized with status indicators and result links

### Deployment Options
- **Local**: Docker Compose (PostgreSQL + backend + frontend)
- **Production**: Kubernetes on Azure AKS with managed PostgreSQL
- Multi-stage Dockerfile builds optimized Node.js and Python images

## Development Notes

- The application uses LangGraph's PostgreSQL checkpointer for conversation state persistence
- Tool events are processed client-side for rich UI feedback during search operations
- Environment variables are handled differently between local development and Docker deployments
- Frontend API calls default to `http://localhost:8000` but are configurable via environment variables