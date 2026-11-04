import ELK from 'elkjs/lib/elk.bundled.js';
import type {ElkNode,ElkExtendedEdge} from 'elkjs/lib/elk-api';
import {MarkerType,Position,type Node,type Edge} from '@xyflow/react';
import {flowChildren,flowItems,flowParent,flowRepresentative,isQuestion,isTechnical,ROOT,TECHNICAL,type FlowData,type FlowItem,type FlowView} from './koboQuestionFlowModel';
import {flowGroupCardHeight} from './koboQuestionFlowSizing';

export type FlowNodeData=Record<string,unknown>&{item?:FlowItem;label:string;group:boolean;technical?:boolean;collapsed:boolean;count:number;horizontal:boolean;headerHeight:number};
export type DiagramNode=Node<FlowNodeData>;
export type FlowPoint={x:number;y:number};
export type FlowRouteData=Record<string,unknown>&{points:FlowPoint[];labelPoint:FlowPoint;rules:FlowData['edges'];caption:string;aggregated:boolean;showLabel?:boolean;onInspect?:()=>void};
export type DiagramEdge=Edge<FlowRouteData>;
const elk=new ELK();
const width=300,height=124;
export async function layoutQuestionFlow(data:FlowData,view:Exclude<FlowView,'outline'>,collapsed:Set<string>){
 const items=flowItems(data),horizontal=view==='mindmap',nodes:DiagramNode[]=[],edges:Edge[]=[];
 if(typeof document!=='undefined')await document.fonts?.ready;
 const context=typeof document!=='undefined'?document.createElement('canvas').getContext('2d'):null;
 if(context)context.font=`650 13px ${getComputedStyle(document.body).fontFamily}`;
 const groupHeight=(label:string)=>flowGroupCardHeight(label,context?text=>context.measureText(text).width:undefined);
 const children=flowChildren(data);
 const visible=(id:string)=>flowRepresentative(id,items,collapsed)===id;
 const nodeData=(id:string):FlowNodeData=>{const item=items.get(id),technical=id===TECHNICAL,group=!item||!isQuestion(item),label=technical?(data.language==='ar'?'الحقول التقنية والحسابات':'Technical & calculated fields'):id===ROOT?data.name:item!.label;return {item,label,group,technical,collapsed:collapsed.has(id),count:data.questions.filter(q=>technical?isTechnical(q):q.groupPath.includes(id)).length,horizontal,headerHeight:group?groupHeight(label):height}};
 const mappedEdges=data.edges.flatMap(edge=>{const source=flowRepresentative(edge.source,items,collapsed),target=flowRepresentative(edge.target,items,collapsed);return source!==target||edge.source===edge.target?[{...edge,source,target}]:[]});
 if(horizontal){
  const ids=[ROOT,...items.keys(),...(data.questions.some(isTechnical)?[TECHNICAL]:[])].filter(visible);
  const treeEdges=ids.filter(id=>id!==ROOT).map((id,index)=>({id:`tree-${index}`,sources:[items.has(id)?flowParent(items.get(id)!)||ROOT:ROOT],targets:[id]}));
  const graph=await elk.layout({id:'layout',layoutOptions:{'elk.algorithm':'layered','elk.separateConnectedComponents':'false','elk.direction':'RIGHT','elk.spacing.nodeNode':'18','elk.layered.spacing.nodeNodeBetweenLayers':'64','elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES','elk.layered.crossingMinimization.forceNodeModelOrder':'true','elk.layered.considerModelOrder.components':'MODEL_ORDER'},children:ids.map(id=>({id,width,height:nodeData(id).headerHeight})),edges:treeEdges});
  for(const child of graph.children||[])nodes.push({id:child.id,type:'flowCard',position:{x:child.x||0,y:child.y||0},data:nodeData(child.id),style:{width,height:child.height},sourcePosition:Position.Right,targetPosition:Position.Left});
  for(const edge of treeEdges)edges.push({id:edge.id,source:edge.sources[0],target:edge.targets[0],type:'smoothstep',className:'qf-tree-edge'});
 }else{
  const groups=new Map<string,{id:string;source:string;target:string;rules:FlowData['edges']}>();
  for(const edge of mappedEdges){
   const key=JSON.stringify([edge.source,edge.target]),existing=groups.get(key);
   const rule=data.edges.find(original=>original.id===edge.id)!;
   if(existing)existing.rules.push(rule);else groups.set(key,{id:edge.id,source:edge.source,target:edge.target,rules:[rule]});
  }
  const routed=[...groups.values()];
  const caption=(entry:typeof routed[number])=>{
   if(entry.rules.length>1)return `${entry.rules.length} ${data.language==='ar'?'روابط':'connections'}`;
   const rule=entry.rules[0],sourceLabel=items.get(rule.source)?.label||'',prefix=data.language==='ar'?'إذا ':'If ';
   const readable=rule.label?.startsWith(sourceLabel+' ')?prefix+rule.label.slice(sourceLabel.length+1).replace(/^=\s*/,''):rule.label;
   const text=rule.compound?(data.language==='ar'?'عرض الشروط':'View conditions'):readable||(data.language==='ar'?'تحتاج مراجعة':'Needs review');
   return text.length>56?text.slice(0,53)+'…':text;
  };
  function build(parent:string,seen=new Set<string>()):ElkNode[]{
   return (children.get(parent)||[]).filter(visible).filter(id=>!seen.has(id)).map(id=>{
    const next=new Set([...seen,id]),info=nodeData(id),expanded=info.group&&!collapsed.has(id),nested=expanded?build(id,next):[];
    return {id,width,height:info.headerHeight,layoutOptions:{'elk.padding':`[top=${info.headerHeight+16},left=18,bottom=18,right=18]`},...(nested.length?{children:nested}:{})};
   });
  }
  const sectionOrder:ElkExtendedEdge[]=[];
  for(const siblings of children.values()){const sections=siblings.filter(id=>visible(id)&&items.has(id)&&!isQuestion(items.get(id)!));for(let i=1;i<sections.length;i++)sectionOrder.push({id:`@section-order-${sectionOrder.length}`,sources:[sections[i-1]],targets:[sections[i]]})}
  const input:ElkNode={id:'@layout',layoutOptions:{
   'elk.algorithm':'layered','elk.separateConnectedComponents':'false','elk.direction':'DOWN','elk.edgeRouting':'ORTHOGONAL','elk.hierarchyHandling':'INCLUDE_CHILDREN',
   'elk.spacing.nodeNode':'28','elk.spacing.componentComponent':'36','elk.aspectRatio':'1.5',
   'elk.layered.spacing.nodeNodeBetweenLayers':'64','elk.layered.spacing.edgeNodeBetweenLayers':'22',
   'elk.spacing.edgeNode':'18','elk.spacing.edgeEdge':'14','elk.layered.considerModelOrder.strategy':'NODES_AND_EDGES','elk.layered.crossingMinimization.forceNodeModelOrder':'true','elk.layered.considerModelOrder.components':'MODEL_ORDER','elk.layered.compaction.connectedComponents':'true',
  },children:build(''),edges:[...sectionOrder,...routed.map(entry=>({id:entry.id,sources:[entry.source],targets:[entry.target],labels:[{text:caption(entry),width:Math.max(80,caption(entry).length*6+20),height:26,layoutOptions:{'elk.edgeLabels.placement':'CENTER'}}]}))]};
  const graph=await elk.layout(input),absolute=new Map<string,FlowPoint>([['@layout',{x:0,y:0}]]);
  function flatten(parent:ElkNode,offset:FlowPoint){
   for(const child of parent.children||[]){
    const pos={x:child.x||0,y:child.y||0},abs={x:offset.x+pos.x,y:offset.y+pos.y};absolute.set(child.id,abs);
    nodes.push({id:child.id,type:'flowCard',parentId:parent.id==='@layout'?undefined:parent.id,position:pos,data:nodeData(child.id),style:{width:child.width,height:child.height},sourcePosition:Position.Bottom,targetPosition:Position.Top});
    flatten(child,abs);
   }
  }
  flatten(graph,{x:0,y:0});
  const inputEdges=new Map(routed.map(entry=>[entry.id,entry]));
  function collect(parent:ElkNode){
   for(const result of parent.edges||[]){
    const entry=inputEdges.get(result.id);if(!entry)continue;
    const container=(result as ElkExtendedEdge&{container?:string}).container||parent.id,offset=absolute.get(container)||{x:0,y:0};
    const sections=result.sections||[],points:FlowPoint[]=[];
    for(const section of sections)for(const point of [section.startPoint,...section.bendPoints||[],section.endPoint])points.push({x:point.x+offset.x,y:point.y+offset.y});
    if(!points.length)throw new Error('A connection could not be routed.');
    const label=result.labels?.[0],end=points[points.length-1];
    const labelPoint=label&&label.x!==undefined&&label.y!==undefined?{x:offset.x+label.x+(label.width||0)/2,y:offset.y+label.y+(label.height||0)/2}:{x:end.x+20,y:end.y-25};
    edges.push({id:entry.id,source:entry.source,target:entry.target,type:'flowRoute',markerEnd:{type:MarkerType.ArrowClosed},data:{points,labelPoint,rules:entry.rules,caption:caption(entry),aggregated:entry.rules.length>1},className:entry.rules.some(rule=>rule.review)?'qf-review-edge':''});
   }
   for(const child of parent.children||[])collect(child);
  }
  collect(graph);
 }

 return {nodes,edges};
}
