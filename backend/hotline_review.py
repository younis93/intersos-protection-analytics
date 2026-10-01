"""Read-only hotline review findings and stable record identities."""
import hashlib
import json
import re
from collections import defaultdict
from difflib import SequenceMatcher

import pandas as pd

RULES = (
    "Duplicate detained-person name", "Similar detained-person name",
    "Detained-person name matches caller", "Detained without lawyer referral",
    "Not detained and not referred to helpline", "High priority without lawyer referral",
    "Invalid contact number",
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
    RULES[0]: ("name",), RULES[1]: ("name",), RULES[2]: ("name", "callerName"),
    RULES[3]: ("beneficiaryDetained", "lawyerReferral"),
    RULES[4]: ("beneficiaryDetained", "helplineReferral"),
    RULES[5]: ("priority", "lawyerReferral"), RULES[6]: ("phone",),
}
ACTIONS = {
    RULES[0]: "Verify the duplicate detained-person records and retain the correct hotline record.",
    RULES[1]: "Verify the possible spelling variation against the hotline source records.",
    RULES[2]: "Verify whether the caller and detained person are the same person and correct the names if needed.",
    RULES[3]: "Verify detention and record the responsible lawyer referral.",
    RULES[4]: "Verify the detention and helpline referral answers and correct the source record.",
    RULES[5]: "Follow up the high-priority request and record the lawyer referral.",
    RULES[6]: "Verify and correct the contact number to a valid 10-digit number.",
}


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


def findings(store, compare_chars=15, allow_variations=True):
    from .legal_platform import normalize_name, clean_id, display_value
    frame = store.frames.get("legalhotlines", pd.DataFrame())
    columns, identities, unavailable = prepare(frame)
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
            add(index, RULES[0], f"Normalized name matches {len(members)-1} other record(s)", duplicateGroup=key, duplicateContext=context, nameMatchMode="exact", duplicateSimilarity=100)
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
            add(member, RULES[1], f"First {settings['nameCompareChars']} normalized characters match {len(matches[member])} other record(s)", duplicateGroup=key, duplicateContext=context, nameMatchMode="variation", duplicateSimilarity=similarity)
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
    return output, unavailable
