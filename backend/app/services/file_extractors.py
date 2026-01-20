# app/services/file_extractors.py

import os
from fastapi import UploadFile, HTTPException
from PyPDF2 import PdfReader
from docx import Document

# --------------------------------------------------
# Extract text from TXT files
# --------------------------------------------------
def extract_text_from_txt(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read TXT file: {str(e)}")


# --------------------------------------------------
# Extract text from PDF files
# --------------------------------------------------
def extract_text_from_pdf(file_path: str) -> str:
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read PDF file: {str(e)}")


# --------------------------------------------------
# Extract text from DOCX files
# --------------------------------------------------
def extract_text_from_docx(file_path: str) -> str:
    try:
        doc = Document(file_path)
        text = "\n".join([para.text for para in doc.paragraphs])
        return text.strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read DOCX file: {str(e)}")


# --------------------------------------------------
# Main extractor function
# --------------------------------------------------
def extract_text_from_file(file_path: str) -> str:
    """
    Detect file type by extension and extract text accordingly.
    Supports: .txt, .pdf, .docx
    """
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    ext = file_path.split(".")[-1].lower()

    if ext == "txt":
        return extract_text_from_txt(file_path)
    elif ext == "pdf":
        return extract_text_from_pdf(file_path)
    elif ext == "docx":
        return extract_text_from_docx(file_path)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
