import type {KoboResult} from './koboTypes';
export type PercentageValue={percent:number|null;displayPercent?:number|null};
export const displayPercent=(entry:PercentageValue|undefined)=>entry?entry.displayPercent===undefined?entry.percent:entry.displayPercent:null;
export const percentageDecimals=(result:Pick<KoboResult,'percentageDecimals'>)=>result.percentageDecimals??0;
export function formatPercent(value:number|null|undefined,decimals:number,language='en'){
 return value==null?'-':`${new Intl.NumberFormat(language,{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(value)}%`;
}
