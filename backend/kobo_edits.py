"""Local, reversible corrections and category recipes over immutable imported records."""
from copy import deepcopy
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
import unicodedata
import uuid
from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator


def text(value): return unicodedata.normalize('NFC', str(value)).strip()
def identity(prefix, *parts): return prefix+hashlib.sha256(json.dumps(parts,ensure_ascii=False).encode()).hexdigest()[:24]

class CellChange(BaseModel):
    record: str
    field: str
    value: Any = None

class ReviewBlankSelection(BaseModel):
    settings: dict
    group: str = Field(min_length=1, max_length=1000)
    category: Literal['all','missing','conflicts','checks','other'] = 'all'
    status: Literal['open','ignored','excluded','all'] = 'open'
    question: str = Field(min_length=1, max_length=1000)
    search: str = Field('', max_length=1000)
    groupSearch: str = Field('', max_length=1000)
    columnFilters: list[dict] = Field(default_factory=list, max_length=100)


class EditOperation(BaseModel):
    kind: Literal['cells','answers']
    cells: list[CellChange] = Field(default_factory=list)
    reviewBlanks: ReviewBlankSelection | None = None
    allMatches: bool = False
    originalValue: Any = None
    field: str = ''
    sources: list[str] = Field(default_factory=list, max_length=10000)
    label: str = Field('', max_length=1000)
    target: str = ''
    destination: Literal['same','new'] = 'new'
    name: str = Field('', max_length=1000)
    language: Literal['en','ar'] = 'en'

class EditRequest(BaseModel):
    revision: int = Field(ge=0)
    operation: EditOperation
    signature: str = ''

    @model_validator(mode='after')
    def validate_cells(self):
        if len(self.operation.cells)>1000:raise ValueError('Choose at most 1000 explicit cells.')
        if self.operation.allMatches and (self.operation.kind!='cells' or len(self.operation.cells)!=1):
            raise ValueError('Choose one response to match.')
        if self.operation.reviewBlanks and (self.operation.allMatches or self.operation.kind!='cells' or len(self.operation.cells)!=1):
            raise ValueError('Choose one question and one review scope for blank filling.')
        return self


def match_value(value, question):
    # Empty values match without collapsing meaningful text whitespace or option codes.
    if value is None or value=='' or value==[]:return None
    if question['kind']=='multiple':
        if not isinstance(value,list) or any(not isinstance(v,str) for v in value):
            raise ValueError('Choose a list of option codes to match.')
        return frozenset(value)
    if question['kind'] in {'number','date'}:return scalar_value(value,question)
    return value


def resolve_operation(project, operation):
    if operation.reviewBlanks:
        from .kobo import KoboSettings, missing
        from .column_filters import ColumnFilter
        from .kobo_data_review import data_review
        selector=operation.reviewBlanks
        change=operation.cells[0]
        if any(q['id']==change.field and (q.get('connectionSetup') or {}).get('pending') for q in project['form']['questions']):
            raise ValueError('Review and save the connection before filling blank answers.')
        if change.field!=selector.question:raise ValueError('The review question does not match the edited question.')
        if missing(change.value) or change.value==[]:raise ValueError('Choose a nonblank answer before filling blank rows.')
        apply_operation(deepcopy(project),operation)
        result=data_review(project,KoboSettings.model_validate(selector.settings),group=selector.group,category=selector.category,
            status=selector.status,question=selector.question,search=selector.search,group_search=selector.groupSearch,
            column_filters=[ColumnFilter.model_validate(f) for f in selector.columnFilters],page_size=10**9)
        eligible={r['record'] for r in result['rows'] if r['question']==change.field and r['outcome'] in {'required-missing','connected-blank'} and (missing(r['value']) or r['value']==[])}
        cells=[CellChange(record=r['id'],field=change.field,value=change.value) for r in project['records'] if r['id'] in eligible]
        return operation.model_copy(update={'cells':cells,'reviewBlanks':None})
    if not operation.allMatches:return operation
    change=operation.cells[0]
    # Validate the anchor and replacement before looking for other matching records.
    apply_operation(deepcopy(project),operation)
    question=next(q for q in project['form']['questions'] if q['id']==change.field)
    anchor=next(r for r in project['records'] if r['id']==change.record)
    original=match_value(operation.originalValue,question)
    if match_value(anchor['values'].get(change.field),question)!=original:
        raise ValueError('The response changed. Reload this table and review your edit again.')
    cells=[CellChange(record=r['id'],field=change.field,value=change.value) for r in project['records']
           if r['scope']==question['repeat'] and match_value(r['values'].get(change.field),question)==original]
    return operation.model_copy(update={'cells':cells,'allMatches':False,'originalValue':None})


