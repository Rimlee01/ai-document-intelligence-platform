import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import "./chat.css";

const API_BASE =
  process.env.REACT_APP_API_URL ||
  "https://ai-document-intelligence-platform-hit4.onrender.com";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".csv"];
const UPLOAD_TIMEOUT_MS = 60000; // 60s — Render free tier can be slow to wake

function getExtension(filename) {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((s) => {
      if (typeof s === "string") return { source: s, snippet: null };
      if (s && typeof s === "object" && s.source)
        return { source: s.source, snippet: s.snippet || null };
      return null;
    })
    .filter(Boolean);
}

function CitationTabs({ sources }) {
  const [openIndex, setOpenIndex] = useState(null);
  const normalized = normalizeSources(sources);
  if (normalized.length === 0) return null;

  return (
    <div className="citations">
      <div className="citations-row">
        {normalized.map((s, i) => (
          <button
            key={`${s.source}-${i}`}
            type="button"
            className="citation-tab"
            aria-expanded={openIndex === i}
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            {s.source}
          </button>
        ))}
      </div>
      {normalized.map(
        (s, i) =>
          openIndex === i &&
          s.snippet && (
            <div className="citation-card" key={`card-${i}`}>
              {s.snippet}
            </div>
          )
      )}
    </div>
  );
}

// Single fetch with abort-based timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 90000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    if (err.name === "AbortError") throw new Error("TIMEOUT");
    throw err;
  }
}

// Handles Render free-tier cold starts: pings the server until awake,
// then automatically fires the real request. No manual retry needed.
async function wakeAndFetch(url, options = {}, onWaking = null) {
  try {
    await fetchWithTimeout(`${API_BASE}/`, {}, 5000);
    return await fetchWithTimeout(url, options, 90000);
  } catch {
    if (onWaking) onWaking();
    const started = Date.now();
    while (Date.now() - started < 90000) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        await fetchWithTimeout(`${API_BASE}/`, {}, 5000);
        return await fetchWithTimeout(url, options, 90000);
      } catch {
        // still waking, keep polling
      }
    }
    throw new Error("Server took too long to wake up. Please try again.");
  }
}

let conversationCounter = 1;

