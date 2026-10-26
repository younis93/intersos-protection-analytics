import {koboLabel,type KoboForm,type KoboMapping,type KoboGroup} from './koboTypes';

export function groupRepeatScope(groups:KoboGroup[],id:string):string|undefined{
 const seen=new Set<string>(),byId=new Map(groups.map(g=>[g.id,g]));
 while(id){if(seen.has(id))return undefined;seen.add(id);const group=byId.get(id);if(!group)return undefined;if(group.repeat)return group.id;id=group.parent}
 return '';
}
export function groupPath(groups:KoboGroup[],id:string):string{
 if(!id)return 'General';
 const byId=new Map(groups.map(g=>[g.id,g])),parts:string[]=[],seen=new Set<string>();
 while(id&&!seen.has(id)){seen.add(id);const group=byId.get(id);if(!group){parts.unshift(id);break}parts.unshift(koboLabel(group,'en'));id=group.parent}
 return parts.join(' / ');
}
export function addedGroupOptions(form:KoboForm,repeat:string):[string,string][]{
 const options:[string,string][]=[...(repeat?[]:[['','General'] as [string,string]]),...form.groups.filter(g=>groupRepeatScope(form.groups,g.id)===repeat).map(g=>[g.id,groupPath(form.groups,g.id)] as [string,string])];
 return options.map(([id,label])=>[id,options.filter(([,text])=>text===label).length>1?`${label} · ${id}`:label]);
}
export function normalizeQuestionHeader(value:string):string{
 return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\(\s*combined\s*\)\s*$/iu,'').replace(/^[\p{N}]+(?:\s*\.\s*[\p{N}]+)*\s*[.)\]:-]?\s*/u,'').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
}
export function questionNameSimilarity(first:string,second:string):number{
 const a=Array.from(normalizeQuestionHeader(first)),b=Array.from(normalizeQuestionHeader(second));
 if(!a.length||!b.length)return 0;
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1)));row=next}
 return 1-row[b.length]/Math.max(a.length,b.length);
}
export type GroupSuggestion={question:string;label:string;group:string;path:string;score:number};
export function suggestQuestionGroup(header:string,form:KoboForm,mappings:KoboMapping[],repeat:string){
 const allowed=new Set(addedGroupOptions(form,repeat).map(([id])=>id));
 const ranked:GroupSuggestion[]=form.questions.filter(q=>!q.metadata&&q.repeat===repeat&&allowed.has(q.group)).map(q=>{
  const names=[q.name,...Object.values(q.labels).filter((v):v is string=>!!v),...mappings.filter(m=>m.question===q.id).map(m=>m.header)];
  return {question:q.id,label:koboLabel(q,'en'),group:q.group,path:groupPath(form.groups,q.group),score:Math.max(...names.map(value=>questionNameSimilarity(header,value)))};
 }).sort((a,b)=>b.score-a.score||a.question.localeCompare(b.question));
 const strong=ranked.filter(item=>item.score>=.85),best=strong[0],other=best&&ranked.find(item=>item.group!==best.group);
 const suggested=best&&new Set(strong.map(item=>item.group)).size===1&&(!other||best.score-other.score>=.10-Number.EPSILON)?best:undefined;
 return {suggested,candidates:strong.slice(0,3)};
}
