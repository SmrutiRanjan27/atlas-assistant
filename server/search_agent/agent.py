import json
from contextlib import asynccontextmanager
from typing import Annotated, List, TypedDict, Union

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
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


async def chatbot(state: AgentState) -> AgentState:
    result = await llm.ainvoke(state["messages"])
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


def compile_agent(checkpointer):
    return graph.compile(checkpointer=checkpointer)


@asynccontextmanager
async def create_async_postgres_checkpointer(conn_string: str):
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

    async with AsyncPostgresSaver.from_conn_string(conn_string) as saver:
        await saver.setup()
        yield saver
