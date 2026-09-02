"""
OCR wrapper — pytesseract with singleton initialization.
"""
from __future__ import annotations

import logging
from typing import Optional

from PIL import Image
import io

logger = logging.getLogger(__name__)

_tesseract_langs: Optional[str] = None


def _get_langs() -> str:
    global _tesseract_langs
    if _tesseract_langs is None:
        from .config import get_settings
        _tesseract_langs = get_settings().tesseract_langs
    return _tesseract_langs


def ocr_image_buffer(image_bytes: bytes) -> str:
    """Run OCR on an image buffer. Returns extracted text."""
    import pytesseract

    try:
        img = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(img, lang=_get_langs())
        return (text or "").strip()
    except Exception as e:
        logger.warning("OCR failed: %s, retrying with eng only", e)
        try:
            img = Image.open(io.BytesIO(image_bytes))
            text = pytesseract.image_to_string(img, lang="eng")
            return (text or "").strip()
        except Exception as e2:
            logger.error("OCR failed completely: %s", e2)
            return ""


def ocr_pil_image(img: Image.Image) -> str:
    """Run OCR on a PIL Image."""
    import pytesseract

    try:
        text = pytesseract.image_to_string(img, lang=_get_langs())
        return (text or "").strip()
    except Exception as e:
        logger.warning("OCR failed: %s", e)
        return ""
