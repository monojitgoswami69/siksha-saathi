"""
Paragraph-aware chunking — same algorithm as the Node ingestion worker.

Preserves: paragraph_id, char_start/char_end, chunk_type, page tracking.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from .pipeline import ExtractionResult


@dataclass
class DocumentChunk:
    chunk_index: int
    total_chunks: int
    raw_content: str
    page_start: int
    page_end: int
    paragraph_id: Optional[str] = None
    chunk_type: str = "text"
    char_start: Optional[int] = None
    char_end: Optional[int] = None
    file_name: str = ""
    title: Optional[str] = None
    stream: str = "General"
    semester: str = "General"
    section: str = "General"
    subject: str = "General"
    module: str = "General"


def _split_paragraphs(text: str) -> list[tuple[str, int]]:
    """Split text into paragraphs, returning (text, char_start) pairs."""
    out: list[tuple[str, int]] = []
    pattern = re.compile(r"\n[ \t]*\n")
    start = 0
    for match in pattern.finditer(text):
        para = text[start : match.start()].strip()
        if para:
            out.append((para, start))
        start = match.end()
    # Remaining
    para = text[start:].strip()
    if para:
        out.append((para, start))
    return out


def chunk_extracted_document(
    extraction: ExtractionResult,
    file_name: str,
    title: str = "",
    stream: str = "General",
    semester: str = "General",
    section: str = "General",
    subject: str = "General",
    module: str = "General",
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> list[DocumentChunk]:
    """Chunk an extraction result into paragraph-aware chunks."""

    raw_chunks: list[dict] = []

    for page in extraction.pages:
        page_text = page.text.strip()
        if not page_text:
            continue

        if page.is_image:
            raw_chunks.append({
                "text": page_text,
                "page_start": page.page_number,
                "page_end": page.page_number,
                "paragraph_id": f"{page.page_number}:img",
                "chunk_type": "image",
            })
            continue

        paragraphs = _split_paragraphs(page_text)
        for para_idx, (para_text, para_start) in enumerate(paragraphs, 1):
            paragraph_id = f"{page.page_number}:{para_idx}"
            start = 0
            while start < len(para_text):
                end = min(start + chunk_size, len(para_text))
                chunk_text = para_text[start:end].strip()
                if len(chunk_text) > 20:
                    raw_chunks.append({
                        "text": chunk_text,
                        "page_start": page.page_number,
                        "page_end": page.page_number,
                        "paragraph_id": paragraph_id,
                        "chunk_type": "text",
                        "char_start": para_start + start,
                        "char_end": para_start + end,
                    })
                start += chunk_size - chunk_overlap
                if start >= len(para_text):
                    break

    # Fallback: if no chunks from page-level, chunk the full text
    if not raw_chunks and extraction.full_text.strip():
        text = extraction.full_text.strip()
        start = 0
        while start < len(text):
            end = min(start + chunk_size, len(text))
            chunk_text = text[start:end].strip()
            if len(chunk_text) > 20:
                raw_chunks.append({
                    "text": chunk_text,
                    "page_start": 1,
                    "page_end": 1,
                    "paragraph_id": "1:1",
                    "chunk_type": "text",
                    "char_start": start,
                    "char_end": end,
                })
            start += chunk_size - chunk_overlap

    total = len(raw_chunks)
    return [
        DocumentChunk(
            chunk_index=idx,
            total_chunks=total,
            raw_content=c["text"],
            page_start=c["page_start"],
            page_end=c["page_end"],
            paragraph_id=c.get("paragraph_id"),
            chunk_type=c.get("chunk_type", "text"),
            char_start=c.get("char_start"),
            char_end=c.get("char_end"),
            file_name=file_name,
            title=title or file_name,
            stream=stream or "General",
            semester=semester or "General",
            section=section or "General",
            subject=subject or "General",
            module=module or "General",
        )
        for idx, c in enumerate(raw_chunks)
    ]
