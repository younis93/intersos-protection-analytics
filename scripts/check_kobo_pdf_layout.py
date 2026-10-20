"""Verify and render the synthetic PDFs created by check_kobo_pdf_layout.cjs."""
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw
from pypdf import PdfReader
from pypdf.generic import ContentStream

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]


def actual_text(reader, page):
    return [str(args[1]['/ActualText']) for args, op in ContentStream(page.get_contents(), reader).operations
            if op == b'BDC' and isinstance(args[1], dict) and '/ActualText' in args[1]]


def normalized(text):
    return ' '.join(text.split())


def verify(language):
    source = ROOT / 'output/pdf' / f'kobo-report-{language}.pdf'
    fixture = json.loads((ROOT / 'tmp/pdfs' / f'fixture-{language}.json').read_text(encoding='utf-8'))
    reader = PdfReader(source)
    pages = [actual_text(reader, page) for page in reader.pages]
    text = normalized(' '.join(value for page in pages for value in page))
    assert 'technical_q' not in text and 'Missing:' not in text and 'Answered:' not in text
    assert 'Answered respondents within each breakdown category' not in text
    assert 'Respondents who answered this question' not in text and 'Count:' not in text
    assert text.count('END_OF_LONG_RESPONSE') == 1
    for result in fixture['results']:
        assert normalized(result['label']) in text, result['label']
        for row in result['rows']:
            if 'END_OF_LONG_RESPONSE' not in row['label']:
                assert normalized(row['label']) in text, row['label']
    # Reassemble row fragments across continuation pages using original marked text.
    long_answer = fixture['results'][3]['rows'][2]['label']
    fragments = [value for page in pages for value in page if normalized(value) in normalized(long_answer)]
    assert ''.join(''.join(fragments).split()) == ''.join(long_answer.split()), 'Oversized answer was changed or truncated'
    total_label = 'الإجمالي' if language == 'ar' else 'Total'
    assert sum(page.count(total_label) for page in pages) == 8
    image_count = 0
    with pdfplumber.open(source) as pdf:
        for index, page in enumerate(pdf.pages):
            assert math.isclose(page.width, 841.89, abs_tol=.1) and math.isclose(page.height, 595.28, abs_tol=.1)
            assert f'{index+1} / {len(pdf.pages)}' in pages[index]
            for rect in page.rects:
                assert rect['x0'] >= 35.9 and rect['x1'] <= page.width-35.9
                assert rect['top'] >= 60 and rect['bottom'] <= page.height-47.9
            for image in page.images:
                image_count += 1
                ratio = image['srcsize'][0] / image['srcsize'][1]
                assert math.isclose(image['width']/image['height'], ratio, rel_tol=1e-6), (index, image)
                assert image['x0'] >= 35.9 and image['x1'] <= page.width-35.9
                assert image['top'] >= 60 and image['bottom'] <= page.height-47.9
                for rect in page.rects:
                    overlap_w = min(image['x1'], rect['x1'])-max(image['x0'], rect['x0'])
                    overlap_h = min(image['bottom'], rect['bottom'])-max(image['top'], rect['top'])
                    assert overlap_w <= .1 or overlap_h <= .1, ('Chart overlaps table', index)
    assert image_count == 14
    destination = ROOT / 'tmp/pdfs' / language
    destination.mkdir(exist_ok=True)
    # Remove only generated page images so contact sheets cannot contain pages from older runs.
    for path in destination.glob('page-*.png'):
        path.unlink()
    subprocess.run([shutil.which('pdftoppm'), '-scale-to', '1100', '-png', str(source), str(destination/'page')],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    paths = sorted(destination.glob('page-*.png'))
    sheet = Image.new('RGB', (1680, ((len(paths)+3)//4)*322), '#dce5ec')
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        img = Image.open(path).convert('RGB')
        img.thumbnail((412, 292))
        x, y = (index % 4)*420+4, (index//4)*322+23
        sheet.paste(img, (x, y))
        draw.text((x, y-18), f'{language.upper()} page {index+1}', fill='black')
    sheet.save(ROOT / 'tmp/pdfs' / f'{language}-contact.png')
    print(f'PASS {language}: {len(pages)} pages, all questions/answers/totals, 14 proportional chart panels, no chart/table overlap, no technical lines.')


for language in ['en', 'ar']:
    verify(language)
single = PdfReader(ROOT / 'tmp/pdfs/single-question.pdf')
single_text = ' '.join(value for page in single.pages for value in actual_text(single, page))
assert len(single.pages) == 2 and 'Sex of the respondent' in single_text and 'Age of the respondent' not in single_text
print('PASS single-question PDF: clean overview and one question, with other questions excluded.')
