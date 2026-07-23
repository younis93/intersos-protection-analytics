import unittest
from pathlib import Path

import polars as pl

from backend.analytics import DataStore, _text

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