function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const [apiOnline, setApiOnline] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // History: array of { id, title, messages, timestamp }
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState(null);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const checkApiHealth = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/`, {}, 10000);
      setApiOnline(res.ok);
    } catch {
      setApiOnline(false);
    }
  }, []);

  useEffect(() => {
    checkApiHealth();
    const interval = setInterval(checkApiHealth, 20000);
    return () => clearInterval(interval);
  }, [checkApiHealth]);

  // Save current messages to history when a conversation ends / new one starts
  const saveToHistory = useCallback((msgs, id) => {
    if (msgs.length === 0) return;
    const firstUser = msgs.find((m) => m.sender === "user");
    const title = firstUser
      ? firstUser.text.slice(0, 48) + (firstUser.text.length > 48 ? "…" : "")
      : "Conversation";

    setHistory((prev) => {
      const existing = prev.findIndex((h) => h.id === id);
      const entry = { id, title, messages: msgs, timestamp: Date.now() };
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = entry;
        return next;
      }
      return [entry, ...prev];
    });
  }, []);

  const startNewConversation = () => {
    if (messages.length > 0) saveToHistory(messages, activeId);
    const newId = conversationCounter++;
    setActiveId(newId);
    setMessages([]);
    setSidebarOpen(false);
  };

  const loadConversation = (entry) => {
    if (messages.length > 0) saveToHistory(messages, activeId);
    setActiveId(entry.id);
    setMessages(entry.messages);
    setSidebarOpen(false);
  };

  const deleteConversation = (e, id) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((h) => h.id !== id));
    if (activeId === id) {
      setMessages([]);
      setActiveId(null);
    }
  };

  // Auto-save on every message change
  useEffect(() => {
    if (messages.length > 0 && activeId !== null) {
      saveToHistory(messages, activeId);
    }
  }, [messages, activeId, saveToHistory]);

  // Init first conversation id
  useEffect(() => {
    if (activeId === null) setActiveId(conversationCounter++);
  }, [activeId]);

  const handleSendMessage = async () => {
    if (!input.trim() || loading) return;

    const question = input;
    setMessages((prev) => [...prev, { text: question, sender: "user" }]);
    setInput("");
    setLoading(true);

    try {
      const response = await wakeAndFetch(
        `${API_BASE}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question }),
        },
        () => {
          // Server is waking up — show a message in the thread
          setMessages((prev) => [
            ...prev,
            {
              text: "⏳ Server is waking up (Render free tier sleeps after inactivity). This usually takes 30–50 seconds — your answer is coming…",
              sender: "ai",
              isWakeup: true,
            },
          ]);
        }
      );

      const data = await response.json().catch(() => null);

      // Remove the wakeup notice once we have a real answer
      setMessages((prev) => prev.filter((m) => !m.isWakeup));

      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            text: data?.detail || "Something went wrong. Please try again.",
            sender: "ai",
            isError: true,
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          text: data?.answer || "No response.",
          sender: "ai",
          sources: data?.sources,
        },
      ]);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => !m.isWakeup));
      setMessages((prev) => [
        ...prev,
        { text: err.message || "Unable to reach the server.", sender: "ai", isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async (file) => {
    if (!file) return;

    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadStatus({
        text: `"${ext}" isn't supported. Use ${ALLOWED_EXTENSIONS.join(", ")}.`,
        type: "error",
      });
      setTimeout(() => setUploadStatus(null), 4000);
      return;
    }

    setUploadStatus({ text: `Uploading ${file.name}… (server may be waking up)`, type: "pending" });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await wakeAndFetch(
        `${API_BASE}/upload`,
        { method: "POST", body: formData },
        () => {
          setUploadStatus({
            text: "Server is waking up… (30–50 sec) — hang tight",
            type: "pending",
          });
        }
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setUploadStatus({
          text: data?.detail || `Failed to upload ${file.name}.`,
          type: "error",
        });
        return;
      }

      setUploadStatus({ text: `${file.name} indexed ✓`, type: "success" });
      setMessages((prev) => [
        ...prev,
        { text: `📄 **${file.name}** uploaded and indexed successfully.`, sender: "ai" },
      ]);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadStatus({
        text: err.message || "Upload failed. Check your connection.",
        type: "error",
      });
    } finally {
      setTimeout(() => setUploadStatus(null), 8000);
    }
  };

  const onFileChange = (e) => {
    uploadDocument(e.target.files[0]);
    e.target.value = "";
  };

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="shell">
      {sidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ===== Sidebar — History ===== */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <p className="sidebar-title">AI Document Intelligence</p>
          <p className="sidebar-subtitle">Agentic RAG · Gemini</p>
        </div>

        <button className="new-chat-btn" onClick={startNewConversation}>
          + New conversation
        </button>

        <p className="sidebar-label">
          <span>History</span>
          <span>{history.length}</span>
        </p>

        <div className="history-list">
          {history.length === 0 ? (
            <p className="sidebar-empty">
              No conversations yet. Ask your first question!
            </p>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className={`history-card ${activeId === entry.id ? "active" : ""}`}
                onClick={() => loadConversation(entry)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && loadConversation(entry)}
              >
                <div className="history-title">{entry.title}</div>
                <div className="history-meta">
                  <span>{formatTime(entry.timestamp)}</span>
                  <button
                    className="history-delete"
                    onClick={(e) => deleteConversation(e, entry.id)}
                    aria-label="Delete conversation"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ===== Main chat ===== */}
      <div className="chat-container">
        <div className="chat-header">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle history"
          >
            ☰
          </button>

          <div className="brand">
            <h2>AI Document Intelligence</h2>
            <p>Agentic RAG · Gemini powered</p>
          </div>

          <div className="header-actions">
            {uploadStatus && (
              <div className={`upload-pill ${uploadStatus.type}`}>
                {uploadStatus.text}
              </div>
            )}
            <button
              className="clear-btn"
              onClick={startNewConversation}
              disabled={messages.length === 0}
            >
              New chat
            </button>
            <div className={`status ${apiOnline ? "online" : apiOnline === false ? "offline" : ""}`}>
              <span className="status-dot" />
              {apiOnline === null ? "Checking…" : apiOnline ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        <div className="chat-box" ref={scrollRef} role="log" aria-live="polite">
          {messages.length === 0 && (
            <div className="welcome">
              <div className="ai-avatar">
                <span className="ai-dot" aria-hidden="true" />
                AI Assistant
              </div>
              <h3>Ask anything about your documents</h3>
              <p>Upload a file using the 📎 button, then ask questions about it</p>
              <div className="suggestions">
                <button onClick={() => setInput("Summarize my document")}>
                  Summarize document
                </button>
                <button onClick={() => setInput("What are the key points?")}>
                  Key points
                </button>
                <button onClick={() => setInput("Explain this document")}>
                  Explain document
                </button>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className={`message-row ${msg.sender}`}>
              <div className="message-content">
                <div className="avatar" aria-hidden="true">
                  {msg.sender === "user" ? "Y" : "A"}
                </div>
                <div className={`bubble ${msg.sender} ${msg.isError ? "error" : ""}`}>
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                  {msg.sender === "ai" && !msg.isError && (
                    <CitationTabs sources={msg.sources} />
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="message-row ai">
              <div className="message-content">
                <div className="avatar" aria-hidden="true">A</div>
                <div className="typing-bubble">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="input-area">
          <button
            type="button"
            className="upload-btn"
            aria-label="Upload a document"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_EXTENSIONS.join(",")}
            style={{ display: "none" }}
            onChange={onFileChange}
          />

          <input
            value={input}
            placeholder="Ask anything about your documents…"
            disabled={loading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage(); }}
            aria-label="Your question"
          />

          <button
            onClick={handleSendMessage}
            disabled={loading || !input.trim()}
          >
            {loading ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
