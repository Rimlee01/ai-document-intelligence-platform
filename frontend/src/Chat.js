import React, { useState, useEffect, useRef } from 'react';
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

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const response = await fetch(
                "https://ai-document-intelligence-platform-hit4.onrender.com/chat",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        question: input
                    }),
                }
            );

            const data = await response.json();

            const aiMessage = {
                text: data.answer,
                sender: "ai"
            };

            setMessages((prev) => [...prev, aiMessage]);

        } catch (error) {

            const errorMessage = {
                text: "**Connection Error**: Backend not reachable.",
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
                <h2 style={styles.title}>
                    ai-document-intelligence-platform
                </h2>

                <div style={styles.statusBadge}>
                    Online
                </div>
            </div>


            <div style={styles.chatBox} ref={scrollRef}>

                {messages.map((msg, index) => (

                    <div
                        key={index}
                        style={{
                            ...styles.messageRow,
                            justifyContent:
                                msg.sender === "user"
                                ? "flex-end"
                                : "flex-start"
                        }}
                    >

                        <div
                            style={{
                                ...styles.bubble,

                                backgroundColor:
                                    msg.sender === "user"
                                    ? "#007bff"
                                    : "#ffffff",

                                color:
                                    msg.sender === "user"
                                    ? "#fff"
                                    : "#333",

                                borderRadius:
                                    msg.sender === "user"
                                    ? "18px 18px 2px 18px"
                                    : "18px 18px 18px 2px"
                            }}
                        >

                            <ReactMarkdown>
                                {msg.text}
                            </ReactMarkdown>

                        </div>

                    </div>

                ))}


                {loading && (

                    <div style={styles.messageRow}>

                        <div style={styles.bubble}>
                            <em>
                                AI is typing...
                            </em>
                        </div>

                    </div>

                )}

            </div>


            <div style={styles.inputArea}>

                <input

                    type="text"

                    value={input}

                    onChange={(e)=>setInput(e.target.value)}

                    onKeyDown={(e)=>
                        e.key === "Enter" && handleSendMessage()
                    }

                    style={styles.input}

                    placeholder="Ask me..."

                />


                <button

                    onClick={handleSendMessage}

                    style={styles.button}

                    disabled={loading}

                >
                    Send

                </button>


            </div>

        </div>
    );
};


const styles = {

    container:{
        maxWidth:"800px",
        margin:"30px auto",
        height:"85vh",
        display:"flex",
        flexDirection:"column",
        backgroundColor:"#f8f9fa",
        borderRadius:"15px",
        overflow:"hidden"
    },


    header:{
        padding:"20px",
        backgroundColor:"#fff",
        display:"flex",
        justifyContent:"space-between"
    },


    title:{
        margin:0
    },


    statusBadge:{
        color:"#28a745",
        fontWeight:"bold"
    },


    chatBox:{
        flex:1,
        overflowY:"auto",
        padding:"20px"
    },


    messageRow:{
        display:"flex",
        marginBottom:"10px"
    },


    bubble:{
        maxWidth:"75%",
        padding:"10px 15px",
        borderRadius:"18px"
    },


    inputArea:{
        padding:"20px",
        display:"flex",
        gap:"10px",
        backgroundColor:"#fff"
    },


    input:{
        flex:1,
        padding:"12px",
        borderRadius:"25px"
    },


    button:{
        padding:"0 25px",
        backgroundColor:"#007bff",
        color:"white",
        border:"none",
        borderRadius:"25px"
    }

};


export default Chat;