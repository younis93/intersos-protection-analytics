import type {KoboAnalysis,KoboResult} from './koboTypes';
type Group=KoboAnalysis['groups'][number];
export function excelGroupChain(snapshot:KoboAnalysis,id:string){
 const groups=new Map(snapshot.groups.map(group=>[group.id,group])),chain:Group[]=[],seen=new Set<string>();
 while(id&&!seen.has(id)){seen.add(id);const group=groups.get(id);if(!group)break;chain.unshift(group);id=group.parent}
 return chain;
}
export function excelGroupChoices(snapshot:KoboAnalysis){
 const counts=new Map<string,number>();
 for(const question of snapshot.questions)for(const group of excelGroupChain(snapshot,question.group))counts.set(group.id,(counts.get(group.id)||0)+1);
 return snapshot.groups.filter(group=>counts.has(group.id)).map(group=>{const chain=excelGroupChain(snapshot,group.id);return {...group,count:counts.get(group.id)!,depth:Math.max(0,chain.length-1),path:chain.map(group=>group.label||group.name).join(' / ')}});
}
export function defaultExcelGroups(snapshot:KoboAnalysis){return excelGroupChoices(snapshot).filter(group=>!group.parent||!snapshot.groups.some(parent=>parent.id===group.parent)).slice(0,2).map(group=>group.id)}
export function initialExcelGroups(snapshot:KoboAnalysis,saved?:string[]|null){const valid=new Set(excelGroupChoices(snapshot).map(group=>group.id));return saved==null?defaultExcelGroups(snapshot):saved.filter(id=>valid.has(id))}
export function excelSheetName(label:string,used:Set<string>){
 const original=Array.from(label.replace(/[\[\]:*?/\\\x00-\x1f]/g,' ').trim().replace(/^'+|'+$/g,'').trim()||'Analysis').slice(0,31).join('').replace(/[' ]+$/g,'')||'Analysis';
 let name=original,index=2;while(used.has(name.toLocaleLowerCase())){const suffix=` (${index++})`;name=Array.from(original).slice(0,31-suffix.length).join('')+suffix}used.add(name.toLocaleLowerCase());return name;
}
export function excelSheetPreview(snapshot:KoboAnalysis,selected:string[]){
 const sections=new Map<string,{id:string;label:string;path:string;kind:'group'|'combined'|'general';questions:KoboResult[]}>(),ids=new Set(selected),order=new Map(snapshot.groups.map((group,index)=>[group.id,index]));
 for(const question of snapshot.questions){
  const chain=excelGroupChain(snapshot,question.group),group=[...chain].reverse().find(group=>ids.has(group.id));
  const kind=group?'group':question.group?'combined':'general',id=group?.id||(kind==='combined'?'@combined':'@general'),label=group?.label||group?.name||(kind==='combined'?'Analysis':'General');
  let section=sections.get(id);if(!section){section={id,label,path:group?excelGroupChain(snapshot,group.id).map(group=>group.label||group.name).join(' / '):label,kind,questions:[]};sections.set(id,section)}section.questions.push(question);
 }
 const used=new Set(['data','workbook guide','_kobo choices','_kobo chart pivots','_kobo chart labels','_kobo slicer totals']);
 for(const group of snapshot.groups.filter(group=>group.repeat))excelSheetName(`Data - ${group.label||group.name}`,used);
 snapshot.questions.forEach((question,index)=>{if(question.kind==='multiple')excelSheetName(`_Kobo multi ${String(index+1).padStart(3,'0')}`,used)});
 return [...sections.values()].sort((a,b)=>(order.get(a.id)??order.size+(a.kind==='general'?1:0))-(order.get(b.id)??order.size+(b.kind==='general'?1:0))).map(section=>({...section,sheetName:excelSheetName(section.label,used)}));
}
