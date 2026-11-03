import {describe,it,expect} from 'vitest';
import {changeFlowVisibility,visibleFlowData,isFlowHidden,flowAncestors,flowChildren,flowItems,flowRelated,flowRepresentative,matchingFlowQuestions,TECHNICAL,type FlowData} from './koboQuestionFlowModel';
import {layoutQuestionFlow} from './koboQuestionFlowLayout';
import {flowGroupCardHeight} from './koboQuestionFlowSizing';

const connections={parents:[],conditions:[],issues:[]};
const question=(id:string,number:number,group='',groupPath:string[]=[])=>({id,name:id,labels:{en:id},label:id,number,type:'select_one',kind:'category' as const,group,groupPath,repeat:'',metadata:false,identifying:false,choices:[],connections});
const data:FlowData={id:'p',name:'Form',language:'en',questions:[question('first',1),question('child',2,'g/nested',['g','g/nested']),question('last',3),{...question('technical',4,'g',['g']),metadata:true}],groups:[{id:'g',name:'g',label:'Details',labels:{en:'Details'},parent:'',repeat:false,groupPath:[],connections},{id:'g/nested',name:'nested',label:'Members',labels:{en:'Members'},parent:'g',repeat:true,groupPath:['g'],connections}],edges:[{id:'e',source:'first',target:'g',label:'first = Yes',expression:"${first} = 'yes'",compound:false,review:false}]};

