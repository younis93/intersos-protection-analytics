from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class DuplicateExclusionRegistry:
    """A small, user-local register kept independent of imported CSV data."""

    def __init__(self, path: Path | None = None) -> None:
        local_app_data = Path(os.getenv("LOCALAPPDATA", str(Path.home())))
        self.path = path or local_app_data / "INTERSOS Legal Platform" / "duplicate-name-exclusions.json"
        self.legacy_path = None if path else local_app_data / "INTERSOS Protection Analytics" / "duplicate-name-exclusions.json"

    def entries(self) -> list[dict[str, Any]]:
        try:
            source = self.path if self.path.exists() or not self.legacy_path else self.legacy_path
            value = json.loads(source.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return []
        if not isinstance(value, list):
            return []
        rows = []
        for row in value:
            if not isinstance(row, dict) or not str(row.get("identifierValue", row.get("caseId", ""))).strip():
                continue
            normalized = dict(row)
            # Records created before rule-specific exclusions were duplicate-only.
            normalized["rule"] = str(normalized.get("rule", "")).strip() or "Possible duplicate name"
            normalized.setdefault("identifierValue", str(normalized.get("caseId", "")).strip())
            normalized.setdefault("identifierType", "caseId")
            normalized.setdefault("dataset", "beneficiaries")
            rows.append(normalized)
        return sorted(rows, key=lambda row: str(row.get("excludedAt", "")), reverse=True)

    def case_ids(self) -> set[str]:
        return {str(row.get("identifierValue", row.get("caseId", ""))).strip() for row in self.entries() if row.get("rule") == "Possible duplicate name"}

    def keys(self) -> set[tuple[str, str]]:
        """Compatibility projection used by older beneficiary-only callers."""
        return {(str(row["rule"]).strip(), str(row.get("identifierValue", row.get("caseId", ""))).strip()) for row in self.entries()}

    def exclusion_rows(self) -> list[dict[str, Any]]:
        rows=[]
        for row in self.entries():
            item=dict(row)
            item.setdefault("dataset", "beneficiaries")
            item.setdefault("identifierType", "caseId")
            item.setdefault("identifierValue", str(item.get("caseId", "")).strip())
            rows.append(item)
        return rows

    def exclude(self, case_id: str, rule: str, name: str = "", project: str = "", source: str = "") -> dict[str, Any]:
        case_id = str(case_id).strip()
        rule = str(rule).strip()
        if not case_id or not rule:
            raise ValueError("Case ID and finding rule are required.")
        rows = [row for row in self.entries() if (str(row.get("caseId", "")).strip(), str(row.get("rule", "")).strip()) != (case_id, rule)]
        record = {
            "caseId": case_id,
            "rule": rule,
            "name": str(name).strip(),
            "project": str(project).strip(),
            "excludedAt": datetime.now(timezone.utc).isoformat(),
            "source": str(source).strip() or "Beneficiaries Review",
        }
        rows.append(record)
        self._write(rows)
        return record

    def exclude_record(self, dataset: str, rule: str, identifier_type: str, identifier_value: str, name: str = "", project: str = "", source: str = "") -> tuple[dict[str, Any], bool]:
        dataset, rule, identifier_type = (str(value).strip() for value in (dataset, rule, identifier_type))
        identifier_value = str(identifier_value).strip()
        if not all((dataset, rule, identifier_type, identifier_value)):
            raise ValueError("Dataset, finding rule, identifier type, and identifier value are required.")
        if identifier_type == "awarenessName":
            identifier_value = " ".join(identifier_value.casefold().split())
        rows=self.exclusion_rows()
        key=(dataset, rule, identifier_type, identifier_value)
        if any((str(row.get("dataset")), str(row.get("rule")), str(row.get("identifierType")), str(row.get("identifierValue"))) == key for row in rows):
            return next(row for row in rows if (str(row.get("dataset")), str(row.get("rule")), str(row.get("identifierType")), str(row.get("identifierValue"))) == key), False
        record={"dataset":dataset,"rule":rule,"identifierType":identifier_type,"identifierValue":identifier_value,"caseId":identifier_value if identifier_type=="caseId" else "","name":str(name).strip(),"project":str(project).strip(),"excludedAt":datetime.now(timezone.utc).isoformat(),"source":str(source).strip() or "Imported exclusion"}
        rows.append(record); self._write(rows)
        return record, True

    def exclude_records(self, records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int, int]:
        """Add a group of exclusions with one durable write.

        Existing records are deliberately treated as successful no-ops so a
        repeated bulk request cannot create duplicate exclusion entries.
        """
        rows = self.exclusion_rows()
        keys = {
            (str(row.get("dataset", "")).strip(), str(row.get("rule", "")).strip(), str(row.get("identifierType", "")).strip(), str(row.get("identifierValue", "")).strip())
            for row in rows
        }
        created: list[dict[str, Any]] = []
        duplicates = 0
        for item in records:
            dataset = str(item.get("dataset", "")).strip()
            rule = str(item.get("rule", "")).strip()
            identifier_type = str(item.get("identifierType", "")).strip()
            identifier_value = str(item.get("identifierValue", item.get("caseId", ""))).strip()
            if not all((dataset, rule, identifier_type, identifier_value)):
                raise ValueError("Dataset, finding rule, identifier type, and identifier value are required.")
            if identifier_type == "awarenessName":
                identifier_value = " ".join(identifier_value.casefold().split())
            key = (dataset, rule, identifier_type, identifier_value)
            if key in keys:
                duplicates += 1
                continue
            record = {
                "dataset": dataset,
                "rule": rule,
                "identifierType": identifier_type,
                "identifierValue": identifier_value,
                "caseId": identifier_value if identifier_type == "caseId" else "",
                "name": str(item.get("name", "")).strip(),
                "project": str(item.get("project", "")).strip(),
                "excludedAt": datetime.now(timezone.utc).isoformat(),
                "source": str(item.get("source", "")).strip() or "Imported exclusion",
            }
            rows.append(record)
            created.append(record)
            keys.add(key)
        if created:
            self._write(rows)
        return created, len(created), duplicates

    def restore(self, case_id: str, rule: str, dataset: str = "", identifier_type: str = "") -> bool:
        case_id = str(case_id).strip()
        rule = str(rule).strip()
        rows = self.entries()
        retained = [row for row in rows if not ((str(row.get("identifierValue", row.get("caseId", ""))).strip() == case_id) and str(row.get("rule", "")).strip() == rule and (not dataset or str(row.get("dataset", "beneficiaries")) == dataset) and (not identifier_type or str(row.get("identifierType", "caseId")) == identifier_type))]
        if len(retained) == len(rows):
            return False
        self._write(retained)
        return True

    def _write(self, rows: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)
