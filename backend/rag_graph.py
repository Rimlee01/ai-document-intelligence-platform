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
    max_output_tokens=512
)
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")


def get_retriever():
    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings
    )
    return vectorstore.as_retriever(
        search_kwargs={"k": 3}
    )


retriever = get_retriever()


class GraphState(TypedDict):
    question: str
    docs: List
    answer: str
    sources: List[str]


def retrieve(state: GraphState):
    question = state["question"]
    print(f"--- RETRIEVING DOCS FOR: {question} ---")

    documents = retriever.invoke(question)
    print("DOCUMENTS FOUND:", len(documents))

    for doc in documents:
        print("CONTENT:", doc.page_content[:200])

    return {
        "docs": documents,
        "question": question
    }


def generate(state: GraphState):
    question = state["question"]
    docs = state["docs"]

    if not docs:
        return {
            "answer": "I couldn't find anything relevant in the uploaded "
                      "documents. Try rephrasing, or upload a document that "
                      "covers this topic.",
            "sources": []
        }

    context = "\n\n".join(
        f"[Source: {d.metadata.get('source', 'unknown')}]\n{d.page_content}"
        for d in docs
    )

    prompt = f"""You are a helpful assistant. Answer the question based ONLY on the context provided below.
Each context chunk is labeled with its source document.

IMPORTANT RULES:
- If multiple documents are in the context, clearly separate your answer by document.
- If the user says "the document" but multiple documents exist, list each one separately and label them.
- If the answer isn't in the context, say you don't know - do not make anything up.
- Be specific and detailed in your answers.

Context:
{context}

Question: {question}
"""

Context:
{context}

Question: {question}
"""

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

    return {
        "answer": response.content,
        "sources": sources
    }


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