def editable(question):
    return not (question.get('metadata') or question.get('localDerived') or question.get('derivedFrom') or question['id'].startswith('calc_') or question['name'].lower() in {'_id','_uuid','uuid','_index','_parent_index','_submission_time'})


def choices_for(project, field, language='en'):
    from .kobo import label, missing
    q=next((q for q in project['form']['questions'] if q['id']==field),None)
    if not q: raise ValueError('This field is no longer available.')
    counts=Counter()
    for record in project['records']:
        value=record['values'].get(field)
        if missing(value):continue
        counts.update(list(dict.fromkeys(value)) if isinstance(value,list) else [str(value)])
    labels={c['name']:label(c,language) for c in q['choices']}
    return [{'id':code,'label':labels.get(code,code),'count':counts[code]} for code in dict.fromkeys([*labels,*counts])]


def scalar_value(value,q):
    from .kobo import missing
    if missing(value) or value==[]:return None
    if q['kind']=='number':
        if isinstance(value,bool):raise ValueError('Enter a finite number.')
        try:value=float(value)
        except (ValueError,TypeError):raise ValueError('Enter a finite number.')
        if not math.isfinite(value):raise ValueError('Enter a finite number.')
        return value
    if q['kind']=='date':
        try:return datetime.fromisoformat(str(value).replace('Z','+00:00')).isoformat() if 'T' in str(value) else datetime.strptime(str(value),'%Y-%m-%d').date().isoformat()
        except ValueError:raise ValueError('Enter a valid date in YYYY-MM-DD format.')
    if not isinstance(value,str):raise ValueError('Enter a text value.')
    if len(value)>100000:raise ValueError('This value is too long.')
    return value


def option_value(value,q,language):
    from .kobo import label
    if value is None:return None
    value=text(value)
    if not value:return None
    if any(c['name']==value for c in q['choices']):return value
    matches=[c for c in q['choices'] if text(label(c,language))==value]
    if len(matches)>1:raise ValueError('Several form options have this label. Select its code instead.')
    if matches:return matches[0]['name']
    code=identity('local_',q['id'],value)
    q['choices'].append({'name':code,'labels':{language:value}})
    return code


