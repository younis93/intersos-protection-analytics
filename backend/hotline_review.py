"""Read-only hotline review findings and stable record identities."""
import hashlib
import json
import re
from collections import defaultdict
from difflib import SequenceMatcher

import pandas as pd

COMBINED_NAME_RULE = "Duplicate detained-person name and caller match"
RULES = (
    "Duplicate detained-person name", "Similar detained-person name",
    "Detained-person name matches caller", "Detained without lawyer referral",
    "Not detained and not referred to helpline", "High priority without lawyer referral",
    "Invalid contact number", COMBINED_NAME_RULE,
)
FIELDS = {
    "name": ("Name of the detained person", "اسم الشخص المعتقل"),
    "callerName": ("Name of the caller", "اسم المتصل"),
    "phone": ("Contact Number", "Phone Number", "Contact number of the caller", "Phone number of the caller", "Caller Contact Number", "رقم هاتف المتصل", "رقم الهاتف", "رقم الاتصال"),
    "beneficiaryDetained": ("Is the beneficiary detained", "هل المستفيد موقوف"),
    "helplineReferral": ("Has the beneficiary referred to the helpline?", "هل تم احالة المستفيد الى خط المساعدة"),
    "priority": ("Priority", "الأولوية", "الاولوية"),
    "lawyerReferral": ("Refer to Lawyer", "احالة الى محامي", "إحالة إلى محامي"),
    "contactDate": ("Contact Date", "تاريخ الاتصال"),
    "project": ("Projects", "Project"), "location": ("Project Location",),
}
REQUIRED = {
    COMBINED_NAME_RULE: ("name", "callerName"),
    RULES[0]: ("name",), RULES[1]: ("name",), RULES[2]: ("name", "callerName"),
    RULES[3]: ("beneficiaryDetained", "lawyerReferral"),
    RULES[4]: ("beneficiaryDetained", "helplineReferral"),
    RULES[5]: ("priority", "lawyerReferral"), RULES[6]: ("phone",),
}
ACTIONS = {
    COMBINED_NAME_RULE: "Verify hotline records with the same detained-person name and caller name; correct the source names and retain the correct record.",
    RULES[0]: "Verify the duplicate detained-person records and retain the correct hotline record.",
    RULES[1]: "Verify the possible spelling variation against the hotline source records.",
    RULES[2]: "Verify whether the caller and detained person are the same person and correct the names if needed.",
    RULES[3]: "Verify detention and record the responsible lawyer referral.",
    RULES[4]: "Verify the detention and helpline referral answers and correct the source record.",
    RULES[5]: "Follow up the high-priority request and record the lawyer referral.",
    RULES[6]: "Verify and correct the contact number to a valid 10-digit number.",
}


def hidden_review_filter(field):
    label=str(field).casefold()
    return (any(hint.casefold() in label for key in ("name","callerName") for hint in FIELDS[key])
            or bool(re.search(r"caller.*(?:himself|herself|someone else)|المتصل.*(?:نفسه|شخص اخر|شخص آخر)",label)))


def review_field_filters(frame, filters=None, omit_contact_date=False):
    """Filter original records without changing duplicate detection or source data."""
    from .legal_platform import display_value, _find
    from .filter_selection import selection_mask
    from .linked_filters import available_values
    fields = {str(column): frame[column].map(lambda value: str(display_value(value)).strip() or "Not recorded")
              for column in frame.columns if not str(column).startswith("__")}
    date_column=_find(list(frame.columns),*FIELDS["contactDate"])
    if date_column:
        fields[str(date_column)]=pd.to_datetime(frame[date_column],format="mixed",dayfirst=False,errors="coerce").dt.strftime("%Y-%m").fillna("Not recorded")
    mask = pd.Series(True, index=frame.index)
    for field, selections in (filters or {}).items():
        if omit_contact_date and field==date_column: continue
        if selections:
            mask &= selection_mask(fields[field], selections) if field in fields else False
    options={field:values for field,values in available_values(fields,filters).items() if not hidden_review_filter(field)}
    if date_column:
        months=options[str(date_column)]
        options[str(date_column)]=sorted((month for month in months if month!="Not recorded"),reverse=True)+(["Not recorded"] if "Not recorded" in months else [])
    return {int(index) + 2 for index in frame.index[mask]}, options


