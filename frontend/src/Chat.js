import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const Chat = () => {
    const [input, setInput] = useState("");
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSendMessage = async () => {
        if (!input.trim()) return;

        const userMessage = { text: input, sender: "user" };
        setMessages([...messages, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const response = await axios.post("http://127.0.0.1:8000/chat", {
                question: input 
            });

            const aiMessage = { text: response.data.answer, sender: "ai" };
            setMessages((prev) => [...prev, aiMessage]);
        } catch (error) {
            const errorMessage = { 
                text: "**Connection Error**: Make sure your FastAPI server is running.", 
                sender: "ai" 
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>ai-document-intelligence-platform</h2>
                <div style={styles.statusBadge}>Online</div>
            </div>

            <div style={styles.chatBox} ref={scrollRef}>
                {messages.map((msg, index) => (
                    <div key={index} style={{ 
                        ...styles.messageRow, 
                        justifyContent: msg.sender === "user" ? "flex-end" : "flex-start" 
                    }}>
                        <div style={{ 
                            ...styles.bubble, 
                            backgroundColor: msg.sender === "user" ? "#007bff" : "#ffffff",
                            color: msg.sender === "user" ? "#fff" : "#333",
                            borderRadius: msg.sender === "user" ? "18px 18px 2px 18px" : "18px 18px 18px 2px",
                            boxShadow: "0 2px 5px rgba(0,0,0,0.05)"
                        }}>
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                    </div>
                ))}
                {loading && (
                    <div style={styles.messageRow}>
                        <div style={{...styles.bubble, backgroundColor: '#f0f0f0'}}>
                            <em style={{color: '#888'}}>AI is typing...</em>
                        </div>
                    </div>
                )}
            </div>

            <div style={styles.inputArea}>
                <input 
                    type="text" 
                    value={input} 
                    onChange={(e) => setInput(e.target.value)} 
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    style={styles.input}
                    placeholder="Ask me..."
                />
                <button onClick={handleSendMessage} style={styles.button} disabled={loading}>
                    Send
                </button>
            </div>
        </div>
    );
};

const styles = {
    container: {
        maxWidth: "800px",
        margin: "30px auto",
        height: "85vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f8f9fa",
        borderRadius: "15px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
        overflow: "hidden",
        fontFamily: "'Segoe UI', Roboto, sans-serif"
    },
    header: {
        padding: "20px",
        backgroundColor: "#fff",
        borderBottom: "1px solid #eee",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
    },
    title: { margin: 0, fontSize: "1.2rem", color: "#222" },
    statusBadge: { fontSize: "0.8rem", color: "#28a745", fontWeight: "bold" },
    chatBox: {
        flex: 1,
        overflowY: "auto",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        backgroundColor: "#f0f2f5"
    },
    messageRow: { display: "flex", width: "100%" },
    bubble: {
        maxWidth: "75%",
        padding: "5px 15px",
        fontSize: "0.95rem",
        lineHeight: "1.5",
        wordWrap: "break-word"
    },
    inputArea: {
        padding: "20px",
        backgroundColor: "#fff",
        display: "flex",
        gap: "10px",
        borderTop: "1px solid #eee"
    },
    input: {
        flex: 1,
        padding: "12px 15px",
        borderRadius: "25px",
        border: "1px solid #ddd",
        outline: "none",
        fontSize: "1rem"
    },
    button: {
        padding: "0 25px",
        backgroundColor: "#007bff",
        color: "white",
        border: "none",
        borderRadius: "25px",
        cursor: "pointer",
        fontWeight: "bold",
        transition: "0.2s"
    }
};

export default Chat;