def apply_operation(project,operation,replay=False,place_after_source=True):
    from .kobo import label, missing
    op=EditOperation.model_validate(operation)
    questions={q['id']:q for q in project['form']['questions']}
    records={r['id']:r for r in project['records']}
    protected={field for entry in project.get('updateHistory',[])[:1] for keys in entry.get('keys',{}).values() for field in keys}
    if op.kind=='cells':
        if not op.cells:raise ValueError('Choose a cell to edit.')
        for change in op.cells:
            q=questions.get(change.field);record=records.get(change.record)
            if not q or not record or q['repeat']!=record['scope'] or not editable(q) or q['id'] in protected:raise ValueError('This cell is read-only or no longer available.')
            if q['kind']=='multiple':
                if change.value is not None and not isinstance(change.value,list):raise ValueError('Choose a list of options.')
                value=list(dict.fromkeys(v for v in (option_value(v,q,op.language) for v in change.value or []) if v))
            elif q['kind']=='category': value=option_value(change.value,q,op.language) if change.value is not None else None
            else:value=scalar_value(change.value,q)
            record['values'][q['id']]=value
        return
    source=questions.get(op.field)
    if not source or source['kind'] not in {'category','multiple','text'} or not editable(source):raise ValueError('Choose an editable text or choice field.')
    options=choices_for(project,op.field,op.language);known={c['id']:c for c in options}
    if replay:
        for code in op.sources:
            if code not in known:known[code]={'id':code,'label':code,'count':0};options.append(known[code])
    if not op.sources or any(code not in known for code in op.sources):raise ValueError('Select available answers to rename or merge.')
    if not text(op.label):raise ValueError('Enter a destination answer label.')
    matches=[c['id'] for c in options if text(c['label'])==text(op.label)]
    if op.target:
        if op.target not in known:raise ValueError('Choose an available destination option.')
        target=op.target
    elif len(matches)>1:raise ValueError('Several options have this label. Select a destination code.')
    else:target=matches[0] if matches else op.sources[0] if len(op.sources)==1 else identity('local_',op.field,text(op.label))
    q=source
    if op.destination=='new':
        if not text(op.name):raise ValueError('Enter the new field name.')
        if any(text(label(item,op.language))==text(op.name) for item in questions.values()):raise ValueError('A field already uses this name.')
        q=deepcopy(source);q.update(id=identity('local_field_',op.field,op.name),name=text(op.name),labels={op.language:text(op.name)},localDerived=True,required='',derivedFrom=source['id'],order=len(questions))
        if q['kind']=='text':q['kind']='category';q['type']='select_one local'
        if place_after_source:
            ordered=project['form']['questions']
            ordered.insert(ordered.index(source)+1,q)
            for index,item in enumerate(ordered):item['order']=index
        else:project['form']['questions'].append(q)
    labels={c['name']:deepcopy(c['labels']) for c in source['choices']}
    for item in options:labels.setdefault(item['id'],{op.language:item['label']})
    labels.setdefault(target,{})[op.language]=text(op.label)
    merged=set(op.sources)-{target}
    q['choices']=[{'name':code,'labels':captions} for code,captions in labels.items() if code not in merged]
    for record in project['records']:
        if record['scope']!=source['repeat']:continue
        value=record['values'].get(source['id'])
        if isinstance(value,list):value=list(dict.fromkeys(target if v in op.sources else v for v in value))
        elif not missing(value):value=target if str(value) in op.sources else value
        record['values'][q['id']]=deepcopy(value)


def effective_project(project):
    batches=project.get('dataEdits',{}).get('history',[])
    active=[batch for batch in batches if not batch.get('undone')]
    if not active:return project
    result=deepcopy(project)
    result['_sourceRecords']=project['records'];result['_sourceForm']=project['form']
    for batch in active:apply_operation(result,batch['operation'],replay=True,place_after_source=batch.get('inheritSourceSettings',False))
    if result.get('customConfig',{}).get('calculatedColumns'):
        from .custom_analysis import Configuration
        from .custom_preparation import calculated_columns
        config=Configuration.model_validate(result['customConfig'])
        result['form']['questions']=[q for q in result['form']['questions'] if not q['id'].startswith('calc_')]
        _,issues=calculated_columns(config,result['records'],result['form']['questions'])
        if issues:raise ValueError('This edit creates invalid calculated values: '+issues[0]['message'])
    return result


def revision(project):return project.get('dataEdits',{}).get('revision',0)
def remap_merge_filters(settings,operation,after):
    op=EditOperation.model_validate(operation)
    if op.kind!='answers' or op.destination!='same':return []
    from .kobo import label
    q=next(q for q in after['form']['questions'] if q['id']==op.field)
    target=op.target or next((c['name'] for c in q['choices'] if text(label(c,op.language))==text(op.label)),None)
    if target is None:return []
    changes=[]
    for view_id,snapshot in [('',settings),*[(v['id'],v['snapshot']) for v in settings.get('savedViews',[])]]:
        targets=[('',snapshot,'filters'),*[(qid,cfg,'ownFilters') for qid,cfg in snapshot.get('questions',{}).items()]]
        for qid,container,key in targets:
            before=deepcopy(container.get(key,[]))
            for rule in container.get(key,[]):
                if rule.get('field')==op.field and rule.get('kind')=='category':rule['values']=list(dict.fromkeys(target if v in op.sources else v for v in rule.get('values',[])))
            if before!=container.get(key,[]):changes.append({'view':view_id,'question':qid,'before':before,'after':deepcopy(container[key])})
    return changes


