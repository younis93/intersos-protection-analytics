import {normalizeHex} from './koboCustomizeOptions';

const key='kobo-recent-chart-colors';
let fallback:string[]=[];
export function recentChartColors():string[]{
 try{
  const saved:unknown=JSON.parse(localStorage.getItem(key)||'[]');
  if(Array.isArray(saved))fallback=[...new Set(saved.flatMap(value=>typeof value==='string'&&normalizeHex(value)?[normalizeHex(value)!]:[]))].slice(0,9);
 }catch{/* Keep the current session history when storage is unavailable. */}
 return [...fallback];
}
export function rememberChartColor(value:string):string[]{
 const color=normalizeHex(value);
 if(!color)return recentChartColors();
 fallback=[color,...recentChartColors().filter(saved=>saved!==color)].slice(0,9);
 try{localStorage.setItem(key,JSON.stringify(fallback))}catch{/* Color editing also works without persistent storage. */}
 return [...fallback];
}
