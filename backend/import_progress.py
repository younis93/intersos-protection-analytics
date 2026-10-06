"""Measured, operation-scoped import progress. No source records are retained here."""
from threading import RLock
from time import monotonic
from uuid import uuid4


class ImportBusyError(ValueError):
    pass


class ImportOperation:
    def __init__(self, operation_id=None, source=""):
        self.lock = RLock()
        self.operation_id = operation_id or uuid4().hex
        self.source = source
        self.state = "preparing"
        self.tasks = {}
        self.current = None
        self.error = ""
        self.last_update = 0.0
        self.published = None

    def plan(self, names):
        with self.lock:
            if self.tasks:
                if list(self.tasks) != list(names): raise ValueError("Import work plan changed.")
                return
            self.tasks = dict.fromkeys(names, 0.0)
            self.state = "processing"
            self.published = None

    def start(self, name):
        with self.lock:
            if name not in self.tasks: raise ValueError("Unplanned import task.")
            self.current = name

    def advance(self, name, completed, total):
        with self.lock:
            value = min(1.0, max(0.0, completed / total)) if total else 1.0
            self.tasks[name] = max(self.tasks[name], value)

    def finish(self, name):
        self.advance(name, 1, 1)

    def complete(self):
        with self.lock:
            if not self.tasks or any(value != 1 for value in self.tasks.values()):
                raise ValueError("Import finished with incomplete work.")
            self.state = "complete"
            self.published = None

    def fail(self, error):
        with self.lock:
            self.state = "error"
            self.error = str(error)
            self.published = None

    def snapshot(self):
        with self.lock:
            now = monotonic()
            # Expose changes at most five times per second; terminal changes are immediate.
            if self.published is not None and now - self.last_update < .2:
                return dict(self.published)
            completed, total = sum(self.tasks.values()), len(self.tasks)
            stage, _, dataset = (self.current or "Preparing").partition(":")
            self.published = {"operationId": self.operation_id, "state": self.state,
                "source": self.source, "stage": stage, "dataset": dataset,
                "completedWork": completed, "totalWork": total,
                "percent": (100 if self.state == "complete" else min(99, int(completed / total * 100))) if total else None,
                "error": self.error}
            self.last_update = now
            return dict(self.published)


class ImportTracker:
    def __init__(self):
        self.lock = RLock()
        self.operation = None

    def begin(self, operation_id=None, source=""):
        with self.lock:
            if self.operation and self.operation.state in {"preparing", "processing"}:
                raise ImportBusyError("Data import is already in progress")
            if operation_id is not None:
                from uuid import UUID
                try: UUID(operation_id)
                except (ValueError, TypeError, AttributeError): raise ValueError("Invalid import operation ID.")
            self.operation = ImportOperation(operation_id, source)
            return self.operation

    def status(self, operation_id=None):
        with self.lock:
            if not self.operation or (operation_id and operation_id != self.operation.operation_id):
                return {"operationId": operation_id, "state": "idle", "percent": None,
                        "completedWork": 0, "totalWork": 0, "stage": "Preparing", "dataset": "", "error": ""}
            return self.operation.snapshot()


legal_import_tracker = ImportTracker()


def import_plan(datasets):
    datasets = list(datasets)
    core = all(name in datasets for name in ("beneficiaries", "assessments", "legalservices"))
    validation = [name for name in ("legalhotlines", "beneficiaries", "assessments", "legalservices", "awareness")
                  if name in datasets and (core or name == "legalhotlines")]
    reviews = [name for name in ("beneficiaries", "assessments", "legalservices", "awareness") if name in datasets]
    return [*(f"Reading:{name}" for name in datasets),
            *(task for name in datasets for task in (f"Parsing:{name}", f"Cleaning:{name}")),
            *(f"Validating:{name}" for name in validation),
            *(["Checking relationships:assessments"] if core else []), "Applying exclusions",
            *(f"Preparing review:{name}" for name in reviews), "Preparing metadata",
            "Reconciling exclusions", "Finalizing metadata", "Publishing"]
