# backend/Dockerfile
FROM python:3.10-slim

WORKDIR /app

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    ffmpeg \
    poppler-utils \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Upgrade pip (no cache)


# Install python dependencies (no cache)
RUN pip install --no-cache-dir -r requirements.txt

# Install boto3 + whisper explicitly (no cache)
RUN pip install --no-cache-dir boto3 openai-whisper

# Copy source
COPY . .

EXPOSE 5000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5000"]
