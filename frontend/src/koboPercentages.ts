import type {KoboResult} from './koboTypes';
export type PercentageValue={percent?:number|null;displayPercent?:number|null};
export const displayPercent=(entry:PercentageValue|undefined)=>entry?.displayPercent===undefined?entry?.percent??null:entry.displayPercent;
export const percentageDecimals=(result:Pick<KoboResult,'percentageDecimals'>)=>result.percentageDecimals??0;
const chartPercentFormatters=[0,1,2].map(maximumFractionDigits=>new Intl.NumberFormat('en-US',{useGrouping:false,maximumFractionDigits}));
export function chartPercent(entry:PercentageValue|undefined,decimals:0|1|2){
 const value=displayPercent(entry);
 return value===null?null:Number(chartPercentFormatters[decimals].format(value));
}
export function formatPercent(value:number|null|undefined,decimals:number,language='en'){
 return value==null?'-':`${new Intl.NumberFormat(language,{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(value)}%`;
}
