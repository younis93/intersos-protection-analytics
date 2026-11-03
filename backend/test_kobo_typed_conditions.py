import pytest
from backend.kobo_connection_rules import validate_tree,tree_issues,matches_tree,excel_condition,describe_tree,parse_condition

def rule(operator,value='',value2='',field='source'):
    return dict(type='rule',field=field,operator=operator,value=value,value2=value2)
def fields(kind):
    return {'source':dict(id='source',name='source',labels={'en':'Source'},kind=kind,repeat='',choices=[])}
child=dict(id='follow',repeat='')
@pytest.mark.parametrize('operator,actual,expected,result',[
 ('contains','BAGHDAD *?%','baghdad',True),('contains','abc','*',False),('contains','x*?%y','*?%',True),
 ('not-contains','abc','*',True),('starts-with','BAGhdad','bag',True),('ends-with','BAGhdad','DAD',True),
 ('contains','بغداد الجديدة','بغداد',True),('not-contains','','x',False),('not-contains','   ','x',False),
 ('contains',None,'x',False),('eq','Abc','abc',False),('neq','','x',True)])
def test_text_matching(operator,actual,expected,result):
    node=rule(operator,expected)
    assert tree_issues(node,child,fields('text'))==[]
    assert matches_tree(node,lambda _:actual,{'source':'text'})==result

@pytest.mark.parametrize('kind,lower,upper,actual', [('number',-2.5,0,-2.5),('number',-2.5,0,0),('date','2026-01-01','2026-02-01','2026-02-01')])
def test_inclusive_ranges(kind,lower,upper,actual):
    node=rule('between',lower,upper)
    assert tree_issues(node,child,fields(kind))==[]
    assert matches_tree(node,lambda _:actual,{'source':kind})
    assert not matches_tree({**node,'operator':'not-between'},lambda _:actual,{'source':kind})
    assert not matches_tree({**node,'operator':'not-between'},lambda _:None,{'source':kind})
    assert 'between' in describe_tree(node,fields(kind),'en')

@pytest.mark.parametrize('kind,node,issue',[
 ('number',rule('between',1),'missing-rule-range'),('number',rule('between',2,1),'reversed-rule-range'),
 ('number',rule('between','nan',2),'invalid-rule-number'),('date',rule('between','2026-02-02','2026-01-01'),'reversed-rule-range'),
 ('date',rule('eq','2026-02-30'),'invalid-rule-date'),('category',rule('contains','a'),'incompatible-rule-operator'),
 ('text',rule('gt',3),'incompatible-rule-operator')])
def test_validation(kind,node,issue):
    assert tree_issues(node,child,fields(kind))==[issue]

@pytest.mark.parametrize('operator,actual,expected,result',[('gt','2026-02-01','2026-01-01',True),('lte','2026-01-01','2026-01-01',True),('lt','2026-02-01','2026-01-01',False)])
def test_date_order(operator,actual,expected,result):
    node=rule(operator,expected)
    assert tree_issues(node,child,fields('date'))==[]
    assert matches_tree(node,lambda _:actual,{'source':'date'})==result

def test_formula_generation_and_settings_roundtrip():
    from backend.kobo import QuestionSettings
    from backend.kobo_excel_source import QUERY_BODY
    node=rule('contains','*?%')
    formula=excel_condition(node,lambda _:'A2',{'source':'text'})
    assert 'FIND(LOWER("*?%"),LOWER(A2&""))' in formula
    assert 'LEN(TRIM' in formula
    assert 'SEARCH' not in formula
    assert 'LEFT(' in excel_condition(rule('starts-with','a'),lambda _:'A2',{'source':'text'})
    assert 'RIGHT(' in excel_condition(rule('ends-with','a'),lambda _:'A2',{'source':'text'})
    assert 'NOT(AND(A2>=-2.5,A2<=0))' in excel_condition(rule('not-between',-2.5,0),lambda _:'A2',{'source':'number'})
    assert 'INT(A2)>=DATE(2026,1,1)' in excel_condition(rule('gte','2026-01-01'),lambda _:'A2',{'source':'date'})
    assert 'INT(A2)<=DATE(2026,2,1)' in excel_condition(rule('between','2026-01-01','2026-02-01'),lambda _:'A2',{'source':'date'})
    for operator in ['contains','not-contains','starts-with','ends-with','between','not-between']:assert '"'+operator+'"' in QUERY_BODY
    tree={'type':'group','match':'all','rules':[rule('between',1,2),rule('not-between',4,5)]}
    assert QuestionSettings.model_validate_json(QuestionSettings(connectionRules=tree).model_dump_json()).connectionRules==tree
    with pytest.raises(ValueError):validate_tree(rule('between',1,float('inf')))

def test_nested_and_or_preserve_detected_parser():
    tree={'type':'group','match':'any','rules':[rule('between',0,2),rule('gt',10)]}
    assert matches_tree(tree,lambda _:11,{'source':'number'})
    with pytest.raises(ValueError):parse_condition("contains(${source}, 'x')",child,fields('text'))


def test_new_operators_filter_analysis_and_prepared_export_cohorts():
    from backend.test_kobo_answer_order import fixture
    from backend.kobo import analyze,KoboSettings,QuestionSettings
    from backend.kobo_excel_source import response_layout,query_config
    from backend.kobo_excel_direct import direct_helpers
    p=fixture()
    for node,expected in [(rule('between',0,0,field='number'),1),(rule('gte','2026-02-01',field='date'),6)]:
        cfg=QuestionSettings(connectionSource='manual',connectionRules={'type':'group','match':'all','rules':[node]})
        settings=KoboSettings(questions={'answer':cfg})
        snapshot=analyze(p,settings,'answer')
        assert snapshot['questions'][0]['denominator']==expected
        layouts=response_layout(p,settings)
        config=query_config(p,snapshot,settings,[],layouts)
        assert config['questions'][0]['connectionTree']['rules'][0]==node
        helpers,sources=direct_helpers(config,layouts)
        assert any('IFERROR(AND(' in str(formula) for group in helpers.values() for formula in group.values())
