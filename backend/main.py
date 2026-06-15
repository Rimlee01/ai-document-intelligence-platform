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

    import os

    if not os.path.exists("./chroma_db"):

        print("STARTING INGESTION")

        ingest_docs()

        print("INGESTION COMPLETE")

    else:

        print("CHROMA DB FOUND - SKIPPING INGESTION")

import time


@app.post("/chat")
def chat(query: Query):

    try:

        start_time = time.time()

        print("QUESTION:", query.question)


        result = graph.invoke(
            {
                "question": query.question
            }
        )


        total_time = time.time() - start_time


        print(
            f"TOTAL RESPONSE TIME: {total_time:.2f} seconds"
        )


        return {
            "answer": result.get(
                "answer",
                "I'm sorry, I couldn't find an answer."
            )
        }


    except Exception as e:

        print(
            f"Error during graph invocation: {e}"
        )


        return {
            "answer":
            "Internal Server Error. Check backend console."
        }

if __name__ == "__main__":

    uvicorn.run(app, host="0.0.0.0", port=8000)

@app.get("/")
def home():
    return {
        "message": "AI Document Intelligence Platform API is running 🚀"
    }