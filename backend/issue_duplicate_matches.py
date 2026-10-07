"""Message context for the exact source rows selected by review duplicate rules."""
class IssueDuplicateMatches:
    def __init__(self, store, canonical, normalize_name):
        self.store = store
        self.canonical = canonical
        self.normalize_name = normalize_name
        self.flags = {(dataset, flag['rule'], flag['row']): flag
                      for dataset, flags in store.flags.items() for flag in flags} if isinstance(store.flags, dict) else {}

    def matches(self, finding):
        dataset, rule = finding['dataset'], finding['rule']
        frame = self.store.frames.get(dataset)
        originals = {peer['row']: peer for peer in finding.get('duplicateMatches', [])}
        source_rows = sorted(set(finding.get('duplicateMatchRows', [])) | set(originals))
        result = []
        for source_row in source_rows:
            index = source_row - 2
            if source_row == finding['row'] or frame is None or index not in frame.index:
                continue
            flag = self.flags.get((dataset, rule, source_row))
            if flag is None:
                generated = []
                self.store._flag(generated, dataset, rule, '', index, frame.loc[index], '')
                flag = generated[0]
            if self.store._is_excluded(flag):
                continue
            original = originals.get(source_row, {})
            name = str(flag.get('lawyer', '')).strip()
            owners = self.canonical.get(self.normalize_name(name), [])
            lawyer = owners[0] if len(owners) == 1 else 'Unassigned' if dataset == 'legalhotlines' or len(owners) > 1 else name or 'Unassigned'
            match = {key: flag.get(key, '') for key in ('caseId', 'assessmentId', 'serviceId', 'hotlineId', 'awarenessId', 'name', 'sessionTopic')}
            match.update(dataset=dataset, row=source_row, lawyer=lawyer,
                         matchType=original.get('matchType') or ('history' if finding.get('duplicateContext', {}).get('settings', {}).get('comparisonMonth') else 'similar' if finding.get('nameMatchMode') == 'variation' else 'exact'),
                         date=flag.get('assessmentDate') or flag.get('serviceDate') or flag.get('awarenessDate') or flag.get('contactDate') or '')
            kind, identifier = {
                'beneficiaries': ('Case', match['caseId']), 'assessments': ('Assessment', match['assessmentId']),
                'legalservices': ('Service', match['serviceId']), 'legalhotlines': ('Hotline', match['hotlineId']),
                'awareness': ('Awareness', match['awarenessId']),
            }[dataset]
            reference = f'{kind} {identifier}' if identifier else f'Row {source_row}'
            if dataset != 'beneficiaries' and identifier:
                reference += f' (row {source_row})'
            context = [reference]
            if dataset == 'awareness' and match['name']:
                context.append(match['name'])
            context.append(lawyer)
            if dataset == 'awareness' and match['sessionTopic']:
                context.append(match['sessionTopic'])
            if match['date']:
                context.append(str(match['date']))
            match['reference'] = reference
            match['description'] = ' - '.join(context) + f" ({match['matchType']})"
            result.append(match)
        return result
