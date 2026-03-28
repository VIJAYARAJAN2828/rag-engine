import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';
import './RagTab.css';

export default function RagTab({ sessionId, api }) {
  const [docs, setDocs]           = useState([]);   // uploaded doc info
  const [messages, setMessages]   = useState([]);   // Q&A history
  const [question, setQuestion]   = useState('');
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking]       = useState(false);
  const [uploadError, setUploadError] = useState('');

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Dropzone ──────────────────────────────────────────────────────────
  const onDrop = async (acceptedFiles) => {
    if (!acceptedFiles.length) return;
    setUploadError('');
    setUploading(true);

    for (const file of acceptedFiles) {
      try {
        const form = new FormData();
        form.append('file', file);

        const res = await axios.post(`${api}/upload?session_id=${sessionId}`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setDocs(prev => [...prev, {
          name: file.name,
          size: file.size,
          chunks: res.data.chunks_created,
        }]);

        // Welcome message on first upload
        if (docs.length === 0) {
          setMessages([{
            role: 'assistant',
            text: `✅ **${file.name}** has been indexed (${res.data.chunks_created} chunks).\n\nYou can now ask questions about this document. Try asking:\n- *"Summarize this document"*\n- *"What are the key findings?"*\n- *"List the main topics covered"*`,
            sources: [],
          }]);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: `✅ **${file.name}** added to your knowledge base (${res.data.chunks_created} chunks). You can now query across all ${docs.length + 1} documents.`,
            sources: [],
          }]);
        }
      } catch (err) {
        const msg = err.response?.data?.detail || 'Upload failed. Please try again.';
        setUploadError(msg);
      }
    }
    setUploading(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
    multiple: true,
    disabled: uploading,
  });

  // ── Ask question ──────────────────────────────────────────────────────
  const handleAsk = async () => {
    const q = question.trim();
    if (!q || asking) return;

    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setAsking(true);

    try {
      const res = await axios.post(`${api}/ask`, {
        session_id: sessionId,
        question: q,
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: res.data.answer,
        sources: res.data.sources || [],
      }]);
    } catch (err) {
      const detail = err.response?.data?.detail || 'An error occurred. Please try again.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `⚠️ ${detail}`,
        sources: [],
        error: true,
      }]);
    }
    setAsking(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="rag-layout">
      {/* Left panel: Upload + Doc list */}
      <div className="rag-sidebar">
        <div className="panel-header">
          <h2>Knowledge Base</h2>
          <span className="badge">{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? 'drag-active' : ''} ${uploading ? 'disabled' : ''}`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="dz-inner">
              <div className="spinner-sm" />
              <span>Processing…</span>
            </div>
          ) : isDragActive ? (
            <div className="dz-inner">
              <span className="dz-icon">↓</span>
              <span>Drop it here!</span>
            </div>
          ) : (
            <div className="dz-inner">
              <span className="dz-icon">⊕</span>
              <span className="dz-primary">Upload documents</span>
              <span className="dz-sub">PDF, DOCX, TXT — drag & drop or click</span>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="upload-error">{uploadError}</div>
        )}

        {/* Document list */}
        {docs.length > 0 && (
          <div className="doc-list">
            {docs.map((doc, i) => (
              <div key={i} className="doc-item">
                <span className="doc-icon">{getDocIcon(doc.name)}</span>
                <div className="doc-info">
                  <span className="doc-name">{doc.name}</span>
                  <span className="doc-meta">{doc.chunks} chunks · {formatSize(doc.size)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {docs.length === 0 && (
          <div className="empty-hint">
            <p>Upload a document to start asking questions about it.</p>
            <ul>
              <li>Research papers</li>
              <li>Legal contracts</li>
              <li>Financial reports</li>
              <li>Study materials</li>
            </ul>
          </div>
        )}
      </div>

      {/* Right panel: Q&A Chat */}
      <div className="rag-chat">
        <div className="panel-header">
          <h2>Document Q&amp;A</h2>
          <span className="model-badge">gemini-2.5-flash</span>
        </div>

        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="chat-empty-icon">◈</div>
              <h3>Ask anything about your documents</h3>
              <p>Upload a document on the left to get started.</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role} ${msg.error ? 'error' : ''}`}>
                <div className="message-role">
                  {msg.role === 'user' ? 'You' : 'DocMind'}
                </div>
                <div className="message-body">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
                {/* Source citations */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="sources">
                    <div className="sources-label">Sources</div>
                    {msg.sources.map((s, j) => (
                      <div key={j} className="source-item">
                        <span className="source-file">{s.source.split('/').pop()} {s.page !== 'N/A' ? `· p.${s.page}` : ''}</span>
                        <p className="source-snippet">"{s.snippet}…"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {asking && (
            <div className="message assistant typing">
              <div className="message-role">DocMind</div>
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            placeholder={docs.length === 0 ? 'Upload a document first…' : 'Ask a question about your documents…'}
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={docs.length === 0 || asking}
          />
          <button
            className="send-btn"
            onClick={handleAsk}
            disabled={!question.trim() || asking || docs.length === 0}
          >
            {asking ? <div className="spinner-sm" /> : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            )}
          </button>
        </div>
        <p className="input-hint">Enter to send · Shift+Enter for new line · Answers grounded in your documents</p>
      </div>
    </div>
  );
}

function getDocIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf')  return '📄';
  if (ext === 'docx') return '📝';
  return '📃';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
