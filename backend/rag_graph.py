import os

from dotenv import load_dotenv

from langgraph.graph import StateGraph, END

from langchain_google_genai import (
    ChatGoogleGenerativeAI,
    GoogleGenerativeAIEmbeddings
)

from langchain_chroma import Chroma


load_dotenv()


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CHROMA_DIR = os.path.join(
    BASE_DIR,
    "chroma_db"
)



llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0,
    max_output_tokens=1024
)



embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)



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



class GraphState(dict):
    pass




def retrieve(state):

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


    return {

        "docs": documents,

        "question": question,

        "history": state.get(
            "history",
            []
        )

    }





def generate(state):

    question = state["question"]

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



    context = "\n\n".join(

        f"""
Source:
{doc.metadata.get('source','unknown')}

Content:
{doc.page_content}
"""

        for doc in docs

    )



    history_text = ""


    for msg in history[-6:]:

        history_text += (
            f"{msg.get('sender')}: "
            f"{msg.get('text')}\n"
        )



    prompt = f"""

You are a document assistant.

Answer ONLY using the provided context.

Rules:

- Never use outside knowledge.
- Never invent information.
- If answer is missing say:
"I don't have enough information in the provided documents to answer this."

- If multiple documents contain information, separate answers by source.

Conversation:

{history_text}


Documents:

{context}


Question:

{question}


Answer:

"""



    response = llm.invoke(
        prompt
    )



    sources = []

    seen = set()



    for doc in docs:

        src = doc.metadata.get(
            "source",
            "unknown"
        )


        if src not in seen:

            seen.add(src)


            sources.append(

                {

                    "source": src,

                    "snippet":
                    doc.page_content[:180]

                }

            )



    return {

        "answer": response.content,

        "sources": sources

    }




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




def refresh_retriever():

    global retriever

    retriever = get_retriever()

    print(
        "Retriever refreshed"
    )
    