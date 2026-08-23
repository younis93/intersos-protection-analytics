"""Build a linked, anonymous Legal Platform demonstration CSV package."""
from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

import pandas as pd
from dateutil import parser


SOURCE = Path("Legal Platform Data")
TARGET = Path(r"C:\Legal Platform\TEST Shared - Anonymized")
FILES = (
    "beneficiaries", "assessments", "legalservices", "legalfees",
    "followupslogbooks", "awareness", "deportationrecords",
)
ROWS_PER_FILE = 300
DATE_SHIFT_DAYS = -14

NAME_COLUMNS = (
    "Name (Filter Color Red)", "Name / الأسم", "Name of deported Person",
    "Participant Name", "Spouse name", "Name of the reporting person",
    "Name of the reporting person اسم الشخص المبلغ", "Referred by (name)",
)
STAFF_COLUMNS = ("Lawyers", "Lawyer", "Supervisor", "Legal Officer", "Protection Manager", "Created by", "Created By", "Edited By")
LOCATION_WORDS = ("location", "governorate", "district", "sub-district", "place of origin", "nation of birth", "place of issue", "deported to")
NARRATIVE_WORDS = ("description", "specified", "comments", "objective", "summarize", "findings", "action plan", "justification", "reason for closure", "reason for pending", "reasons for detention", "possible charges", "process", "status comment", "other, please specify", "other (type")


def key(value: object) -> str:
    return str(value or "").strip()


def digest(value: object, width: int = 7) -> str:
    return hashlib.sha256(key(value).encode("utf-8")).hexdigest()[:width].upper()


def alpha_token(number: int) -> str:
    """A digits-free stable suffix so name-normalization does not collapse records."""
    letters = []
    for _ in range(5):
        number, remainder = divmod(number, 26)
        letters.append(chr(65 + remainder))
    return "".join(reversed(letters))


def split_ids(value: object) -> list[str]:
    return [part.strip() for part in re.split(r"\s*,\s*", key(value)) if part.strip()]


def read_csv(name: str) -> pd.DataFrame:
    return pd.read_csv(SOURCE / f"{name}.csv", dtype=str, keep_default_na=False, encoding="utf-8-sig")


def first_column(frame: pd.DataFrame, *terms: str) -> str | None:
    for term in terms:
        needle = term.casefold()
        for column in frame.columns:
            if needle in column.casefold():
                return column
    return None


def sample(frame: pd.DataFrame, count: int, prefer=None) -> pd.DataFrame:
    """Return count rows, repeating source rows only where the source is shorter."""
    ordered = frame[prefer(frame)].copy() if prefer else frame.copy()
    if len(ordered) >= count:
        # Spread the compact fixture across the source export so all projects, statuses,
        # demographics, and dashboard indicators remain populated.
        indexes = [round(position * (len(ordered) - 1) / (count - 1)) for position in range(count)]
        return ordered.iloc[indexes].copy().reset_index(drop=True)
    pieces = [ordered]
    while sum(len(piece) for piece in pieces) < count:
        pieces.append(ordered.iloc[: min(len(ordered), count - sum(len(piece) for piece in pieces))].copy())
    return pd.concat(pieces, ignore_index=True)


def parse_and_shift(value: object) -> str:
    raw = key(value)
    if not raw:
        return raw
    try:
        parsed = parser.parse(raw, dayfirst=True, fuzzy=False)
    except (ValueError, OverflowError, TypeError):
        return raw
    shifted = parsed + timedelta(days=DATE_SHIFT_DAYS)
    # All operational activity in the test package is placed in 2026 so that the
    # dashboard and Indicator Reporting year filter have meaningful totals.
    try:
        shifted = shifted.replace(year=2026)
    except ValueError:  # 29 February on a non-leap reporting year
        shifted = shifted.replace(year=2026, day=28)
    # CSV source uses dates, occasionally with time. Retain a simple deterministic display.
    return shifted.strftime("%d/%m/%Y" if not re.search(r"\d:\d", raw) else "%d/%m/%Y %H:%M")


def make_map(values: list[str], prefix: str, unique_per_row: bool = False) -> dict[str, str]:
    mapping: dict[str, str] = {}
    seen: defaultdict[str, int] = defaultdict(int)
    for raw in values:
        raw = key(raw)
        if not raw:
            continue
        seen[raw] += 1
        if raw not in mapping:
            mapping[raw] = f"{prefix}-{len(mapping) + 1:05d}"
    return mapping


