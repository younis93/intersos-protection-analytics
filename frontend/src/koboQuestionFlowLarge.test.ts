import {describe,it,expect} from 'vitest';
import {overviewFlowCollapsed,focusedFlowData,flowItems,flowAncestors,type FlowData} from './koboQuestionFlowModel';
import {layoutQuestionFlow,type FlowRouteData} from './koboQuestionFlowLayout';

function form(count:number):FlowData{
 const connections={parents:[],conditions:[],issues:[]};
 const group=(id:string,parent:string)=>({id,name:id,label:id,labels:{en:id},parent,repeat:id.endsWith('1'),groupPath:parent?[parent]:[],connections});
 const groups=[group('form',''),...Array.from({length:5},(_,i)=>group(`form/section-${i}`,'form'))];
 const questions=Array.from({length:count},(_,i)=>{const section=`form/section-${Math.min(4,Math.floor(i/(count/5)))}`;return {id:`q${i}`,name:`q${i}`,number:i+1,label:`Question ${i}`,labels:{en:`Question ${i}`},type:'select_one',kind:'category' as const,group:section,groupPath:['form',section],repeat:'',metadata:false,identifying:false,choices:[],connections}});
 const edge=(source:number,target:number,id:string)=>({id,source:`q${source}`,target:`q${target}`,label:`Question ${source} = Yes`,expression:`\${q${source}} = 'yes'`,review:false,compound:false});
 const edges=[edge(0,1,'first'),edge(1,0,'cycle'),edge(0,Math.ceil(count/5),'cross1'),edge(1,Math.ceil(count/5)+1,'cross2'),edge(2,Math.ceil(count/5)+2,'cross3')];
 for(let i=4;i<count;i+=4)if(questions[i-1].group===questions[i].group)edges.push(edge(i-1,i,`e${i}`));
 return {id:'large',name:'Large questionnaire',language:'en',questions,groups,edges};
}
describe('large-form flow review',()=>{
 it('opens wrappers while collapsing actual sections in an overview',()=>{
  const data=form(99),collapsed=overviewFlowCollapsed(data);
  expect(collapsed.has('form')).toBe(false);
  expect(collapsed.has('form/section-0')).toBe(true);
  expect(data.groups.filter(g=>collapsed.has(g.id))).toHaveLength(5);
 });
 it('focuses a section with direct neighbours, preserving original form and removing wrapper frames',()=>{
  const data=form(99),before=JSON.stringify(data),focused=focusedFlowData(data,'form/section-0');
  expect(focused.groups.some(g=>g.id==='form')).toBe(false);
  expect(focused.groups.find(g=>g.id==='form/section-0')?.parent).toBe('');
  expect(focused.questions.some(q=>q.id==='q20')).toBe(true);
  expect(focused.questions.some(q=>q.id==='q80')).toBe(false);
  const ids=new Set(flowItems(focused).keys());
  expect(focused.edges.every(e=>ids.has(e.source)&&ids.has(e.target))).toBe(true);
  expect(focused.questions.every(q=>!flowAncestors(q.id,flowItems(focused)).includes('form'))).toBe(true);
  expect(JSON.stringify(data)).toBe(before);
 });
 it.each([99,250])('routes and aggregates a %i-question overview without losing rules',async count=>{
  const data=form(count),graph=await layoutQuestionFlow(data,'flowchart',overviewFlowCollapsed(data));
  expect(graph.nodes.filter(n=>!n.data.group)).toHaveLength(0);
  expect(graph.nodes).toHaveLength(6);
  const aggregated=graph.edges.find(e=>(e.data as FlowRouteData)?.rules.length===3)!;
  expect(aggregated).toBeDefined();
  expect((aggregated.data as FlowRouteData).rules.map(e=>e.id)).toEqual(['cross1','cross2','cross3']);
  expect(graph.edges.every(e=>e.type==='flowRoute'&&(e.data as FlowRouteData).points.length>=2)).toBe(true);
 },20000);
 it.each([99,250])('routes all %i question cards with finite orthogonal paths outside card interiors',async count=>{
  const graph=await layoutQuestionFlow(form(count),'flowchart',new Set());
  expect(graph.nodes.filter(n=>!n.data.group)).toHaveLength(count);
  const absolute=new Map<string,{x:number;y:number}>();
  const leaves=graph.nodes.filter(node=>!graph.nodes.some(child=>child.parentId===node.id));
  for(const node of graph.nodes){const parent=node.parentId?absolute.get(node.parentId):undefined;absolute.set(node.id,{x:node.position.x+(parent?.x||0),y:node.position.y+(parent?.y||0)})}
  for(const edge of graph.edges){
   const route=edge.data as FlowRouteData;
   expect(route.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
   const labelWidth=Math.max(80,route.caption.length*6+20),label={left:route.labelPoint.x-labelWidth/2,right:route.labelPoint.x+labelWidth/2,top:route.labelPoint.y-13,bottom:route.labelPoint.y+13};
   for(const leaf of leaves){const p=absolute.get(leaf.id)!;expect(label.left<p.x+Number(leaf.style?.width)&&label.right>p.x&&label.top<p.y+Number(leaf.style?.height)&&label.bottom>p.y,`${edge.id} label covers ${leaf.id}`).toBe(false)}
   for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i];expect(Math.abs(a.x-b.x)<.1||Math.abs(a.y-b.y)<.1).toBe(true);
    for(const leaf of leaves){const p=absolute.get(leaf.id)!,right=p.x+Number(leaf.style?.width),bottom=p.y+Number(leaf.style?.height);
     const crosses=Math.abs(a.x-b.x)<.1?a.x>p.x+1&&a.x<right-1&&Math.max(a.y,b.y)>p.y+1&&Math.min(a.y,b.y)<bottom-1:a.y>p.y+1&&a.y<bottom-1&&Math.max(a.x,b.x)>p.x+1&&Math.min(a.x,b.x)<right-1;
     expect(crosses,`${edge.id} crosses ${leaf.id}`).toBe(false);
    }
   }
  }
 },20000);
});
