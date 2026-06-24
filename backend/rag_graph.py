import os
from typing import TypedDict

from dotenv import load_dotenv

from langgraph.graph import StateGraph, END

from langchain_google_genai import (
    ChatGoogleGenerativeAI,
    GoogleGenerativeAIEmbeddings
)

from langchain_chroma import Chroma


# =========================
# ENV
# =========================

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")


# =========================
# PATHS
# =========================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CHROMA_DIR = os.path.join(
    BASE_DIR,
    "chroma_db"
)


# =========================
# LLM + EMBEDDINGS
# =========================

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0,
    max_output_tokens=1024
)


embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)



# =========================
# RETRIEVER
# =========================

def get_retriever():

    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings
    )


    retriever = vectorstore.as_retriever(
        search_kwargs={
            "k": 3
        }
    )


    return retriever



retriever = get_retriever()



# =========================
# GRAPH STATE
# =========================

class GraphState(TypedDict):

    question: str

    history: list[dict]

    docs: list

    answer: str

    sources: list



# =========================
# RETRIEVE NODE
# =========================

def retrieve(state: GraphState):

    question = state["question"]


    print(
        f"--- RETRIEVING DOCS FOR: {question} ---"
    )


    documents = retriever.invoke(
        question
    )


    print(
        "DOCUMENTS FOUND:",
        len(documents)
    )


    for doc in documents:

        print(
            "CONTENT:",
            doc.page_content[:200]
        )


    return {

        "docs": documents,

        "question": question

    }



# =========================
# GENERATE NODE
# =========================

def generate(state: GraphState):

    question = state["question"]

    docs = state["docs"]

    history = state.get(
        "history",
        []
    )



    if not docs:

        return {

            "answer":
            "I couldn't find anything relevant in the uploaded documents. Try rephrasing, or upload a document that covers this topic.",

            "sources": []

        }



    # =========================
    # CONTEXT CREATION
    # =========================

    context = "\n\n".join(

        f"""
Source Document:
{doc.metadata.get('source','unknown')}

Content:
{doc.page_content}
"""

        for doc in docs

    )



    # =========================
    # CHAT MEMORY
    # =========================

    history_text = ""


    if history:

        history_text = "Previous conversation:\n"


        for msg in history[-6:]:

            role = (
                "User"
                if msg.get("sender") == "user"
                else "Assistant"
            )


            history_text += (
                f"{role}: "
                f"{msg.get('text','')}\n"
            )


        history_text += "\n"



    # =========================
    # PROMPT
    # =========================

    prompt = f"""

You are an intelligent document-based assistant.

Answer the user's question using ONLY the provided context.

Rules:

1. Context:
- Use only the provided documents.
- Do not use outside knowledge.
- Do not make assumptions.
- Never hallucinate.

2. Multiple Documents:
- If multiple documents contain answers:
  - Mention the source document.
  - Separate the answer by document.

3. Conversation:
- Use previous conversation history only for understanding context.
- Final answers must still be based on the documents.

4. Missing Information:
If the answer is not present, say:

"I don't have enough information in the provided documents to answer this."

5. Answer Style:
- Be specific.
- Include names, dates, numbers, and steps when available.


====================
CONVERSATION HISTORY
====================

{history_text}


====================
DOCUMENT CONTEXT
====================

{context}


====================
QUESTION
====================

{question}


====================
ANSWER
====================

"""



    response = llm.invoke(
        prompt
    )



    # =========================
    # SOURCES
    # =========================

    sources = []

    seen = set()



    for doc in docs:


        source = doc.metadata.get(
            "source",
            "unknown"
        )


        if source in seen:

            continue


        seen.add(source)



        snippet = (
            doc.page_content[:180]
            .strip()
        )


        if len(doc.page_content) > 180:

            snippet += "..."



        sources.append(

            {

                "source": source,

                "snippet": snippet

            }

        )



    return {

        "answer": response.content,

        "sources": sources

    }




# =========================
# BUILD GRAPH
# =========================

def build_graph():

    workflow = StateGraph(
        GraphState
    )


    workflow.add_node(
        "retrieve",
        retrieve
    )


    workflow.add_node(
        "generate",
        generate
    )


    workflow.set_entry_point(
        "retrieve"
    )


    workflow.add_edge(
        "retrieve",
        "generate"
    )


    workflow.add_edge(
        "generate",
        END
    )


    return workflow.compile()



graph = build_graph()



# =========================
# REFRESH RETRIEVER
# =========================

def refresh_retriever():

    global retriever


    retriever = get_retriever()


    print(
        "Retriever refreshed"
    )