import os

from dotenv import load_dotenv

from langgraph.graph import StateGraph, END

from langchain_google_genai import (
    ChatGoogleGenerativeAI,
    GoogleGenerativeAIEmbeddings
)

from langchain_chroma import Chroma


# =========================
# ENVIRONMENT
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
    max_output_tokens=1024
)


embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)



# =========================
# VECTOR DATABASE
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
# NO TYPING HERE
# =========================

class GraphState(dict):
    pass



# =========================
# RETRIEVE DOCUMENTS
# =========================

def retrieve(state):

    question = state.get(
        "question",
        ""
    )


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


    return {

        "question": question,

        "docs": documents,

        "history": state.get(
            "history",
            []
        )

    }



# =========================
# GENERATE ANSWER
# =========================

def generate(state):

    question = state.get(
        "question",
        ""
    )

    docs = state.get(
        "docs",
        []
    )


    history = state.get(
        "history",
        []
    )



    if not docs:

        return {

            "answer":
            "I couldn't find anything relevant in the uploaded documents.",

            "sources": []

        }



    # Create context

    context = "\n\n".join(

        f"""
Source Document:
{doc.metadata.get('source','unknown')}

Content:
{doc.page_content}
"""

        for doc in docs

    )



    # Conversation memory

    history_text = ""


    for msg in history[-6:]:

        history_text += (

            f"{msg.get('sender','')}: "
            f"{msg.get('text','')}\n"

        )



    prompt = f"""

You are an intelligent document-based assistant.

Answer the question ONLY using the provided documents.

Rules:

- Do not use outside knowledge.
- Do not guess.
- Do not create information.
- If information is missing say:
"I don't have enough information in the provided documents to answer this."

- If multiple documents contain information, separate the answer by document.
- Mention the source document when possible.
- Be detailed and accurate.


Previous Conversation:

{history_text}


Documents:

----------------
{context}
----------------


Question:

{question}


Answer:

"""



    response = llm.invoke(
        prompt
    )



    # Sources

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


        snippet = doc.page_content[:180]


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