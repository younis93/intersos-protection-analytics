from __future__ import annotations

import io
import re
import zipfile
from typing import Any


MAX_XLSX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
MAX_XLSX_ENTRY_BYTES = 128 * 1024 * 1024
MAX_XLSX_ENTRIES = 10_000
MAX_XLSX_COMPRESSION_RATIO = 200
SPREADSHEET_FORMULA_PREFIX = re.compile(r"^[=+\-@]")


def safe_spreadsheet_value(value: Any) -> Any:
    """Keep imported text from becoming an executable spreadsheet formula."""
    if isinstance(value, str) and SPREADSHEET_FORMULA_PREFIX.match(value):
        return "'" + value
    return value


def validate_xlsx_archive(raw: bytes) -> None:
    """Reject malformed or excessively expanding XLSX ZIP containers."""
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_XLSX_ENTRIES:
                raise ValueError("Workbook contains too many internal files.")
            if sum(entry.file_size for entry in entries) > MAX_XLSX_UNCOMPRESSED_BYTES:
                raise ValueError("Workbook expands beyond the allowed size.")
            for entry in entries:
                if entry.file_size > MAX_XLSX_ENTRY_BYTES:
                    raise ValueError("Workbook contains an oversized internal file.")
                if entry.file_size > MAX_XLSX_COMPRESSION_RATIO * max(entry.compress_size, 1):
                    raise ValueError("Workbook contains an unsafe compression ratio.")
    except zipfile.BadZipFile as exc:
        raise ValueError("Workbook is not a valid .xlsx file.") from exc
