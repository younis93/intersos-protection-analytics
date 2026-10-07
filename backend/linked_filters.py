"""Self-excluding facets over complete source rows, without pagination."""
import pandas as pd
from .filter_selection import selection_mask


def available_values(series_by_field, filters=None, base_mask=None, masks_by_field=None):
    if not series_by_field:
        return {}
    index = next(iter(series_by_field.values())).index
    base = pd.Series(True, index=index) if base_mask is None else base_mask.reindex(index, fill_value=False)
    masks = {key: ((masks_by_field or {}).get(key) if key in (masks_by_field or {}) else selection_mask(series, filters[key])) for key, series in series_by_field.items()
             if (filters or {}).get(key)}
    # Count failures once. A field ignores only its own failures.
    failures = pd.Series(0, index=index)
    for mask in masks.values():
        failures += (~mask).astype(int)
    result = {}
    for key, series in series_by_field.items():
        remaining = failures - ((~masks[key]).astype(int) if key in masks else 0)
        result[key] = sorted({str(value) for value in series[base & remaining.eq(0)].dropna()
                              if str(value) and str(value) != "NaT"})
    return result


def without_field(filters, field):
    return {key: values for key, values in (filters or {}).items() if key != field and values}


def search_mask(frame, search, columns=None, join=False):
    if not search:
        return pd.Series(True, index=frame.index)
    text = frame[list(columns) if columns is not None else list(frame.columns)].fillna("").astype(str)
    if join:return text.agg(" ".join,axis=1).str.contains(search,case=False,regex=False)
    return text.apply(lambda column:column.str.contains(search,case=False,regex=False)).any(axis=1)