describe('question flow structure',()=>{
 it('hides and restores individual fields without changing the source form',()=>{
  const before=JSON.stringify(data),hidden=changeFlowVisibility(data,new Set(),'first','hide');
  expect(visibleFlowData(data,hidden).questions.map(q=>q.id)).not.toContain('first');
  expect(visibleFlowData(data,hidden).edges).toEqual([]);
  expect(visibleFlowData(data,changeFlowVisibility(data,hidden,'first','show')).questions).toHaveLength(4);
  expect(JSON.stringify(data)).toBe(before);
 });
 it('hides nested groups and restores only the chosen field with ancestor containers',()=>{
  const siblings={...data,questions:[...data.questions,question('sibling',5,'g/nested',['g','g/nested'])]};
  const hidden=changeFlowVisibility(siblings,new Set(),'g','hide');
  expect(isFlowHidden('child',flowItems(siblings),hidden)).toBe(true);
  expect(visibleFlowData(siblings,hidden).groups).toEqual([]);
  const shown=visibleFlowData(siblings,changeFlowVisibility(siblings,hidden,'child','show'));
  expect(shown.groups).toHaveLength(2);
  expect(shown.questions.map(q=>q.id)).toContain('child');
  expect(shown.questions.map(q=>q.id)).not.toContain('sibling');
  expect(visibleFlowData(siblings,changeFlowVisibility(siblings,hidden,'g','show')).questions).toHaveLength(5);
 });
 it('show only retains direct and inherited controllers without unrelated siblings',()=>{
  const focused=visibleFlowData(data,changeFlowVisibility(data,new Set(),'child','only'));
  expect(focused.questions.map(q=>q.id)).toEqual(['first','child']);
  expect(focused.groups.map(g=>g.id)).toEqual(['g','g/nested']);
  expect(focused.edges).toEqual(data.edges);
  expect(visibleFlowData(data,changeFlowVisibility(data,new Set(),'g','only')).questions.map(q=>q.id)).toEqual(['first','child']);
 });
 it('show only includes dependent groups and their contents without following indirect chains',()=>{
  const linked={...data,edges:[...data.edges,{...data.edges[0],id:'next',source:'child',target:'last'}]};
  const focused=visibleFlowData(linked,changeFlowVisibility(linked,new Set(),'first','only'));
  expect(focused.questions.map(q=>q.id)).toEqual(['first','child','technical']);
  const technicalHidden=changeFlowVisibility(data,new Set(),TECHNICAL,'hide');
  expect(visibleFlowData(data,technicalHidden).questions.map(q=>q.id)).not.toContain('technical');
 });
 it('sizes long English and Arabic group titles with room for footer actions',async()=>{
  const title='A very long group title covering household screening, disability and protection needs '.repeat(3);
  expect(flowGroupCardHeight(title)).toBeGreaterThan(140);
  expect(flowGroupCardHeight('تفاصيل الأسرة واحتياجات الحماية والدعم الإضافي '.repeat(5))).toBeGreaterThan(140);
  const long={...data,groups:data.groups.map(g=>g.id==='g'?{...g,label:title}:g)};
  const collapsed=await layoutQuestionFlow(long,'flowchart',new Set(['g']));
  expect(Number(collapsed.nodes.find(n=>n.id==='g')!.style!.height)).toBeGreaterThan(140);
  const expanded=await layoutQuestionFlow(long,'flowchart',new Set());
  const group=expanded.nodes.find(n=>n.id==='g')!,child=expanded.nodes.find(n=>n.id==='g/nested')!;
  expect(child.position.y).toBeGreaterThan(group.data.headerHeight);
 });
 it('orders mixed groups and questions and isolates metadata',()=>{
  expect(flowChildren(data).get('')).toEqual(['first','g','last',TECHNICAL]);
  expect(flowChildren(data).get(TECHNICAL)).toEqual(['technical']);
 });
 it('reveals ancestors and maps connections to outer collapsed containers',()=>{
  const items=flowItems(data);
  expect(flowAncestors('child',items)).toEqual(['g','g/nested']);
  expect(flowRepresentative('child',items,new Set(['g','g/nested']))).toBe('g');
  expect(flowRepresentative('technical',items,new Set([TECHNICAL]))).toBe(TECHNICAL);
 });
 it('searches group labels and retains inherited dependency relationships',()=>{
  expect(matchingFlowQuestions(data,'members').map(q=>q.id)).toEqual(['child']);
  expect([...flowRelated(data,'child').incoming]).toEqual(['first']);
  expect(flowRelated(data,'first').outgoing.has('child')).toBe(true);
 });
 it('lays out nested containers with parents before children and no sequential arrows',async()=>{
  const graph=await layoutQuestionFlow(data,'flowchart',new Set([TECHNICAL]));
  expect(graph.edges).toHaveLength(1);
  expect(graph.nodes.find(n=>n.id==='child')?.parentId).toBe('g/nested');
  expect(graph.nodes.findIndex(n=>n.id==='g')).toBeLessThan(graph.nodes.findIndex(n=>n.id==='g/nested'));
  expect(graph.nodes.some(n=>n.id==='technical')).toBe(false);
  expect(graph.nodes.every(n=>Number.isFinite(n.position.x)&&Number.isFinite(n.position.y))).toBe(true);
 });
 it('collapses nested questions and creates hierarchical mind map edges',async()=>{
  const collapsed=await layoutQuestionFlow(data,'flowchart',new Set(['g',TECHNICAL]));
  expect(collapsed.nodes.some(n=>n.id==='child')).toBe(false);
  expect(collapsed.edges[0].target).toBe('g');
  const mindmap=await layoutQuestionFlow(data,'mindmap',new Set([TECHNICAL]));
  expect(mindmap.edges.find(e=>e.target==='child')?.source).toBe('g/nested');
  expect(mindmap.edges.every(e=>e.id.startsWith('tree-'))).toBe(true);
 });
 it('handles cyclic connections without losing questions',async()=>{
  const cyclic={...data,edges:[...data.edges,{...data.edges[0],id:'back',source:'child',target:'first',review:true}]};
  const graph=await layoutQuestionFlow(cyclic,'flowchart',new Set());
  expect(graph.nodes.some(n=>n.id==='first')).toBe(true);
  expect(graph.edges).toHaveLength(2);
 });
 it('lays out a large questionnaire without losing fields',async()=>{
  const large:FlowData={...data,groups:[],questions:Array.from({length:250},(_,i)=>question(`field-${i}`,i+1)),edges:[]};
  const graph=await layoutQuestionFlow(large,'flowchart',new Set());
  expect(graph.nodes).toHaveLength(250);
  expect(graph.edges).toHaveLength(0);
  expect(graph.nodes.every(node=>Number.isFinite(node.position.y))).toBe(true);
 },15000);
});
