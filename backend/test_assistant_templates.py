import io
import zipfile
from xml.etree import ElementTree as ET
import pytest
from .assistant_templates import fill_template, inspect_template, WORD


def template(text):
    output = io.BytesIO()
    with zipfile.ZipFile(output,'w') as archive:
        archive.writestr('[Content_Types].xml','<Types/>')
        archive.writestr('word/document.xml', '<w:document xmlns:w="'+WORD[1:-1]+'"><w:body><w:p>'+text+'</w:p></w:body></w:document>')
        archive.writestr('word/styles.xml','<styles/>')
    return output.getvalue()


def test_split_runs_and_surrounding_text_preserved():
    raw = template('<w:r><w:t>Before {{key_</w:t></w:r><w:r><w:t>findings}} after</w:t></w:r>')
    assert inspect_template(raw)[2] == ['key_findings']
    with zipfile.ZipFile(io.BytesIO(fill_template(raw,{'key_findings':'Evidence & findings'}))) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
        assert ''.join(node.text or '' for node in root.iter(WORD+'t')) == 'Before Evidence & findings after'
        assert archive.read('word/styles.xml') == b'<styles/>'


def test_missing_sections_rejected():
    with pytest.raises(ValueError,match='every'):
        fill_template(template('<w:r><w:t>{{findings}}</w:t></w:r>'),{})


def test_no_placeholders_rejected():
    with pytest.raises(ValueError,match='placeholders'):
        inspect_template(template('<w:r><w:t>Empty</w:t></w:r>'))
