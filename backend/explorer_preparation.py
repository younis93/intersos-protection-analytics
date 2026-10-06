"""Lazy, revision-owned Explorer indexes. Source frames are never modified."""
import re
from threading import RLock

import pandas as pd


class PreparedExplorer:
    def __init__(self, frame, dataset):
        from .legal_platform import _find
        self.dataset = dataset
        self.frame = frame
        self.lock = RLock()
        self.values = {}
        self.sorts = {}
        self.months = {}
        self.search = None
        if dataset == "deportationrecords":
            column = _find(list(frame.columns), "Date of deporting", "Date of deportation")
            if column:
                dates = pd.to_datetime(frame[column], errors="coerce", dayfirst=True)
                self.frame = frame.assign(Month=dates.dt.to_period("M").astype(str).replace("NaT", ""))

    def __getstate__(self):
        return {key: value for key, value in self.__dict__.items() if key != "lock"}

    def __setstate__(self, state):
        self.__dict__.update(state)
        self.lock = RLock()

    def text(self, column):
        with self.lock:
            if column not in self.values:
                self.values[column] = self.frame[column].fillna("").astype(str)
            return self.values[column]

    def month_values(self, column, indexes):
        # Pandas' inferred format depends on the first value. Preserve that
        # behavior for heterogeneous source formats after earlier filters.
        with self.lock:
            if column not in self.months:
                values = self.text(column)
                formats = values[values.ne("")].map(lambda value: re.sub(r"\d", "0", value)).unique()
                homogeneous = len(formats) <= 1
                parsed = pd.to_datetime(self.frame[column], errors="coerce", dayfirst=True)
                self.months[column] = (homogeneous, parsed.dt.to_period("M").astype(str))
            homogeneous, months = self.months[column]
        if homogeneous or indexes.equals(self.frame.index): return months.reindex(indexes)
        return pd.to_datetime(self.frame.loc[indexes, column], errors="coerce", dayfirst=True).dt.to_period("M").astype(str)

    def select(self, search, filters, filter_column="", filter_value="", sort_column="", sort_direction="asc"):
        from .legal_platform import DATE_HINT, YEAR_MONTH
        indexes = self.frame.index
        if self.dataset == "legalhotlines":
            from .hotline import FIELDS, values, source_values
            for field, selections in (filters or {}).items():
                key = "Contact Date" if field == "Month" else field
                if not selections: continue
                cache_key = ("hotline", key)
                with self.lock:
                    if cache_key not in self.values:
                        if key in FIELDS: self.values[cache_key] = values(self.frame, key)
                        elif field in self.frame.columns: self.values[cache_key] = source_values(self.frame, field)
                        else: continue
                    matches = self.values[cache_key].reindex(indexes).isin(selections)
                indexes = indexes[matches]
            filters = {}
        if search:
            with self.lock:
                if self.search is None:
                    self.search = self.frame.fillna("").astype(str).agg(" ".join, axis=1).str.lower()
                matches = self.search.reindex(indexes).str.contains(search.lower(), regex=False)
            indexes = indexes[matches]
        if filter_column in self.frame.columns and filter_value:
            indexes = indexes[self.text(filter_column).reindex(indexes).str.contains(filter_value, case=False, regex=False)]
        for column, selections in (filters or {}).items():
            if column not in self.frame.columns or not selections: continue
            values = self.month_values(column, indexes) if DATE_HINT.search(str(column)) and all(YEAR_MONTH.fullmatch(str(value)) for value in selections) else self.text(column).reindex(indexes)
            indexes = indexes[values.isin(selections)]
        if sort_column in self.frame.columns:
            with self.lock:
                if sort_column not in self.sorts:
                    values = self.frame[sort_column]
                    if DATE_HINT.search(sort_column): values = pd.to_datetime(values, errors="coerce", dayfirst=self.dataset != "legalhotlines", format="mixed")
                    elif pd.api.types.is_numeric_dtype(values): values = pd.to_numeric(values, errors="coerce")
                    else: values = self.text(sort_column).str.casefold()
                    self.sorts[sort_column] = values
                indexes = self.sorts[sort_column].reindex(indexes).sort_values(ascending=sort_direction != "desc", kind="stable", na_position="last").index
        return indexes
