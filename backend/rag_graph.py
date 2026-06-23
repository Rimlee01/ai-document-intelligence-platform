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

prompt = f"""
You are an intelligent document-based assistant. Your task is to answer the user's question using ONLY the information available in the provided context.

Follow these rules carefully:

1. Context Usage:
- Use only the provided context to generate your answer.
- Do not use your own knowledge or assumptions.
- If the answer cannot be found in the context, clearly say:
  "I don't have enough information in the provided documents to answer this."

2. Multiple Documents:
- Each context section contains information from a different source document.
- If multiple documents contain relevant information:
    - Mention the document name/source.
    - Separate the answer clearly for each document.
- If the user refers to "the document" but multiple documents are available, explain the answer document-by-document.

3. Answer Quality:
- Provide accurate, specific, and detailed answers.
- Include important details, numbers, dates, names, or steps when available.
- Avoid vague responses.
- Do not summarize unless the user asks for a summary.

4. Handling Missing Information:
- Never guess or create information that is not present in the context.
- If only partial information is available, mention what is available and what is missing.

Context:
----------------
{context}
----------------

User Question:
{question}

Answer:
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