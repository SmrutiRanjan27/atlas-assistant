import os
import pandas as pd
from dotenv import load_dotenv
from typing import TypedDict, Union, List
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, ToolMessage, AIMessage
from langgraph.graph import START, END, StateGraph
from langgraph.prebuilt import ToolNode
from agents.tools.excel_query_tool import ExcelQueryTool


load_dotenv(override=True)


EXCEL_FILE_PATH = os.path.join(os.getcwd(), "data", "Employee_details_1.xlsx")


llm = ChatOpenAI(model="gpt-4o", streaming=True)
tools = [ExcelQueryTool()]
llm = llm.bind_tools(tools)


# Dynamically inspect columns for context
df = pd.read_excel(EXCEL_FILE_PATH, engine="openpyxl")
columns_info = ", ".join([f"{col} ({df[col].dtype})" for col in df.columns])




class ExcelAgentModel(BaseModel):
    query: str = Field(..., description="User's natural-language query about the Excel file.")




class ExcelAgentState(TypedDict):
    query: str
    messages: List[Union[HumanMessage, ToolMessage, AIMessage]]




excel_agent = create_agent(
    model=llm,
    system_prompt=f"""
        You are a data analysis assistant specialized in querying Excel data.


        You can call `excel_query_tool` to extract or analyze information from:
        {EXCEL_FILE_PATH}


        The Excel file has the following columns:
        {columns_info}


        Rules:
        - Always use `excel_query_tool` for any data-related query.
        - For summarization, rely only on tool output.
        - Return clear, structured responses that can be displayed on frontend.
        - Never fabricate data or column names.
    """,
    tools=tools,
    name="excel_agent"
)




async def excelbot(state: ExcelAgentState) -> ExcelAgentState:
    query = state.get("query")
    result = await excel_agent.ainvoke({"messages": [HumanMessage(content=query)]})
    messages = result.get("messages", [])
    return {"query": query, "messages": messages}




async def route_tools(state: ExcelAgentState):
    messages = state.get("messages", [])
    ai_message = messages[-1] if messages else None
    if ai_message and hasattr(ai_message, "tool_calls") and len(ai_message.tool_calls) > 0:
        return "tools"
    return END




graph = StateGraph(ExcelAgentState)
graph.add_node("excelbot", excelbot)
graph.add_node("tools", ToolNode(tools=tools))
graph.add_edge(START, "excelbot")
graph.add_conditional_edges("excelbot", route_tools, {"tools": "tools", END: END})
graph.add_edge("tools", "excelbot")


agent = graph.compile()


excel_search_tool = agent.as_tool(
    name="excel_search_tool",
    description=(
        "Analyzes employee-level company data from the Excel file. "
        "The dataset includes columns: Name, Age, Gender, Email, Phone, Address, Salary (USD), "
        "Education, Department, and Position. "
        "Use this tool to answer questions such as: "
        "calculating average or total salaries, finding employees by department or position, "
        "analyzing education levels, gender distribution, or age statistics, "
        "and producing summaries or aggregations grouped by Department, Education, or Position."
    ),
    args_schema=ExcelAgentModel,
)