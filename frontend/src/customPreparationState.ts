import preparationPolicy from '../../backend/custom_preparation_policy.json';
import type {CustomColumn,CustomConfig} from './CustomColumnSetup';

export type Preparation={trim:boolean;collapseSpaces:boolean;letterCase:'none'|'lower'|'upper'|'title';missingTokens:string[];numberFormat:'plain'|'dot'|'comma';currency:string;percent:boolean};
export type CalculatedColumn={id:string;label:string;operation:'add'|'subtract'|'multiply'|'divide'|'percentage'|'days_between'|'age_years';left:string;right:string;useLiteral:boolean;literal:string;included:boolean;invalidAsMissing:boolean};
export type ValidationRule={id:string;label:string;kind:'required'|'number_range'|'date_order';field:string;otherField:string;minimum:number|null;maximum:number|null;severity:'error'|'warning';acceptedSignature:string};
export type ValidationResult={id:string;label:string;field:string;severity:'error'|'warning';matched:number;examples:{row:number;value:unknown;otherValue:unknown}[];error:string;signature:string;acknowledged:boolean};
export type PreparationTab='cleaning'|'calculations'|'rules'|'duplicates';
export const preparationDefaults:Preparation={trim:false,collapseSpaces:false,letterCase:'none',missingTokens:[],numberFormat:'plain',currency:'',percent:false};
export const calculationOptions:[CalculatedColumn['operation'],string][]=[['add','Add'],['subtract','Subtract'],['multiply','Multiply'],['divide','Divide'],['percentage','Percentage (first / second × 100)'],['days_between','Days between dates'],['age_years','Age in completed years']];
export const ruleOptions:[ValidationRule['kind'],string][]=[['required','Required value'],['number_range','Number range'],['date_order','Date order (first on or before second)']];
export const analysisColumns=(config:CustomConfig):CustomColumn[]=>[...config.columns,...(config.calculatedColumns||[]).map((c,i)=>({id:c.id,index:config.columns.length+i,header:c.label,label:c.label,kind:'number' as const,included:c.included,group:'',dateFormat:'auto' as const,separator:'',categories:{},invalidAsMissing:c.invalidAsMissing,includeTime:false,timeLabel:'',calculated:true}))];
export const preparationFields=(config:CustomConfig,before?:string)=>analysisColumns({...config,calculatedColumns:before?(config.calculatedColumns||[]).slice(0,(config.calculatedColumns||[]).findIndex(c=>c.id===before)):config.calculatedColumns}).filter(c=>c.included);
export const prunePreparationFilters=(config:CustomConfig)=>{
 const ids=new Set(analysisColumns(config).filter(c=>c.included).flatMap(c=>c.kind==='date'&&c.includeTime?[c.id,c.id+'__time']:[c.id]));
 const dateIds=new Set(config.columns.filter(c=>c.included&&c.kind==='date'&&config.filterFields.includes(c.id)).map(c=>c.id));
 return {...config,filterFields:config.filterFields.filter(id=>ids.has(id)),dateFilterModes:Object.fromEntries(Object.entries(config.dateFilterModes||{}).filter(([id])=>dateIds.has(id)))};
};

export type DuplicateDecision={mode:"all"|"first"|"last"|"custom";rows:number[]};
export type DuplicateReview={fields:string[];decisions:Record<string,DuplicateDecision>};
export type DuplicateResult={groups:{signature:string;values:unknown[];mode:string;keptRows:number[];records:{row:number;values:Record<string,unknown>;original:unknown[]}[]}[];unresolved:number;excluded:number;included:number;skipped:number;error:string};

export const preparationControls=(kind:CustomColumn['kind'])=>preparationPolicy[kind] as (keyof Preparation)[];
export const activePreparation=(column:CustomColumn):Preparation=>{
 const saved={...preparationDefaults,...column.preparation},active={...preparationDefaults};
 for(const field of preparationControls(column.kind))Object.assign(active,{[field]:saved[field]});
 return active;
};
