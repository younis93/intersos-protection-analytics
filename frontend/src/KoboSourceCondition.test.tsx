import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboSourceCondition from './KoboSourceCondition';
import {KoboOriginalConnections} from './KoboConnections';
import type {KoboProject,KoboResult} from './koboTypes';

const project={form:{questions:[{id:'a',name:'a',labels:{en:'Consent',ar:'الموافقة'}},{id:'b',name:'b',labels:{en:'Details'},relevant:"${a} = 'no'",connectionSetup:{pending:true,recovered:{relevant:'',inheritedRelevant:[{source:'group',expression:"${a} = 'yes'"}]}}}]}} as unknown as KoboProject;
describe('visible Kobo source conditions',()=>{
 it('shows recovered source rather than stale project conditions, including inherited rules and controlling labels',()=>{
  const html=renderToStaticMarkup(<KoboSourceCondition project={project} question="b" language="en"/>);
  expect(html).toContain('Original group condition');expect(html).toContain('Consent');expect(html).toContain('${a} = &#x27;yes&#x27;');expect(html).not.toContain('${a} = &#x27;no&#x27;');expect(html).toContain('dir="ltr"');expect(html).not.toContain('<details');
 });
 it('shows the evaluated readable rule alongside its exact source',()=>{
  const result={connections:{conditions:[{source:'group',expression:"${a} = 'yes'",readable:'Consent is Yes',supported:true}]}} as unknown as KoboResult;
  const html=renderToStaticMarkup(<KoboSourceCondition project={project} question="b" language="en" result={result}/>);expect(html).toContain('Consent is Yes');expect(html).toContain('${a}');
 });
 it('localizes source labels while preserving the expression direction',()=>{
  const html=renderToStaticMarkup(<KoboSourceCondition project={project} question="b" language="ar"/>);expect(html).toContain('الموافقة');expect(html).toContain('شرط المجموعة الأصلي');expect(html).toContain('dir="ltr"');
 });
 it('does not claim unconditional applicability when source verification failed',()=>{
  const copy=structuredClone(project);copy.form.questions[1].connectionSetup!.recovered=null;
  const html=renderToStaticMarkup(<KoboSourceCondition project={copy} question="b" language="en"/>);expect(html).toContain('could not be verified');expect(html).not.toContain("${a}");
 });
 it('keeps original expressions visible when manual overrides are active',()=>{
  const html=renderToStaticMarkup(<KoboOriginalConnections result={{id:'b',connections:{source:'manual',parents:[],issues:[],conditions:[{source:'b',expression:"${a} = 'yes'",readable:'Consent is Yes',supported:true}]}}} language="en"/>);expect(html).toContain('Consent is Yes');expect(html).toContain('${a}');expect(html).toContain('manual analysis rules');
 });
});
