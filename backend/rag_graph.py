import os
from typing import TypedDict, List
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)
embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

vectorstore = Chroma(persist_directory="./chroma_db", embedding_function=embeddings)

retriever = vectorstore.as_retriever(
    search_kwargs={"k":3}
)

class GraphState(TypedDict):
    question: str
    docs: List
    answer: str

def retrieve(state: GraphState):
    question = state["question"]
    print(f"--- RETRIEVING DOCS FOR: {question} ---")
    documents = retriever.invoke(question)
    return {"docs": documents, "question": question}

def generate(state: GraphState):
    question = state["question"]
    docs = state["docs"]
    context = "\n".join([d.page_content for d in docs])

    prompt = f"""
    You are a assistant. Answer the question based ONLY on the context provided.
    Context: {context}
    Question: {question}
    """
    
    response = llm.invoke(prompt)
    return {"answer": response.content}

# Build Workflow
def build_graph():
    workflow = StateGraph(GraphState)
    workflow.add_node("retrieve", retrieve)
    workflow.add_node("generate", generate)
    
    workflow.set_entry_point("retrieve")
    workflow.add_edge("retrieve", "generate")
    workflow.add_edge("generate", END)
    
    return workflow.compile()

graph = build_graph()