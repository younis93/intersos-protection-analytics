export const reportPurposes={general:'General survey report',protection:'Protection analysis',donor:'Donor reporting',planning:'Programme planning'} as const;
export const reportLanguages={en:'English',ar:'Arabic'} as const;
export const reportLengths={standard:'Standard report',short:'Short summary',detailed:'Detailed analysis'} as const;
export type ReportOptions={
 purpose:keyof typeof reportPurposes;audience:string;language:keyof typeof reportLanguages;length:keyof typeof reportLengths;
 context:{period:string;location:string;population:string;sampling:string;objectives:string};
 quality:{enabled:boolean;missingPercent:number;smallBase:number};
};
export type ReportOverrides=Record<string,string[]>;
export type ReportPreset={id:string;name:string;mainFields:string[];mode:'none'|'current'|'custom';fields:string[];overrides:ReportOverrides;options:ReportOptions};
export function defaultReportOptions():ReportOptions{
 return {purpose:'general',audience:'',language:'en',length:'standard',context:{period:'',location:'',population:'',sampling:'',objectives:''},quality:{enabled:false,missingPercent:20,smallBase:30}};
}
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown,limit=2000)=>typeof value==='string'?value.slice(0,limit):'';
const ids=(value:unknown,limit=500)=>Array.isArray(value)?[...new Set(value.filter((id):id is string=>typeof id==='string'&&id.length>0))].slice(0,limit):[];
export function normalizeReportOptions(value:unknown):ReportOptions{
 const input=record(value),context=record(input.context),quality=record(input.quality),defaults=defaultReportOptions();
 return {purpose:Object.hasOwn(reportPurposes,String(input.purpose))?input.purpose as ReportOptions['purpose']:defaults.purpose,
  audience:text(input.audience,300),language:input.language==='ar'?'ar':'en',length:Object.hasOwn(reportLengths,String(input.length))?input.length as ReportOptions['length']:defaults.length,
  context:Object.fromEntries(Object.keys(defaults.context).map(key=>[key,text(context[key])])) as ReportOptions['context'],
  quality:{enabled:quality.enabled===true,missingPercent:typeof quality.missingPercent==='number'&&Number.isFinite(quality.missingPercent)?Math.max(1,Math.min(100,quality.missingPercent)):20,
   smallBase:typeof quality.smallBase==='number'&&Number.isFinite(quality.smallBase)?Math.max(1,Math.min(10000,Math.round(quality.smallBase))):30}};
}
export function normalizeReportOverrides(value:unknown):ReportOverrides{
 return Object.fromEntries(Object.entries(record(value)).slice(0,500).filter(([,fields])=>Array.isArray(fields)).map(([id,fields])=>[id,ids(fields,3)]));
}
export function normalizeReportPreset(value:unknown):ReportPreset|null{
 const input=record(value),id=text(input.id,100),name=text(input.name,160).trim();
 if(!id||!name||!Array.isArray(input.mainFields))return null;
 return {id,name,mainFields:ids(input.mainFields),mode:input.mode==='custom'||input.mode==='current'?input.mode:'none',fields:ids(input.fields,3),overrides:normalizeReportOverrides(input.overrides),options:normalizeReportOptions(input.options)};
}
export const reportPresetStorageKey=(workspace:string,projectId:string)=>`intersos-report-presets:v1:${workspace}:${projectId}`;
export function readReportPresets(storage:Pick<Storage,'getItem'>,key:string):ReportPreset[]{
 const raw=storage.getItem(key);if(!raw)return [];
 const data=record(JSON.parse(raw));if(data.version!==1||!Array.isArray(data.presets))return [];
 const seen=new Set<string>();
 return data.presets.map(normalizeReportPreset).filter((preset):preset is ReportPreset=>Boolean(preset)).filter(preset=>{if(seen.has(preset.id))return false;seen.add(preset.id);return true}).slice(0,50);
}
export function writeReportPresets(storage:Pick<Storage,'setItem'>,key:string,presets:ReportPreset[]){
 storage.setItem(key,JSON.stringify({version:1,presets:presets.slice(0,50)}));
}
// Revalidate stored references against the current safe question lists when loading a preset.
export function restoreReportPreset(preset:ReportPreset,mainIds:ReadonlySet<string>,fieldIds:ReadonlySet<string>){
 const mainFields=preset.mainFields.filter(id=>mainIds.has(id)),fields=preset.fields.filter(id=>fieldIds.has(id));
 const overrides=Object.fromEntries(Object.entries(preset.overrides).filter(([id])=>mainIds.has(id)).map(([id,values])=>[id,values.filter(field=>fieldIds.has(field)&&field!==id)]));
 const omitted=mainFields.length!==preset.mainFields.length||fields.length!==preset.fields.length||JSON.stringify(overrides)!==JSON.stringify(preset.overrides);
 return {...preset,mainFields,fields,overrides,omitted};
}
