import asyncio
import os
from pathlib import Path
from PyPDF2 import PdfReader
from dotenv import load_dotenv
from langchain.embeddings import init_embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langgraph.store.postgres import AsyncPostgresStore


load_dotenv(override=True)


# ---------------------------
# CONFIG
# ---------------------------
CONNECTION = os.getenv("DATABASE_URL")  # Fixed variable name
EMBED_MODEL = "openai:text-embedding-3-small"
BASE_NAMESPACE = ("documents", "pdf")


# ---------------------------
# HELPERS
# ---------------------------
def extract_pdf_text(file_path: str) -> str:
    """Extract text from all pages of a PDF."""
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        t = page.extract_text()
        if t:
            text += t + "\n"
    return text




def create_semantic_chunks(text: str, chunk_size=1000, chunk_overlap=150) -> list[str]:
    """Split long text into meaningful overlapping chunks."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ".", "!", "?", ",", " ", ""],
    )
    chunks = splitter.split_text(text)
    return [c.strip() for c in chunks if c.strip()]




# ---------------------------
# MAIN INDEX FUNCTION
# ---------------------------
async def index_pdf_to_pgstore(file_path: str, store):
    file_name = os.path.splitext(os.path.basename(file_path))[0].replace(" ", "_")


    text = extract_pdf_text(file_path)
    chunks = create_semantic_chunks(text)


    print(f"📄 Extracted {len(chunks)} semantic chunks from '{file_name}.pdf'")


    for i, chunk in enumerate(chunks):
        await store.aput(
            namespace=BASE_NAMESPACE + (file_name,),
            key=f"{file_name}_chunk_{i}",
            value={"text": chunk, "source": file_name, "chunk_index": i},
        )


    print(f"✅ Indexed {len(chunks)} chunks for {file_name}.pdf")




# ---------------------------
# SEARCH FUNCTION
# ---------------------------
async def query_pgstore(store, query: str, namespace=None):
    if namespace is None:
        namespace = BASE_NAMESPACE


    results = await store.asearch(
        namespace,
        query=query,
        limit=3,
    )


    print("🔍 Top results:")
    for item in results:
        print("•", item.value["text"], "...\n")




# ---------------------------
# MAIN ENTRY POINT
# ---------------------------
async def main():
    embedder = init_embeddings(EMBED_MODEL)


    async with AsyncPostgresStore.from_conn_string(
        CONNECTION,
        index={
            "dims": 1536,
            "embed": embedder,
            "fields": ["text"],
        },
    ) as store:


        data_dir = Path(os.getcwd()) / "data"


        for file_path in data_dir.iterdir():
            if file_path.suffix.lower() == ".pdf":
                await index_pdf_to_pgstore(str(file_path), store)


        await query_pgstore(store, "What does it say about pricing strategy?")


if __name__ == "__main__":
    import selectors
    from asyncio import SelectorEventLoop, set_event_loop


    loop = SelectorEventLoop(selectors.SelectSelector())
    set_event_loop(loop)
    loop.run_until_complete(main())