def inherit_new_field_settings(settings,operation,after):
    """Copy current settings once, translating answer identities into the new field."""
    from .kobo import QuestionSettings,label
    op=EditOperation.model_validate(operation)
    if op.kind!='answers' or op.destination!='new':return
    qid=identity('local_field_',op.field,op.name)
    question=next(q for q in after['form']['questions'] if q['id']==qid)
    target=op.target or next(c['name'] for c in question['choices'] if text(label(c,op.language))==text(op.label))
    sources=set(op.sources)
    def mapped(code):return target if code in sources else code
    cfg=deepcopy(settings.get('questions',{}).get(op.field))
    if cfg is None:cfg=QuestionSettings(percentageMode=settings.get('percentageDefault') or 'grand-total').model_dump()
    cfg['hiddenAnswers']=list(dict.fromkeys(mapped(code) for code in cfg.get('hiddenAnswers',[])))
    for rule in cfg.get('ownFilters',[]):
        if rule.get('field')==op.field:
            rule['field']=qid
            if rule.get('kind')=='category':rule['values']=list(dict.fromkeys(mapped(code) for code in rule.get('values',[])))
    colors=cfg.get('colors',{})
    cfg['colors']={code:color for code,color in colors.items() if code not in sources}
    for code in dict.fromkeys([target,*op.sources]):
        if code in colors:cfg['colors'][target]=colors[code];break
    # Mark colors encode [breakdown fields, breakdown value, answer code].
    marks={}
    priority={code:index for index,code in enumerate(dict.fromkeys([target,*op.sources]))}
    for key,color in sorted(cfg.get('pointColors',{}).items(),key=lambda item:priority.get(json.loads(item[0])[2],len(priority))):
        parts=json.loads(key);parts[2]=mapped(parts[2])
        marks.setdefault(json.dumps(parts,ensure_ascii=False,separators=(',',':')),color)
    cfg['pointColors']=marks
    settings.setdefault('questions',{})[qid]=cfg
    if op.field in settings.get('hidden',[]):settings['hidden'].append(qid)