def filter_review_findings(frame, items, filters=None, row_scope=None):
    """Expand only duplicate groups seeded by the chosen months, after other filters."""
    from .legal_platform import _find
    selected=row_scope[0] if row_scope is not None else review_field_filters(frame,filters)[0]
    date_column=_find(list(frame.columns),*FIELDS["contactDate"])
    if not date_column or not (filters or {}).get(date_column):
        return [item for item in items if item["row"] in selected]
    eligible=row_scope[1] if row_scope is not None else review_field_filters(frame,filters,omit_contact_date=True)[0]
    groups={(item["rule"],item["duplicateGroup"]) for item in items
            if item["row"] in selected and item.get("duplicateGroup")}
    return [item for item in items if item["row"] in selected or
            (item["row"] in eligible and item.get("duplicateGroup") and (item["rule"],item["duplicateGroup"]) in groups)]


def prepare(frame):
    from .legal_platform import _find, clean_id
    columns = {key: _find(list(frame.columns), *hints) for key, hints in FIELDS.items()}
    id_column = _find(list(frame.columns), "Hotline ID", "Hotline Record ID", "Record ID") or next((c for c in frame.columns if str(c).strip().casefold() == "id"), None)
    counts = defaultdict(int)
    identities = {}
    for index, row in frame.iterrows():
        native = clean_id(row.get(id_column, "")) if id_column else ""
        content = json.dumps({str(k): "" if pd.isna(v) else str(v) for k, v in sorted(row.items(), key=lambda item: str(item[0]))}, ensure_ascii=False, sort_keys=True)
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        key = f"id:{native}" if native else f"hotline:{digest}"
        counts[key] += 1
        identities[index] = (key, digest)
    seen = defaultdict(int)
    for index, (key, digest) in identities.items():
        if key.startswith("id:") and counts[key] == 1:
            identities[index] = key
            continue
        base = f"{key}:{digest}" if key.startswith("id:") else key
        seen[base] += 1
        identities[index] = f"{base}:{seen[base]}"
    unavailable = {rule: "Missing column(s): " + ", ".join(FIELDS[key][0] for key in required if not columns[key]) for rule, required in REQUIRED.items() if any(not columns[key] for key in required)}
    return columns, identities, unavailable


