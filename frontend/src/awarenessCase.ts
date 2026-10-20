import {getLegalExplorer} from './api';

export const isAwarenessIdColumn=(column:string)=>/^awareness[\s_-]*id\b/i.test(column.trim());

export async function getAwarenessCaseRecords(awarenessId:string,page:number,signal:AbortSignal,identifierColumn?:string) {
  let column=identifierColumn;
  if(!column){
    const schema=await getLegalExplorer('awareness','',1,{},'','asc',1,signal);
    column=schema.columns.find(isAwarenessIdColumn);
  }
  if(!column)throw new Error('No Awareness ID column is available in the awareness records.');
  return getLegalExplorer('awareness','',page,{[column]:[awarenessId.trim()]},'','asc',100,signal);
}
