"""Import-note identity and explicit review, independent of display settings."""
from collections import Counter
import hashlib
import json
import re


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, default=str, separators=(',', ':')).encode()).hexdigest()


def note_key(note):
    return note['id'] + ':' + note['fingerprint']


def warning_references(project, sheets, warnings):
    """Keep source identity when a replacement has lost a previously linked column."""
    from .kobo import norm
    result = {}
    for warning in warnings:
        match = re.match(r'Saved source column (.*?) is absent from the replacement data\.', warning)
        if not match: continue
        candidates = [m for m in project.get('mappings', [])
                      if m['sheet'] < len(sheets) and m['column'] < len(sheets[m['sheet']]['headers'])
                      and norm(sheets[m['sheet']]['headers'][m['column']]) == match[1]]
        result[warning] = {'questions': sorted({m['question'] for m in candidates if m.get('question')}), 'header': match[1]}
    return result


def refresh_notes(payload, sheets=None):
    """Regenerate notes; only exact current fingerprints can remain reviewed.

    Source context hashes are persisted so a reopened project needs no source-file
    parsing. Effective records are also included, so local answer edits invalidate
    review. Raw source answers catch changes even when both normalize to blank.
    """
    from .kobo import norm
    form = payload.get('form', {})
    questions = {q['id']: q for q in form.get('questions', [])}
    base = payload.get('baseForm', form)
    excluded = set(payload.get('reviewConfig', {}).get('excludedQuestionIds', []))
    mappings = payload.get('mappings', [])
    references = payload.get('noteWarningReferences', {})
    accepted = set(payload.get('reviewedImportNotes', []))
    contexts = dict(payload.get('noteSourceContexts', {}))
    notes = []
    warnings = []
    for message in dict.fromkeys(payload.get('warnings', [])):
        ref = references.get(message, {})
        qids = ref.get('questions', [])
        missing = re.match(r'Saved source column (.*?) is absent from the replacement data\.', message)
        if missing and not qids:
            qids = [q['id'] for q in base.get('questions', []) if missing[1] in {
                norm(str(v)) for v in [q['id'], q['name'], *q.get('labels', {}).values()]}]
        # Form warnings name the owning question before the colon.
        owner = next((q for q in base.get('questions', []) if any(
            message.startswith(str(label) + ':') for label in [q['id'], *q.get('labels', {}).values()] if label)), None)
        if owner: qids = [owner['id']]
        if qids and all(qid in excluded for qid in qids): continue
        # A warning about an unsupported/unlinked source becomes obsolete once
        # that exact source column is intentionally excluded.
        header = None
        source_warning = re.match(r'(?:Saved link for |Some saved answer links for )(.*?) (?:could not be reused|no longer exist)', message)
        if source_warning: header = source_warning[1]
        elif ': unsupported type ' in message: header = message.split(': unsupported type ', 1)[0]
        if header:
            sources = [m for m in mappings if norm(m.get('header', '')) == norm(header)]
            if sources and all(m.get('status') in {'ignored', 'excluded'} for m in sources): continue
        if 'choice filter depends on an ignored question.' in message:
            if not owner or owner['id'] not in questions: continue
            names = {v for q in base.get('questions', []) if q['id'] in excluded for v in (q['id'], q['name'])}
            if not names.intersection(re.findall(r'\$\{([^}]+)\}', questions[owner['id']].get('choiceFilter', ''))): continue
        warnings.append(message)
        notes.append({'kind': 'warning', 'message': message, 'question': qids[0] if len(qids) == 1 else '', '_questions': qids})
    payload['warnings'] = warnings
    for issue in payload.get('issues', []):
        if issue['question'] in excluded: continue
        notes.append({'kind': 'issue', **issue, '_questions': [issue['question']]})
    for note in notes:
        qids = note.pop('_questions')
        note['id'] = digest([note['kind'], note['question'], note['message']])
        related = set(qids)
        for qid in qids:
            q = questions.get(qid, {})
            dependencies = set(re.findall(r'\$\{([^}]+)\}', q.get('choiceFilter', '')))
            related.update(q['id'] for q in base.get('questions', []) if dependencies.intersection((q['id'], q['name'])))
        links = [m for m in mappings if m.get('question') in related and m.get('status') == 'matched'] if related else mappings
        if sheets is not None:
            columns = []
            for m in links:
                si, ci = m['sheet'], m['column']
                if si < len(sheets):
                    sheet = sheets[si]
                    columns.append([sheet['name'], m.get('header', ''), [row[ci] if ci < len(row) else None for row in sheet['rows']]])
            contexts[note['id']] = digest(columns)
        # Multiset avoids reopening notes solely because source row order changed.
        records = Counter(digest([r.get('id'), r.get('scope'), {k: v for k, v in r.get('values', {}).items() if not related or k in related}])
                          for r in payload.get('records', []))
        # Connection setup is transient review UI state, not import evidence.
        schema = [{k:v for k,v in q.items() if k not in {'connectionSetup','ignoredConnectionRules','dependencyReviewNeeded','ignoredSourceConditions','conditionReview'}} for q in base.get('questions', []) if not related or q['id'] in related]
        effective = [{k:v for k,v in questions[qid].items() if k not in {'connectionSetup','ignoredConnectionRules','dependencyReviewNeeded','ignoredSourceConditions','conditionReview'}} for qid in sorted(related) if qid in questions]
        semantic_links = [{k: m.get(k, '' if k not in {'answerMap', 'priority'} else {} if k == 'answerMap' else 0)
                           for k in ('sheet', 'column', 'header', 'question', 'option', 'status', 'answerMap', 'mergeMode', 'priority')} for m in links]
        note['fingerprint'] = digest([note['message'], note.get('count'), schema, effective, semantic_links,
                                      sorted(excluded.intersection(related)), contexts.get(note['id']), sorted(records.items()),
                                      {k: v for k, v in payload.get('policies', {}).items() if not related or k in related}])
        note['reviewed'] = note_key(note) in accepted
    payload['noteSourceContexts'] = {n['id']: contexts[n['id']] for n in notes if n['id'] in contexts}
    payload['importNotes'] = notes
    return notes


def import_note_payload(item, form, mappings, policies, issues, config, records=None):
    from .kobo import normalize
    if records is None: records, _ = normalize(form, item['sheets'], mappings, policies)
    payload = {'form': form, 'baseForm': item['form'], 'reviewConfig': config, 'records': records,
               'mappings': mappings, 'policies': policies, 'warnings': item['warnings'] + form.get('warnings', []),
               'issues': issues, 'source': item.get('source', {}),
               'noteWarningReferences': item.get('noteWarningReferences', {}),
               'reviewedImportNotes': item.get('reviewedImportNotes', [])}
    refresh_notes(payload, item['sheets'])
    return payload


def preview_notes(result, item, form=None, config=None):
    payload = import_note_payload(item, form or result['form'], result['mappings'], result.get('policies', {}),
                                  result['issues'], config or item.get('reviewConfig', {}))
    return {**result, 'warnings': payload['warnings'], 'importNotes': payload['importNotes'],
            'reviewedImportNotes': payload['reviewedImportNotes']}
