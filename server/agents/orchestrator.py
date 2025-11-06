import time
import json
from contextlib import asynccontextmanager
from typing import Annotated, Dict, List, Optional, TypedDict, Union


from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_tavily import TavilySearch
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langchain.embeddings import init_embeddings
from langgraph.prebuilt import ToolNode
from agents.excel_agent import excel_search_tool
from agents.tools.info_tools import make_memory_retriever_tool, make_document_retriever_tool
from agents.tools.location_tool import LocationWeatherTool


load_dotenv(override=True)


# 🌐 Core LLM
llm = ChatOpenAI(model="gpt-4o", streaming=True)


SYSTEM_PROMPT = """
You are Atlas Assistant — an intelligent company knowledge agent designed to help employees
analyze internal data, recall prior context, and retrieve information about the company’s
components, people, and strategy.


You can reason, synthesize, and use the following specialized tools:


1️⃣ `memory_retriever` — Recall relevant details or summaries from past user interactions.
Use this to maintain continuity across conversations and reference previous discussions.


2️⃣ `doc_retriever` — Access the company’s internal document repository to find information
about organizational components, product architecture, business strategy, engineering systems,
and operational processes. Use this when the query involves internal knowledge such as
pricing strategy, system design, or component documentation.


3️⃣ `excel_search_tool` — Analyze structured employee or HR-related data stored in Excel files.
Use this to answer questions about employees, departments, salaries, education, or
organizational statistics. You can perform grouping, filtering, comparisons, and aggregations
to extract insights from this data.


4️⃣ `tavily_search_tool` — Retrieve factual, up-to-date information from the public web.
Use this when the user asks about external topics, current events, or information not covered
in internal documents.


5️⃣ `location_weather_tool` — Fetch the user's current location, local date/time, and real-time
weather conditions using their IP address or provided coordinates.
Use this when the user asks about the current time, weather, or environment at their location
(or another specified place).


---


**Guidelines for Tool Usage**
- If a question references something previously discussed, first check the `memory_retriever`.
- If the topic involves company systems, product components, or internal strategies,
  prefer the `doc_retriever`.
- If it concerns employee data, workforce analytics, or HR insights, use `excel_search_tool`.
- If external or real-world context is needed, use `tavily_search_tool`.
- If the user requests local or real-time environmental information such as time, date,
  weather, or location context, use `location_weather_tool`.
- When multiple sources may be relevant, call tools sequentially and integrate results naturally.
- Provide clear, structured, and concise explanations in your replies.


You are a professional internal AI assistant — always maintain a helpful, factual,
and context-aware tone aligned with company knowledge.
"""


# Helper to enrich the base system prompt with user-specific context
def build_system_prompt(base_prompt: str, user_profile: Optional[Dict[str, str]]) -> str:
    prompt = base_prompt.strip()
    if not isinstance(user_profile, dict):
        return prompt


    details = []
    name = user_profile.get("name")
    username = user_profile.get("username")
    email = user_profile.get("email")


    if isinstance(name, str) and name.strip():
        details.append(f"Name: {name.strip()}")
    if isinstance(username, str) and username.strip():
        details.append(f"Username: {username.strip()}")
    if isinstance(email, str) and email.strip():
        details.append(f"Email: {email.strip()}")


    if not details:
        return prompt


    prompt += "\n\nCurrent User Profile:\n"
    prompt += "\n".join(f"- {line}" for line in details)
    return prompt




# 🧠 Shared state structure
class AgentState(TypedDict):
    messages: Annotated[List[Union[HumanMessage, ToolMessage, AIMessage]], add_messages]




# 🧩 Chatbot node
async def chatbot(state: AgentState, config=None, store=None) -> AgentState:
    """Chatbot with persistent user memory in LangGraph store."""
    messages = state.get("messages", [])
    configurable = (config or {}).get("configurable", {}) or {}
    user_id = configurable.get("user_id")
    thread_id = configurable.get("thread_id")


    # Always prepend system prompt once
    if not any(isinstance(m, SystemMessage) for m in messages):
        override_prompt = configurable.get("system_prompt")
        prompt_text = (
            override_prompt
            if isinstance(override_prompt, str) and override_prompt.strip()
            else build_system_prompt(SYSTEM_PROMPT, configurable.get("user_profile"))
        )
        messages = [SystemMessage(content=prompt_text)] + messages


    # LLM can choose to call tools as needed
    result = await llm.ainvoke(messages, config={"configurable": {"user_id": user_id}})


    # 💾 Store the latest user-assistant exchange
    if store is not None and user_id:
        try:
            last_user = next(
                (m.content for m in reversed(messages) if isinstance(m, HumanMessage)),
                None,
            )
            if last_user and thread_id:
                assistant_text = getattr(result, "content", None)
                if assistant_text:
                    exchange = {
                        "user": last_user,
                        "assistant": assistant_text,
                        "timestamp": int(time.time() * 1000),
                    }
                    key = f"exchange_{exchange['timestamp']}"
                    await store.aput(("users", user_id, "memory", thread_id), key, exchange)
        except Exception as e:
            print(f"[Warning] Memory write failed: {e}")


    return {"messages": [result]}




# 🧩 Conditional routing
async def route_tools(state: AgentState):
    if messages := state.get("messages", []):
        ai_message = messages[-1]
    else:
        raise ValueError("No AI message found in input state to tool edge")


    if hasattr(ai_message, "tool_calls") and len(ai_message.tool_calls) > 0:
        return "tools"
    return END




# 🏗️ Graph builder
def build_graph(store):
    tavily_search_tool = TavilySearch(max_results=2)
    location_weather_tool = LocationWeatherTool()
    memory_retriever_tool = make_memory_retriever_tool(store)
    document_retriever_tool = make_document_retriever_tool(store)


    tools = [
        tavily_search_tool,
        location_weather_tool,
        excel_search_tool,
        memory_retriever_tool,
        document_retriever_tool,
    ]


    global llm
    llm = llm.bind_tools(tools)


    graph = StateGraph(AgentState)
    graph.add_node("chatbot", chatbot)
    graph.add_node("tools", ToolNode(tools=tools))
    graph.add_edge(START, "chatbot")
    graph.add_conditional_edges("chatbot", route_tools, {"tools": "tools", END: END})
    graph.add_edge("tools", "chatbot")


    return graph


def compile_agent(checkpointer, store):
    graph = build_graph(store)
    return graph.compile(checkpointer=checkpointer, store=store)




# ✅ Async context managers for storage & checkpoints
@asynccontextmanager
async def create_async_postgres_checkpointer(conn_string: str):
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver


    async with AsyncPostgresSaver.from_conn_string(conn_string) as saver:
        await saver.setup()
        yield saver




@asynccontextmanager
async def create_async_postgres_store(conn_string: str):
    from langgraph.store.postgres.aio import AsyncPostgresStore


    async with AsyncPostgresStore.from_conn_string(
        conn_string,
        index={
            "dims": 1536,
            "embed": init_embeddings("openai:text-embedding-3-small"),
            "fields": ["user", "assistant", "text"],
        },
    ) as store:
        await store.setup()
        yield store




@asynccontextmanager
async def create_async_memory_checkpointer():
    from langgraph.checkpoint.memory import InMemorySaver


    saver = InMemorySaver()
    try:
        yield saver
    finally:
        pass




@asynccontextmanager
async def create_async_memory_store():
    from langgraph.store.memory import InMemoryStore


    store = InMemoryStore()
    try:
        yield store
    finally:
        pass