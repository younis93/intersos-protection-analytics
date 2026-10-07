"""Inclusion and exclusion semantics shared by filters and exports."""
EXCLUDE_PREFIX = "\x00exclude:"


def selection_value(value):
    return value[len(EXCLUDE_PREFIX):] if value.startswith(EXCLUDE_PREFIX) else value


def split_selection(selection):
    return ([value for value in selection if not value.startswith(EXCLUDE_PREFIX)],
            [selection_value(value) for value in selection if value.startswith(EXCLUDE_PREFIX)])


def selection_caption(selection):
    return ", ".join(("Excluding " if value.startswith(EXCLUDE_PREFIX) else "") + selection_value(value)
                     for value in selection)


def selection_mask(series, selection):
    included, excluded = split_selection(selection)
    mask = series.isin(included) if included else ~series.isin([])
    return mask & ~series.isin(excluded)


def matches_selection(value, selection):
    included, excluded = split_selection(selection)
    return (not included or value in included) and value not in excluded


def resolve_selection(selection, available):
    # Preserve a nonempty impossible selection when every available value is excluded.
    return [value for value in available if matches_selection(value, selection)] or ["\x00no-matches"]