def findings(store, compare_chars=15, allow_variations=True, group_names=True):
    from .legal_platform import normalize_name, clean_id, display_value
    frame = store.frames.get("legalhotlines", pd.DataFrame())
    columns, identities, unavailable = prepare(frame)
    represented_columns = {column for column in columns.values() if column}
    extra_columns = [column for column in frame.columns if column not in represented_columns]
    output = []
    def value(row, key):
        return str(display_value(row.get(columns[key], ""))) if columns[key] else ""
    def answer(raw):
        text = str(raw).strip()
        if re.search(r"\byes\b", text, re.I) or "نعم" in text: return "Yes"
        if re.search(r"\bno\b", text, re.I) or text == "لا": return "No"
        return ""
    def add(index, rule, detail, **extra):
        row = frame.loc[index]
        store._flag(output, "legalhotlines", rule, "High" if rule in RULES[3:6] else "Medium", index, row, detail)
        flag = output[-1]
        flag.update({key: value(row, key) for key in FIELDS})
        flag["sourceFields"] = {str(column): str(display_value(row.get(column, ""))) for column in extra_columns}
        flag.update(recordId=identities[index], hotlineId=identities[index], lawyer=value(row, "lawyerReferral"), action=ACTIONS[rule], caseId="", assessmentId="", serviceId="")
        # Only expose a case action when a real imported beneficiary is linked.
        case_column = store.frames.get("beneficiaries", pd.DataFrame())
        if not case_column.empty:
            from .legal_platform import _find
            source_id = _find(list(row.index), "Beneficiary ID", "Case ID")
            target_id = _find(list(case_column.columns), "Case ID")
            candidate = clean_id(row.get(source_id, "")) if source_id else ""
            if target_id and candidate and candidate in set(case_column[target_id].map(clean_id)):
                flag["caseId"] = candidate
        flag.update(extra)
    def normalized_words(raw):
        return " ".join(normalize_name(word) for word in re.findall(r"[^\W_]+", raw, re.UNICODE) if normalize_name(word))
    names = {index: normalize_name(value(row, "name")) for index, row in frame.iterrows() if columns["name"]}
    exact = defaultdict(list)
    for index, name in names.items():
        if name: exact[name].append(index)
    settings = {"nameCompareChars": max(10, min(30, compare_chars)), "allowNameVariations": bool(allow_variations)}
    for name, members in exact.items():
        if len(members) < 2: continue
        key = f"hotline-exact:{name}"
        context = store._duplicate_context(key, [identities[i] for i in members])
        for index in members:
            add(index, RULES[0], f"Normalized name matches {len(members)-1} other record(s)", duplicateGroup=key, duplicateContext=context, nameMatchMode="exact", duplicateSimilarity=100, duplicateMatchRows=[int(peer)+2 for peer in sorted(members) if peer != index])
    pairs = defaultdict(list)
    if COMBINED_NAME_RULE not in unavailable:
        for index, row in frame.iterrows():
            name = names[index]
            caller = normalize_name(value(row, "callerName"))
            if name and caller:
                pairs[(name, caller)].append(index)
    for (name, caller), members in pairs.items():
        if len(members) < 2: continue
        key = "hotline-name-caller:" + json.dumps([name, caller], ensure_ascii=False, separators=(",", ":"))
        context = store._duplicate_context(key, [identities[i] for i in members],
                                           {"detainedPersonName": name, "callerName": caller})
        for index in members:
            add(index, COMBINED_NAME_RULE,
                f"Both normalized detained-person name and caller name match {len(members)-1} other record(s)",
                duplicateGroup=key, duplicateContext=context, nameMatchMode="exact", duplicateSimilarity=100,
                duplicateMatchRows=[int(peer)+2 for peer in sorted(members) if peer != index])
    matches = defaultdict(set)
    buckets = defaultdict(list)
    for index, name in names.items():
        if len(name) < settings["nameCompareChars"]: continue
        prefix = name[:settings["nameCompareChars"]]
        for other, other_prefix in buckets[prefix[:2]]:
            if names[other] == name: continue
            score = SequenceMatcher(None, prefix, other_prefix).ratio()
            if score >= (0.9 if allow_variations else 1):
                matches[index].add(other); matches[other].add(index)
        buckets[prefix[:2]].append((index, prefix))
    visited = set()
    for index in matches:
        if index in visited: continue
        pending = [index]; members = set()
        while pending:
            member = pending.pop()
            if member in members: continue
            members.add(member); pending.extend(matches[member])
        visited.update(members)
        key = "hotline-similar:" + min(names[i] for i in members)
        context = store._duplicate_context(key, [identities[i] for i in members], settings)
        for member in members:
            similarity = round(max(SequenceMatcher(None, names[member], names[peer]).ratio() for peer in matches[member])*100)
            add(member, RULES[1], f"First {settings['nameCompareChars']} normalized characters match {len(matches[member])} other record(s)", duplicateGroup=key, duplicateContext=context, nameMatchMode="variation", duplicateSimilarity=similarity, duplicateMatchRows=[int(peer)+2 for peer in sorted(matches[member])])
    for index, row in frame.iterrows():
        detained = answer(value(row, "beneficiaryDetained")); referral = answer(value(row, "helplineReferral"))
        name = normalized_words(value(row, "name")); caller = normalized_words(value(row, "callerName"))
        if RULES[2] not in unavailable and name and caller and (f" {name} " in f" {caller} " or f" {caller} " in f" {name} "):
            add(index, RULES[2], "Detained-person and caller names overlap within this record")
        if RULES[3] not in unavailable and detained == "Yes" and not value(row, "lawyerReferral").strip():
            add(index, RULES[3], "Detained is Yes; lawyer referral is blank")
        if RULES[4] not in unavailable and detained == "No" and referral == "No":
            add(index, RULES[4], "Detained and helpline referral are both No")
        priority = value(row, "priority")
        if RULES[5] not in unavailable and (re.search(r"\bhigh\b", priority, re.I) or "عالية" in priority) and not value(row, "lawyerReferral").strip():
            add(index, RULES[5], "Priority is High; lawyer referral is blank")
        phone = value(row, "phone").strip()
        if RULES[6] not in unavailable and phone:
            digits = re.sub(r"[\s()\-]", "", phone)
            if not re.fullmatch(r"\d{10}", digits):
                add(index, RULES[6], "Populated contact number must contain exactly 10 digits with no other characters")
    if not group_names:
        return output, unavailable
    # A record belongs to one name-check table, independent of filters or paging.
    name_rules = {COMBINED_NAME_RULE, *RULES[:3]}
    by_record = defaultdict(dict)
    for flag in output:
        if flag["rule"] in name_rules:
            by_record[flag["hotlineId"]][flag["rule"]] = flag
    grouped = []
    for flags in by_record.values():
        flag = next(flags[rule] for rule in (COMBINED_NAME_RULE, RULES[0], RULES[2], RULES[1]) if rule in flags)
        grouped.append(flag)
    return grouped + [flag for flag in output if flag["rule"] not in name_rules], unavailable
