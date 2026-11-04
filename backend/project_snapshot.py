"""Materialized portable data and rebuildable internal source snapshots."""
from copy import deepcopy
import json

MAGIC = b'INTERSOS-SOURCE-1\n'


def encode(value):
    return MAGIC + json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')


def decode(raw, kind):
    if not raw.startswith(MAGIC):
        return None
    value = json.loads(raw[len(MAGIC):])
    if not isinstance(value, dict) or value.get('kind') != kind:
        raise ValueError('Invalid materialized project source.')
    return value['value']


def materialize(payload, original_form=None):
    from .kobo_edits import effective_project
    from .custom_analysis import Column, Configuration
    if original_form:
        from .kobo_required import recover_required
        payload = recover_required(payload, original_form)
    project = deepcopy(effective_project(payload))
    # An allowlist prevents recipes, review decisions and original values from leaking.
    clean = {key: project[key] for key in ('form', 'records')}
    questions = clean['form']['questions']
    for question in questions:
        for key in ('derivedFrom', 'localDerived'):
            question.pop(key, None)
    if project.get('customConfig'):
        # Excluded source columns still have normalized values. Visibility and
        # inclusion preferences must not discard those values from a data file.
        known = {q['id'] for q in questions}
        definitions = [*project['customConfig'].get('columns', []),
                       *[{**c, 'kind':'number'} for c in project['customConfig'].get('calculatedColumns', [])]]
        for column in definitions:
            if column['id'] in known: continue
            if not any(column['id'] in r['values'] for r in clean['records']): continue
            group = 'group_' + column['group'].strip() if column.get('group', '').strip() else ''
            if group and not any(g['id']==group for g in clean['form']['groups']):
                clean['form']['groups'].append({'id':group, 'name':column['group'].strip(),
                    'labels':{'en':column['group'].strip()}, 'parent':'', 'repeat':False})
            values = [r['values'].get(column['id']) for r in clean['records']]
            codes = list(dict.fromkeys(str(v) for value in values if value is not None
                        for v in (value if isinstance(value,list) else [value])))
            questions.append({'id':column['id'], 'name':column['label'], 'labels':{'en':column['label']},
                'kind':column['kind'], 'type':{'number':'decimal','category':'select_one custom','multiple':'select_multiple custom'}.get(column['kind'],column['kind']),
                'choices':[{'name':v, 'labels':{'en':v}} for v in codes] if column['kind'] in {'category','multiple'} else [],
                'group':group, 'repeat':'', 'metadata':False, 'identifying':False})
            known.add(column['id'])
        separator = ' ||| '
        while any(separator in str(v) for r in clean['records'] for v in r['values'].values()):
            separator += '|'
        groups = {g['id']: g['name'] for g in clean['form']['groups']}
        columns = [Column(id=q['id'], index=i, header=q['id'], label=q['labels'].get('en') or q['name'],
                          kind=q['kind'], group=groups.get(q['group'], ''), dateFormat='iso',
                          separator=separator if q['kind']=='multiple' else '') for i,q in enumerate(questions)]
        config = Configuration(worksheet='Data', columns=columns)
        rows = [[q['id'] for q in questions]]
        for record in clean['records']:
            rows.append([separator.join(map(str, value)) if isinstance(value, list) else value
                         for q in questions for value in [record['values'].get(q['id'])]])
        clean['customConfig'] = config.model_dump()
        clean['source'] = {'filename': 'project-data.csv', 'worksheet': 'Data'}
        data_raw = encode({'kind':'custom', 'value':{'Data':rows}})
        form_raw = b''
    else:
        scopes = sorted({''} | {r['scope'] for r in clean['records']}, key=lambda s:(s.count('/'), len(s), s))
        names = {scope: scope or 'submissions' for scope in scopes}
        records = {r['id']:r for r in clean['records']}
        sheets, mappings = [], []
        for si,scope in enumerate(scopes):
            fields = [q for q in questions if q['repeat']==scope]
            headers = ['_index', '_parent_index', '_parent_table_name', '_uuid'] + [q['id'] for q in fields]
            rows = []
            for record in clean['records']:
                if record['scope'] != scope: continue
                parent = records.get(record.get('parent'))
                rows.append([record['id'], parent['id'] if parent else '', names[parent['scope']] if parent else '',
                             record.get('sourceIdentity','')] + [record['values'].get(q['id']) for q in fields])
            sheets.append({'name':names[scope], 'headers':headers, 'rows':rows})
            mappings.extend({'sheet':si, 'column':i+4, 'header':q['id'], 'question':q['id'], 'option':'', 'status':'matched'} for i,q in enumerate(fields))
        clean.update(mappings=mappings, policies={})
        clean['source'] = {'filename':'project-data.xlsx', 'formFilename':'project-form.xlsx', 'worksheet':'',
                           'tables':[{'name':s['name'], 'role':'Main table' if i==0 else 'Repeat table'} for i,s in enumerate(sheets)]}
        form_raw = encode({'kind':'form', 'value':clean['form']})
        data_raw = encode({'kind':'kobo', 'value':sheets})
    clean.update(warnings=[], issues=[], importNotes=[], reviewedImportNotes=[], noteSourceContexts={})
    return clean, form_raw, data_raw
