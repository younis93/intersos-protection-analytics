"""Inspect and fill Word placeholders while preserving package structure and namespaces."""
import io
import json
from pathlib import PurePosixPath
import re
import zipfile
from xml.dom import Node, minidom
from xml.parsers.expat import ExpatError

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

router = APIRouter(prefix='/api/assistant/templates')
WORD = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
NS = WORD[1:-1]
PLACEHOLDER = re.compile(r'\{\{([a-z][a-z0-9_]{0,60})\}\}')
PART = re.compile(r'word/(document|header\d+|footer\d+)\.xml')
MAX_UPLOAD = 10 * 1024**2


def xml_part(data):
    # OOXML XML parts use UTF-8 or UTF-16. Decode before checking declarations.
    encoding = 'utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8'
    text = data.decode(encoding)
    if re.search(r'<!\s*(DOCTYPE|ENTITY)', text, re.IGNORECASE):
        raise ValueError('Unsupported XML declaration in Word template.')
    return minidom.parseString(data)


def word_text(node):
    return ''.join(child.data for child in node.childNodes
                   if child.nodeType in (Node.TEXT_NODE, Node.CDATA_SECTION_NODE))


def paragraphs(document):
    for paragraph in document.getElementsByTagNameNS(NS, 'p'):
        # Nested paragraphs belong to their own text boxes, not the parent text.
        runs = []
        for node in paragraph.getElementsByTagNameNS(NS, 't'):
            owner = node.parentNode
            while owner.localName != 'p':
                owner = owner.parentNode
            if owner is paragraph:
                runs.append(node)
        yield runs, ''.join(map(word_text, runs))


def inspect_template(raw):
    if len(raw) > MAX_UPLOAD:
        raise ValueError('Word templates must be 10 MB or smaller.')
    archive = zipfile.ZipFile(io.BytesIO(raw))
    files = archive.infolist()
    names = archive.namelist()
    if len(files) > 2000 or sum(item.file_size for item in files) > 40 * 1024**2:
        raise ValueError('This Word template is too large when expanded.')
    if len(names) != len(set(names)) or any(
        '\\' in name or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts
        for name in names
    ):
        raise ValueError('The Word template contains invalid package entries.')
    if 'word/document.xml' not in names or '[Content_Types].xml' not in names:
        raise ValueError('Choose a Word .docx template.')
    if any('vbaproject' in name.lower() or name.lower().startswith(('word/embeddings/', 'word/activex/'))
           for name in names):
        raise ValueError('Choose a Word template without macros or embedded objects.')
    for name in names:
        if name.endswith('.rels'):
            relationships = xml_part(archive.read(name))
            for item in relationships.getElementsByTagNameNS('*', 'Relationship'):
                if item.getAttribute('TargetMode') == 'External' and not item.getAttribute('Type').endswith('/hyperlink'):
                    raise ValueError('Remove linked external content before using this Word template.')
    parts = {}
    placeholders = set()
    for name in names:
        if not PART.fullmatch(name):
            continue
        document = xml_part(archive.read(name))
        fields = {match.group(1) for _, text in paragraphs(document) for match in PLACEHOLDER.finditer(text)}
        if fields:
            parts[name] = document
            placeholders.update(fields)
    if not placeholders:
        raise ValueError('Add placeholders such as {{key_findings}} to paragraphs or table cells.')
    if len(placeholders) > 40:
        raise ValueError('Use up to 40 named placeholders in one template.')
    return archive, parts, sorted(placeholders)


def write_run_text(node, text):
    document = node.ownerDocument
    for child in list(node.childNodes):
        node.removeChild(child)
    lines = text.split('\n')
    node.appendChild(document.createTextNode(lines[0]))
    node.setAttribute('xml:space', 'preserve')
    anchor = node.nextSibling
    for line in lines[1:]:
        prefix = f'{node.prefix}:' if node.prefix else ''
        node.parentNode.insertBefore(document.createElementNS(NS, prefix+'br'), anchor)
        sibling = document.createElementNS(NS, prefix+'t')
        sibling.setAttribute('xml:space', 'preserve')
        sibling.appendChild(document.createTextNode(line))
        node.parentNode.insertBefore(sibling, anchor)


def fill_template(raw, values):
    archive, parts, names = inspect_template(raw)
    if set(names) - values.keys():
        raise ValueError('Provide content for every template placeholder.')
    if any(re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]', value)
           for value in values.values()):
        raise ValueError('Draft text contains characters that Word cannot store.')
    for document in parts.values():
        for runs, text in paragraphs(document):
            original = list(map(word_text, runs))
            offsets = []
            offset = 0
            for value in original:
                offsets.append(offset)
                offset += len(value)
            revised = original.copy()
            for match in reversed(list(PLACEHOLDER.finditer(text))):
                for index, (value, start) in enumerate(zip(original, offsets)):
                    end = start + len(value)
                    if end <= match.start() or start >= match.end():
                        continue
                    left = max(0, match.start()-start)
                    right = min(len(value), match.end()-start)
                    replacement = values[match.group(1)] if start <= match.start() else ''
                    revised[index] = revised[index][:left]+replacement+revised[index][right:]
            for node, before, after in zip(runs, original, revised):
                if before != after:
                    write_run_text(node, after)
    result = io.BytesIO()
    with archive, zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as output:
        for item in archive.infolist():
            data = parts[item.filename].toxml(encoding='utf-8') if item.filename in parts else archive.read(item.filename)
            output.writestr(item, data)
    return result.getvalue()


@router.post('/inspect')
async def inspect(file: UploadFile = File(...)):
    raw = await file.read(MAX_UPLOAD+1)
    try:
        archive, _, names = await run_in_threadpool(inspect_template, raw)
        archive.close()
        return {'placeholders': names}
    except (ValueError, zipfile.BadZipFile, ExpatError, RuntimeError) as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post('/fill')
async def fill(file: UploadFile = File(...), values: str = Form(..., max_length=200000)):
    raw = await file.read(MAX_UPLOAD+1)
    try:
        mapping = json.loads(values)
        if not isinstance(mapping, dict) or any(not isinstance(value, str) for value in mapping.values()):
            raise ValueError('Template content must contain text values.')
        result = await run_in_threadpool(fill_template, raw, mapping)
        return Response(result, media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        headers={'Content-Disposition': 'attachment; filename="report-draft.docx"'})
    except (ValueError, zipfile.BadZipFile, ExpatError, RuntimeError) as exc:
        raise HTTPException(400, str(exc)) from exc
