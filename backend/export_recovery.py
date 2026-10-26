"""Durable retry requests, separate from generated files and project data."""
import json
import sqlite3
from pathlib import Path

from pydantic import BaseModel
from typing import Literal
from .kobo import KoboSettings


class RecoveryInput(BaseModel):
    workspace: Literal['kobo', 'custom'] = 'kobo'
    projectId: str
    projectName: str
    settings: KoboSettings
    format: Literal['excel', 'pdf']
    excelMode: Literal['native', 'binary'] | None = None
    question: str = ''
    separateGroups: list[str] | None = None
    chartMetric: Literal['count', 'percent', 'both'] | None = None


class RecoveryTask(BaseModel):
    filename: str
    input: RecoveryInput
    job: str | None = None


class ExportRecoveryStore:
    def __init__(self, path: Path):
        self.path = path

    def connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=30)
        db.execute('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
        return db

    def list(self):
        with self.connect() as db:
            return [dict(id=key, **json.loads(payload)) for key, payload in db.execute('SELECT id,payload FROM tasks ORDER BY rowid')]

    def save(self, key: str, task: RecoveryTask):
        with self.connect() as db:
            db.execute('INSERT OR REPLACE INTO tasks VALUES (?, ?)', (key, task.model_dump_json(exclude_none=True)))

    def remove(self, key: str):
        with self.connect() as db:
            db.execute('DELETE FROM tasks WHERE id=?', (key,))
