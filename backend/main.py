from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rag_graph import graph, refresh_retriever
from ingest import ingest_docs, list_ingested_sources, LOADERS

import uvicorn
import time
import os


app = FastAPI()


# =========================
# CORS
# =========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# Models
# =========================

class Query(BaseModel):
    question: str


# =========================
# Startup
# =========================

@app.on_event("startup")
def startup():

    if not os.path.exists("./chroma_db"):
        print("STARTING INGESTION")
        ingest_docs()
        print("INGESTION COMPLETE")
    else:
        print("CHROMA DB FOUND - SKIPPING INGESTION")


# =========================
# Home Route
# =========================

@app.get("/")
def home():
    return {
        "message": "AI Document Intelligence Platform API is running 🚀"
    }


# =========================
# Chat Route
# =========================

@app.post("/chat")
def chat(query: Query):

    try:
        start_time = time.time()

        print("QUESTION:", query.question)

        result = graph.invoke({"question": query.question})

        total_time = time.time() - start_time
        print(f"TOTAL RESPONSE TIME: {total_time:.2f} seconds")

        return {
            "answer": result.get(
                "answer", "I'm sorry, I couldn't find an answer."
            ),
            "sources": result.get("sources", [])
        }

    except Exception as e:
        print(f"Error during graph invocation: {e}")

        raise HTTPException(
            status_code=500,
            detail="Something went wrong while generating an answer. "
                   "Check the backend console for details."
        )


# =========================
# Upload Document Route
# =========================

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):

    ext = os.path.splitext(file.filename)[1].lower()

    if ext not in LOADERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. "
                   f"Supported types: {', '.join(sorted(LOADERS.keys()))}"
        )

    os.makedirs("./uploads", exist_ok=True)
    file_path = f"./uploads/{file.filename}"

    contents = await file.read()

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    with open(file_path, "wb") as f:
        f.write(contents)

    print("UPLOADED:", file_path)

    try:
        ingest_docs(file_path)
    except Exception as e:
        print(f"Error during ingestion: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process '{file.filename}'. "
                   f"Make sure it's a valid, non-corrupted file."
        )

    refresh_retriever()

    return {
        "message": f"{file.filename} uploaded and indexed successfully"
    }


# =========================
# List Documents Route
# =========================

@app.get("/documents")
def documents():
    return {"documents": list_ingested_sources()}


# =========================
# Run Server
# =========================

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000
    )