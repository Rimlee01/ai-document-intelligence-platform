import os
from typing import TypedDict, List

from dotenv import load_dotenv

from langgraph.graph import StateGraph, END

from langchain_google_genai import (
    ChatGoogleGenerativeAI,
    GoogleGenerativeAIEmbeddings
)

from langchain_chroma import Chroma


# =========================
# ENV SETUP
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
# MODELS
# =========================

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0,
    max_output_tokens=512
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


    return vectorstore.as_retriever(
        search_kwargs={
            "k": 3
        }
    )



retriever = get_retriever()



# =========================
# GRAPH STATE
# =========================

class GraphState(TypedDict):

    question: str

    docs: List

    answer: str

    sources: List[str]



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



    if not docs:

        return {

            "answer":
            "I couldn't find anything relevant in the uploaded documents. Try rephrasing, or upload a document that covers this topic.",

            "sources": []

        }



    # =========================
    # CREATE CONTEXT
    # =========================

    context = "\n\n".join(

        f"""
Source Document:
{d.metadata.get('source','unknown')}

Content:
{d.page_content}
"""

        for d in docs

    )



    # =========================
    # PROMPT
    # =========================


    prompt = f"""

You are an intelligent document-based assistant.

Your task is to answer the user's question using ONLY the information available in the provided context.


IMPORTANT RULES:


1. Context Usage:

- Use only the provided context.

- Do not use your own knowledge.

- Do not assume missing information.

- If the answer is not available, say:

"I don't have enough information in the provided documents to answer this."


2. Multiple Documents:

- Each context section belongs to a different source document.

- If multiple documents contain relevant information:

  - Mention the document name.

  - Separate answers clearly by document.


3. Answer Quality:

- Give accurate and detailed answers.

- Include dates, names, numbers, and steps when available.

- Avoid vague answers.


4. Missing Information:

- Never hallucinate.

- If only partial information exists, explain what is available and what is missing.



====================
CONTEXT
====================

{context}


====================
USER QUESTION
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



    for d in docs:


        src = d.metadata.get(
            "source",
            "unknown"
        )


        if src in seen:

            continue


        seen.add(src)



        snippet = (
            d.page_content[:180]
            .strip()
        )


        if len(d.page_content) > 180:

            snippet += "..."



        sources.append(

            {

                "source": src,

                "snippet": snippet

            }

        )



    return {

        "answer": response.content,

        "sources": sources

    }




# =========================
# BUILD LANGGRAPH
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