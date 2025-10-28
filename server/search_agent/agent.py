import time
import json
from contextlib import asynccontextmanager
from typing import Annotated, List, TypedDict, Union

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_tavily import TavilySearch
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

load_dotenv(override=True)

llm = ChatOpenAI(model="gpt-4o", streaming=True)
tools = [TavilySearch(max_results=2)]
llm = llm.bind_tools(tools)


class AgentState(TypedDict):
    messages: Annotated[List[Union[HumanMessage, AIMessage]], add_messages]


class ToolNode:
    def __init__(self, tools: list) -> None:
        self.tools_by_name = {tool.name: tool for tool in tools}

    async def __call__(self, inputs: dict):
        if messages := inputs.get("messages", []):
            message = messages[-1]
        else:
            raise ValueError("No message found in input")
        outputs = []
        for tool_call in message.tool_calls:
            tool_result = await self.tools_by_name[tool_call["name"]].ainvoke(tool_call["args"])

            outputs.append(
                ToolMessage(
                    content=json.dumps(tool_result),
                    name=tool_call["name"],
                    tool_call_id=tool_call["id"],
                )
            )
        return {"messages": outputs}


async def chatbot(state: AgentState, config=None, store=None) -> AgentState:
    """Chatbot with persistent user memory in LangGraph store."""
    messages = state.get("messages", [])
    user_id = (config or {}).get("configurable", {}).get("user_id")

    enriched_messages = list(messages)

    # 🧩 Retrieve long-term memory
    if store is not None and user_id:
        try:
            query = messages[-1].content if messages else ""
            # ✅ Correctly pass namespace and query
            results = await store.asearch(("users", user_id, "memory"), query=query)

            recent_items = []
            for item in results or []:
                value = getattr(item, "value", None) if item is not None else None
                if value is None and isinstance(item, dict):
                    value = item.get("value")
                if value:
                    # ✅ Ensure it's plain text (handle JSONB or dict)
                    if isinstance(value, (dict, list)):
                        value = json.dumps(value, ensure_ascii=False)
                    recent_items.append(str(value))

            if recent_items:
                summary_text = "\n".join(recent_items[:5])
                enriched_messages = [
                    SystemMessage(content=f"Relevant memories for this user:\n{summary_text}")
                ] + enriched_messages
        except Exception as e:
            print(f"[Warning] Memory retrieval failed: {e}")

    # 🧠 Generate assistant reply
    result = await llm.ainvoke(enriched_messages)

    # 💾 Store the latest user-assistant exchange
    if store is not None and user_id:
        try:
            user_ns = ("users", user_id, "memory")

            # find last user message
            last_user = next(
                (m.content for m in reversed(messages) if isinstance(m, HumanMessage)),
                None
            )
            if last_user:
                assistant_text = getattr(result, "content", None)
                if assistant_text:
                    exchange = {
                        "user": last_user,
                        "assistant": assistant_text,
                        "timestamp": int(time.time() * 1000)
                    }
                    key = f"exchange_{exchange['timestamp']}"

                    # ✅ Store as proper JSON (not double-quoted string)
                    await store.aput(user_ns, key, exchange)
        except Exception as e:
            print(f"[Warning] Memory write failed: {e}")

    return {"messages": [result]}


async def route_tools(state: AgentState):
    if messages := state.get("messages", []):
        ai_message = messages[-1]
    else:
        raise ValueError(f"No AI message found in input state to tool edge: {state}")

    if hasattr(ai_message, "tool_calls") and len(ai_message.tool_calls) > 0:
        return "tools"
    return END


graph = StateGraph(AgentState)
graph.add_node("chatbot", chatbot)
graph.add_node("tools", ToolNode(tools=tools))
graph.add_edge(START, "chatbot")
graph.add_conditional_edges(
    "chatbot",
    route_tools,
    {"tools": "tools", END: END},
)
graph.add_edge("tools", "chatbot")


def compile_agent(checkpointer, store):
    return graph.compile(checkpointer=checkpointer, store=store)


@asynccontextmanager
async def create_async_postgres_checkpointer(conn_string: str):
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    async with AsyncPostgresSaver.from_conn_string(conn_string) as saver:
        await saver.setup()
        yield saver

@asynccontextmanager
async def create_async_postgres_store(conn_string: str):
    from langgraph.store.postgres.aio import AsyncPostgresStore

    async with AsyncPostgresStore.from_conn_string(conn_string) as store:
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
async def create_async_memory_store(conn_string: str):
    from langgraph.store.memory import InMemoryStore

    store = InMemoryStore()
    try:
        yield store
    finally:
        pass

    