def edit_preview(raw,request):
    if request.revision!=revision(raw):raise ValueError('The data changed. Reload this table and review your edit again.')
    before=effective_project(raw);operation=resolve_operation(before,request.operation)
    # Validate the full pipeline, including dependent calculations.
    candidate=deepcopy(raw)
    if operation.cells or operation.kind=='answers':candidate.setdefault('dataEdits',{}).setdefault('history',[]).append({'operation':operation.model_dump(),'inheritSourceSettings':True})
    after=effective_project(candidate)
    changed=sum(a['values']!=b['values'] for a,b in zip(before['records'],after['records']))
    evidence=[request.revision,request.operation.model_dump()]
    if request.operation.reviewBlanks:
        connections={key:[cfg.get('connectionSource','automatic'),cfg.get('connectionRules')] for key,cfg in raw.get('settings',{}).get('questions',{}).items() if cfg.get('connectionSource','automatic')!='automatic' or cfg.get('connectionRules')}
        from .kobo_connections import semantic_form
        evidence.extend([semantic_form(before['form']),before['records'],before.get('conditionalReview',{}),connections,[(c.record,c.field) for c in operation.cells]])
    signature=hashlib.sha256(json.dumps(evidence,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    field=request.operation.field
    created=next((q['id'] for q in after['form']['questions'] if q['id'] not in {v['id'] for v in before['form']['questions']}),field)
    settings=deepcopy(raw.get('settings',{}));filter_changes=remap_merge_filters(settings,request.operation,after)
    impacts=[f'{len(filter_changes)} current or saved filter configurations will follow the merged answer.'] if filter_changes else []
    if operation.kind=='answers' and operation.destination=='new':
        inherit_new_field_settings(settings,operation,after)
        impacts.append('The new field will appear directly after the original question in form order and inherit its current analysis settings, including filters and hidden answers.')
    from .kobo_indicators import IndicatorDefinition,indicator_issues
    for definition in settings.get('indicators',[]):
        issues=indicator_issues(after,IndicatorDefinition.model_validate(definition))
        if issues:impacts.append(definition['name']+': review indicator scoring after this change.')
    return {'impacts':impacts,'revision':revision(raw),'signature':signature,'affectedRecords':len(operation.cells) if request.operation.reviewBlanks else changed,'matchingRecords':len(operation.cells) if request.operation.allMatches or request.operation.reviewBlanks else None,'field':created,'options':choices_for(after,created,request.operation.language) if created else [],'beforeOptions':choices_for(before,field,request.operation.language) if field else []}


def commit_edit(store,pid,request=None,undo=False):
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT payload,settings FROM projects WHERE id=?',(pid,)).fetchone()
        if not row:raise KeyError('Project not found.')
        raw=json.loads(row[0])
        review_context=None
        if not undo and request.operation.reviewBlanks:
            from .kobo_required import recover_required
            form_raw=bytes(db.execute('SELECT form FROM projects WHERE id=?',(pid,)).fetchone()[0])
            raw=recover_required(raw,form_raw)
            from .kobo_connection_setup import hydrate_connections
            review_context=hydrate_connections({**raw,'settings':json.loads(row[1])},form_raw)
            from .kobo_shared_dependencies import annotate as shared_connections
            from .kobo_question_conditions import annotate as local_connections
            review_context=local_connections(shared_connections(review_context))
        edits=raw.setdefault('dataEdits',{'revision':0,'history':[]})
        if undo:
            if request.revision!=revision(raw):raise ValueError('The data changed. Reload before undoing.')
            last=next((b for b in reversed(edits['history']) if not b.get('undone')),None)
            if not last:raise ValueError('There is no local edit to undo.')
            last['undone']=True
        else:
            preview=edit_preview(review_context if request.operation.reviewBlanks else raw,request)
            if request.signature and preview['signature']!=request.signature:raise ValueError('Review this edit again before applying.')
            if (request.operation.kind=='answers' or request.operation.allMatches or request.operation.reviewBlanks) and not request.signature:raise ValueError('Preview the answer changes before applying.')
            if request.operation.reviewBlanks and not preview['affectedRecords']:raise ValueError('No eligible blank rows remain in this review.')
            operation=resolve_operation(effective_project(review_context if request.operation.reviewBlanks else raw),request.operation)
            edits['history'].append({'id':uuid.uuid4().hex,'at':datetime.now(timezone.utc).isoformat(),'operation':operation.model_dump(),'affectedRecords':preview['affectedRecords'],'inheritSourceSettings':True})
        effective=effective_project(raw)
        settings=json.loads(row[1])
        if undo:
            for patch in last.get('filterChanges',[]):
                snapshot=settings if not patch['view'] else next((v['snapshot'] for v in settings.get('savedViews',[]) if v['id']==patch['view']),None)
                if snapshot is not None:
                    container=snapshot.get('questions',{}).get(patch['question']) if patch.get('question') else snapshot
                    key='ownFilters' if patch.get('question') else 'filters'
                    if container is not None and container.get(key,[])==patch['after']:container[key]=patch['before']
        else:
            edits['history'][-1]['filterChanges']=remap_merge_filters(settings,request.operation,effective)
            inherit_new_field_settings(settings,request.operation,effective)
        from .kobo import QuestionSettings
        for q in effective['form']['questions']:
            if q.get('localDerived') and q['id'] not in settings.get('questions',{}):settings.setdefault('questions',{})[q['id']]=QuestionSettings(percentageMode=settings.get('percentageDefault') or 'grand-total').model_dump()
        known={q['id'] for q in effective['form']['questions']}
        settings['questions']={key:value for key,value in settings.get('questions',{}).items() if key in known}
        settings['filters']=[f for f in settings.get('filters',[]) if f['field'] in known]
        for cfg in settings['questions'].values():
            cfg['breakdowns']=[field for field in cfg.get('breakdowns',[]) if field in known]
            if cfg.get('breakdown') not in known:cfg['breakdown']=''
            if cfg.get('calculation') and cfg['calculation'].get('field') not in known:cfg['calculation']=None
            if cfg.get('trendDateField') not in known:cfg['trendDateField']=''
        settings['dashboardQuestions']=[f for f in settings.get('dashboardQuestions',[]) if f in known]
        if settings.get('geographyField') not in known:settings['geographyField']=''
        settings['filterFields']=[f for f in settings.get('filterFields',[]) if f in known]
        settings['hidden']=[f for f in settings.get('hidden',[]) if f in known]
        from .kobo_saved_views import saved_view_issues
        from .kobo import SavedAnalysisView
        for view in settings.get('savedViews',[]):view['reviewIssues']=saved_view_issues(effective,SavedAnalysisView.model_validate(view))
        from .kobo_indicators import IndicatorDefinition,indicator_issues
        for definition in settings.get('indicators',[]):definition['reviewIssues']=indicator_issues(effective,IndicatorDefinition.model_validate({**definition,'reviewIssues':[]}))
        edits['revision']+=1
        db.execute('UPDATE projects SET payload=?,settings=?,updated=? WHERE id=?',(json.dumps(raw,ensure_ascii=False),json.dumps(settings,ensure_ascii=False),datetime.now().isoformat(),pid))
    return store.get(pid)

def carry_edits(previous,payload,matching,apply=False,materialize=False):
    """Carry corrections only through explicit, unique source identities."""
    old_records=previous.get('_sourceRecords',previous['records']);old_form=previous.get('_sourceForm',previous['form'])
    oldq={q['id']:q for q in old_form['questions']};newq={q['id']:q for q in payload['form']['questions']}
    maps={};pairs={}
    for scope in sorted({r['scope'] for r in old_records+payload['records']},key=lambda s:(s.count('/'),len(s),s)):
        keys=matching.keys.get(scope,[])
        if matching.skip or not keys or any(k not in oldq or k not in newq or oldq[k]['kind']!=newq[k]['kind'] or newq[k]['repeat']!=scope for k in keys):continue
        def index(records,side):
            result={}
            for record in records:
                if record['scope']!=scope:continue
                values=[record['values'].get(k) for k in keys]
                if any(v is None or isinstance(v,str) and not v.strip() for v in values):return None
                parent=maps.get((side,record.get('parent'))) if scope else ''
                if scope and parent is None:return None
                key=json.dumps([parent,[[type(v).__name__,v] for v in values]],ensure_ascii=False)
                if key in result:return None
                result[key]=record
            return result
        before=index(old_records,'old');after=index(payload['records'],'new')
        if before is None or after is None:continue
        for side,records in [('old',before),('new',after)]:maps.update({(side,r['id']):key for key,r in records.items()})
        pairs.update({r['id']:after[key] for key,r in before.items() if key in after})
    raw_lookup={r['id']:r for r in old_records};effective_lookup={r['id']:r for r in previous['records']};conflicts=[];lost=0;issues=[];history=[]
    active_history=[b for b in previous.get('dataEdits',{}).get('history',[]) if not b.get('undone')]
    last_cells={(c['record'],c['field']):(bi,ci) for bi,b in enumerate(active_history) if b['operation']['kind']=='cells' for ci,c in enumerate(b['operation'].get('cells',[]))}
    candidate=deepcopy(payload)
    for bi,batch in enumerate(active_history):
        saved=deepcopy(batch);op=saved['operation']
        if op['kind']=='cells':
            cells=[]
            for ci,cell in enumerate(op.get('cells',[])):
                if last_cells.get((cell['record'],cell['field']))!=(bi,ci):continue
                old=raw_lookup.get(cell['record']);new=pairs.get(cell['record']);field=cell['field']
                if not old or not new or field not in newq or field not in oldq or newq[field]['kind']!=oldq[field]['kind']:lost+=1;continue
                conflict=identity('conflict_',batch.get('id',''),cell['record'],field)
                incoming=new['values'].get(field);original=old['values'].get(field)
                local=effective_lookup.get(cell['record'],old)['values'].get(field)
                if incoming!=original and incoming!=local:
                    conflicts.append({'id':conflict,'field':field,'row':new.get('row'),'before':original,'incoming':incoming,'local':local})
                    choice=matching.editResolutions.get(conflict)
                    if apply and choice not in {'local','incoming'}:raise ValueError('Choose incoming data or the local correction for every edit conflict.')
                    if choice=='incoming':continue
                cells.append({**cell,'record':new['id']})
            op['cells']=cells
            if not cells:continue
        try:apply_operation(candidate,op,replay=True,place_after_source=batch.get('inheritSourceSettings',False))
        except ValueError as exc:
            issues.append(str(exc));continue
        history.append(saved)
    if apply and (lost or issues) and not matching.discardEdits:raise ValueError('Acknowledge the local edits that cannot be carried into this source update.')
    if apply or materialize:
        payload['dataEdits']={'revision':revision(previous)+1,'history':history}
        effective_project(payload)
    return {'conflicts':conflicts,'lostCells':lost,'mappingIssues':list(dict.fromkeys(issues)),'preservedBatches':len(history)}
