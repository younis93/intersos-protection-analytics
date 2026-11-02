"""Isolated synthetic sources for measured pivots and update review UI."""
import sys,tempfile,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
import uvicorn
from backend.kobo import ProjectStore,parse_form,parse_data,propose_mapping,normalize,KoboSettings,QuestionSettings
from backend.kobo_api import make_router
from backend.custom_analysis import make_custom_router,read_tables,table_data,initial_columns,Configuration,build
from backend.test_kobo import workbook
def main():
    root=Path(__file__).resolve().parents[1];temporary=tempfile.TemporaryDirectory(prefix='analysis-features-');app=FastAPI();saved={}
    raw=b'code,answer,amount,region\n001,A,10,north\n002,B,20,south\n003,A,30,south\n'
    for workspace in ['kobo','custom']:
        store=ProjectStore(Path(temporary.name)/(workspace+'.sqlite3'))
        if workspace=='kobo':
            formraw=workbook({'survey':[['type','name','label'],['text','code','Code'],['select_one answers','answer','Answer'],['decimal','amount','Amount'],['select_one regions','region','Region']], 'choices':[['list_name','name','label'],['answers','A','A'],['answers','B','B'],['regions','north','North'],['regions','south','South']]})
            form=parse_form(formraw);tables=parse_data(raw,'source.csv');links,_=propose_mapping(form,tables);records,issues=normalize(form,tables,links)
            payload={'form':form,'records':records,'mappings':links,'policies':{},'issues':issues,'warnings':[],'source':{'filename':'baseline.csv'}}
        else:
            tables=read_tables(raw,'source.csv');config=Configuration(worksheet='CSV');headers,rows=table_data(tables,config);columns=initial_columns(headers,rows)
            for column in columns:column.kind='number' if column.header=='amount' else 'text' if column.header=='code' else 'category';column.label=column.header.title()
            config.columns=columns;payload,_=build(tables,config,columns);formraw=b'';payload['source']['filename']='baseline.csv'
        ids={q['name'].lower():q['id'] for q in payload['form']['questions']}
        settings=KoboSettings(hidden=[ids['code'],ids['amount'],ids['region']],filterFields=[ids['region']],questions={ids['answer']:QuestionSettings(chart='bar',breakdowns=[ids['region']])})
        project=store.create('Analysis features - '+workspace,payload,formraw,raw,settings)
        saved[workspace]={'id':project['id'],'ids':ids,'settings':settings.model_dump(),'answerName':next(q['name'] for q in payload['form']['questions'] if q['id']==ids['answer'])}
        if workspace=='custom':
            app.include_router(make_custom_router(store));router=make_router(store,prefix='/api/custom');router.routes=[r for r in router.routes if '/imports/' not in r.path and not r.path.endswith('/review')]
        else:router=make_router(store)
        app.include_router(router)
    output=root/'output'/'analysis-features';output.mkdir(parents=True,exist_ok=True);(output/'fixture.json').write_text(json.dumps(saved))
    app.mount('/',StaticFiles(directory=root/'frontend'/'dist',html=True))
    uvicorn.run(app,host='127.0.0.1',port=5397,log_level='warning')

if __name__=='__main__':main()
