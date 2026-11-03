import {type KoboQuestion,type KoboFieldPlacement,type KoboForm,type KoboMapping} from './koboTypes';
export function placeQuestions<T extends Pick<KoboQuestion,'id'|'group'|'repeat'|'placement'>>(questions:T[]):T[]{
 const byId=new Map(questions.map(q=>[q.id,q])),before=new Map<string,T[]>(),after=new Map<string,T[]>(),roots:T[]=[],visiting=new Set<string>(),done=new Set<string>(),ordered:T[]=[];
 for(const q of questions){const p=q.placement;if(!p||['first','last'].includes(p.position)){roots.push(q);continue}const target=byId.get(p.reference||'');if(!target||target.id===q.id)throw new Error('Placement reference is unavailable. Choose a new position.');if(target.group!==q.group||target.repeat!==q.repeat)throw new Error('Choose a reference in the selected group and repeat scope.');const map=p.position==='before'?before:after;map.set(target.id,[...(map.get(target.id)||[]),q])}
 const emit=(q:T)=>{if(visiting.has(q.id))throw new Error('Field placements form a cycle. Choose another reference question.');if(done.has(q.id))return;visiting.add(q.id);for(const child of before.get(q.id)||[])emit(child);ordered.push(q);for(const child of after.get(q.id)||[])emit(child);visiting.delete(q.id);done.add(q.id)};
 for(const group of new Set(questions.map(q=>q.group)))for(const phase of ['first','normal','last'])for(const q of roots.filter(q=>q.group===group))if((q.placement?.position||'normal')===phase)emit(q);
 for(const q of questions)if(!done.has(q.id))emit(q);
 const buckets=new Map([...new Set(questions.map(q=>q.group))].map(group=>[group,ordered.filter(q=>q.group===group)]));return questions.map(q=>buckets.get(q.group)!.shift()!);
}
export function placementCandidate(form:KoboForm,question:KoboQuestion,group:string,placement:KoboFieldPlacement|null){
 const candidate=[...form.questions.filter(q=>q.id!==question.id),{...question,group,placement}];
 try{return placeQuestions(candidate)}catch(error){
  // Other broken saved placements remain editable one at a time during import review.
  const byId=new Map(candidate.map(q=>[q.id,q]));let current=byId.get(question.id)!,seen=new Set<string>();
  while(current.placement&&['before','after'].includes(current.placement.position)){
   if(seen.has(current.id)){if(seen.has(question.id)&&current.id===question.id)throw error;break}seen.add(current.id);
   const target=byId.get(current.placement.reference||'');
   if(!target||target.group!==current.group||target.repeat!==current.repeat){if(current.id===question.id)throw error;break}current=target;
  }
  return placeQuestions(candidate.map(q=>q.id===question.id?q:{...q,placement:null}));
 }

}
export function suggestColumnPlacement(form:KoboForm,mappings:KoboMapping[],mapping:KoboMapping,repeat:string){
 const byId=new Map(form.questions.map(q=>[q.id,q]));
 const usable=mappings.filter(m=>m.sheet===mapping.sheet&&m.column!==mapping.column&&m.status!=='excluded'&&byId.get(m.question)?.repeat===repeat&&!byId.get(m.question)?.metadata);
 const prev=usable.filter(m=>m.column<mapping.column).sort((a,b)=>b.column-a.column)[0],next=usable.filter(m=>m.column>mapping.column).sort((a,b)=>a.column-b.column)[0];
 const choices=[...(prev?[{group:byId.get(prev.question)!.group,placement:{position:'after' as const,reference:prev.question},neighbor:byId.get(prev.question)!}]:[]),...(next?[{group:byId.get(next.question)!.group,placement:{position:'before' as const,reference:next.question},neighbor:byId.get(next.question)!}]:[])];
 const clear=choices.length===1||choices.length===2&&choices[0].group===choices[1].group&&form.questions.findIndex(q=>q.id===prev.question)<form.questions.findIndex(q=>q.id===next.question);
 return {suggested:clear?choices[0]:undefined,choices};
}
