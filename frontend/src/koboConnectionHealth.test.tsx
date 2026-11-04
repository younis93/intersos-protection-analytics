import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {replacementSuggestions,ruleIssue,conditionSummary} from './koboConnectionHealth';
import KoboConnections from './KoboConnections';
import type {KoboQuestion,KoboResult,KoboProject} from './koboTypes';
const fields=[{id:'main',name:'main',kind:'category',labels:{en:'Main reason'},choices:[{name:'other',labels:{en:'Other reason'}}],repeat:''}] as KoboQuestion[];
it('prioritizes normalized exact suggestions without choosing a replacement',()=>{
 const items=['other_extra','OTHER','unrelated'];expect(replacementSuggestions(items,'other',x=>[x])).toEqual(['OTHER','other_extra']);
 expect(replacementSuggestions(items,'',x=>[x])).toEqual([]);
});
it('validates references and renders current labels',()=>{
 expect(ruleIssue({type:'rule',field:'removed',operator:'eq',value:'other'},fields)).toBe('missing-rule-question');
 expect(ruleIssue({type:'rule',field:'main',operator:'eq',value:'removed'},fields)).toBe('missing-rule-answer');
 expect(ruleIssue({type:'group',match:'any',rules:[]},fields)).toBe('incomplete-condition');
 expect(conditionSummary({type:'rule',field:'main',operator:'eq',value:'other'},fields,'en')).toContain('Main reason equals “Other reason”');
});
it('shows broken active connections and keeps valid manual overrides healthy',()=>{
 const result={connections:{parents:[],conditions:[],issues:[],reviewIssues:['missing-rule-question'],diagnostics:[{code:'missing-rule-question',path:[0],field:'removed'}]}} as unknown as KoboResult;
 const project={form:{questions:fields}} as KoboProject;
 let html=renderToStaticMarkup(<KoboConnections result={result} project={project} language="en" onConfigure={()=>{}}/>);
 expect(html).toContain('Broken connection');expect(html).toContain('Broken connection · Edit');expect(html).not.toContain('removed');expect(html).toContain('>View</button>');
 result.connections={...result.connections!,source:'manual',parents:[{id:'main',name:'main',label:'Main',compatible:true,hidden:false,triggers:[]}],reviewIssues:[],diagnostics:[],conditions:[{source:'follow',expression:'unsupported()',readable:null,supported:false}]};
 html=renderToStaticMarkup(<KoboConnections result={result} project={project} language="en"/>);
 expect(html).toContain('is-connected');expect(html).not.toContain('Broken connection');
});


it('keeps source details accessible after the only dependency is ignored',()=>{
 const result={connections:{parents:[],conditions:[],issues:[],ignoredDependencies:[{type:'rule',field:'main',operator:'eq',value:'other'}]}} as unknown as KoboResult;
 const html=renderToStaticMarkup(<KoboConnections result={result} project={{form:{questions:fields}} as KoboProject} language="en"/>);
 expect(html).toContain('Condition ignored');expect(html).toContain('>View</button>');expect(html).toContain('>Edit</button>');
});


it('uses effective controllers and retains real errors when dependencies are ignored',()=>{
 const result={connections:{parents:[{id:'main',label:'Main'}],conditions:[],issues:[],reviewIssues:[],ignoredDependencies:[{type:'rule',field:'consent',operator:'eq',value:'yes'}]},respondentBasis:{kind:'question',parentId:'consent',issue:''}} as unknown as KoboResult;
 const project={form:{questions:fields}} as KoboProject;
 let html=renderToStaticMarkup(<KoboConnections result={result} project={project} language="en"/>);
 expect(html).toContain('Connected');expect(html).toContain('1 question');expect(html).not.toContain('2 questions');expect(html).toContain('1 ignored');
 result.connections!.reviewIssues=['missing-rule-question'];
 html=renderToStaticMarkup(<KoboConnections result={result} project={project} language="en"/>);expect(html).toContain('Broken connection');
 result.connections!.suspendedDependencies=true;
 html=renderToStaticMarkup(<KoboConnections result={result} project={project} language="en"/>);expect(html).toContain('Needs review');expect(html).not.toContain('Broken connection');
});
