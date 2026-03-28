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

from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_classic.chains import ConversationalRetrievalChain
from langchain_classic.memory import ConversationBufferMemory
from langchain_core.messages import HumanMessage, AIMessage

# App setup
app = FastAPI(title="RAG App API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Google API Key
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY

# LLM - lightweight, initialize at startup
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)

# Embeddings - lazy initialization (only created on first upload)
# This prevents startup crashes from model API issues
_embeddings = None

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        _embeddings = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004"
        )
    return _embeddings

# In-memory session store
sessions: dict = {}
chat_memories: dict = {}

# Pydantic models
class AskRequest(BaseModel):
    session_id: str
    question: str

class ChatRequest(BaseModel):
    session_id: str
    message: str

class SessionRequest(BaseModel):
    session_id: Optional[str] = None

# Helpers
def load_document(file_path: str, filename: str):
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

# Routes
@app.get("/")
def root():
    return {"status": "RAG API is running 🚀"}

@app.post("/session/create")
def create_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = {"vectorstore": None, "chain": None, "docs_info": []}
    chat_memories[session_id] = []
    return {"session_id": session_id}

@app.post("/upload")
async def upload_document(session_id: str, file: UploadFile = File(...)):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")

    allowed = {".pdf", ".docx", ".txt"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '{ext}'.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        docs = load_document(tmp_path, file.filename)
        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
        chunks = splitter.split_documents(docs)

        if not chunks:
            raise HTTPException(status_code=400, detail="No text could be extracted.")

        embeddings = get_embeddings()

        existing_vs = sessions[session_id]["vectorstore"]
        if existing_vs is None:
            vectorstore = Chroma.from_documents(
                documents=chunks,
                embedding=embeddings,
                collection_name=f"session_{session_id[:8]}",
            )
        else:
            existing_vs.add_documents(chunks)
            vectorstore = existing_vs

        chain = build_rag_chain(vectorstore)
        sessions[session_id]["vectorstore"] = vectorstore
        sessions[session_id]["chain"] = chain
        sessions[session_id]["docs_info"].append({
            "filename": file.filename,
            "chunks": len(chunks),
            "pages": len(docs),
        })
    finally:
        os.unlink(tmp_path)

    return {
        "message": f"'{file.filename}' uploaded successfully.",
        "chunks_created": len(chunks),
        "total_docs": len(sessions[session_id]["docs_info"]),
    }

@app.post("/ask")
def ask_document(req: AskRequest):
    if req.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
    session = sessions[req.session_id]
    if session["chain"] is None:
        raise HTTPException(status_code=400, detail="No documents uploaded yet.")
    try:
        result = session["chain"].invoke({"question": req.question})
        answer = result.get("answer", "")
        sources = []
        for doc in result.get("source_documents", []):
            sources.append({
                "snippet": doc.page_content[:300],
                "source": doc.metadata.get("source", "uploaded document"),
                "page": doc.metadata.get("page", "N/A"),
            })
        return {"answer": answer, "sources": sources[:3]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")

@app.post("/chat")
def general_chat(req: ChatRequest):
    if req.session_id not in chat_memories:
        chat_memories[req.session_id] = []
    history = chat_memories[req.session_id]
    messages = []
    for entry in history[-10:]:
        if entry["role"] == "user":
            messages.append(HumanMessage(content=entry["content"]))
        else:
            messages.append(AIMessage(content=entry["content"]))
    messages.append(HumanMessage(content=req.message))
    try:
        response = llm.invoke(messages)
        answer = response.content
        chat_memories[req.session_id].append({"role": "user", "content": req.message})
        chat_memories[req.session_id].append({"role": "assistant", "content": answer})
        return {"reply": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@app.get("/session/{session_id}/info")
def session_info(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {
        "documents": sessions[session_id]["docs_info"],
        "has_documents": sessions[session_id]["vectorstore"] is not None,
    }

@app.delete("/session/{session_id}")
def clear_session(session_id: str):
    if session_id in sessions:
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