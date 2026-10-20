"""Measured, operation-scoped import progress. No source records are retained here."""
from threading import RLock
from time import monotonic
from uuid import uuid4


class ImportBusyError(ValueError):
    pass


class ImportCancelled(ValueError):
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
        self.cancel_requested = False
        self.publishing = False

    def check_cancelled(self):
        with self.lock:
            if self.cancel_requested and not self.publishing:
                self.state = "cancelled"
                self.published = None
                raise ImportCancelled("Import cancelled")

    def cancel(self):
        with self.lock:
            if self.state in {"preparing", "processing", "cancelling"} and not self.publishing:
                self.cancel_requested = True
                self.state = "cancelling"
                self.published = None
            return self.snapshot()

    def begin_publication(self):
        with self.lock:
            self.check_cancelled()
            self.publishing = True
            self.published = None

    def plan(self, names):
        with self.lock:
            self.check_cancelled()
            if self.tasks:
                if list(self.tasks) != list(names): raise ValueError("Import work plan changed.")
                return
            self.tasks = dict.fromkeys(names, 0.0)
            self.state = "processing"
            self.published = None

    def start(self, name):
        with self.lock:
            self.check_cancelled()
            if name not in self.tasks: raise ValueError("Unplanned import task.")
            self.current = name

    def advance(self, name, completed, total):
        with self.lock:
            self.check_cancelled()
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
            self.state = "cancelled" if isinstance(error, ImportCancelled) or self.cancel_requested and not self.publishing else "error"
            self.error = "" if self.state == "cancelled" else str(error)
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
                "error": self.error, "canCancel": not self.publishing and self.state in {"preparing", "processing"}}
            self.last_update = now
            return dict(self.published)


class ImportTracker:
    def __init__(self):
        self.lock = RLock()
        self.operation = None
        self.cancelled_ids = set()

    def begin(self, operation_id=None, source=""):
        with self.lock:
            if self.operation and self.operation.state in {"preparing", "processing", "cancelling"}:
                raise ImportBusyError("Data import is already in progress")
            if operation_id is not None:
                from uuid import UUID
                try: UUID(operation_id)
                except (ValueError, TypeError, AttributeError): raise ValueError("Invalid import operation ID.")
            self.operation = ImportOperation(operation_id, source)
            if operation_id in self.cancelled_ids:
                self.cancelled_ids.discard(operation_id)
                self.operation.cancel_requested = True
                self.operation.check_cancelled()
            return self.operation

    def cancel(self, operation_id):
        from uuid import UUID
        try: UUID(operation_id)
        except (ValueError, TypeError, AttributeError): raise ValueError("Invalid import operation ID.")
        with self.lock:
            if self.operation and self.operation.operation_id == operation_id:
                return self.operation.cancel()
            # An upload can be aborted before its request reaches the import worker.
            self.cancelled_ids.add(operation_id)
            if len(self.cancelled_ids) > 256: self.cancelled_ids.pop()
            return {**self.status(operation_id), "state": "cancelled", "canCancel": False}

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
                  if name in datasets and (core or name in {"legalhotlines", "awareness"})]
    reviews = [name for name in ("beneficiaries", "assessments", "legalservices", "awareness") if name in datasets and (core or name == "awareness")]
    return [*(f"Reading:{name}" for name in datasets),
            *(task for name in datasets for task in (f"Parsing:{name}", f"Cleaning:{name}")),
            "Restoring linked fields",
            *(f"Validating:{name}" for name in validation),
            *(["Checking relationships:assessments"] if core else []), "Applying exclusions",
            *(f"Preparing review:{name}" for name in reviews), "Preparing metadata",
            "Reconciling exclusions", "Finalizing metadata", "Publishing"]
