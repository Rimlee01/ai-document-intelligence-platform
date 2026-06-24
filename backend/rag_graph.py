import os
from typing import TypedDict, List
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0,
    max_output_tokens=1024
)
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")


def get_retriever():
    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings
    )
    return vectorstore.as_retriever(search_kwargs={"k": 3})


retriever = get_retriever()


class GraphState(TypedDict):
    question: str
    history: List[dict]
    docs: List
    answer: str
    sources: List


def retrieve(state: GraphState):
    question = state["question"]
    print(f"--- RETRIEVING DOCS FOR: {question} ---")
    documents = retriever.invoke(question)
    print("DOCUMENTS FOUND:", len(documents))
    return {"docs": documents, "question": question}


def generate(state: GraphState):
    question = state["question"]
    docs = state["docs"]
    history = state.get("history", [])

    if not docs:
        return {
            "answer": "I couldn't find anything relevant in the uploaded documents. "
                      "Try rephrasing, or upload a document that covers this topic.",
            "sources": []
        }

    context = "\n\n".join(
        f"[Source: {d.metadata.get('source', 'unknown')}]\n{d.page_content}"
        for d in docs
    )

    # Build conversation history string
    history_text = ""
    if history:
        history_text = "Previous conversation:\n"
        for msg in history[-6:]:  # last 6 messages to avoid token overflow
            role = "User" if msg.get("sender") == "user" else "Assistant"
            history_text += f"{role}: {msg.get('text', '')}\n"
        history_text += "\n"

    prompt = (
        "You are an intelligent document-based assistant. Answer using ONLY the context below.\n\n"
        + (history_text if history_text else "")
        + "Rules:\n"
        "- Use only the provided context. Do not use outside knowledge.\n"
        "- If multiple documents are relevant, answer per document and label each.\n"
        "- If the user refers to something from earlier in the conversation, use the conversation history above.\n"
        "- If the answer isn't in the context, say: 'I don't have enough information in the provided documents to answer this.'\n"
        "- Never guess or make up information.\n"
        "- Be specific and detailed. Include numbers, names, dates when available.\n\n"
        f"Context:\n----------------\n{context}\n----------------\n\n"
        f"Current Question: {question}\n\nAnswer:"
    )

    response = llm.invoke(prompt)

    sources = []
    seen = set()
    for d in docs:
        src = d.metadata.get("source", "unknown")
        if src in seen:
            continue
        seen.add(src)
        snippet = d.page_content[:180].strip()
        if len(d.page_content) > 180:
            snippet += "…"
        sources.append({"source": src, "snippet": snippet})

    return {"answer": response.content, "sources": sources}


def build_graph():
    workflow = StateGraph(GraphState)
    workflow.add_node("retrieve", retrieve)
    workflow.add_node("generate", generate)
    workflow.set_entry_point("retrieve")
    workflow.add_edge("retrieve", "generate")
    workflow.add_edge("generate", END)
    return workflow.compile()


graph = build_graph()


def refresh_retriever():
    global retriever
    retriever = get_retriever()
    print("Retriever refreshed")