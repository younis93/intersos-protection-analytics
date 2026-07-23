import io
import unittest
import zipfile
from pathlib import Path

import pandas as pd
import polars as pl

from backend.analytics import COLS, SHEETS, DataStore, _text, validate_xlsx_archive

WORKBOOK = Path(__file__).resolve().parents[1] / "# Legal platform Analysis - share.xlsx"


@unittest.skipUnless(WORKBOOK.exists(), "Private analytics workbook is not available in CI")
class WorkbookAnalyticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = DataStore.from_path(WORKBOOK)

    def test_source_reconciliation(self):
        expected = {"assessment": 11372, "services": 19211, "deportation": 64}
        self.assertEqual({p: f.height for p, f in self.store.frames.items()}, expected)
        for page, total in expected.items():
            result = self.store.dashboard(page, {}, "records", default_ytd=False)
            self.assertEqual(result["total"], total)

    def test_unique_beneficiary_mode_is_distinct(self):
        records = self.store.dashboard("services", {}, "records")
        beneficiaries = self.store.dashboard("services", {}, "beneficiaries")
        self.assertLess(beneficiaries["total"], records["total"])

    def test_multichoice_filter_does_not_inflate_grain(self):
        option = self.store.metadata()["pages"]["assessment"]["filters"]["legal_need"][0]
        result = self.store.dashboard("assessment", {"legal_need": [option]}, "records", default_ytd=False)
        self.assertLessEqual(result["total"], 11372)
        for chart in result["charts"]:
            for row in chart["rows"]:
                self.assertGreaterEqual(row["percent"], 0)

    def test_project_filter_recalculates_denominator(self):
        result = self.store.dashboard("services", {"project": ["UNHCR 2026 - Baghdad"]}, "beneficiaries")
        self.assertEqual(result["kpis"][5]["value"] if isinstance(result["kpis"][5], tuple) else result["kpis"][5]["label"], "Projects")
        self.assertEqual(result["kpis"][5]["value"], 1)

    def test_studio_two_dimension_pivot_preserves_distinct_grain(self):
        result = self.store.studio("assessment", "project", "status", {}, "records")
        self.assertEqual(result["total"], 5109)
        self.assertGreater(len(result["cells"]), 0)
        self.assertTrue(all(cell["count"] <= result["total"] for cell in result["cells"]))


class AnalyticsSecurityTests(unittest.TestCase):
    def test_synthetic_workbook_exercises_all_required_sheets(self):
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            for page, sheet in SHEETS.items():
                row = {}
                for key, source_column in COLS[page].items():
                    if key in {"date", "completed_date"}:
                        row[source_column] = "2026-01-15"
                    elif key == "status":
                        row[source_column] = "Completed" if page == "services" else "Open"
                    elif key == "assessment_id":
                        row[source_column] = "assessment-1"
                    elif key == "beneficiary":
                        row[source_column] = "beneficiary-1"
                    else:
                        row[source_column] = f"{key}-1"
                pd.DataFrame([row]).to_excel(writer, sheet_name=sheet, index=False)

        store = DataStore.from_bytes(output.getvalue(), "synthetic.xlsx")
        self.assertEqual(
            {page: frame.height for page, frame in store.frames.items()},
            {"assessment": 1, "services": 1, "deportation": 1},
        )

    def test_rejects_extreme_xlsx_compression_ratio(self):
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("xl/worksheets/sheet1.xml", b"0" * 1_000_000)
        with self.assertRaisesRegex(ValueError, "unsafe compression ratio"):
            validate_xlsx_archive(output.getvalue())

    def test_bilingual_answers_keep_each_english_choice(self):
        self.assertEqual(
            _text("Legal Assistance - مساعدة,Legal Counselling - استشارة"),
            "Legal Assistance,Legal Counselling",
        )
        self.assertEqual(_text("Female أنثى"), "Female")
        self.assertIsNone(_text("العربية فقط"))

    def test_csv_export_escapes_spreadsheet_formula_prefixes(self):
        store = DataStore(
            "test.xlsx",
            {"assessment": pl.DataFrame({"id": ["A1"], "beneficiary": ["B1"], "project": ["=SUM(1,1)"]})},
            {"assessment": {}},
            [],
            "",
        )
        csv = store.export_csv("assessment", {}, default_ytd=False).decode("utf-8-sig")
        self.assertIn("'=SUM(1,1)", csv)


if __name__ == "__main__":
    unittest.main()
