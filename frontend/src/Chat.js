import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import "./chat.css";


function Chat() {


    const [input, setInput] = useState("");

    const [messages, setMessages] = useState([]);

    const [loading, setLoading] = useState(false);


    const scrollRef = useRef(null);



    useEffect(() => {

        if (scrollRef.current) {

            scrollRef.current.scrollTop =
                scrollRef.current.scrollHeight;

        }

    }, [messages, loading]);





    const handleSendMessage = async () => {


        if (!input.trim() || loading) return;



        const question = input;



        setMessages((prev) => [

            ...prev,

            {
                text: question,
                sender: "user"
            }

        ]);



        setInput("");

        setLoading(true);




        try {


            const response = await fetch(

                "https://ai-document-intelligence-platform-hit4.onrender.com/chat",

                {

                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        question
                    })

                }

            );



            if (!response.ok) {

                throw new Error("Server error");

            }



            const data = await response.json();



            setMessages((prev) => [

                ...prev,

                {

                    text: data?.answer || "No response",

                    sender: "ai"

                }

            ]);



        } catch (error) {


            setMessages((prev) => [

                ...prev,

                {

                    text: "⚠️ Unable to connect to AI server.",

                    sender: "ai"

                }

            ]);

        }



        finally {

            setLoading(false);

        }


    };






    return (


        <div className="chat-container">





            {/* HEADER */}

            <div className="chat-header">


                <div className="brand">


                    <h2>

                        ✨ AI Document Intelligence

                    </h2>


                    <p>

                        Agentic RAG • Gemini powered

                    </p>


                </div>





                <div className="header-actions">


                    <button

                        className="clear-btn"

                        onClick={() => setMessages([])}

                    >

                        Clear

                    </button>



                    <div className="status">

                        <span className="status-dot"></span>

                        Online

                    </div>



                </div>


            </div>








            {/* CHAT AREA */}


            <div

                className="chat-box"

                ref={scrollRef}

            >






                {/* WELCOME */}


                {messages.length === 0 && (


                    <div className="welcome">



                        <div className="ai-avatar">

                            <span className="ai-dot"></span>

                            AI Assistant

                        </div>





                        <h3>

                            Ask anything about your document

                        </h3>





                        <p>

                            Powered by Gemini + RAG-based intelligence system

                        </p>





                        <div className="document-status">


                            <span>

                                📄 Resume.pdf loaded

                            </span>



                            <span>

                                🟢 Knowledge base ready

                            </span>


                        </div>






                        <div className="suggestions">



                            <button

                                onClick={() =>
                                    setInput("Summarize my resume")}

                            >

                                Summarize resume

                            </button>




                            <button

                                onClick={() =>
                                    setInput("What are my skills?")}

                            >

                                My skills

                            </button>




                            <button

                                onClick={() =>
                                    setInput("Explain this document")}

                            >

                                Explain document

                            </button>



                        </div>



                    </div>


                )}








                {/* MESSAGES */}



                {messages.map((msg, index) => (



                    <div

                        key={index}

                        className={`message-row ${msg.sender}`}

                    >



                        <div className="message-content">



                            <div className="avatar">

                                {msg.sender === "user"
                                    ? "👤"
                                    : "✨"}

                            </div>





                            <div

                                className={`bubble ${msg.sender}`}

                            >


                                <ReactMarkdown>

                                    {msg.text}

                                </ReactMarkdown>



                            </div>



                        </div>



                    </div>



                ))}








                {/* TYPING */}



                {loading && (


                    <div className="message-row ai">


                        <div className="typing-bubble">


                            <span></span>

                            <span></span>

                            <span></span>


                        </div>


                    </div>


                )}





            </div>









            {/* INPUT */}


            <div className="input-area">


                <textarea

                    value={input}

                    placeholder="Ask anything about your documents..."

                    disabled={loading}

                    onChange={(e) => setInput(e.target.value)}

                    onKeyDown={(e) => {

                        if (e.key === "Enter" && !e.shiftKey) {

                            e.preventDefault();

                            handleSendMessage();

                        }

                    }}

                />



                />





                <button
                    onClick={handleSendMessage}
                    disabled={loading || !input.trim()}
                >
                    {loading ? "Analyzing..." : "Send"}
                </button>


            </div>







        </div>



    );


}



export default Chat;