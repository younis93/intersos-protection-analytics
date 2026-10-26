import {koboThemeColor,currentKoboTheme} from './koboThemeColors';
import {resolveKoboColors} from './koboCustomizeOptions';
import type {Theme} from './types';
import type {KoboQuestionSettings,KoboResult} from './koboTypes';

export type KoboMarkTarget={answer:string;breakdown?:string};
export function markTargetFromPoint(result:KoboResult,customdata:unknown):KoboMarkTarget|null{
 // Plotly pie events wrap the selected customdata row in a single-element array.
 const data=Array.isArray(customdata)&&customdata.length===1&&Array.isArray(customdata[0])?customdata[0]:customdata;
 if(!Array.isArray(data)||typeof data[3]!=='string'||!result.rows.some(row=>row.id===data[3]))return null;
 if(typeof data[4]==='string'&&!result.breakdowns.some(column=>column.id===data[4]))return null;
 return {answer:data[3],...(typeof data[4]==='string'?{breakdown:data[4]}:{})};
}
export const markColorKey=(result:KoboResult,target:KoboMarkTarget)=>JSON.stringify([(result.breakdownFields||[]).map(field=>field.id),target.breakdown??null,target.answer]);
export const usesPointColor=(result:KoboResult)=>result.breakdowns.length>0||result.chart==='line';
export function markColor(result:KoboResult,target:KoboMarkTarget,theme:Theme=currentKoboTheme()){
 const override=result.pointColors?.[markColorKey(result,target)];
 if(usesPointColor(result)&&override)return override;
 if(target.breakdown!==undefined)return result.colors[target.breakdown]||koboThemeColor(target.breakdown,theme);
 if(result.chart==='line')return result.colors.series||koboThemeColor('series',theme);
 return result.colors[target.answer]||koboThemeColor(target.answer,theme);
}
export function editMarkColor(result:KoboResult,cfg:KoboQuestionSettings,target:KoboMarkTarget,color:string|null):KoboQuestionSettings{
 const next={...cfg,colors:{...cfg.colors},pointColors:{...cfg.pointColors}};
 const map=usesPointColor(result)?next.pointColors:next.colors,key=usesPointColor(result)?markColorKey(result,target):target.answer;
 if(color===null)delete map[key];else map[key]=color;
 return next;
}
export const resultWithColors=(result:KoboResult,cfg:KoboQuestionSettings,theme:Theme=currentKoboTheme()):KoboResult=>({...result,colors:resolveKoboColors(result,cfg.palette,cfg.colors,theme),pointColors:cfg.pointColors||{}});
