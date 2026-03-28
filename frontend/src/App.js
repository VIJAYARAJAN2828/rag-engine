import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import RagTab from './components/RagTab';
import ChatTab from './components/ChatTab';
import './App.css';

// Backend URL — set REACT_APP_API_URL in .env for production
const API = process.env.REACT_APP_API_URL || '';

export default function App() {
  const [tab, setTab] = useState('rag');             // 'rag' | 'chat'
  const [sessionId, setSessionId] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  console.log("hello this is the session id", sessionId);
  // Create a session on first load
  useEffect(() => {
    const initSession = async () => {
      try {
        const res = await axios.post(`${API}/session/create`);
        setSessionId(res.data.session_id);
        setSessionReady(true);
      } catch (err) {
        console.error('Failed to create session:', err);
        // Fallback: generate client-side ID (chat still works)
        setSessionId(uuidv4());
        setSessionReady(true);
      }
    };
    initSession();
  }, []);

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">◈</span>
          <span className="logo-text">VijAI<span className="logo-ai">AI</span></span>
        </div>

        <nav className="nav">
          <button
            className={`nav-item ${tab === 'rag' ? 'active' : ''}`}
            onClick={() => setTab('rag')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Document RAG
          </button>

          <button
            className={`nav-item ${tab === 'chat' ? 'active' : ''}`}
            onClick={() => setTab('chat')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            AI Chatbot
          </button>
        </nav>

        {/* Session badge */}
        <div className="session-badge">
          <span className={`status-dot ${sessionReady ? 'online' : 'offline'}`} />
          <span className="session-label">
            {sessionReady ? `Session active` : 'Connecting…'}
          </span>
        </div>

        <div className="sidebar-footer">
          <div className="tech-stack">
            <span>Gemini 2.5 Flash</span>
            <span>LangChain</span>
            <span>ChromaDB</span>
            <span>FastAPI</span>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-content">
        {sessionReady ? (
          tab === 'rag'
            ? <RagTab sessionId={sessionId} api={API} />
            : <ChatTab sessionId={sessionId} api={API} />
        ) : (
          <div className="loading-screen">
            <div className="spinner" />
            <p>Initializing session…</p>
          </div>
        )}
      </main>
    </div>
  );
}
