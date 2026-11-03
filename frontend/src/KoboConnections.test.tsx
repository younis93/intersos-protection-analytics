import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboConnections,{KoboBasisSummary,KoboConnectionControls,KoboOriginalConnections} from './KoboConnections';
import type {KoboResult,KoboProject,KoboQuestionSettings} from './koboTypes';

const result={id:'follow',name:'follow',label:'Follow-up',kind:'category',group:'',repeat:'',denominator:5,missing:95,total:100,statistics:{},percentageBasis:'Respondents',colors:{},chart:'bar',rows:[],breakdowns:[],connections:{parents:[{id:'main',name:'main',label:'Main',hidden:true,compatible:true,triggers:['Other']}],conditions:[{source:'follow',expression:"${main} = 'other'",readable:'Main = Other',supported:true}],issues:[]},respondentBasis:{kind:'parent',parentId:'main',label:'Main',denominator:100,active:true,issue:'',hiddenMode:'adjust',repeatEntries:false}} as KoboResult;
const project={form:{questions:[{id:'follow',name:'follow',labels:{en:'Follow-up'},repeat:''},{id:'main',name:'main',labels:{en:'Main'},repeat:''},{id:'other/repeat',name:'unrelated',labels:{en:'Unrelated'},repeat:'other'}]},settings:{hidden:['main']}} as KoboProject;

it('keeps connection information compact and does not render a permanent panel',()=>{
 const html=renderToStaticMarkup(<KoboConnections result={result} project={project} language="en"/>);
 expect(html).toContain('Connected · 1 question · Edit');expect(html).toContain('aria-haspopup="dialog"');expect(html).not.toContain('<dialog');
});
it('explains the selected base and hidden-answer behavior in both languages',()=>{
 const html=renderToStaticMarkup(<KoboBasisSummary result={result} language="en"/>);
 expect(html).toContain('100');expect(html).toContain('Main');expect(html).toContain('Adjusted follow-up base');
 expect(renderToStaticMarkup(<KoboBasisSummary result={result} language="ar"/>)).toContain('dir="rtl"');
 const invalid={...result,respondentBasis:{...result.respondentBasis!,issue:'missing-parent',denominator:null}};
 expect(renderToStaticMarkup(<KoboBasisSummary result={invalid} language="en"/>)).toContain('Percentage base unavailable');
});
it('offers explicit parent selection while preserving an unavailable selection for repair',()=>{
 const value={percentageBase:'parent',percentageParent:'removed'} as KoboQuestionSettings;
 const html=renderToStaticMarkup(<KoboConnectionControls result={result} project={project} value={value} language="en" onChange={()=>{}}/>);
 expect(html).toContain('Question connection');expect(html).toContain('Review this question');expect(html).toContain('Original base question');
 expect(renderToStaticMarkup(<KoboConnectionControls result={result} project={project} value={value} language="ar" onChange={()=>{}}/>)).toContain('ارتباط السؤال');
});

it('always shows original expressions and missing references alongside a manual connection',()=>{
 const missing={...result,connections:{...result.connections!,source:'manual' as const,conditions:[{source:'follow',expression:"${removed_parent} = 'old_answer'",readable:null,supported:false}],unresolvedReferences:[{reference:'removed_parent',source:'follow'}]}};
 for(const language of ['en','ar'] as const){
  const html=renderToStaticMarkup(<KoboOriginalConnections result={missing} language={language}/>);
  expect(html).toContain('removed_parent');expect(html).toContain('old_answer');expect(html).not.toContain('<details');
 }
 const html=renderToStaticMarkup(<KoboConnectionControls result={missing} project={project} value={{connectionSource:'manual'} as KoboQuestionSettings} language="en" onChange={()=>{}}/>);
 expect(html).toContain('Original Kobo connection');expect(html).toContain('Missing or unresolved question');expect(html).toContain('removed_parent');
});

it('combines connection status and editing into one button for unconnected questions',()=>{
 for(const language of ['en','ar'] as const){
  const html=renderToStaticMarkup(<KoboConnections result={{...result,connections:null,respondentBasis:null}} project={project} language={language} onConfigure={()=>{}}/>);
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain(language==='en'?'No connection · Edit':'لا يوجد ارتباط · تعديل');
  expect(html).not.toContain('Set connection');
 }
});

it('uses a compact empty state and keeps calculation-specific connections visible',()=>{
 const unlinked={...result,connections:null,respondentBasis:null};
 const html=renderToStaticMarkup(<KoboConnectionControls result={unlinked} project={project} value={{} as KoboQuestionSettings} language="en" onChange={()=>{}}/>);
 expect(html).toContain('Add manual connection');expect(html).not.toContain('No original condition is stored');
 for(const operation of ['sum','average','unique'] as const){
  const measured=renderToStaticMarkup(<KoboConnectionControls result={result} project={project} value={{calculation:{operation,field:'main',decimals:0}} as KoboQuestionSettings} language="en" onChange={()=>{}}/>);
  expect(measured).toContain('Question connection');expect(measured).toContain('Switch the calculation to Count');expect(measured).not.toContain('Condition mode');
 }
});
it('collapses original logic by default and expands detected issues',()=>{
 const render=(value:KoboResult)=>renderToStaticMarkup(<KoboConnectionControls result={value} project={project} value={{} as KoboQuestionSettings} language="en" onChange={()=>{}}/>);
 expect(render(result)).toContain('<details class="kobo-original-logic">');
 expect(render({...result,connections:{...result.connections!,reviewIssues:['unsupported-condition']}})).toContain('<details class="kobo-original-logic" open="">');
});

it('places hidden actions alongside the connection button and retains them for measures',()=>{
 const action=<button type="button">3 answers hidden</button>;
 const html=renderToStaticMarkup(<KoboConnections result={result} project={project} language="en" trailingAction={action}/>);
 expect(html).toContain('</button><button type="button">3 answers hidden</button></div>');
 const measured=renderToStaticMarkup(<KoboConnections result={{...result,measure:{operation:'sum',field:'main',decimals:0,label:'Sum',unit:'',parentValuesRepeated:false}}} project={project} language="ar" trailingAction={action}/>);
 expect(measured).toContain('3 answers hidden');expect(measured).toContain('dir="rtl"');expect(measured).not.toContain('Edit');
});
