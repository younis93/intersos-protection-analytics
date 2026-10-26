import type {KoboFilter,KoboSettings} from './koboTypes';

export type DateFilterMode='range'|'month'|'both';
export const dateFilterModeOptions:[DateFilterMode,string][]=[['range','Date range'],['month','Month dropdown'],['both','Both']];
export const dateFilterModeLabel=(mode:DateFilterMode)=>dateFilterModeOptions.find(([value])=>value===mode)![1];
export const dateFilterActive=(rule:KoboFilter)=>rule.kind==='category'?rule.values.length>0:rule.minimum!=null||rule.maximum!=null||!!rule.months?.length;
export function dateMonths(values:string[]){
 return [...new Set(values.filter(value=>{
  if(!/^[0-9]{4}-(0[1-9]|1[0-2])-[0-9]{2}(?:$|T| )/.test(value))return false;
  const day=value.slice(0,10),parsed=new Date(day+'T00:00:00Z');
  return !Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===day;
 }).map(value=>value.slice(0,7)))].sort().reverse();
}
export function applyDateFilterModes(settings:KoboSettings,modes:Record<string,DateFilterMode>):KoboSettings{
 return {...settings,dateFilterModes:modes,filters:settings.filters.map(rule=>{
  if(rule.kind!=='date')return rule;
  const mode=modes[rule.field]||'range';
  return {...rule,months:mode==='range'?[]:rule.months||[],minimum:mode==='month'?null:rule.minimum,maximum:mode==='month'?null:rule.maximum};
 }).filter(dateFilterActive)};
}
export function dateFilterSummary(rule:KoboFilter){
 const parts:string[]=[];
 if(rule.months?.length)parts.push('Months: '+rule.months.join(', '));
 if(rule.minimum!=null||rule.maximum!=null||!parts.length)parts.push(`${rule.minimum??'Any'} - ${rule.maximum??'Any'}`);
 return parts.join('; ');
}
