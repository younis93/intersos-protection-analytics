import {koboLabel,type KoboProject,type KoboQuestion,type KoboSettings} from './koboTypes';
export type VisibilityChanges=Record<string,boolean>;
export type VisibilityGroup={id:string;label:string;path:string;depth:number;questionIds:string[]};
export const visibilityEnabled=(id:string,hidden:ReadonlySet<string>,changes:VisibilityChanges)=>changes[id]??!hidden.has(id);
export function visibilityGroups(project:KoboProject,language:string):VisibilityGroup[]{
 const groups=new Map(project.form.groups.map(group=>[group.id,group])),ordered:VisibilityGroup[]=[],seen=new Set<string>();
 const visit=(id:string,ancestors:string[]=[])=>{
  if(seen.has(id))return;seen.add(id);const group=groups.get(id);if(!group)return;
  const labels=[...ancestors,koboLabel(group,language)];ordered.push({id,label:labels.at(-1)!,path:labels.join(' / '),depth:ancestors.length,questionIds:[]});
  for(const child of project.form.groups)if(child.parent===id)visit(child.id,labels);
 };
 for(const group of project.form.groups)if(!group.parent||!groups.has(group.parent))visit(group.id);
 for(const group of project.form.groups)visit(group.id);
 for(const question of project.form.questions)if(question.group&&!ordered.some(group=>group.id===question.group))ordered.push({id:question.group,label:question.group,path:question.group,depth:0,questionIds:[]});
 ordered.push({id:'',label:language==='ar'?'بدون مجموعة':'Ungrouped fields',path:language==='ar'?'بدون مجموعة':'Ungrouped fields',depth:0,questionIds:[]});
 for(const question of project.form.questions){
  let id=question.group;const ancestors=new Set<string>([id]);
  while(id&&groups.get(id)?.parent&&!ancestors.has(groups.get(id)!.parent)){id=groups.get(id)!.parent;ancestors.add(id)}
  for(const group of ordered)if(ancestors.has(group.id))group.questionIds.push(question.id);
 }
 return ordered.filter(group=>group.questionIds.length>0);
}
export function visibilityMatches(question:KoboQuestion,language:string,path:string,query:string,kind:string,status:string,hidden:ReadonlySet<string>){
 const text=`${koboLabel(question,language)} ${question.name} ${question.id} ${path}`.normalize('NFC').toLocaleLowerCase();
 const typeMatches=kind==='all'||(kind==='metadata'?question.metadata:question.kind===kind&&!question.metadata);
 return text.includes(query.trim().normalize('NFC').toLocaleLowerCase())&&typeMatches&&(status==='all'||(status==='hidden')===hidden.has(question.id));
}
export function mergeVisibility(settings:KoboSettings,changes:VisibilityChanges,questions:KoboQuestion[]):KoboSettings{
 const valid=new Set(questions.map(question=>question.id)),hidden=new Set(settings.hidden);
 for(const[id,enabled]of Object.entries(changes))if(valid.has(id)){if(enabled)hidden.delete(id);else hidden.add(id)}
 return {...settings,hidden:[...hidden]};
}