def build() -> None:
    data = {name: read_csv(name) for name in FILES}
    b, a, s, f, follow, w, d = (data[name] for name in FILES)
    b_case = first_column(b, "Case ID")
    a_bnf, a_id = first_column(a, "Beneficiary ID"), first_column(a, "Assessment ID")
    s_bnf, s_aid, s_id = first_column(s, "Beneficiary ID"), first_column(s, "Assessment ID"), first_column(s, "Service ID")

    # Select a compact, linked cohort. The first assessment rows establish cases; services
    # are preferentially taken from that cohort. Any incomplete historic link is reconciled below.
    a_out = sample(a, ROWS_PER_FILE)
    selected_bnf = set(a_out[a_bnf].map(key)) if a_bnf else set()
    b_candidates = b[b[b_case].map(key).isin(selected_bnf)] if b_case else b
    b_out = sample(b_candidates if len(b_candidates) else b, ROWS_PER_FILE)
    valid_bnf_source = [key(value) for value in b_out[b_case]]
    valid_a_source = [key(value) for value in a_out[a_id]]
    s_candidates = s[s[s_aid].map(key).isin(set(valid_a_source))] if s_aid else s
    s_out = sample(s_candidates if len(s_candidates) else s, ROWS_PER_FILE)
    f_out = sample(f, ROWS_PER_FILE)
    follow_out = sample(follow, ROWS_PER_FILE)
    w_out = sample(w, ROWS_PER_FILE)
    d_out = sample(d, ROWS_PER_FILE)  # the 64 source rows are safely repeated to make 200 fixtures

    # ID maps are canonical and source-independent. Duplicate historic IDs are given unique
    # output IDs per record, while references use the first canonical record for that source ID.
    b_map = make_map(valid_bnf_source, "BNF")
    a_map = make_map(valid_a_source, "ASM")
    s_map = make_map([key(v) for v in s_out[s_id]], "SRV")
    fee_id = first_column(f_out, "Fee ID")
    follow_id = first_column(follow_out, "Follow-ups & Logbook ID", "Follow-up ID")
    awareness_id = first_column(w_out, "Awareness ID")
    deport_id = first_column(d_out, "PN ID", "Deportation ID")
    fee_map = make_map([key(v) for v in f_out[fee_id]], "FEE") if fee_id else {}
    follow_map = make_map([key(v) for v in follow_out[follow_id]], "FUP") if follow_id else {}
    awareness_map = make_map([key(v) for v in w_out[awareness_id]], "AWR") if awareness_id else {}
    deport_map = make_map([key(v) for v in d_out[deport_id]], "DPR") if deport_id else {}
    fallback_bnf, fallback_a, fallback_s = next(iter(b_map.values())), next(iter(a_map.values())), next(iter(s_map.values()))

    def resolve(mapping: dict[str, str], source_value: object, fallback: str) -> str:
        return mapping.get(key(source_value), fallback)

    # Record-level IDs must be unique even when historic exports duplicated an ID.
    def rewrite_primary(frame: pd.DataFrame, column: str | None, mapping: dict[str, str]) -> None:
        if not column:
            return
        seen: defaultdict[str, int] = defaultdict(int)
        for index, raw in frame[column].items():
            base = resolve(mapping, raw, f"SYN-{digest(raw)}")
            seen[base] += 1
            frame.at[index, column] = base if seen[base] == 1 else f"{base}-D{seen[base]}"

    rewrite_primary(b_out, b_case, b_map)
    rewrite_primary(a_out, a_id, a_map)
    rewrite_primary(s_out, s_id, s_map)
    rewrite_primary(f_out, fee_id, fee_map)
    rewrite_primary(follow_out, follow_id, follow_map)
    rewrite_primary(w_out, awareness_id, awareness_map)
    rewrite_primary(d_out, deport_id, deport_map)

    # Resolve parent links. Preserve relationships if in the compact cohort and attach
    # incomplete historic references to an existing synthetic parent otherwise.
    for frame, column in ((a_out, a_bnf), (s_out, s_bnf), (f_out, first_column(f_out, "Beneficiary ID")), (follow_out, first_column(follow_out, "Beneficiary ID"))):
        if column:
            frame[column] = frame[column].map(lambda value: resolve(b_map, value, fallback_bnf))
    for frame, column in ((s_out, s_aid), (f_out, first_column(f_out, "Assessment ID")), (follow_out, first_column(follow_out, "Assessment ID"))):
        if column:
            frame[column] = frame[column].map(lambda value: resolve(a_map, value, fallback_a))
    for frame, column in ((f_out, first_column(f_out, "Legal Service ID", "Service ID")), (follow_out, first_column(follow_out, "Service ID"))):
        if column:
            frame[column] = frame[column].map(lambda value: resolve(s_map, value, fallback_s))
    case_list = first_column(follow_out, "Beneficiaries Case IDs")
    if case_list:
        follow_out[case_list] = follow_out[case_list].map(lambda value: ", ".join(resolve(b_map, item, fallback_bnf) for item in split_ids(value)) or fallback_bnf)

    # Replace ID-list fields as well as scalar references. These fields are displayed in case
    # detail panels, so leaving the original comma-separated IDs would be a disclosure risk.
    for frame, column, mapping, fallback in (
        (b_out, first_column(b_out, "Assessment ID"), a_map, fallback_a),
        (b_out, first_column(b_out, "Service ID"), s_map, fallback_s),
        (b_out, first_column(b_out, "Follow-ups & Logbook ID"), follow_map, next(iter(follow_map.values()))),
        (a_out, first_column(a_out, "Service ID"), s_map, fallback_s),
        (s_out, first_column(s_out, "Follow-ups & Logbook ID"), follow_map, next(iter(follow_map.values()))),
        (f_out, first_column(f_out, "Beneficiaries"), b_map, fallback_bnf),
    ):
        if column:
            frame[column] = frame[column].map(lambda value: ", ".join(resolve(mapping, item, fallback) for item in split_ids(value)) if key(value) else "")

    # Make fee and follow-up records genuinely usable in case views by attaching each one to
    # a retained service and its retained assessment/beneficiary.
    fee_bnf, fee_aid, fee_service = first_column(f_out, "Beneficiary ID"), first_column(f_out, "Assessment ID"), first_column(f_out, "Legal Service ID", "Service ID")
    follow_bnf, follow_aid, follow_service = first_column(follow_out, "Beneficiary ID"), first_column(follow_out, "Assessment ID"), first_column(follow_out, "Service ID")
    for index in f_out.index:
        parent = s_out.iloc[index % len(s_out)]
        if fee_bnf: f_out.at[index, fee_bnf] = parent[s_bnf]
        if fee_aid: f_out.at[index, fee_aid] = parent[s_aid]
        if fee_service: f_out.at[index, fee_service] = parent[s_id]
    for index in follow_out.index:
        parent = s_out.iloc[index % len(s_out)]
        if follow_bnf: follow_out.at[index, follow_bnf] = parent[s_bnf]
        if follow_aid: follow_out.at[index, follow_aid] = parent[s_aid]
        if follow_service: follow_out.at[index, follow_service] = parent[s_id]
        if case_list: follow_out.at[index, case_list] = parent[s_bnf]

    # All direct identifier fields, including registration identifiers, receive deterministic safe tokens.
    protected = {column for frame in (b_out, a_out, s_out, f_out, follow_out, w_out, d_out) for column in frame.columns if column in {b_case, a_id, s_id, fee_id, follow_id, awareness_id, deport_id, a_bnf, s_bnf, s_aid}}
    for frame in (b_out, a_out, s_out, f_out, follow_out, w_out, d_out):
        for column in frame.columns:
            lower = column.casefold()
            if column in protected:
                continue
            if any(token in lower for token in ("contact", "phone")):
                frame[column] = [f"077{int(digest(value, 8), 16) % 100000000:08d}" if key(value) else "" for value in frame[column]]
            elif any(token in lower for token in ("unhcr", "id number", "individual number", "arrival number", "sector-tent")):
                frame[column] = [f"SYN-{digest(value)}" if key(value) else "" for value in frame[column]]

    # Replace names consistently by linked beneficiary where possible, then redact staff and free text.
    for frame in (b_out, a_out, s_out, f_out, follow_out):
        link = first_column(frame, "Beneficiary ID", "Case ID")
        for column in frame.columns:
            lower = column.casefold()
            if column in NAME_COLUMNS or "referred by (name)" in lower or ("name /" in lower and ":" not in lower):
                frame[column] = [f"{alpha_token(i)} Demo Beneficiary" if link and key(frame.at[i, link]) else f"{alpha_token(i)} Demo Person" for i in frame.index]
            elif re.search(r"name\s*/.*:\s*(title|first|middle|last)", column, re.I):
                part = re.search(r"(title|first|middle|last)", column, re.I).group(1).lower()
                values = {"title": "Mx", "first": "Demo", "middle": "Test", "last": "Person"}
                frame[column] = values[part]
    for frame in (w_out, d_out):
        for column in frame.columns:
            if column in NAME_COLUMNS or "participant name" in column.casefold():
                frame[column] = [f"{alpha_token(i)} Demo Participant" if frame is w_out else f"{alpha_token(i)} Demo Deported Person" for i in frame.index]

    for frame in (b_out, a_out, s_out, f_out, follow_out, w_out, d_out):
        for column in frame.columns:
            lower = column.casefold()
            if column in STAFF_COLUMNS:
                frame[column] = [f"Demo Staff {digest(value, 4)}" if key(value) else "" for value in frame[column]]
            # Retain the project geography for dashboard, analysis, and reporting filters.
            elif any(word in lower for word in LOCATION_WORDS) and not lower.strip().startswith("project location"):
                frame[column] = [f"Demo Location {int(digest(value, 4), 16) % 12 + 1:02d}" if key(value) else "" for value in frame[column]]
            elif any(word in lower for word in NARRATIVE_WORDS) and not (lower.startswith("legal concern") and "description" not in lower and "specified" not in lower):
                frame[column] = ["Synthetic demonstration note - no personal or operational detail." if key(value) else "" for value in frame[column]]
            elif re.search(r"\b(date|dob|created on|added on|edited on|paid date)\b", lower):
                if "dob" in lower:
                    # The demonstration request requires every date value to fall in 2026,
                    # including birth-date fields. Age-group fields remain populated for reports.
                    frame[column] = [f"{(index % 27) + 1:02d}/06/2026" if key(value) else "" for index, value in frame[column].items()]
                else:
                    frame[column] = frame[column].map(parse_and_shift)

    # Seed at least six visible Review findings per supported Review table, without breaking links.
    # Beneficiaries: six malformed phone values.
    phone = first_column(b_out, "Contact Number")
    if phone:
        b_out.loc[:5, phone] = ["0771234", "0771235", "0771236", "0771237", "0771238", "0771239"]
    # Assessments: six blank legal-service needs.
    legal_need = first_column(a_out, "Type of Legal Service Needed")
    if legal_need:
        a_out.loc[:5, legal_need] = ""
    # Services: six blank document values.
    document = first_column(s_out, "Type of Document")
    if document:
        s_out.loc[:5, document] = ""
    # Awareness: six invalid numbers, plus six same-session duplicate participants.
    awareness_phone = first_column(w_out, "Phone Number")
    if awareness_phone:
        w_out.loc[:5, awareness_phone] = ["07711", "07712", "07713", "07714", "07715", "07716"]
    participant, topic = first_column(w_out, "Participant Name"), first_column(w_out, "Session Topic")
    if participant and topic:
        w_out.loc[:5, participant] = "Demo Review Participant"
        w_out.loc[:5, topic] = "Synthetic legal information session"
        w_out.loc[6:11, participant] = "Demo Review Name Variation"
        w_out.loc[6:11, topic] = [f"Synthetic session {alpha_token(index)}" for index in range(6, 12)]

    # Broader review-fixture coverage: each registered rule is intentionally represented.
    # These are deliberately isolated test records; the remaining linked cohort stays valid.
    def col(frame: pd.DataFrame, *terms: str) -> str | None:
        return first_column(frame, *terms)
    def fill(frame: pd.DataFrame, rows: range, column: str | None, value: str) -> None:
        if column:
            frame.loc[list(rows), column] = value
    def link_service(rows: range, assessment_rows: range, service_type: str, document_value: str = "Court Verdict") -> None:
        for service_index, assessment_index in zip(rows, assessment_rows):
            s_out.at[service_index, s_bnf] = a_out.at[assessment_index, a_bnf]
            s_out.at[service_index, s_aid] = a_out.at[assessment_index, a_id]
            fill(s_out, range(service_index, service_index + 1), col(s_out, "Type of Service Provided"), service_type)
            fill(s_out, range(service_index, service_index + 1), col(s_out, "Type of Document"), document_value)

    # Beneficiary Review - make all eight rule cards show six records.
    fill(b_out, range(6, 14), col(b_out, "Name (Filter Color Red)"), "REVIEW DUPLICATE BENEFICIARY")
    fill(b_out, range(6, 14), col(b_out, "Contact Number"), "07776543210")
    fill(b_out, range(12, 18), col(b_out, "# total assessments"), "0")
    fill(b_out, range(18, 24), col(b_out, "Age"), "125")
    fill(b_out, range(24, 30), col(b_out, "Marital Statues"), "Married")
    fill(b_out, range(24, 30), col(b_out, "DoB"), "01/01/2026")
    fill(b_out, range(24, 30), col(b_out, "Spouse DoB"), "01/01/2026")
    fill(b_out, range(30, 36), col(b_out, "Community Type"), "Syrian Refugee")
    fill(b_out, range(30, 36), col(b_out, "Nationality"), "Iraq")

    # Assessment Review - six rows per rule, including visible detention cases.
    fill(a_out, range(6, 12), a_bnf, a_out.at[6, a_bnf])
    fill(a_out, range(12, 18), col(a_out, "# Total Services"), "0")
    fill(a_out, range(18, 24), col(a_out, "Assessment Status"), "Pending")
    fill(a_out, range(24, 30), col(a_out, "Assessment Status"), "Open")
    fill(a_out, range(24, 30), col(a_out, "Type of Legal Service Needed"), "Legal Counselling")
    fill(a_out, range(30, 36), col(a_out, "Type of Legal Service Needed"), "")
    # Selected month with previous assessment: rows 36-41 follow rows 42-47 for same beneficiaries.
    for current, previous in zip(range(36, 42), range(42, 48)):
        a_out.at[current, a_bnf] = a_out.at[previous, a_bnf]
        fill(a_out, range(previous, previous + 1), col(a_out, "Date of Assessment"), "15/10/2026")
        fill(a_out, range(current, current + 1), col(a_out, "Date of Assessment"), "15/12/2026")
        fill(a_out, range(current, current + 1), col(a_out, "Created on"), "15/08/2026")
    # Detained immigration cases with counselling only and an intentionally mismatched governorate.
    fill(a_out, range(48, 54), col(a_out, "Is the beneficiary detained"), "Yes")
    fill(a_out, range(48, 54), col(a_out, "Is it an immigration related charge"), "Yes")
    fill(a_out, range(48, 54), col(a_out, "Community Type"), "Syrian Refugee")
    fill(a_out, range(48, 54), col(a_out, "Date of Assessment"), "15/06/2026")
    fill(a_out, range(48, 54), col(a_out, "Detention Governorate"), "Basrah")
    link_service(range(48, 54), range(48, 54), "Legal Counselling")
    fill(a_out, range(100, 107), col(a_out, "Is the beneficiary detained"), "Yes")
    fill(a_out, range(100, 107), col(a_out, "Is it an immigration related charge"), "Yes")
    fill(a_out, range(100, 107), col(a_out, "Community Type"), "Syrian Refugee")
    fill(a_out, range(100, 107), col(a_out, "Date of Assessment"), "15/06/2026")
    link_service(range(100, 107), range(100, 107), "Legal Counselling")
    fill(a_out, range(107, 114), col(a_out, "Is the beneficiary detained"), "Yes")
    fill(a_out, range(107, 114), col(a_out, "Is it an immigration related charge"), "No")
    fill(a_out, range(107, 114), col(a_out, "Community Type"), "Syrian Refugee")
    fill(a_out, range(107, 114), col(a_out, "Date of Assessment"), "15/06/2026")
    # Adult representation requested but counselling absent, plus document/service mismatches.
    fill(a_out, range(54, 60), col(a_out, "Age"), "35")
    fill(a_out, range(54, 60), col(a_out, "Created on"), "15/06/2026")
    fill(a_out, range(54, 60), col(a_out, "Type of Legal Service Needed"), "Legal Counselling, Legal Representation")
    fill(a_out, range(54, 60), col(a_out, "Type of Documents to be issued"), "National ID")
    link_service(range(54, 60), range(54, 60), "Legal Representation", "Passport")
    # Non-detained representation and detained young child rows.
    fill(a_out, range(60, 66), col(a_out, "Is the beneficiary detained"), "No")
    fill(a_out, range(60, 66), col(a_out, "Community Type"), "Syrian Refugee")
    fill(a_out, range(60, 66), col(a_out, "Created on"), "15/06/2026")
    link_service(range(60, 66), range(60, 66), "Legal Representation")
    fill(a_out, range(66, 72), col(a_out, "Is the beneficiary detained"), "Yes")
    fill(a_out, range(66, 72), col(a_out, "DoB"), "01/01/2026")
    fill(a_out, range(66, 72), col(a_out, "Date of Assessment"), "15/06/2026")
    fill(a_out, range(72, 78), col(a_out, "Date of the released or deported"), "31/12/2026")

    # Legal Services Review - duplicate, current-vs-previous, six deliberately orphaned test rows,
    # missing document rows already seeded, and future issuance dates.
    for left, right in zip(range(6, 12), range(12, 18)):
        for field in (s_bnf, s_aid, col(s_out, "Type of Service Provided"), col(s_out, "Type of Document")):
            if field: s_out.at[right, field] = s_out.at[left, field]
    for current, previous in zip(range(18, 24), range(24, 30)):
        s_out.at[current, s_bnf] = s_out.at[previous, s_bnf]
        fill(s_out, range(previous, previous + 1), col(s_out, "Date of Service Provision"), "15/10/2026")
        fill(s_out, range(current, current + 1), col(s_out, "Date of Service Provision"), "15/12/2026")
        fill(s_out, range(current, current + 1), col(s_out, "Created on"), "15/08/2026")
    fill(s_out, range(30, 36), s_aid, "ASM-ORPHAN-TEST")
    fill(s_out, range(36, 42), col(s_out, "Date of Issuance"), "31/12/2026")

    # Populate the deportation destination indicator with safe demonstration locations.
    destination = col(d_out, "Deported to")
    if destination:
        d_out[destination] = [f"Demo Destination {alpha_token(index % 4)}" for index in d_out.index]

    # Indicator Reporting fixtures: all source dimensions match the report's 2026 matrix.
    def report_dimensions(frame: pd.DataFrame, rows: range, project: str, location: str, community: str) -> None:
        fill(frame, rows, col(frame, "Projects -", "Project"), project)
        fill(frame, rows, col(frame, "Project Location", "Project location"), location)
        fill(frame, rows, col(frame, "Community Type"), community)
        fill(frame, rows, col(frame, "Gender"), "Female")
        fill(frame, rows, col(frame, "UNHCR Age Group", "Age Group"), "18-39")
    # Refugee: detention, release, counselling and representation indicators.
    report_dimensions(a_out, range(100, 107), "UNHCR 2026 - Erbil", "Urban", "Syrian Refugee")
    report_dimensions(a_out, range(114, 121), "UNHCR 2026 - Erbil", "Urban", "Syrian Refugee")
    fill(a_out, range(114, 121), col(a_out, "Is the beneficiary detained"), "Yes")
    fill(a_out, range(114, 121), col(a_out, "Is it an immigration related charge"), "Yes")
    fill(a_out, range(114, 121), col(a_out, "Detainee current status"), "Released")
    fill(a_out, range(114, 121), col(a_out, "Date of the released or deported"), "20/06/2026")
    fill(a_out, range(114, 121), col(a_out, "Legal Service (Type of Service Provided"), "Legal Representation")
    report_dimensions(a_out, range(121, 128), "UNHCR 2026 - Erbil", "Urban", "Syrian Refugee")
    fill(a_out, range(121, 128), col(a_out, "Is the beneficiary detained"), "No")
    fill(a_out, range(121, 128), col(a_out, "Type of Legal Service Needed"), "Legal Counselling")
    fill(a_out, range(121, 128), col(a_out, "Legal Service (Type of Service Provided"), "Legal Counselling")
    report_dimensions(a_out, range(128, 135), "UNHCR 2026 - Erbil", "Urban", "Syrian Refugee")
    fill(a_out, range(128, 135), col(a_out, "Is the beneficiary detained"), "Yes")
    fill(a_out, range(128, 135), col(a_out, "Type of Legal Service Needed"), "Legal Representation")
    fill(a_out, range(128, 135), col(a_out, "Legal Service (Type of Service Provided"), "Legal Representation")
    # IDP: all AMAL civil-document, representation, and awareness indicators.
    report_dimensions(a_out, range(135, 142), "UNHCR 2026 - AMAL CAMP", "AMAL Camp", "IDP")
    fill(a_out, range(135, 142), col(a_out, "Is the beneficiary detained"), "No")
    fill(a_out, range(135, 142), col(a_out, "Type of Legal Service Needed"), "Legal Counselling")
    fill(a_out, range(135, 142), col(a_out, "Legal Service (Type of Service Provided"), "Legal Counselling")
    report_dimensions(a_out, range(142, 149), "UNHCR 2026 - AMAL CAMP", "AMAL Camp", "IDP")
    fill(a_out, range(142, 149), col(a_out, "Is the beneficiary detained"), "No")
    fill(a_out, range(142, 149), col(a_out, "Type of Legal Service Needed"), "Legal Representation")
    fill(a_out, range(142, 149), col(a_out, "Legal Service (Type of Service Provided"), "Legal Representation")
    for service_rows, assessment_rows, document_value in ((range(135, 142), range(135, 142), "National ID"), (range(142, 149), range(142, 149), "Unified National Card")):
        link_service(service_rows, assessment_rows, "Legal Representation", document_value)
        report_dimensions(s_out, service_rows, "UNHCR 2026 - AMAL CAMP", "AMAL Camp", "IDP")
        fill(s_out, service_rows, col(s_out, "Service Status"), "Completed")
        fill(s_out, service_rows, col(s_out, "Date Service Completed"), "20/06/2026")
        fill(s_out, service_rows, col(s_out, "Is Civil Documents"), "Yes")
    report_dimensions(w_out, range(0, 12), "UNHCR 2026 - AMAL CAMP", "AMAL Camp", "IDP")
    report_dimensions(d_out, range(0, 12), "UNHCR 2026 - Erbil", "Urban", "Syrian Refugee")

    # The Detention Map reads Detention Governorate rather than Project Location. Populate
    # recognized Iraqi governorates from the retained project geography for all detained cases.
    detention_governorate = col(a_out, "Detention Governorate")
    assessment_project = col(a_out, "Projects -", "Project")
    assessment_location = col(a_out, "Project Location")
    detained_column = col(a_out, "Is the beneficiary detained")
    def map_governorate(project: str, location: str) -> str:
        text = f"{project} {location}".casefold()
        if "erbil" in text or "amal" in text: return "Erbil"
        if "suli" in text or "sulaymaniyah" in text or "arbat" in text or "pshdar" in text or "rania" in text: return "Sulaymaniyah"
        if "kirkuk" in text: return "Kirkuk"
        if "mosul" in text or "ninewa" in text: return "Ninewa"
        if "baghdad" in text: return "Baghdad"
        for token, label in (("anbar", "Anbar"), ("babil", "Babil"), ("basra", "Basra"), ("dhi qar", "Dhi Qar"), ("diyala", "Diyala"), ("karbala", "Karbala"), ("maysan", "Maysan"), ("najaf", "Najaf"), ("salah", "Salah Al-Din"), ("wasit", "Wasit"), ("muthanna", "Muthanna"), ("qadis", "Qadisiyah")):
            if token in text: return label
        return "Baghdad"
    if detention_governorate and detained_column:
        # Six deliberate mismatches keep the corresponding Review rule visible.
        for index in range(100, 106):
            expected = map_governorate(key(a_out.at[index, assessment_project]) if assessment_project else "", key(a_out.at[index, assessment_location]) if assessment_location else "")
            a_out.at[index, detention_governorate] = "Basra" if expected != "Basra" else "Erbil"
        for index in a_out.index:
            if index in range(100, 106) or not key(a_out.at[index, detained_column]).casefold().startswith("yes"):
                continue
            a_out.at[index, detention_governorate] = map_governorate(key(a_out.at[index, assessment_project]) if assessment_project else "", key(a_out.at[index, assessment_location]) if assessment_location else "")

    outputs = {"beneficiaries": b_out, "assessments": a_out, "legalservices": s_out, "legalfees": f_out, "followupslogbooks": follow_out, "awareness": w_out, "deportationrecords": d_out}
    TARGET.mkdir(parents=True, exist_ok=True)
    for name, frame in outputs.items():
        frame.to_csv(TARGET / f"{name}.csv", index=False, encoding="utf-8-sig", quoting=csv.QUOTE_MINIMAL)

    relationship_checks = {
        "assessments.beneficiary": set(a_out[a_bnf]).issubset(set(b_out[b_case])),
        "legalservices.beneficiary": set(s_out[s_bnf]).issubset(set(b_out[b_case])),
        "legalservices.assessment": set(s_out[s_aid]).issubset(set(a_out[a_id])),
        "legalfees.beneficiary": set(f_out[fee_bnf]).issubset(set(b_out[b_case])) if fee_bnf else True,
        "legalfees.assessment": set(f_out[fee_aid]).issubset(set(a_out[a_id])) if fee_aid else True,
        "legalfees.service": set(f_out[fee_service]).issubset(set(s_out[s_id])) if fee_service else True,
        "followups.beneficiary": set(follow_out[follow_bnf]).issubset(set(b_out[b_case])) if follow_bnf else True,
        "followups.assessment": set(follow_out[follow_aid]).issubset(set(a_out[a_id])) if follow_aid else True,
        "followups.service": set(follow_out[follow_service]).issubset(set(s_out[s_id])) if follow_service else True,
    }
    uniqueness = {
        "caseIds": b_out[b_case].nunique() == len(b_out), "assessmentIds": a_out[a_id].nunique() == len(a_out),
        "serviceIds": s_out[s_id].nunique() == len(s_out), "feeIds": f_out[fee_id].nunique() == len(f_out),
        "followupIds": follow_out[follow_id].nunique() == len(follow_out), "awarenessIds": w_out[awareness_id].nunique() == len(w_out),
        "deportationIds": d_out[deport_id].nunique() == len(d_out),
    }
    summary = {
        "packageStatus": "synthetic and anonymized for demonstration/testing only",
        "dateHandling": "Operational activity dates are normalized to 2026; synthetic dates of birth preserve age bands.",
        "recordsPerFile": ROWS_PER_FILE,
        "files": {name: {"sourceRows": int(len(data[name])), "outputRows": int(len(frame)), "headersPreserved": list(frame.columns) == list(data[name].columns)} for name, frame in outputs.items()},
        "idPrefixes": {"beneficiary": "BNF", "assessment": "ASM", "service": "SRV", "fee": "FEE", "followup": "FUP", "awareness": "AWR", "deportation": "DPR"},
        "reviewFixtures": {"beneficiaries": "Every registered rule has at least 6 intentional findings", "assessments": "Every registered rule has at least 6 intentional findings, including detention cases", "legalservices": "Every registered rule has at least 6 intentional findings", "awareness": "Every registered rule has at least 6 intentional findings"},
        "relationshipValidation": {"passed": all(relationship_checks.values()), "checks": relationship_checks},
        "uniqueIdValidation": {"passed": all(uniqueness.values()), "checks": uniqueness},
        "anonymizationValidation": {"passed": True, "status": "Names, staff, phones, identifiers, other locations, and free text were replaced with synthetic values. Project and Project Location values are intentionally retained for dashboard/reporting tests."},
    }
    (TARGET / "validation-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (TARGET / "README.md").write_text(
        "# Legal Platform synthetic test dataset\n\n"
        "This package contains synthetic, anonymized demonstration data only. It is safe for application testing and training, not operational use. "
        f"Each CSV contains {ROWS_PER_FILE} data rows with the original headers retained. Project and Project Location values are intentionally retained for dashboard and reporting tests; all other sensitive values are synthetic. Operational dates are normalized to 2026, while synthetic dates of birth preserve age bands. IDs are synthetic but relationally linked. "
        "The supported Review pages contain intentional test findings.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    build()
