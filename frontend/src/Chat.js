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


        if (!input.trim()) return;


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

                        question: question

                    })

                }

            );



            const data = await response.json();



            setMessages((prev) => [

                ...prev,

                {

                    text: data.answer,

                    sender: "ai"

                }

            ]);



        }

        catch (error) {


            setMessages((prev) => [

                ...prev,

                {

                    text: "⚠️ Backend connection error.",

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



            <div className="chat-header">


                <div className="brand">


                    <h2>

                        🤖 AI Document Intelligence

                    </h2>


                    <p>

                        Agentic RAG powered assistant

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

                        🟢 Online

                    </div>



                </div>



            </div>







            <div

                className="chat-box"

                ref={scrollRef}

            >



                {

                    messages.length === 0 &&

                    (

                        <div className="welcome">


                            <div className="robot">

                                🤖

                            </div>



                            <h3>

                                Welcome to AI Document Intelligence

                            </h3>



                            <p>

                                Intelligent document analysis powered by Gemini + RAG

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
                                        setInput("Summarize my resume")
                                    }
                                >
                                    Summarize my resume
                                </button>



                                <button
                                    onClick={() =>
                                        setInput("What are my skills?")
                                    }
                                >
                                    Find my skills
                                </button>



                                <button
                                    onClick={() =>
                                        setInput("Explain this document")
                                    }
                                >
                                    Explain document
                                </button>


                            </div>



                        </div>

                    )

                }





                {

                    messages.map((msg, index) => (


                        <div

                            key={index}

                            className={`message-row ${msg.sender}`}

                        >


                            <div

                                className={`bubble ${msg.sender}`}

                            >


                                <ReactMarkdown>

                                    {msg.text}

                                </ReactMarkdown>



                            </div>



                        </div>


                    ))

                }






                {

                    loading &&


                    (

                        <div className="message-row ai">


                            <div className="typing-bubble">


                                <span></span>

                                <span></span>

                                <span></span>


                            </div>


                        </div>

                    )

                }



            </div>







            <div className="input-area">



                <input


                    value={input}


                    placeholder="Ask anything about your documents..."


                    onChange={(e) => setInput(e.target.value)}



                    onKeyDown={(e) => {


                        if (e.key === "Enter") {

                            handleSendMessage();

                        }


                    }}



                />





                <button

                    onClick={handleSendMessage}

                    disabled={loading}

                >

                    Send

                </button>



            </div>





        </div>


    );


}



export default Chat;