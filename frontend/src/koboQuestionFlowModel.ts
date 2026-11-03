import type {KoboConnections,KoboGroup,KoboQuestion} from './koboTypes';

export type FlowView='flowchart'|'mindmap'|'outline';
export type FlowQuestion=KoboQuestion&{label:string;number:number;groupPath:string[];connections:KoboConnections};
export type FlowGroup=KoboGroup&{label:string;groupPath:string[];connections:KoboConnections};
export type FlowItem=FlowQuestion|FlowGroup;
export type FlowData={id:string;name:string;language:'en'|'ar';questions:FlowQuestion[];groups:FlowGroup[];edges:{id:string;source:string;target:string;label:string|null;expression:string;review:boolean;compound:boolean}[]};
export const TECHNICAL='@technical';
export const GENERAL='@general';
export const ROOT='@form';
export const isQuestion=(item:FlowItem):item is FlowQuestion=>'number' in item;
export const isTechnical=(q:FlowQuestion)=>q.metadata||q.type==='calculate';
export function flowItems(data:FlowData):Map<string,FlowItem>{return new Map<string,FlowItem>([...data.groups,...data.questions].map(item=>[item.id,item]))}
export function flowParent(item:FlowItem){return isQuestion(item)?isTechnical(item)?TECHNICAL:item.group:item.parent}
export function flowAncestors(id:string,items:Map<string,FlowItem>):string[]{
 const ancestors:string[]=[],seen=new Set<string>();let parent=items.has(id)?flowParent(items.get(id)!):'';
 while(parent&&!seen.has(parent)){seen.add(parent);ancestors.unshift(parent);parent=items.has(parent)?flowParent(items.get(parent)!):''}
 return ancestors;
}
export function flowRepresentative(id:string,items:Map<string,FlowItem>,collapsed:Set<string>){return flowAncestors(id,items).find(parent=>collapsed.has(parent))||id}
export function flowChildren(data:FlowData){
 const children=new Map<string,string[]>(),order=new Map<string,number>();
 for(const q of data.questions){order.set(q.id,q.number);for(const group of q.groupPath)order.set(group,Math.min(order.get(group)??Infinity,q.number))}
 for(const item of [...data.groups,...data.questions]){const parent=flowParent(item);children.set(parent,[...(children.get(parent)||[]),item.id])}
 if(data.questions.some(isTechnical))children.set('',[...(children.get('')||[]),TECHNICAL]);
 for(const ids of children.values())ids.sort((a,b)=>(order.get(a)??Infinity)-(order.get(b)??Infinity));
 return children;
}
export function matchingFlowQuestions(data:FlowData,search:string){const needle=search.trim().toLocaleLowerCase();return data.questions.filter(q=>!needle||[q.label,q.name,q.id,...q.groupPath.map(id=>data.groups.find(g=>g.id===id)?.label||id)].some(value=>value.toLocaleLowerCase().includes(needle)))}
export function flowRelated(data:FlowData,selected:string){
 const incoming=new Set<string>(),outgoing=new Set<string>();
 const q=[...data.questions,...data.groups].find(item=>item.id===selected);
 const targets=new Set([selected,...(q?.groupPath||[])]);
 for(const edge of data.edges){if(targets.has(edge.target))incoming.add(edge.source);if(edge.source===selected){outgoing.add(edge.target);for(const child of data.questions)if(child.groupPath.includes(edge.target))outgoing.add(child.id)}}
 return {incoming,outgoing,all:new Set([selected,...incoming,...outgoing])};
}
export function readFlowView(projectId:string):FlowView{try{const view=localStorage.getItem(`kobo-question-flow-view:${projectId}`);if(view==='mindmap'||view==='outline')return view}catch{}return 'flowchart'}

export type FlowVisibilityAction='show'|'hide'|'only';
export function flowSubtree(data:FlowData,id:string){
 const children=flowChildren(data),result=new Set<string>(),pending=[id];
 while(pending.length){const key=pending.pop()!;if(result.has(key))continue;result.add(key);pending.push(...children.get(key)||[])}
 return result;
}
export function isFlowHidden(id:string,items:Map<string,FlowItem>,hidden:Set<string>){return hidden.has(id)||flowAncestors(id,items).some(parent=>hidden.has(parent))}
export function changeFlowVisibility(data:FlowData,hidden:Set<string>,id:string,action:FlowVisibilityAction):Set<string>{
 const items=flowItems(data),subtree=flowSubtree(data,id);
 if(action==='hide')return new Set([...hidden,...subtree]);
 if(action==='show')return new Set([...hidden].filter(key=>!subtree.has(key)&&!flowAncestors(id,items).includes(key)));
 const included=new Set(subtree);
 // Compute connections from the original scope only, without recursively following links.
 for(const key of subtree){
  const related=flowRelated(data,key);
  for(const parent of related.incoming)included.add(parent);
  for(const dependent of related.outgoing)for(const child of flowSubtree(data,dependent))included.add(child);
 }
 for(const key of [...included])for(const ancestor of flowAncestors(key,items))included.add(ancestor);
 return new Set([...items.keys(),TECHNICAL].filter(key=>!included.has(key)));
}
export function visibleFlowData(data:FlowData,hidden:Set<string>):FlowData{
 const items=flowItems(data),visible=(id:string)=>!isFlowHidden(id,items,hidden);
 return {...data,questions:data.questions.filter(q=>visible(q.id)),groups:data.groups.filter(g=>visible(g.id)),edges:data.edges.filter(edge=>visible(edge.source)&&visible(edge.target))};
}

export type FlowPresentation='overview'|'all';
export function overviewFlowCollapsed(data:FlowData):Set<string>{
 const children=flowChildren(data),groups=new Set(data.groups.map(group=>group.id));
 const collapsed=new Set<string>([TECHNICAL,...groups]);
 function openWrapper(id:string,seen=new Set<string>()){
  if(seen.has(id))return;seen.add(id);
  const ids=children.get(id)||[],subgroups=ids.filter(key=>groups.has(key));
  // Retain structural wrappers, while actual sections remain compact cards.
  if(subgroups.length&&ids.every(key=>groups.has(key))){collapsed.delete(id);for(const key of subgroups)openWrapper(key,seen)}
 }
 for(const id of children.get('')||[])if(groups.has(id))openWrapper(id);
 return collapsed;
}

export function focusedFlowData(data:FlowData,section:string):FlowData{
 const scoped=visibleFlowData(data,changeFlowVisibility(data,new Set(),section,'only'));
 const items=flowItems(data),wrappers=new Set(flowAncestors(section,items));
 const groups=scoped.groups.filter(group=>!wrappers.has(group.id)),retained=new Set(groups.map(group=>group.id));
 function parent(id:string){const seen=new Set<string>();while(id&&!retained.has(id)&&!seen.has(id)){seen.add(id);id=items.has(id)?flowParent(items.get(id)!):''}return id}
 const questions=scoped.questions.map(q=>({...q,group:parent(q.group),groupPath:q.groupPath.filter(id=>retained.has(id))}));
 const ids=new Set([...questions.map(q=>q.id),...retained]);
 return {...scoped,questions,groups:groups.map(g=>({...g,parent:parent(g.parent),groupPath:g.groupPath.filter(id=>retained.has(id))})),edges:scoped.edges.map(edge=>({...edge,target:wrappers.has(edge.target)?section:edge.target})).filter(edge=>ids.has(edge.source)&&ids.has(edge.target))};
}
