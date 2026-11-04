import {showRespondentPercentageControls} from './KoboHiddenAnswerControls';
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

it('shows only editing for unconnected questions',()=>{
 for(const language of ['en','ar'] as const){
  const html=renderToStaticMarkup(<KoboConnections result={{...result,connections:null,respondentBasis:null}} project={project} language={language} onConfigure={()=>{}}/>);
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).not.toContain(language==='en'?'View':'عرض');
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
it('keeps original Kobo logic visible with or without detected issues',()=>{
 const render=(value:KoboResult)=>renderToStaticMarkup(<KoboConnectionControls result={value} project={project} value={{} as KoboQuestionSettings} language="en" onChange={()=>{}}/>);
 expect(render(result)).toContain('<section class="kobo-original-connections"');
 expect(render(result)).not.toContain('<details class="kobo-original-logic"');
 expect(render({...result,connections:{...result.connections!,reviewIssues:['unsupported-condition']}})).toContain('<section class="kobo-original-connections"');
});

it('places hidden actions alongside the connection button and retains them for measures',()=>{
 const action=<button type="button">3 answers hidden</button>;
 const html=renderToStaticMarkup(<KoboConnections result={result} project={project} language="en" trailingAction={action}/>);
 expect(html).toContain('</button></div><button type="button">3 answers hidden</button></div>');
 const measured=renderToStaticMarkup(<KoboConnections result={{...result,measure:{operation:'sum',field:'main',decimals:0,label:'Sum',unit:'',parentValuesRepeated:false}}} project={project} language="ar" trailingAction={action}/>);
 expect(measured).toContain('3 answers hidden');expect(measured).toContain('dir="rtl"');expect(measured).not.toContain('Edit');
});


it('places View conditions before Edit connection and outside the condition summary',()=>{
 for(const language of ['en','ar'] as const){
  const html=renderToStaticMarkup(<KoboConnections result={result} project={project} language={language} onConfigure={()=>{}}/>);
  const view=language==='ar'?'عرض':'View',edit=language==='ar'?'تعديل':'Edit';
  expect(html.indexOf(view)).toBeLessThan(html.indexOf(edit));
  expect(html.match(new RegExp(view,'g'))).toHaveLength(1);
  expect(html).not.toContain('kobo-condition-card');
  expect(html).toContain('kobo-connection-action-group');
  expect(html).toContain('role="group"');
  expect(html).not.toContain('kobo-connection-card-issue');
 }
});


it('reserves parent percentage controls for legacy basis while keeping connection editing',()=>{
 const html=renderToStaticMarkup(<KoboConnectionControls result={result} project={project} value={{percentageMode:'grand-total'} as KoboQuestionSettings} language="en" onChange={()=>{}}/>);
 expect(html).not.toContain('Original base question');
 expect(html).toContain('Question connection');
});


it('shows respondent switches only for active connections or hidden answers',()=>{
 const plain={...result,connections:null,respondentBasis:null};
 const settings={} as KoboQuestionSettings;
 expect(showRespondentPercentageControls(plain,settings)).toBe(false);
 expect(showRespondentPercentageControls(result,settings)).toBe(true);
 expect(showRespondentPercentageControls(plain,{...settings,hiddenAnswers:['a']})).toBe(true);
 const ignored={...result,connections:{...result.connections!,effectiveTree:null,conditions:result.connections!.conditions.map(c=>({...c,status:'ignored'}))}};
 expect(showRespondentPercentageControls(ignored,settings)).toBe(false);
 for(const percentageMode of ['grand-total','row-total','column-total','breakdown-group'] as const){
  expect(showRespondentPercentageControls({...result,percentageMode},{...settings,hiddenAnswers:['a']})).toBe(false);
  const html=renderToStaticMarkup(<KoboConnectionControls result={result} project={project} value={{...settings,percentageMode}} language="en" onChange={()=>{}}/>);
  expect(html).not.toContain('Adjust %');
 }
 for(const candidate of [plain,ignored]){
  const html=renderToStaticMarkup(<KoboConnectionControls result={candidate} project={project} value={settings} language="en" onChange={()=>{}}/>);
  expect(html).not.toContain('Adjust %');
 }
 const hidden=renderToStaticMarkup(<KoboConnectionControls result={plain} project={project} value={{...settings,hiddenAnswers:['a']}} language="en" onChange={()=>{}}/>);
 expect(hidden).toContain('Adjust %');
 expect(hidden).not.toContain('Original base question');
});


it('selecting % of Respondents alone does not reveal respondent switches',()=>{
 const settings={percentageMode:'legacy-respondents'} as KoboQuestionSettings;
 const plain={...result,connections:null,respondentBasis:null};
 const ignored={...result,connections:{...result.connections!,effectiveTree:null,conditions:result.connections!.conditions.map(c=>({...c,status:'ignored'}))}};
 for(const candidate of [plain,ignored]){
  expect(showRespondentPercentageControls(candidate,settings)).toBe(false);
  const html=renderToStaticMarkup(<KoboConnectionControls section="percentages" result={candidate} project={project} value={settings} language="en" onChange={()=>{}}/>);
  expect(html).not.toContain('Adjust %');
  expect(html).not.toContain('Keep original %');
 }
 expect(showRespondentPercentageControls(result,settings)).toBe(true);
 const connected=renderToStaticMarkup(<KoboConnectionControls section="percentages" result={result} project={project} value={settings} language="en" onChange={()=>{}}/>);
 expect(connected).toContain('Adjust %');
 expect(connected).toContain('Keep original %');
});
