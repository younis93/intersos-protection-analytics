import {formatPercent} from './koboPercentages';
export type KoboAppearance={title?:string;titleBold?:boolean;titleItalic?:boolean;titleUnderline?:boolean;titleAlign?:'left'|'center'|'right';titleFont?:'inherit'|'Arial'|'Calibri'|'Georgia'|'Times New Roman'|'Tahoma'|'Verdana';titleSize?:number;titleColor?:string;valueAxis?:'show'|'hide';metric?:'auto'|'count'|'percent';labels?:'auto'|'hidden'|'count'|'percent'|'both';legend?:'auto'|'hidden'|'top'|'bottom'|'left'|'right';fontSize?:0|10|12|14|16;height?:0|320|420|560|720;grid?:'auto'|'show'|'hide';bars?:'group'|'stack'};
export const appearanceDefaults={title:'',titleBold:false,titleItalic:false,titleUnderline:false,titleAlign:'center',titleFont:'inherit',titleSize:0,titleColor:'',valueAxis:'show',metric:'auto',labels:'auto',legend:'auto',fontSize:0,height:0,grid:'auto',bars:'group'} as const;
export const resolveAppearance=(value?:KoboAppearance|null)=>({...appearanceDefaults,...value});
export function chartLabel(count:number,percent:number|null|undefined,mode:KoboAppearance['labels'],language:string,decimals=0){
 const number=(n:number)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(n);
 const p=formatPercent(percent,decimals,language);
 return mode==='count'?number(count):mode==='percent'?p:mode==='both'?`${number(count)} / ${p}`:'';
}
