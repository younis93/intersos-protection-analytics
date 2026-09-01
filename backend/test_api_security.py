import asyncio
import io
import socket
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from openpyxl import load_workbook
from starlette.requests import Request
from starlette.responses import Response

from backend import main
from backend.duplicate_exclusions import DuplicateExclusionRegistry


class LocalApiSecurityTests(unittest.TestCase):
    @staticmethod
    def write_legal_source(folder: Path) -> list[Path]:
        files = {
            "beneficiaries.csv": "Case ID,Name (Filter Color Red)\nB1,Person One\n",
            "assessments.csv": "Assessment ID,Beneficiary ID\nA1,B1\n",
            "legalservices.csv": "Service ID,Assessment ID,Beneficiary ID\nS1,A1,B1\n",
        }
        paths=[]
        for name, content in files.items():
            path=folder / name;path.write_text(content,encoding="utf-8");paths.append(path)
        return paths

    def test_startup_restores_remembered_folder_source(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory);self.write_legal_source(folder)
            with patch.object(main,"REMEMBERED_LEGAL_SOURCE_CONFIGURED",True), patch.object(main,"REMEMBERED_LEGAL_SOURCE","folder"), patch.object(main,"REMEMBERED_LEGAL_FOLDER",folder):
                main.load_initial_legal_store()
            self.assertIsNotNone(main.legal_store)
            self.assertEqual(main.legal_store.source,folder.name)
            self.assertFalse(main.legal_store_loading)

    def test_startup_restores_remembered_individual_files(self):
        with tempfile.TemporaryDirectory() as directory:
            paths=self.write_legal_source(Path(directory))
            with patch.object(main,"REMEMBERED_LEGAL_SOURCE_CONFIGURED",True), patch.object(main,"REMEMBERED_LEGAL_SOURCE","files"), patch.object(main,"REMEMBERED_LEGAL_FILES",paths):
                main.load_initial_legal_store()
            self.assertIsNotNone(main.legal_store)
            self.assertEqual(main.legal_store.source,"Selected Legal Platform CSV files")
            self.assertFalse(main.legal_store_loading)

    def test_startup_clears_stale_source_when_remembered_files_are_unavailable(self):
        missing=Path("C:/missing/beneficiaries.csv")
        with patch.object(main,"REMEMBERED_LEGAL_SOURCE_CONFIGURED",True), patch.object(main,"REMEMBERED_LEGAL_SOURCE","files"), patch.object(main,"REMEMBERED_LEGAL_FILES",[missing]):
            main.legal_store=object()
            main.load_initial_legal_store()
        self.assertIsNone(main.legal_store)
        self.assertIn("unavailable",main.legal_store_restore_error)
        self.assertFalse(main.legal_store_loading)

    def test_local_session_cookie_is_required_when_desktop_token_is_set(self):
        async def next_response(_request):
            return Response(status_code=200)

        with patch.object(main, "LOCAL_SESSION_TOKEN", "test-session-token"):
            unauthenticated = Request({"type": "http", "method": "GET", "path": "/api/health", "headers": []})
            denied = asyncio.run(main.prevent_stale_api_state(unauthenticated, next_response))
            self.assertEqual(denied.status_code, 403)

            authenticated = Request({
                "type": "http",
                "method": "GET",
                "path": "/api/health",
                "headers": [(b"cookie", b"intersos_session=test-session-token")],
            })
            allowed = asyncio.run(main.prevent_stale_api_state(authenticated, next_response))
            self.assertEqual(allowed.status_code, 200)

    def test_attachment_urls_reject_private_and_local_addresses(self):
        private_addresses = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443)),
            (socket.AF_INET6, socket.SOCK_STREAM, 6, "", ("::1", 443, 0, 0)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 443)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.4", 443)),
        ]
        for address in private_addresses:
            with self.subTest(address=address[4][0]), patch.object(main.socket, "getaddrinfo", return_value=[address]):
                with self.assertRaisesRegex(ValueError, "local or private"):
                    main.validate_attachment_url("https://attachments.example/document.pdf")

    def test_attachment_urls_allow_public_addresses(self):
        public = (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
        with patch.object(main.socket, "getaddrinfo", return_value=[public]):
            self.assertEqual(
                main.validate_attachment_url("https://attachments.example/document.pdf"),
                "https://attachments.example/document.pdf",
            )

    def test_table_workbook_neutralizes_spreadsheet_formulas(self):
        response = main.table_workbook(main.TableWorkbookRequest(
            columns=["=Header"],
            rows=[{"=Header": "=1+1"}],
        ))
        sheet = load_workbook(io.BytesIO(response.body), data_only=False).active
        self.assertEqual(sheet["A1"].value, "'=Header")
        self.assertEqual(sheet["A2"].value, "'=1+1")
        self.assertNotEqual(sheet["A2"].data_type, "f")

    def test_bulk_duplicate_exclusions_are_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            registry=DuplicateExclusionRegistry(Path(directory)/"exclusions.json")
            request=main.BulkDuplicateExclusionRequest(records=[
                main.DuplicateExclusionRequest(dataset="assessments",rule="Missing document",identifierType="assessmentId",identifierValue="A1",name="Person"),
                main.DuplicateExclusionRequest(dataset="assessments",rule="Missing document",identifierType="assessmentId",identifierValue="A2",name="Person"),
            ])
            with patch.object(main,"duplicate_exclusions",registry), patch.object(main,"legal_store",None):
                first=main.create_duplicate_exclusions_bulk(request)
                repeated=main.create_duplicate_exclusions_bulk(request)
            self.assertEqual(first["created"],2)
            self.assertEqual(first["duplicates"],0)
            self.assertEqual(repeated["created"],0)
            self.assertEqual(repeated["duplicates"],2)
            self.assertEqual(repeated["count"],2)

    def test_limited_upload_reader_stops_before_unbounded_read(self):
        class FakeUpload:
            size = None

            def __init__(self):
                self.source = io.BytesIO(b"12345")

            async def read(self, size):
                return self.source.read(size)

        with self.assertRaises(HTTPException) as error:
            asyncio.run(main.read_upload_limited(FakeUpload(), limit=4))
        self.assertEqual(error.exception.status_code, 413)


if __name__ == "__main__":
    unittest.main()
