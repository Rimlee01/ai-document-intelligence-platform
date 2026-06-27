import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import "./chat.css";

const API_BASE =
  process.env.REACT_APP_API_URL ||
  "https://ai-document-intelligence-platform-hit4.onrender.com";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".csv"];

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
          openIndex === i && s.snippet && (
            <div className="citation-card" key={`card-${i}`}>{s.snippet}</div>
          )
      )}
    </div>
  );
}

async function timedFetch(url, options = {}, ms = 60000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function ensureAwake(onStatus) {
  try {
    await timedFetch(`${API_BASE}/`, {}, 5000);
    return true;
  } catch {}

  onStatus("⏳ Server is waking up (free tier). This takes ~30–50 seconds…");
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      await timedFetch(`${API_BASE}/`, {}, 5000);
      onStatus(null);
      return true;
    } catch {}
  }
  throw new Error("Server didn't respond after 90 seconds. Please try again.");
}

let convCounter = 1;

function Chat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiOnline, setApiOnline] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [wakeMsg, setWakeMsg] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState(() => convCounter++);

  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, wakeMsg]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await timedFetch(`${API_BASE}/`, {}, 8000);
      setApiOnline(res.ok);
    } catch {
      setApiOnline(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const t = setInterval(checkHealth, 20000);
    return () => clearInterval(t);
  }, [checkHealth]);

  const saveToHistory = useCallback((msgs, id) => {
    if (!msgs.length) return;
    const title =
      (msgs.find((m) => m.sender === "user")?.text || "Conversation").slice(0, 50);
    setHistory((prev) => {
      const idx = prev.findIndex((h) => h.id === id);
      const entry = { id, title, messages: msgs, ts: Date.now() };
      if (idx >= 0) { const n = [...prev]; n[idx] = entry; return n; }
      return [entry, ...prev];
    });
  }, []);

  useEffect(() => {
    if (messages.length) saveToHistory(messages, activeId);
  }, [messages, activeId, saveToHistory]);

  const startNew = () => {
    if (messages.length) saveToHistory(messages, activeId);
    setActiveId(convCounter++);
    setMessages([]);
    setWakeMsg(null);
    setSidebarOpen(false);
  };

  const loadConv = (entry) => {
    if (messages.length) saveToHistory(messages, activeId);
    setActiveId(entry.id);
    setMessages(entry.messages);
    setWakeMsg(null);
    setSidebarOpen(false);
  };

  const deleteConv = (e, id) => {
    e.stopPropagation();
    setHistory((p) => p.filter((h) => h.id !== id));
    if (activeId === id) { setMessages([]); setWakeMsg(null); }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const question = input;
    setMessages((p) => [...p, { text: question, sender: "user" }]);
    setInput("");
    setLoading(true);
    setWakeMsg(null);

    try {
      await ensureAwake((msg) => setWakeMsg(msg));
      setWakeMsg(null);

      const aiMsgId = Date.now();
      setMessages((p) => [...p, {
        id: aiMsgId,
        text: "",
        sender: "ai",
        streaming: true,
      }]);

      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: messages.slice(-10),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setMessages((p) => p.filter((m) => m.id !== aiMsgId));
        setMessages((p) => [...p, {
          text: data?.detail || "Something went wrong. Please try again.",
          sender: "ai",
          isError: true,
        }]);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let sources = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.token !== undefined) {
              fullText += parsed.token;
              setMessages((p) =>
                p.map((m) =>
                  m.id === aiMsgId ? { ...m, text: fullText } : m
                )
              );
            }
            if (parsed.sources) {
              sources = parsed.sources;
            }
          } catch {
            // incomplete JSON chunk, skip
          }
        }
      }

      setMessages((p) =>
        p.map((m) =>
          m.id === aiMsgId
            ? { ...m, text: fullText, sources, streaming: false }
            : m
        )
      );
    } catch (err) {
      setWakeMsg(null);
      setMessages((p) => p.filter((m) => !m.streaming));
      setMessages((p) => [...p, {
        text: err.message || "Unable to reach the server.",
        sender: "ai",
        isError: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const uploadFile = async (file) => {
    if (!file) return;

    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadStatus({ text: `"${ext}" not supported. Use: ${ALLOWED_EXTENSIONS.join(", ")}`, type: "error" });
      setTimeout(() => setUploadStatus(null), 5000);
      return;
    }

    setUploadStatus({ text: `Preparing to upload ${file.name}…`, type: "pending" });

    try {
      await ensureAwake((msg) =>
        setUploadStatus({ text: msg || `Uploading ${file.name}…`, type: "pending" })
      );

      setUploadStatus({ text: `Uploading ${file.name}…`, type: "pending" });
      const formData = new FormData();
      formData.append("file", file);

      const res = await timedFetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      }, 60000);

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setUploadStatus({
          text: data?.detail || `Upload failed (${res.status})`,
          type: "error",
        });
        return;
      }

      setUploadStatus({ text: `✓ ${file.name} indexed`, type: "success" });
      setMessages((p) => [...p, {
        text: `📄 **${file.name}** uploaded and indexed successfully.`,
        sender: "ai",
      }]);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadStatus({
        text: err.message || "Upload failed. Check console for details.",
        type: "error",
      });
    } finally {
      setTimeout(() => setUploadStatus(null), 6000);
    }
  };

  const onFileChange = (e) => {
    if (e.target.files?.[0]) uploadFile(e.target.files[0]);
    e.target.value = "";
  };

  function fmtTime(ts) {
    const d = new Date(ts), now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className="shell">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <p className="sidebar-title">AI Document Intelligence</p>
          <p className="sidebar-subtitle">Agentic RAG · Gemini</p>
        </div>

        <button className="new-chat-btn" onClick={startNew}>
          + New conversation
        </button>

        <p className="sidebar-label">
          <span>History</span><span>{history.length}</span>
        </p>

        <div className="history-list">
          {history.length === 0 ? (
            <p className="sidebar-empty">No conversations yet.</p>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className={`history-card ${activeId === entry.id ? "active" : ""}`}
                onClick={() => loadConv(entry)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && loadConv(entry)}
              >
                <div className="history-title">{entry.title}</div>
                <div className="history-meta">
                  <span>{fmtTime(entry.ts)}</span>
                  <button
                    className="history-delete"
                    onClick={(e) => deleteConv(e, entry.id)}
                  >✕</button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="chat-container">
        <div className="chat-header">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
          >☰</button>

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
            <button className="clear-btn" onClick={startNew} disabled={messages.length === 0}>
              New chat
            </button>
            <div className={`status ${apiOnline === true ? "online" : apiOnline === false ? "offline" : ""}`}>
              <span className="status-dot" />
              {apiOnline === null ? "Checking…" : apiOnline ? "Online" : "Offline"}
            </div>
          </div>
        </div>

        <div className="chat-box" ref={scrollRef} role="log" aria-live="polite">
          {messages.length === 0 && !wakeMsg && (
            <div className="welcome">
              <div className="ai-avatar">
                <span className="ai-dot" />AI Assistant
              </div>
              <h3>Ask anything about your documents</h3>
              <p>Upload a file using the 📎 button below, then ask questions about it</p>
              <div className="suggestions">
                <button onClick={() => setInput("Summarize my document")}>Summarize document</button>
                <button onClick={() => setInput("What are the key points?")}>Key points</button>
                <button onClick={() => setInput("Explain this document")}>Explain document</button>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`message-row ${msg.sender}`}>
              <div className="message-content">
                <div className="avatar">{msg.sender === "user" ? "Y" : "A"}</div>
                <div className={`bubble ${msg.sender} ${msg.isError ? "error" : ""} ${msg.streaming ? "streaming" : ""}`}>
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                  {msg.sender === "ai" && !msg.isError && !msg.streaming && (
                    <CitationTabs sources={msg.sources} />
                  )}
                </div>
              </div>
            </div>
          ))}

          {wakeMsg && (
            <div className="message-row ai">
              <div className="message-content">
                <div className="avatar">A</div>
                <div className="bubble ai wakeup">{wakeMsg}</div>
              </div>
            </div>
          )}
        </div>

        <div className="input-area">
          <button
            type="button"
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Upload a document"
          >📎</button>

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
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            aria-label="Your question"
          />

          <button onClick={handleSend} disabled={loading || !input.trim()}>
            {loading ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;