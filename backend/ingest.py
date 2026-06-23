import os

from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    Docx2txtLoader,
    CSVLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from dotenv import load_dotenv


load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CHROMA_DIR = os.path.join(BASE_DIR, "chroma_db")

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001"
)

LOADERS = {
    ".pdf": PyPDFLoader,
    ".txt": TextLoader,
    ".md": TextLoader,
    ".csv": CSVLoader,
    ".docx": Docx2txtLoader,
}


def get_loader(file_path):
    ext = os.path.splitext(file_path)[1].lower()

    if ext not in LOADERS:
        raise ValueError(
            f"Unsupported file type '{ext}'. "
            f"Supported types: {', '.join(LOADERS.keys())}"
        )

    return LOADERS[ext](file_path)


def remove_existing_source(vectorstore, source_name):
    existing = vectorstore.get(where={"source": source_name})
    existing_ids = existing.get("ids", [])

    if existing_ids:
        print(f"REPLACING {len(existing_ids)} EXISTING CHUNK(S) FOR: {source_name}")
        vectorstore.delete(ids=existing_ids)


def ingest_docs(file_path=None):

    if file_path is None:
        file_path = os.path.join(BASE_DIR, "data", "RimLee_RESUME.pdf")

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    print("READING FILE:", file_path)

    loader = get_loader(file_path)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )

    chunks = splitter.split_documents(docs)

    print("TOTAL CHUNKS:", len(chunks))

    source_name = os.path.basename(file_path)

    for chunk in chunks:
        chunk.metadata["source"] = source_name

    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings
    )

    remove_existing_source(vectorstore, source_name)

    vectorstore.add_documents(chunks)

    print("CHROMA UPDATED SUCCESSFULLY")

    return vectorstore


def list_ingested_sources():
    if not os.path.exists(CHROMA_DIR):
        return []

    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings
    )

    data = vectorstore.get()
    sources = {meta.get("source") for meta in data.get("metadatas", []) if meta}

    return sorted(s for s in sources if s)