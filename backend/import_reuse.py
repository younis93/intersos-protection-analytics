"""Compatibility checks for updating source records without changing saved setup."""
from collections import Counter


def source_reuse_reasons(previous, current):
    """Compare worksheet/header identities, allowing unique columns to move."""
    def identities(sheets):
        return [(sheet['name'], tuple(sheet['headers'])) for sheet in sheets]
    old, new = identities(previous), identities(current)
    reasons = []
    if [name for name, _ in old] != [name for name, _ in new]:
        reasons.append('The source worksheets changed. Review the selected data table.')
    if len(old) != len(new) or any(a[0] != b[0] or Counter(a[1]) != Counter(b[1]) for a, b in zip(old, new)):
        reasons.append('Source columns were added, removed, or renamed.')
    if any(len(set(headers)) != len(headers) or any(not header for header in headers) for _, headers in new):
        reasons.append('Blank or duplicate column headers need review before settings can be reused.')
    return reasons


def settings_reuse_reasons(project, payload):
    from .kobo import KoboSettings
    from .kobo_saved_views import snapshot_issues, saved_view_issues
    from .kobo_indicators import indicator_issues
    settings = KoboSettings.model_validate(project['settings'])
    reasons = snapshot_issues(payload, settings)
    for view in settings.savedViews:
        reasons.extend(f'{view.name}: {issue}' for issue in saved_view_issues(payload, view))
    for definition in settings.indicators:
        reasons.extend(f'{definition.name}: {issue}' for issue in indicator_issues(payload, definition))
    return list(dict.fromkeys(reasons))


def reuse_result(reasons):
    return {'eligible': not reasons, 'reasons': list(dict.fromkeys(reasons))}
