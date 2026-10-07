"""Stable English source-field labels for compact finding messages."""
from .hotline_review import FIELDS as HOTLINE_FIELDS, REQUIRED as HOTLINE_REQUIRED

RULE_FIELDS = {
    "Possible duplicate name": ["Name (Filter Color Red)"],
    "Possible duplicate contact and name": ["Name (Filter Color Red)", "Contact Number"],
    "Invalid contact number": ["Contact Number"],
    "Case without assessment": ["# total assessments"],
    "Invalid age": ["Age", "Date of Birth"],
    "Marital status below 18": ["Marital Status", "Age", "Date of Birth"],
    "Spouse below 18": ["Spouse DoB"],
    "Check Community Type vs Nationality": ["Community Type", "Nationality", "Project"],
    "Beneficiary has multiple assessments": ["Case ID", "Assessment ID"],
    "Selected month with previous assessment": ["Date of Assessment", "Created On"],
    "Assessment without services": ["# Total Services"],
    "Pending assessment": ["Assessment Status"],
    "Open counselling-only assessment": ["Assessment Status", "Type of Legal Service Needed"],
    "Open assessment with all services closed": ["Assessment Status", "Request for Closed Status", "Service Status"],
    "Blank legal service need": ["Type of Legal Service Needed"],
    "Detained beneficiary has counselling only": ["Is the beneficiary detained", "Type of Legal Service Needed"],
    "Adult representation without counselling": ["Type of Legal Service Needed", "Type of Service Provided"],
    "Type of Legal Service in Assessment vs Services": ["Type of Legal Service Needed", "Type of Service Provided"],
    "Detention/immigration inconsistency": ["Is the beneficiary detained", "Is it an immigration related charge?"],
    "Representation while not detained": ["Community Type", "Is the beneficiary detained", "Type of Legal Service Needed"],
    "Type of document in Assessments vs Services": ["Type of documents to be issued", "Type of Document"],
    "Detained beneficiary below 10 years": ["Is the beneficiary detained", "Date of Birth"],
    "Detention Governorate mismatch": ["Detention Governorate", "Project", "Project Location"],
    "Assessment date after today": ["Date of Assessment", "Date of the released or deported", "Date of Detention", "Date of Assessment Closure", "Date of the Request"],
    "Duplicate service": ["Beneficiary ID", "Assessment ID", "Type of Service Provided", "Type of Document"],
    "Duplicate service without Assessment ID": ["Beneficiary ID", "Type of Service Provided", "Type of Document"],
    "Current and previous month duplicate": ["Date of Service Provision", "Type of Service Provided"],
    "Orphaned assessment relationship": ["Assessment ID"],
    "Missing Type of Document": ["Type of Document"],
    "Legal service date after today": ["Date of Service Provision", "Date Service Completed", "Date of Issuance"],
    "Duplicate participant in session": ["Participant Name", "Session Topic"],
    "Possible duplicate participant name": ["Participant Name"],
}


def affected_fields(dataset: str, rule: str, detail: str = "") -> list[str]:
    if dataset == "legalhotlines" and rule in HOTLINE_REQUIRED:
        return [HOTLINE_FIELDS[key][0] for key in HOTLINE_REQUIRED[rule]]
    base_rule = rule.split(" (Closure ", 1)[0]
    if base_rule == "Invalid age" and detail.startswith("Spouse DoB"):
        return ["Spouse DoB"]
    if base_rule in {"Assessment date after today", "Legal service date after today"}:
        # Future-date findings can refer to just one of several date columns.
        fields = [field for field in RULE_FIELDS[base_rule] if any(
            item.strip().startswith(field + ":") for item in detail.split(";")
        )]
        if fields:
            return fields
    return list(RULE_FIELDS.get(base_rule, [rule]))
