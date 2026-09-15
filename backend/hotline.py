"""Hotline aggregation and filtering, without modifying imported source values."""
import re

import pandas as pd

from .legal_platform import normalize_governorate

FIELDS = (
    "Contact Date", "Is the beneficiary detained",
    "Has the beneficiary referred to the helpline?", "Governorate of detention",
    "Priority", "Type of Request", "Gender", "Detaining Authority",
)


def values(frame, field):
    column = next((c for c in frame.columns if str(c).strip().casefold().startswith(field.casefold())), None)
    series = frame[column] if column else pd.Series("", index=frame.index, dtype=object)
    if field == "Contact Date":
        return pd.to_datetime(series, format="mixed", dayfirst=False, errors="coerce").dt.to_period("M").astype(str).replace("NaT", "Not recorded")

    def normalize(value):
        label = "" if pd.isna(value) else re.sub(r"\s+", " ", str(value)).strip()
        if not label:
            return "Not recorded"
        if field in FIELDS[1:3]:
            for word, arabic in (("Yes", "نعم"), ("No", "لا")):
                if re.search(r"\b" + word + r"\b", label, re.I) or arabic in label:
                    return word
        if field == "Priority":
            for word, arabic in (("High", "عالية"), ("Medium", "متوسطة"), ("Low", "منخفضة")):
                if re.search(r"\b" + word + r"\b", label, re.I) or arabic in label:
                    return word
        return label
    return series.map(normalize)


def source_values(frame, column):
    """Return filter-ready source values, grouping every date field by reporting month."""
    series = frame[column]
    if re.search(r"\b(date|month)\b", str(column), re.I):
        parsed = pd.to_datetime(series, format="mixed", dayfirst=False, errors="coerce")
        return parsed.dt.to_period("M").astype(str).replace("NaT", "Not recorded")
    return series.map(lambda value: "Not recorded" if pd.isna(value) or not str(value).strip() else re.sub(r"\s+", " ", str(value)).strip())


def filter_frame(frame, filters):
    for field, selections in (filters or {}).items():
        key = "Contact Date" if field == "Month" else field
        if selections and key in FIELDS:
            frame = frame[values(frame, key).isin(selections)]
        elif selections and field in frame.columns:
            frame = frame[source_values(frame, field).isin(selections)]
    return frame


def dashboard(source, filters=None):
    if source is None:
        raise ValueError("legalhotlines.csv is not loaded.")
    frame = filter_frame(source, filters)
    total = len(frame)
    options = {field: sorted(values(source, field).unique().tolist()) for field in FIELDS}
    known_columns = {next((column for column in source.columns if str(column).strip().casefold().startswith(field.casefold())), None) for field in FIELDS}
    for column in source.columns:
        if column not in known_columns:
            options[str(column)] = sorted(source_values(source, column).unique().tolist())
    options["Contact Date"] = [m for m in options["Contact Date"] if m != "Not recorded"]
    charts = []
    for field in FIELDS[1:]:
        counts = values(frame, field).value_counts()
        charts.append({"id": field, "title": field, "kind": "bar", "multiChoice": False,
                       "rows": [{"label": label, "count": int(count), "percent": int(count)/total if total else 0} for label, count in counts.items()]})
    months = values(frame, "Contact Date")
    counts = months[months.ne("Not recorded")].value_counts()
    selected = (filters or {}).get("Contact Date") or (filters or {}).get("Month") or options["Contact Date"]
    valid = sorted(m for m in selected if re.fullmatch(r"\d{4}-\d{2}", m))
    span = pd.period_range(valid[0], valid[-1], freq="M") if valid else []
    detention_values = values(frame, "Is the beneficiary detained")
    trend = [{"label": str(m), "count": int(counts.get(str(m), 0)), "percent": int(counts.get(str(m), 0))/total if total else 0,
              "detained": int((months.eq(str(m)) & detention_values.eq("Yes")).sum()),
              "notDetained": int((months.eq(str(m)) & detention_values.eq("No")).sum())} for m in span]
    metrics = [("Hotline records", total), ("Detained records", int(values(frame, FIELDS[1]).eq("Yes").sum())),
               ("Referred to helpline", int(values(frame, FIELDS[2]).eq("Yes").sum())),
               ("High-priority records", int(values(frame, "Priority").eq("High").sum()))]
    governorate_labels = {
        "sulaymaniyah": "Al-Sulaimaniyah", "ninewa": "Ninawa", "qadisiyah": "Al-Qadisiyah",
        "muthanna": "Al-Muthanna", "dhi qar": "Dhi Qar", "salah al din": "Salah al-Din",
        "anbar": "Al-Anbar", "basra": "Al-Basrah", "karbala": "Karbala", "najaf": "An-Najaf",
        "wasit": "Wasit", "baghdad": "Baghdad", "babil": "Babil", "maysan": "Maysan",
        "diyala": "Diyala", "kirkuk": "Kirkuk", "erbil": "Erbil", "duhok": "Dohuk",
    }
    governorates = values(frame, "Governorate of detention")
    detention_status = values(frame, "Is the beneficiary detained")
    map_groups = {}
    for raw in governorates.unique():
        if raw == "Not recorded":
            continue
        canonical = normalize_governorate(raw)
        label = governorate_labels.get(canonical)
        if not label:
            continue
        matches = governorates.eq(raw)
        item = map_groups.setdefault(label, {"label": label, "count": 0, "detained": 0, "notDetained": 0, "values": []})
        item["detained"] += int((matches & detention_status.eq("Yes")).sum())
        item["notDetained"] += int((matches & detention_status.eq("No")).sum())
        item["count"] += int(matches.sum())
        item["values"].append(raw)
    return {"page": "hotline", "measure": "records", "total": total, "filteredRows": total,
            "kpis": [{"label": label, "value": count, "format": "number"} for label, count in metrics],
            "trend": trend, "charts": charts, "filterOptions": options,
            "missingContactDates": int(months.eq("Not recorded").sum()),
            "map": {"items": sorted(map_groups.values(), key=lambda item: (-item["detained"], item["label"]))}}
