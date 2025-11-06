import json
import textwrap
from typing import Dict, Any
from langchain_core.tools import StructuredTool
from langchain_core.runnables import RunnableConfig


def make_memory_retriever_tool(store):
    async def memory_retriever(query: str, config: RunnableConfig) -> Dict[str, Any]:
        """Retrieve relevant user memories from Postgres store."""
        try:
            user_id = None
            if config and hasattr(config, "configurable"):
                user_id = getattr(config, "configurable", {}).get("user_id")
            elif isinstance(config, dict):
                user_id = config.get("configurable", {}).get("user_id")


            if not user_id:
                return {"error": "Missing user_id in RunnableConfig."}


            results = await store.asearch(("users", user_id, "memory"), query=query, limit=3)
            if not results:
                return {"results": [], "message": "No relevant past memories found."}


            formatted = []
            for item in results:
                value = getattr(item, "value", None) or item.get("value")


                # Decode stringified JSON payloads
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except json.JSONDecodeError:
                        value = {"user": value}


                timestamp = None
                user_text = None
                assistant_text = None
                summary = None


                if isinstance(value, dict):
                    timestamp = value.get("timestamp")
                    raw_user = value.get("user") or value.get("prompt") or value.get("text")
                    raw_assistant = value.get("assistant") or value.get("response")
                    if isinstance(raw_user, str):
                        user_text = raw_user.strip() or None
                    if isinstance(raw_assistant, str):
                        assistant_text = raw_assistant.strip() or None
                    if not user_text and not assistant_text:
                        raw_summary = value.get("summary") or value.get("snippet") or value.get("text")
                        if isinstance(raw_summary, str):
                            summary = raw_summary.strip() or None
                else:
                    summary = str(value)


                # Fallback summary if we have lengthy text
                if not summary and user_text and assistant_text:
                    combined = f"{user_text}\n{assistant_text}"
                    summary = textwrap.shorten(combined, width=320, placeholder=" ...")
                elif not summary and user_text:
                    summary = textwrap.shorten(user_text, width=320, placeholder=" ...")
                elif not summary and assistant_text:
                    summary = textwrap.shorten(assistant_text, width=320, placeholder=" ...")


                formatted_entry: Dict[str, Any] = {
                    "score": getattr(item, "score", None) or item.get("score", None),
                }
                if timestamp:
                    formatted_entry["timestamp"] = timestamp
                if user_text:
                    formatted_entry["user"] = user_text
                if assistant_text:
                    formatted_entry["assistant"] = assistant_text
                if summary:
                    formatted_entry["summary"] = summary


                formatted.append(formatted_entry)


            return {"results": formatted}


        except Exception as e:
            return {"error": f"Memory Retrieval Error: {e}"}


    return StructuredTool.from_function(
        func=memory_retriever,
        coroutine=memory_retriever,
        name="memory_retriever",
        description="Fetch relevant past memories for a given user_id from persistent store."
    )


def make_document_retriever_tool(store):
    async def document_retriever(query: str) -> Dict[str, Any]:
        try:
            results = await store.asearch(("documents", "pdf"), query=query, limit=3)
            if not results:
                return {"results": [], "message": "No relevant documents found."}


            formatted = []
            for item in results:
                # Handle flexible access to attributes or dicts
                val = getattr(item, "value", None) or item.get("value", {})


                # Parse if stored as string JSON
                if isinstance(val, str):
                    try:
                        val = json.loads(val)
                    except json.JSONDecodeError:
                        val = {"text": val}


                # Extract fields safely
                source = val.get("source", "Unknown Source")
                text = val.get("text", "")
                chunk_index = val.get("chunk_index")


                # Truncate for frontend (safe word boundary)
                snippet = textwrap.shorten(text, width=400, placeholder=" ...")


                formatted.append({
                    "source": source,
                    "chunk_index": chunk_index,
                    "snippet": snippet,
                    "full_text": text,
                    "score": getattr(item, "score", None) or item.get("score", None),
                })


            return {"results": formatted}


        except Exception as e:
            return {"error": f"Document Retrieval Error: {e}"}


    return StructuredTool.from_function(
        func=document_retriever,
        coroutine=document_retriever,
        name="document_retriever",
        description="Retrieves company component information, design specs, and related technical documents from the internal document store."
    )