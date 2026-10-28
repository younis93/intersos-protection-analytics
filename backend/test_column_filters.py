from io import BytesIO

import pandas as pd
import pytest
from openpyxl import load_workbook

from backend.column_filters import ColumnFilter, apply_column_filters, value_page


@pytest.fixture
def records():
    return pd.DataFrame({'ID':['001','002','003','004'], 'Name':['علي','ALI','Alice',''], 'Age':[10,20,30,None], 'Date':['2026-01-01','2026-01-02','2026-01-03',None]})


def test_values_empty_is_distinct_from_unrestricted(records):
    assert len(apply_column_filters(records,[{'column':'ID','values':None}])) == 4
    assert apply_column_filters(records,[{'column':'ID','values':[]}]).empty
    assert apply_column_filters(records,[{'column':'ID','values':['001']}]).ID.tolist() == ['001']


def test_typed_conditions_and_combined_columns(records):
    rules = [ColumnFilter(column='Age',type='number',condition={'operator':'between','value':'20','value2':'30'}),ColumnFilter(column='Name',condition={'operator':'starts_with','value':'ali'})]
    assert apply_column_filters(records,rules).ID.tolist() == ['002','003']
    assert apply_column_filters(records,[{'column':'Name','condition':{'operator':'equals','value':'علي'}}]).ID.tolist() == ['001']
    assert apply_column_filters(records,[{'column':'Age','condition':{'operator':'blank'}}]).ID.tolist() == ['004']


def test_dates_and_invalid_conditions(records):
    rule = {'column':'Date','type':'date','condition':{'operator':'date_between','value':'2026-01-01','value2':'2026-01-02'}}
    assert apply_column_filters(records,[rule]).ID.tolist() == ['001','002']
    rule['condition'] = {'operator':'date_before','value':'2026-01-02'}
    assert apply_column_filters(records,[rule]).ID.tolist() == ['001']
    with pytest.raises(ValueError): apply_column_filters(records,[{'column':'Age','type':'number','condition':{'operator':'between','value':'30','value2':'20'}}])
    with pytest.raises(ValueError): apply_column_filters(records,[{'column':'missing','values':[]}])
    assert len(apply_column_filters(records,[{'column':'Date','type':'date','values':['2026-01']}]))==3


def test_linked_facets_exclude_own_filter_and_page_full_cohort(records):
    rules=[{'column':'Name','values':['ALI']},{'column':'Age','type':'number','condition':{'operator':'gte','value':'20'}}]
    assert value_page(records,'Name',rules)['values'] == ['ALI','Alice']
    frame=pd.DataFrame({'ID':[f'{i:04}' for i in range(1200)]})
    page=value_page(frame,'ID',search='1',offset=100,limit=20)
    assert len(page['values'])==20 and page['total']>100
    filtered=apply_column_filters(frame,[{'column':'ID','valueSearch':'1','excluded':['0001']}])
    assert len(filtered)==page['total']-1


def test_explorer_pagination_export_agree():
    from backend.legal_platform import LegalStore
    store=LegalStore.__new__(LegalStore)
    from threading import RLock
    store._cache_lock=RLock();store._explorer_prepared={}
    store.frames={'test':pd.DataFrame({'ID':[f'{i:04}' for i in range(650)],'Amount':range(650)})}
    rules=[{'column':'Amount','type':'number','condition':{'operator':'gte','value':'600'}}]
    page=store.explorer('test',page=2,page_size=20,column_filters=rules)
    assert page['total']==50 and page['rows'][0]['ID']=='0620'
    content=store.explorer_export('test',column_filters=rules)
    workbook=load_workbook(BytesIO(content),read_only=True)
    rows=list(workbook.active.values)
    assert len(rows)==51 and rows[1][0]=='0600'
