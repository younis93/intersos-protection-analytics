"""Portable Kobo configuration, with conservative form matching and no response data."""
from copy import deepcopy
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .kobo import AnalysisViewSettings, SavedAnalysisView, KoboSettings, QuestionSettings, breakdown_fields, new_project_settings
from .kobo_saved_views import saved_view_issues
from .kobo_trends import trend_date_field
from .kobo_indicators import IndicatorDefinition, indicator_issues


class QuestionDescriptor(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str
    name: str
    type: str
    kind: str
    repeat: str = ''
    choices: list[str] = Field(default_factory=list)


class GroupDescriptor(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: str
    name: str
    parent: str = ''
    repeat: bool = False


class SettingsFile(BaseModel):
    model_config = ConfigDict(extra='forbid')
    format: Literal['kobo-settings']
    version: Literal[1]
    settings: KoboSettings
    questions: list[QuestionDescriptor]
    groups: list[GroupDescriptor]


def export_settings(project, settings):
    return SettingsFile(format='kobo-settings', version=1, settings=settings,
        questions=[QuestionDescriptor(**{k: q[k] for k in ('id', 'name', 'type', 'kind', 'repeat')},
                                      choices=[c['name'] for c in q['choices']]) for q in project['form']['questions']],
        groups=[GroupDescriptor(**{k: g[k] for k in ('id', 'name', 'parent', 'repeat')}) for g in project['form']['groups']])


def preview_settings(project, current, package):
    if package.settings.version != 1:
        raise ValueError('Unsupported settings version.')
    for items in (package.questions, package.groups):
        if len({item.id for item in items}) != len(items):
            raise ValueError('Settings file contains duplicate identifiers.')
    warnings, matches, skipped = [], [], []
    destination = {q['id']: q for q in project['form']['questions']}
    groups = {g['id']: g for g in project['form']['groups']}
    source_groups = {g.id: g for g in package.groups}

    def group_path(gid, lookup):
        path, seen = [], set()
        while gid:
            if gid in seen or gid not in lookup: return None
            seen.add(gid)
            g = lookup[gid]
            if isinstance(g, BaseModel): g = g.model_dump()
            path.insert(0, (g['name'], g['repeat']))
            gid = g['parent']
        return path

    group_map = {}
    for g in package.groups:
        candidates = [d for d in groups.values() if group_path(g.id, source_groups) == group_path(d['id'], groups)]
        exact = groups.get(g.id)
        if exact and exact['repeat'] == g.repeat: group_map[g.id] = g.id
        elif len(candidates) == 1: group_map[g.id] = candidates[0]['id']

    mapping, used = {}, set()
    # Reserve exact paths before considering fallback names.
    ordered = sorted(package.questions, key=lambda q: q.id not in destination)
    for q in ordered:
        def compatible(d):
            return d['kind'] == q.kind and d['type'] == q.type and d['repeat'] == (group_map.get(q.repeat) if q.repeat else '')
        exact = destination.get(q.id)
        candidates = [d for d in destination.values() if d['name'] == q.name and compatible(d)]
        unique_source = sum(other.name == q.name and other.kind == q.kind and other.type == q.type and other.repeat == q.repeat for other in package.questions) == 1
        target = exact if exact and compatible(exact) else candidates[0] if len(candidates) == 1 and unique_source else None
        if target and target['id'] not in used:
            mapping[q.id] = target['id']; used.add(target['id'])
            matches.append({'source': q.id, 'target': target['id']})
        else: skipped.append(q.id)
    if not matches: warnings.append('No compatible questions found. Only shared display settings can be applied.')

    def remap(ids, context):
        out = []
        for qid in ids:
            if qid in mapping:
                if mapping[qid] not in out: out.append(mapping[qid])
            else: warnings.append(f'{context}: skipped {qid}.')
        return out

    incoming = package.settings.model_dump()
    result = deepcopy(current.model_dump())
    for key in ('language', 'metadata', 'hideBlanks', 'hideZero', 'hideEmpty', 'questionSort', 'percentageDecimals', 'viewMode'):
        result[key] = incoming[key]
    result['hidden'] = [qid for qid in result['hidden'] if qid not in used] + remap(incoming['hidden'], 'Question visibility')
    result['filterFields'] = remap(incoming['filterFields'], 'Filter fields')
    result['questions'] = {qid: cfg for qid, cfg in result['questions'].items() if qid not in used}
    result['filters'] = []
    for rule in incoming['filters']:
        target = destination.get(mapping.get(rule['field']))
        if not target:
            warnings.append(f"Filter: skipped {rule['field']}."); continue
        expected = 'number' if target['kind'] == 'number' else 'date' if target['kind'] == 'date' else 'category'
        if rule['kind'] != expected:
            warnings.append(f"Filter type is incompatible: {rule['field']}."); continue
        rule['field'] = target['id']
        if rule['kind'] == 'category':
            codes = {c['name'] for c in target['choices']} | {'__blank__'}
            if target['kind'] == 'text':
                codes |= {str(record['values'][target['id']]) for record in project['records'] if record['values'].get(target['id']) is not None}
            valid = [v for v in rule['values'] if v in codes]
            if len(valid) != len(rule['values']): warnings.append(f"Unsupported filter selections skipped: {target['id']}.")
            if not valid:
                if rule['values']: warnings.append(f"Filter removed because no selections match: {target['id']}.")
                continue
            rule['values'] = valid
        result['filters'].append(rule)
    for qid, config in incoming['questions'].items():
        if qid not in mapping:
            warnings.append(f'Question settings: skipped {qid}.'); continue
        target = destination[mapping[qid]]
        fields = remap(config['breakdowns'] or ([config['breakdown']] if config['breakdown'] else []), f'Breakdowns for {qid}')
        valid = []
        for field in fields:
            try:
                breakdown_fields(QuestionSettings(breakdowns=[field]), destination, target)
                valid.append(field)
            except ValueError: warnings.append(f'Incompatible breakdown skipped: {field}.')
        if config.get('trendDateField'):
            original = config['trendDateField']
            config['trendDateField'] = mapping.get(original, '')
            try:
                if not config['trendDateField']: raise ValueError('Missing date field')
                trend_date_field(target, QuestionSettings.model_validate(config), destination)
            except ValueError:
                config['trendDateField'] = ''
                if config['chart'] == 'line' and target['kind'] in {'category', 'multiple'}: config['chart'] = 'bar'
                warnings.append(f'Incompatible trend date field skipped: {original}.')
        if config['chart'] == 'heatmap' and not valid:
            config['chart'] = 'bar'
            warnings.append(f'Heatmap changed to Bar because no breakdowns matched: {qid}.')
        legacy = mapping.get(config['breakdown'], '')
        config['breakdowns'], config['breakdown'] = valid, legacy if legacy in valid else ''
        if target['choices']:
            codes = {c['name'] for c in target['choices']} | {'series', '__blank__'}
            def supported_color(key):
                if key in codes: return True
                if not valid: return False
                try: values = [key] if len(valid) == 1 else json.loads(key)
                except (ValueError, TypeError): return False
                return isinstance(values, list) and len(values) == len(valid) and all(
                    isinstance(value, str) and (destination[field]['kind'] == 'text' or value in {c['name'] for c in destination[field]['choices']} | {'__blank__'})
                    for field, value in zip(valid, values))
            removed = {key for key in config['colors'] if not supported_color(key)}
            if removed: warnings.append(f'Unsupported color overrides skipped: {qid}.')
            config['colors'] = {k: v for k, v in config['colors'].items() if k not in removed}
        retained_points = {}
        for key, color in config.get('pointColors', {}).items():
            fields_in_key, column_id, answer_id = json.loads(key)
            remapped_fields = [mapping.get(field) for field in fields_in_key]
            compatible = remapped_fields == valid
            if target['choices'] and answer_id not in {choice['name'] for choice in target['choices']} | {'__blank__'}:
                compatible = False
            if column_id is None:
                compatible = compatible and not valid and target['kind'] in {'number', 'date'}
            elif not valid:
                compatible = False
            else:
                try: values = [column_id] if len(valid) == 1 else json.loads(column_id)
                except (ValueError, TypeError): values = []
                compatible = compatible and isinstance(values, list) and len(values) == len(valid) and all(
                    isinstance(value, str) and (destination[field]['kind'] == 'text' or value in
                    {choice['name'] for choice in destination[field]['choices']} | {'__blank__'})
                    for field, value in zip(valid, values))
            if compatible:
                retained_points[json.dumps([remapped_fields, column_id, answer_id], ensure_ascii=False, separators=(',', ':'))] = color
        if len(retained_points) != len(config.get('pointColors', {})):
            warnings.append(f'Incompatible individual chart colors skipped: {qid}.')
        config['pointColors'] = retained_points
        result['questions'][target['id']] = config
    indicator_ids = {item['id'] for item in incoming.get('indicators', [])}
    result['indicators'] = [item for item in result.get('indicators', []) if item['id'] not in indicator_ids]
    for definition in incoming.get('indicators', []):
        review = []
        definition['reviewIssues'] = []
        if definition['scope']:
            if definition['scope'] not in group_map: review.append('Scoring repeat table could not be matched.')
            else: definition['scope'] = group_map[definition['scope']]
        for rule in definition['questions']:
            original = rule['question']
            if original in mapping: rule['question'] = mapping[original]
            else: review.append(f'Scoring question could not be matched: {original}.')
        item = IndicatorDefinition.model_validate(definition)
        definition['reviewIssues'] = list(dict.fromkeys([*review, *indicator_issues(project, item)]))
        if definition['reviewIssues']: warnings.append(f'Indicator requires review before calculation: {definition["name"]}.')
        result['indicators'].append(definition)
    view_ids = {v['id'] for v in incoming.get('savedViews', [])}
    result['savedViews'] = [v for v in result.get('savedViews', []) if v['id'] not in view_ids]
    used_names = {v['name'].casefold() for v in result['savedViews']}
    for view in incoming.get('savedViews', []):
        nested = SettingsFile(format='kobo-settings', version=1, settings=KoboSettings.model_validate(view['snapshot']), questions=package.questions, groups=package.groups)
        remapped = preview_settings(project, new_project_settings(project['form']), nested)
        snapshot = AnalysisViewSettings.model_validate(remapped['settings'])
        view['snapshot'] = snapshot.model_dump()
        missing_refs = [f'Question could not be matched: {qid}.' for qid in view.get('questionKinds', {}) if qid not in mapping]
        view['questionKinds'] = {mapping.get(qid, qid): kind for qid, kind in view.get('questionKinds', {}).items()}
        if view['questionKinds']:
            added = destination.keys() - used
            view['snapshot']['hidden'] = list(dict.fromkeys([*view['snapshot']['hidden'], *sorted(added)]))
            view['questionKinds'].update({qid: destination[qid]['kind'] for qid in added if qid not in view['questionKinds']})
        view['reviewIssues'] = list(dict.fromkeys([*view['reviewIssues'], *missing_refs, *remapped['warnings'], *saved_view_issues(project, SavedAnalysisView.model_validate(view))]))
        original, suffix = view['name'], 1
        while view['name'].casefold() in used_names:
            suffix += 1; view['name'] = original[:140] + f' (imported {suffix})'
        if view['name'] != original: warnings.append(f'Saved view renamed to avoid a duplicate name: {view["name"]}.')
        used_names.add(view['name'].casefold())
        if view['reviewIssues']: warnings.append(f'Saved view requires review before opening: {view["name"]}.')
        result['savedViews'].append(view)
    result['activeViewId'] = ''
    if incoming['excelGroups'] is None: result['excelGroups'] = None
    else:
        result['excelGroups'] = []
        for gid in incoming['excelGroups']:
            if gid in group_map: result['excelGroups'].append(group_map[gid])
            else: warnings.append(f'Excel sheet group skipped: {gid}.')
    return {'settings': KoboSettings.model_validate(result).model_dump(), 'matches': matches,
            'skipped': skipped, 'warnings': list(dict.fromkeys(warnings))}
