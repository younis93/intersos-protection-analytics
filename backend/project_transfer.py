"""Staged portable project imports. No destination writes before confirmation."""
from copy import deepcopy
from datetime import datetime
import json
import threading
import time
import uuid

from fastapi import File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from typing import Literal
from starlette.concurrency import run_in_threadpool

from .kobo import KoboSettings, new_project_settings, filtered_records
from .kobo_edits import effective_project
from .kobo_saved_views import snapshot_issues
from .kobo_updates import UpdateMatching, preview_update, paged_review, review_update
from .kobo_workspace import read_backup
from .project_encryption import MAX_UPLOAD, ProjectProtectionError, unlock_backup
from .project_snapshot import materialize


class TransferChoice(BaseModel):
    projectId: str = ''
    settingsPolicy: Literal['file', 'defaults', 'keep'] = 'file'
    expectedUpdated: str = ''
    matching: UpdateMatching | None = None
    matchingMode: Literal['automatic', 'manual'] = 'automatic'
    page: int = 1
    kind: str = ''
    field: str = ''


def add_transfer_routes(router, store, prefix):
    staged = {}
    lock = threading.RLock()

    def item_for(token):
        item = staged.get(token)
        if item is None or time.monotonic()-item['created'] > 1800:
            staged.pop(token, None)
            raise HTTPException(410, 'This import expired. Choose the project file again.')
        return item

    def candidate(item, body):
        name, payload, settings, form_raw, data_raw, includes = item['backup']
        if body.settingsPolicy == 'file' and not includes:
            raise ValueError('This file contains data only. Choose default or current settings.')
        if (body.projectId and body.settingsPolicy == 'defaults') or (not body.projectId and body.settingsPolicy == 'keep'):
            raise ValueError('Choose a settings option for this import destination.')
        previous = None
        if body.projectId:
            previous = store.get(body.projectId)
            if previous['updated'] != body.expectedUpdated:
                raise HTTPException(409, 'This project changed. Select it again and review the latest update.')
        # Settings-free imports use a corrected baseline without source recipes.
        if body.settingsPolicy != 'file':
            payload, form_raw, data_raw = materialize(payload, form_raw)
        elif previous:
            # Compare against incoming corrected values, then restore the complete
            # source and incoming edit history when committing a full transfer.
            payload = deepcopy(effective_project(payload))
            for key in ('_sourceForm', '_sourceRecords', 'dataEdits'):
                payload.pop(key, None)
        else:
            payload = deepcopy(payload)
        selected = KoboSettings.model_validate(previous['settings']) if body.settingsPolicy=='keep' else settings if body.settingsPolicy=='file' else new_project_settings(payload['form'], payload['records'])
        return name, payload, selected, form_raw, data_raw, previous

    def settings_issues(payload, settings):
        from .kobo_indicators import IndicatorDefinition, indicator_issues
        from .kobo_saved_views import saved_view_issues
        from .kobo import SavedAnalysisView
        effective = effective_project(payload)
        issues = snapshot_issues(effective, settings)
        for view in settings.savedViews:
            issues.extend(saved_view_issues(effective, SavedAnalysisView.model_validate(view)))
        for definition in settings.indicators:
            issues.extend(indicator_issues(effective, IndicatorDefinition.model_validate(definition)))
        return list(dict.fromkeys(issues))

    @router.post('/backups/preview')
    async def stage_backup(file: UploadFile = File(...), password: str | None = Form(None)):
        try:
            raw = await file.read(MAX_UPLOAD+1)
        finally:
            await file.close()
        try:
            raw = await run_in_threadpool(unlock_backup, raw, password)
            backup = await run_in_threadpool(lambda: read_backup(raw, with_metadata=True))
            name, payload, settings, _, _, includes = backup
            from .kobo_api import FormSchema
            FormSchema.model_validate(payload['form'])
            if bool(payload.get('customConfig')) != (prefix == '/api/custom'):
                raise ValueError('Choose a backup from this workspace.')
            if payload.get('customConfig'):
                from .custom_analysis import Configuration
                Configuration.model_validate(payload['customConfig'])
            ids = [q['id'] for q in payload['form']['questions']]
            if len(ids)!=len(set(ids)): raise ValueError('Duplicate question identifiers in backup.')
            filtered_records(effective_project(payload), settings or new_project_settings(payload['form'], payload['records']))
            with lock:
                for key in list(staged):
                    if time.monotonic()-staged[key]['created'] > 1800: del staged[key]
                if len(staged)>=3: raise HTTPException(409, 'Finish or cancel an existing project import first.')
                token = uuid.uuid4().hex
                staged[token] = {'created':time.monotonic(), 'backup':backup, 'filename':file.filename or 'Project', 'reviews':set()}
            return {'token':token, 'name':name, 'includesSettings':includes, 'records':len(payload['records']),
                    'fields':len(ids), 'projects':store.list()}
        except ProjectProtectionError as exc:
            raise HTTPException(400, exc.detail) from None
        except (ValueError, KeyError, TypeError) as exc:
            raise HTTPException(400, {'code':'invalid_backup', 'message':str(exc)}) from None

    @router.post('/backups/{token}/review')
    def review_backup(token: str, body: TransferChoice):
        try:
            with lock:
                item = item_for(token)
                _, payload, settings, _, _, previous = candidate(item, body)
                if not previous:
                    return {'settingsIssues':settings_issues(payload, settings)}
                previous = {**previous, 'settings':settings.model_dump()}
                review = preview_update(previous, payload, body.model_dump(exclude_none=True), item['filename'])
                issues = settings_issues(payload, settings)
                review['blockingIssues'] = list(dict.fromkeys([*review['blockingIssues'], *issues]))
                item['reviews'].add((body.projectId, body.expectedUpdated, body.settingsPolicy, review['signature']))
                return paged_review(review, max(1,body.page), kind=body.kind, field=body.field)
        except KeyError:
            raise HTTPException(404, 'Destination project no longer exists.') from None
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None

    @router.post('/backups/{token}/confirm')
    def confirm_backup(token: str, body: TransferChoice):
        try:
            with lock:
                item = item_for(token)
                name, payload, settings, form_raw, data_raw, previous = candidate(item, body)
                if previous:
                    if not body.matching or (body.projectId, body.expectedUpdated, body.settingsPolicy, body.matching.signature) not in item['reviews']:
                        raise ValueError('Review this update before applying.')
                    entry = review_update({**previous, 'settings':settings.model_dump()}, payload, body.matching, item['filename'])
                    if body.settingsPolicy == 'file':
                        incoming = deepcopy(item['backup'][1])
                        local = payload.get('dataEdits', {})
                        incoming['dataEdits'] = {'revision':local.get('revision', 1),
                            'history':[*incoming.get('dataEdits', {}).get('history', []), *local.get('history', [])]}
                        payload = incoming
                    payload['updateHistory'] = [entry, *previous.get('updateHistory', [])][:20]
                    issues = settings_issues(payload, settings)
                    if issues: raise ValueError('Review incompatible settings before applying: '+' '.join(issues))
                    # One transaction commits data, sources and settings against the reviewed version.
                    with store.connect() as db:
                        db.execute('BEGIN IMMEDIATE')
                        result = db.execute('UPDATE projects SET payload=?,settings=?,form=?,data=?,updated=? WHERE id=? AND updated=?',
                            (json.dumps(payload,ensure_ascii=False), settings.model_dump_json(), form_raw, data_raw,
                             datetime.now().isoformat(),body.projectId,body.expectedUpdated))
                        if result.rowcount!=1: raise HTTPException(409,'This project changed. Review the update again.')
                    project = store.get(body.projectId)
                else:
                    issues = settings_issues(payload, settings)
                    if issues: raise ValueError('Review incompatible settings before applying: '+' '.join(issues))
                    project = store.create(name,payload,form_raw,data_raw,settings)
                del staged[token]
                return {k:v for k,v in project.items() if k!='records'}
        except KeyError:
            raise HTTPException(404,'Destination project no longer exists.') from None
        except ValueError as exc:
            raise HTTPException(400,str(exc)) from None

    @router.delete('/backups/{token}')
    def cancel_backup(token: str):
        with lock: staged.pop(token,None)
        return {'cancelled':True}
