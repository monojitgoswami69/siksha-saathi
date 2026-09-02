FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    TRANSFORMERS_CACHE=/root/.cache/huggingface \
    HF_HOME=/root/.cache/huggingface

# Install system dependencies for OCR & document parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libmupdf-dev \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install lean PyTorch CPU build
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy worker application
COPY worker/ ./worker/

CMD ["python", "-m", "worker.main"]
