"""Restore linked profile and activity fields before preparing shared store data."""
import re
import unicodedata

import pandas as pd

from .linked_csv_layouts import LEGACY_LAYOUTS


PROFILE_FIELDS = (
    "Name", "Gender", "DoB", "Age", "Age group", "UNHCR Age Group", "Age Gender Group",
    "Contact Number", "Secondary Contact Number", "Community Type", "Nationality",
    "Nationality if Other", "Nation of Birth", "ID Number", "Registered with UNHCR",
    "# UNHCR", "Individual Number ASSISIT", "Arrival Number", "Governorate", "District",
    "Sub-District", "Governorate of Origin", "Place of Origin", "Place of issue of residency card",
    "Sector-Tent Number", "Marital Statues", "Spouse name", "Spouse DoB", "Referred / Identified by",
    "Referred by (name)", "Type of vulnerabilities", "Other (Type of vulnerability)",
    "Protection Category", "Description of the Case",
)
ASSESSMENT_FIELDS = (
    "Is the beneficiary detained", "Is it an immigration related charge?", "Type of Released",
    "Date of the released or deported", "Date of Assessment", "Date of Assessment Closure",
    "Assessment Status",
)


def normalized_header(value):
    value = unicodedata.normalize("NFKC", str(value))
    value = "".join(char for char in value if unicodedata.category(char) != "Cf")
    return re.sub(r"\s+", " ", value).strip().casefold()


def field_for(header, fields):
    """Match only explicit English field prefixes, never arbitrary substrings."""
    header = normalized_header(header)
    for field in sorted(fields, key=len, reverse=True):
        key = normalized_header(field)
        if header == key or header.startswith(key + " /") or header.startswith(key + " "):
            # Similar-looking fields such as nationality stateless are independent.
            if field == "Nationality" and header.startswith("nationality stateless"):
                continue
            if field == "Name" and header not in {"name", "name / الأسم", "name (filter color red)"}:
                continue
            suffix = header[len(key):].strip().lstrip("/").strip()
            if suffix and suffix[0].isascii() and field != "Name":
                continue
            return field
    return None


def enrich_linked_csvs(frames, date_columns, warnings, *, clean_id, checkpoint):
    original_columns = {name: list(frame.columns) for name, frame in frames.items()}

    def copy_fields(destination, parent, foreign_key, parent_key, fields):
        if destination not in frames or parent not in frames:
            return
        frame, source = frames[destination], frames[parent]
        if foreign_key not in frame or parent_key not in source:
            warnings.append(f"{destination}.csv: cannot restore linked fields from {parent}.csv because {foreign_key} or {parent_key} is missing; existing linked values were retained.")
            return
        checkpoint()
        source_fields = {}
        for column in source.columns:
            field = field_for(column, fields)
            if field and field not in source_fields:
                source_fields[field] = column
        source_ids = source[parent_key].map(clean_id)
        usable = source_ids.ne("")
        duplicates = usable & source_ids.duplicated(keep="first")
        warning = f"{parent}.csv has {int(duplicates.sum())} duplicate {parent_key} rows; linked fields use the first row."
        if duplicates.any() and warning not in warnings:
            warnings.append(warning)
        lookup = source.loc[usable & ~duplicates, list(source_fields.values())].copy()
        lookup.index = source_ids.loc[usable & ~duplicates]
        target_ids = frame[foreign_key].map(clean_id)
        matched = target_ids.ne("") & target_ids.isin(lookup.index)
        if (~matched).any():
            warnings.append(f"{destination}.csv: {int((~matched).sum())} rows have blank or unmatched {foreign_key} links to {parent}.csv; existing linked values were retained.")
        layout = LEGACY_LAYOUTS[destination]
        existing_fields = {field_for(column, fields) for column in frame.columns}
        targets = [*frame.columns, *(column for column in layout
                   if column not in frame and field_for(column, fields) not in existing_fields)]
        for column in targets:
            field = field_for(column, fields)
            if not field:
                continue
            source_column = source_fields.get(field)
            if column not in frame:
                frame[column] = pd.Series(pd.NA, index=frame.index, dtype=object)
            if source_column:
                values = target_ids.map(lookup[source_column])
                # Object assignment also supports clearing a legacy value with NaT.
                result = frame[column].astype(object)
                result.loc[matched] = values.loc[matched]
                if pd.api.types.is_datetime64_any_dtype(source[source_column]) and result.dropna().map(lambda value: isinstance(value, pd.Timestamp)).all():
                    result = pd.to_datetime(result)
                frame[column] = result
                if source_column in date_columns.get(parent, ()) and column not in date_columns[destination]:
                    date_columns[destination].append(column)
            checkpoint()

    for dataset in LEGACY_LAYOUTS:
        copy_fields(dataset, "beneficiaries", "Beneficiary ID", "Case ID", PROFILE_FIELDS)
    copy_fields("legalservices", "assessments", "Assessment ID", "Assessment ID", ASSESSMENT_FIELDS)
    copy_fields("followupslogbooks", "assessments", "Assessment ID", "Assessment ID", ("Date of Assessment",))
    copy_fields("followupslogbooks", "legalservices", "Service ID", "Service ID", ("Date of Service Provision",))
    for dataset, layout in LEGACY_LAYOUTS.items():
        if dataset not in frames:
            continue
        frame = frames[dataset]
        if dataset in {"assessments", "legalservices"} and "Nationality Stateless" not in frame:
            frame["Nationality Stateless"] = pd.NA
        # Insert missing legacy fields relative to their nearest preceding legacy
        # column without moving existing columns or dropping custom columns.
        ordered = original_columns[dataset].copy()
        for position, column in enumerate(layout):
            if column not in frame or column in ordered:
                continue
            previous = next((c for c in reversed(layout[:position]) if c in ordered), None)
            following = next((c for c in layout[position + 1:] if c in ordered), None)
            insertion = ordered.index(previous) + 1 if previous else ordered.index(following) if following else len(ordered)
            ordered.insert(insertion, column)
        ordered.extend(column for column in frame.columns if column not in ordered)
        frames[dataset] = frame[ordered]
