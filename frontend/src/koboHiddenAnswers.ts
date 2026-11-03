import {koboLabel,type KoboQuestion,type KoboResult} from './koboTypes';
export type HiddenAnswerOption={id:string;label:string};
export function hiddenAnswerOptions(ids:string[],question:KoboQuestion|undefined,result:KoboResult,language:'en'|'ar',fetched:HiddenAnswerOption[]=[]){
 const labels=new Map<string,string>();
 for(const row of [...(result.percentageRows||[]),...result.rows])labels.set(row.id,row.label);
 for(const choice of question?.choices||[])labels.set(choice.name,koboLabel(choice,language));
 for(const option of fetched)labels.set(option.id,option.label);
 const options=[...new Set(ids)].map(id=>({id,label:id==='__blank__'?(language==='ar'?'فارغ / دون إجابة':'Blank / unanswered'):labels.get(id)||id}));
 const counts=new Map<string,number>();for(const option of options){const key=option.label.normalize('NFKC').toLocaleLowerCase().trim();counts.set(key,(counts.get(key)||0)+1)}
 return options.map(option=>({...option,showCode:(counts.get(option.label.normalize('NFKC').toLocaleLowerCase().trim())||0)>1}));
}
export const restoreHiddenSelection=(latest:string[],selected:Iterable<string>)=>{const restore=new Set(selected);return latest.filter(id=>!restore.has(id))};
