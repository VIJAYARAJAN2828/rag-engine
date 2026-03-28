"""
RAG Application Backend
FastAPI + LangChain + ChromaDB + Google Gemini
Session-scoped in-memory vector store (no persistent storage)
"""

import os
import uuid
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# LangChain imports
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_classic.chains import ConversationalRetrievalChain
from langchain_classic.memory import ConversationBufferMemory
from langchain_core.messages import HumanMessage, AIMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# ── App setup ──────────────────────────────────────────────────────────────────
app = FastAPI(title="RAG App API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Google API Key ─────────────────────────────────────────────────────────────
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "AIzaSyBCVrmKCf2tTe6cs9UaYxFzbZbjTQCs3xI")
os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY

# ── LLM & Embeddings ───────────────────────────────────────────────────────────
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
embeddings = GoogleGenerativeAIEmbeddings(
    model="models/text-embedding-004",
    client_options={"api_endpoint": "generativelanguage.googleapis.com"},
    transport="rest"
)

# ── In-memory session store ────────────────────────────────────────────────────
# Each session has its own ChromaDB collection + conversation memory
sessions: dict = {}   # session_id -> { "vectorstore": ..., "chain": ..., "docs_info": [...] }

# General chatbot memory (single shared history per session)
chat_memories: dict = {}  # session_id -> list of messages


# ── Pydantic models ────────────────────────────────────────────────────────────
class AskRequest(BaseModel):
    session_id: str
    question: str

class ChatRequest(BaseModel):
    session_id: str
    message: str

class SessionRequest(BaseModel):
    session_id: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────
def load_document(file_path: str, filename: str):
    """Load a document based on its extension."""
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        loader = PyPDFLoader(file_path)
    elif ext == ".docx":
        loader = Docx2txtLoader(file_path)
    elif ext == ".txt":
        loader = TextLoader(file_path, encoding="utf-8")
    else:
        raise ValueError(f"Unsupported file type: {ext}")
    return loader.load()


def build_rag_chain(vectorstore):
    """Build a ConversationalRetrievalChain from a vectorstore."""
    retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
    memory = ConversationBufferMemory(
        memory_key="chat_history",
        return_messages=True,
        output_key="answer"
    )
    chain = ConversationalRetrievalChain.from_llm(
        llm=llm,
        retriever=retriever,
        memory=memory,
        return_source_documents=True,
        verbose=False,
    )
    return chain


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "RAG API is running 🚀"}


@app.post("/session/create")
def create_session():
    """Create a new session and return its ID."""
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "vectorstore": None,
        "chain": None,
        "docs_info": [],
    }
    chat_memories[session_id] = []
    return {"session_id": session_id}


@app.post("/upload")
async def upload_document(
    session_id: str,
    file: UploadFile = File(...)
):
    """
    Upload a PDF / DOCX / TXT file.
    Chunks it, embeds it, and stores in the session's ChromaDB vectorstore.
    """
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found. Create a session first.")

    allowed = {".pdf", ".docx", ".txt"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'. Use PDF, DOCX, or TXT.")

    # Save upload to a temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Load document pages
        docs = load_document(tmp_path, file.filename)

        # Chunk the text
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        chunks = splitter.split_documents(docs)

        if not chunks:
            raise HTTPException(status_code=400, detail="No text could be extracted from the file.")

        # Add to (or create) vectorstore for this session
        existing_vs = sessions[session_id]["vectorstore"]
        if existing_vs is None:
            # Create a new in-memory Chroma collection
            vectorstore = Chroma.from_documents(
                documents=chunks,
                embedding=embeddings,
                collection_name=f"session_{session_id[:8]}",
            )
        else:
            existing_vs.add_documents(chunks)
            vectorstore = existing_vs

        # Rebuild the RAG chain with updated vectorstore
        chain = build_rag_chain(vectorstore)

        sessions[session_id]["vectorstore"] = vectorstore
        sessions[session_id]["chain"] = chain
        sessions[session_id]["docs_info"].append({
            "filename": file.filename,
            "chunks": len(chunks),
            "pages": len(docs),
        })

    finally:
        os.unlink(tmp_path)   # Clean up temp file

    return {
        "message": f"✅ '{file.filename}' uploaded and indexed successfully.",
        "chunks_created": len(chunks),
        "total_docs": len(sessions[session_id]["docs_info"]),
    }


@app.post("/ask")
def ask_document(req: AskRequest):
    """
    Ask a question about uploaded documents (RAG pipeline).
    """
    if req.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    session = sessions[req.session_id]
    if session["chain"] is None:
        raise HTTPException(status_code=400, detail="No documents uploaded yet. Please upload a document first.")

    try:
        result = session["chain"].invoke({"question": req.question})
        answer = result.get("answer", "")

        # Extract source snippets for transparency
        sources = []
        for doc in result.get("source_documents", []):
            sources.append({
                "snippet": doc.page_content[:300],
                "source": doc.metadata.get("source", "uploaded document"),
                "page": doc.metadata.get("page", "N/A"),
            })

        return {
            "answer": answer,
            "sources": sources[:3],   # Return top 3 sources
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating answer: {str(e)}")


@app.post("/chat")
def general_chat(req: ChatRequest):
    """
    General-purpose chatbot (not RAG — direct Gemini conversation).
    """
    if req.session_id not in chat_memories:
        chat_memories[req.session_id] = []

    # Build message history for context
    history = chat_memories[req.session_id]
    messages = []
    for entry in history[-10:]:   # Keep last 10 turns to stay within context limits
        if entry["role"] == "user":
            messages.append(HumanMessage(content=entry["content"]))
        else:
            messages.append(AIMessage(content=entry["content"]))

    messages.append(HumanMessage(content=req.message))

    try:
        response = llm.invoke(messages)
        answer = response.content

        # Save to memory
        chat_memories[req.session_id].append({"role": "user", "content": req.message})
        chat_memories[req.session_id].append({"role": "assistant", "content": answer})

        return {"reply": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")


@app.get("/session/{session_id}/info")
def session_info(session_id: str):
    """Return info about uploaded documents in a session."""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {
        "documents": sessions[session_id]["docs_info"],
        "has_documents": sessions[session_id]["vectorstore"] is not None,
    }


@app.delete("/session/{session_id}")
def clear_session(session_id: str):
    """Clear all documents and memory for a session."""
    if session_id in sessions:
        # Delete Chroma collection to free memory
        vs = sessions[session_id]["vectorstore"]
        if vs:
            try:
                vs.delete_collection()
            except Exception:
                pass
        del sessions[session_id]
    if session_id in chat_memories:
        del chat_memories[session_id]
    return {"message": "Session cleared."}