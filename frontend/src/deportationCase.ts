import {getLegalExplorer} from './api';

export const isDeportationIdColumn=(column:string)=>/^(?:pn[\s_-]*id|deportation[\s_-]*id)\b/i.test(column.trim());
export const hasDeportationId=(value:unknown)=>value!==null&&value!==undefined&&!['','-','\u2014'].includes(String(value).trim());

export async function getDeportationCaseRecords(pnId:string,page:number,signal:AbortSignal,identifierColumn?:string) {
  let column=identifierColumn;
  if(!column){
    const schema=await getLegalExplorer('deportationrecords','',1,{},'','asc',1,signal);
    column=schema.columns.find(isDeportationIdColumn);
  }
  if(!column)throw new Error('No PN ID column is available in the deportation records.');
  return getLegalExplorer('deportationrecords','',page,{[column]:[pnId.trim()]},'','asc',100,signal);
}
