import type {KoboMapping,KoboQuestion} from './koboTypes';
export const linkKey=(m:KoboMapping)=>`${m.sheet}:${m.column}`;
export const needsLink=(m:KoboMapping)=>m.status==='unmatched'||m.status==='ambiguous';
export const ignoredLink=(m:KoboMapping)=>m.status==='ignored'||m.status==='excluded';
export function mergedQuestions(mappings:KoboMapping[]){const grouped=new Map<string,KoboMapping[]>();for(const m of mappings){if(m.status!=='matched'||!m.question||m.option)continue;grouped.set(m.question,[...(grouped.get(m.question)||[]),m])}return new Map([...grouped].filter(([,ms])=>ms.length>1))}
export function canLink(m:KoboMapping,q:KoboQuestion,scope:string|undefined){return (!m.sourceKind||m.sourceKind===q.kind)&&(m.sourceRepeat==null||m.sourceRepeat===q.repeat)&&(scope!==undefined&&q.repeat===scope)}
export function setMergeRule(mappings:KoboMapping[],qid:string,mode:NonNullable<KoboMapping['mergeMode']>,order:string[]){return mappings.map(m=>m.question===qid&&!m.option?{...m,mergeMode:mode,priority:Math.max(0,order.indexOf(linkKey(m)))}:m)}
export function linkColumn(mappings:KoboMapping[],source:KoboMapping,question:string,option=''){return mappings.map(m=>linkKey(m)===linkKey(source)?{...m,question,option,status:question?'matched':'excluded',answerMap:{},mergeMode:'' as const,priority:0,reason:'Linked by you'}:m)}

export function replaceSource(mappings:KoboMapping[],source:KoboMapping,question:string,option=''){
 return linkColumn(mappings.map(m=>m.question===question&&linkKey(m)!==linkKey(source)?{...m,question:'',option:'',status:'unmatched',answerMap:{},mergeMode:'' as const,priority:0,reason:'Previous data source replaced. Choose how to use this column.'}:m),source,question,option);
}
