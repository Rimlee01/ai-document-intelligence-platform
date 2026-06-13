from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from rag_graph import graph
from ingest import ingest_docs

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Query(BaseModel):
    question: str

@app.on_event("startup")
def startup():
    print("STARTING INGESTION")
    ingest_docs()
    print("INGESTION COMPLETE")

@app.post("/chat")
def chat(query: Query):
    try:
        result = graph.invoke({"question": query.question})
        return {"answer": result.get("answer", "I'm sorry, I couldn't find an answer.")}
    except Exception as e:
        print(f"Error during graph invocation: {e}")
        return {"answer": "Internal Server Error. Check backend console."}

if __name__ == "__main__":

    uvicorn.run(app, host="0.0.0.0", port=8000)

@app.get("/")
def home():
    return {
        "message": "AI Document Intelligence Platform API is running 🚀"
    }