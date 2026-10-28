export type ColumnType='text'|'number'|'date';
export type ColumnOperator='equals'|'contains'|'starts_with'|'ends_with'|'gt'|'gte'|'lt'|'lte'|'between'|'date_on'|'date_before'|'date_after'|'date_between'|'blank'|'not_blank';
export type ColumnCondition={operator:ColumnOperator;value:string;value2?:string};
export type ColumnFilter={column:string;type:ColumnType;values?:string[]|null;excluded?:string[];included?:string[];valueSearch?:string|null;condition?:ColumnCondition|null};
export type FilterColumn={key:string;label:string;type?:ColumnType};
export type ValuePage={values:string[];total:number;offset:number;type?:ColumnType};
export type ValueLoader=(column:string,search:string,offset:number,signal:AbortSignal)=>Promise<ValuePage>;
export function recordColumnType(name:string,type:ColumnType='text'):ColumnType{return /\b(id|identifier|phone|code)\b/i.test(name.replace(/[_/]+/g,' '))?'text':type}
export const columnText=(value:unknown):string=>value==null||typeof value==='number'&&!Number.isFinite(value)?'':Array.isArray(value)?value.map(columnText).join(', '):String(value).trim();
const folded=(value:string)=>value.trim().toLocaleLowerCase();
const dateValue=(value:string)=>{const match=value.match(/^(\d{4})-(\d{2})-(\d{2})/);if(match)return Date.UTC(+match[1],+match[2]-1,+match[3]);const dayFirst=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(dayFirst)return Date.UTC(+dayFirst[3],+dayFirst[2]-1,+dayFirst[1]);const date=new Date(value);return Number.isNaN(+date)?NaN:Date.UTC(date.getFullYear(),date.getMonth(),date.getDate())};
export function matchesColumn(value:unknown,filter:ColumnFilter){
 const text=columnText(value),lower=folded(text);
 const selectionKey=(selection:string[])=>{if(filter.type==='date'&&selection.some(Boolean)&&selection.every(item=>!item||/^\d{4}-\d{2}$/.test(item))){const date=dateValue(text);return Number.isFinite(date)?new Date(date).toISOString().slice(0,7):text}return text};
 if(filter.values!=null&&!filter.values.includes(selectionKey(filter.values))||filter.excluded?.includes(selectionKey(filter.excluded))||filter.valueSearch!=null&&!lower.includes(folded(filter.valueSearch))&&!filter.included?.includes(text))return false;
 const c=filter.condition;if(!c)return true;
 if(c.operator==='blank')return text==='';if(c.operator==='not_blank')return text!=='';
 const a=folded(c.value),b=folded(c.value2||'');
 if(c.operator.startsWith('date_')){const n=dateValue(text),first=dateValue(a),last=dateValue(b);if(!Number.isFinite(n))return false;return c.operator==='date_on'?n===first:c.operator==='date_before'?n<first:c.operator==='date_after'?n>first:n>=first&&n<=last}
 if(filter.type==='number'){const n=text===''?NaN:Number(text),first=Number(a),last=Number(b);if(!Number.isFinite(n))return false;return c.operator==='equals'?n===first:c.operator==='gt'?n>first:c.operator==='gte'?n>=first:c.operator==='lt'?n<first:c.operator==='lte'?n<=first:n>=first&&n<=last}
 return c.operator==='equals'?lower===a:c.operator==='starts_with'?lower.startsWith(a):c.operator==='ends_with'?lower.endsWith(a):lower.includes(a);
}
export function filterRecords<T>(rows:T[],filters:ColumnFilter[],getValue:(row:T,key:string)=>unknown=(row,key)=>(row as Record<string,unknown>)[key]){return rows.filter(row=>filters.every(filter=>matchesColumn(getValue(row,filter.column),filter)))}
export function filterActive(filter:ColumnFilter){return filter.values!=null||filter.valueSearch!=null||Boolean(filter.excluded?.length)||Boolean(filter.condition)}
export function conditionError(condition:ColumnCondition|undefined|null,type:ColumnType){
 if(!condition||['blank','not_blank'].includes(condition.operator))return '';
 if(!condition.value.trim())return 'Enter a value.';
 const between=condition.operator==='between'||condition.operator==='date_between';
 if(between&&!condition.value2?.trim())return 'Enter both range values.';
 if(type==='number'&&(!Number.isFinite(Number(condition.value))||between&&!Number.isFinite(Number(condition.value2))))return 'Enter valid numbers.';
 if(type==='date'&&(!Number.isFinite(dateValue(condition.value))||between&&!Number.isFinite(dateValue(condition.value2||''))))return 'Enter valid dates.';
 if(between&&(type==='date'?dateValue(condition.value)>dateValue(condition.value2||''):Number(condition.value)>Number(condition.value2)))return 'The range end must be on or after its start.';
 return '';
}
export const conditionOptions=(type:ColumnType):[ColumnOperator,string][]=>[...(type==='number'?[['equals','Equals'],['gt','Greater than'],['gte','At least'],['lt','Less than'],['lte','At most'],['between','Between']]:type==='date'?[['date_on','On date'],['date_before','Before date'],['date_after','After date'],['date_between','Between dates']]:[['equals','Equals'],['contains','Contains'],['starts_with','Starts with'],['ends_with','Ends with']]),['blank','Is blank'],['not_blank','Is not blank']] as [ColumnOperator,string][];
