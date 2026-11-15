import {formatPercent} from './koboPercentages';
export const koboChartFonts=['Helvetica Neue','Aptos','Arial','Arial Narrow','Calibri','Cambria','Century Gothic','Consolas','Courier New',
 'Garamond','Georgia','Palatino Linotype','Segoe UI','Tahoma','Times New Roman','Trebuchet MS','Verdana'] as const;
type KoboChartFont=typeof koboChartFonts[number];
export const koboChartFontFamily=(font:KoboChartFont,language:string)=>
 [font,...(language==='ar'?['Noto Naskh Arabic']:[]),'Arial','sans-serif'].join(', ');
const legacyTitleSpacing={compact:4.5,standard:9,roomy:18} as const;
export const maxTitleSpacing=36;
export type KoboAppearance={title?:string;titleBold?:boolean;titleItalic?:boolean;titleUnderline?:boolean;titleAlign?:'left'|'center'|'right';titleFont?:'inherit'|KoboChartFont;titleSize?:number;titleSpacing?:number|keyof typeof legacyTitleSpacing;titleColor?:string;valueAxis?:'show'|'hide';metric?:'auto'|'count'|'percent';labels?:'auto'|'hidden'|'count'|'percent'|'both';zeroPercentLabels?:'show'|'hide';legend?:'auto'|'hidden'|'top'|'bottom'|'left'|'right';fontFamily?:KoboChartFont;fontSize?:0|10|12|14|16;height?:0|320|420|560|720;grid?:'auto'|'show'|'hide';bars?:'group'|'stack'};
export const appearanceDefaults={title:'',titleBold:false,titleItalic:false,titleUnderline:false,titleAlign:'center',titleFont:'Helvetica Neue',titleSize:32,titleSpacing:9,titleColor:'',valueAxis:'show',metric:'auto',labels:'auto',zeroPercentLabels:'show',legend:'auto',fontFamily:'Helvetica Neue',fontSize:0,height:0,grid:'auto',bars:'group'} as const;
export const resolveAppearance=(value?:KoboAppearance|null)=>({...appearanceDefaults,...value});
export function titleSpacingPoints(value:KoboAppearance['titleSpacing']){
 if(typeof value==='number')return value;
 return value===undefined?appearanceDefaults.titleSpacing:legacyTitleSpacing[value];
}
export const hideZeroPercentLabel=(percent:number|null|undefined,decimals:number,setting:KoboAppearance['zeroPercentLabels'])=>
 setting==='hide'&&percent!=null&&Math.abs(percent)<0.5*10**-decimals;
export function chartLabel(count:number,percent:number|null|undefined,mode:KoboAppearance['labels'],language:string,decimals=0,zeroPercentLabels?:KoboAppearance['zeroPercentLabels']){
 const number=(n:number)=>new Intl.NumberFormat(language,{maximumFractionDigits:2}).format(n);
 if((mode==='percent'||mode==='both')&&hideZeroPercentLabel(percent,decimals,zeroPercentLabels))return mode==='both'?number(count):'';
 const p=formatPercent(percent,decimals,language);
 return mode==='count'?number(count):mode==='percent'?p:mode==='both'?`${number(count)} / ${p}`:'';
}
