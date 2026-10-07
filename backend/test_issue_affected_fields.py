from .issue_affected_fields import affected_fields, RULE_FIELDS
from .legal_platform import REGISTERED_RULES


def test_all_registered_rules_have_field_mappings():
    for dataset, rules in REGISTERED_RULES.items():
        for rule in rules:
            assert affected_fields(dataset, rule)
            if dataset != "legalhotlines":
                assert rule in RULE_FIELDS


def test_dataset_specific_and_detail_specific_fields():
    assert affected_fields("legalhotlines", "Detained-person name matches caller") == [
        "Name of the detained person", "Name of the caller"
    ]
    assert affected_fields("beneficiaries", "Invalid age", "Spouse DoB is not a valid date") == ["Spouse DoB"]
    assert affected_fields("legalservices", "Legal service date after today", "Date of Issuance: 01/01/2030") == ["Date of Issuance"]
    assert affected_fields("assessments", "Open assessment with all services closed (Closure requested by lawyer)") == affected_fields("assessments", "Open assessment with all services closed")
    assert affected_fields("legalservices", "Duplicate service") == [
        "Beneficiary ID", "Assessment ID", "Type of Service Provided", "Type of Document"
    ]


def test_unknown_rules_fall_back_without_mutating_mappings():
    assert affected_fields("beneficiaries", "Future rule") == ["Future rule"]
    fields = affected_fields("beneficiaries", "Invalid contact number")
    fields.append("Changed")
    assert affected_fields("beneficiaries", "Invalid contact number") == ["Contact Number"]
