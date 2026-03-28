import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './ChatTab.css';

// Suggested prompts to show users what they can do
const SUGGESTIONS = [
  { icon: '💾', label: 'Write SQL', prompt: 'Write a SQL query to find the top 5 customers by revenue from an orders table.' },
  { icon: '📊', label: 'Data analysis', prompt: 'I have sales data: Jan=120, Feb=98, Mar=145, Apr=130. Calculate the growth rate and identify any trends.' },
  { icon: '🐍', label: 'Python script', prompt: 'Write a Python script that reads a CSV file, calculates basic statistics (mean, median, std dev), and plots a histogram.' },
  { icon: '✉️', label: 'Write an email', prompt: 'Write a professional email to a client explaining a project delay and the revised timeline.' },
  { icon: '🔍', label: 'Explain concept', prompt: 'Explain how vector embeddings work in simple terms, and why they\'re useful for semantic search.' },
  { icon: '🔧', label: 'Debug code', prompt: 'My Python function returns None instead of the expected value. What are the common reasons for this?' },
];

export default function ChatTab({ sessionId, api }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: "Hi! I'm your AI assistant powered by **Gemini 2.5 Flash**. I can help you with:\n\n- **SQL queries** and data analysis\n- **Code** in any language\n- **Calculations** and math\n- **Writing** — emails, reports, summaries\n- **Explaining** concepts\n\nWhat can I help you with today?",
    }
  ]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    try {
      const res = await axios.post(`${api}/chat`, {
        session_id: sessionId,
        message: msg,
      });
      setMessages(prev => [...prev, { role: 'assistant', text: res.data.reply }]);
    } catch (err) {
      const detail = err.response?.data?.detail || 'Something went wrong. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ ${detail}`, error: true }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const showSuggestions = messages.length === 1;  // Only after the welcome message

  return (
    <div className="chat-layout">
      <div className="panel-header">
        <h2>AI Chatbot</h2>
        <div className="header-badges">
          <span className="model-badge">gemini-2.5-flash</span>
          <span className="context-badge">10-turn memory</span>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role} ${msg.error ? 'error' : ''}`}>
            <div className="message-role">
              {msg.role === 'user' ? 'You' : 'Gemini'}
            </div>
            <div className="message-body">
              <ReactMarkdown>{msg.text}</ReactMarkdown>
            </div>
          </div>
        ))}

        {/* Suggestion chips — shown after welcome message */}
        {showSuggestions && (
          <div className="suggestions">
            <p className="suggestions-label">Try asking:</p>
            <div className="suggestion-grid">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => sendMessage(s.prompt)}
                  style={{ animationDelay: `${i * 0.06}s` }}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="message assistant typing">
            <div className="message-role">Gemini</div>
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
          placeholder="Ask me anything — SQL, code, analysis, writing…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="send-btn"
          onClick={() => sendMessage()}
          disabled={!input.trim() || loading}
        >
          {loading ? <div className="spinner-sm" /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
        </button>
      </div>
      <p className="input-hint">Enter to send · Shift+Enter for new line · Powered by Google Gemini</p>
    </div>
  );
}
