import {formatPercent} from './koboPercentages';
export const koboChartFonts=['Helvetica Neue','Aptos','Arial','Arial Narrow','Calibri','Cambria','Century Gothic','Consolas','Courier New',
 'Garamond','Georgia','Palatino Linotype','Segoe UI','Tahoma','Times New Roman','Trebuchet MS','Verdana'] as const;
type KoboChartFont=typeof koboChartFonts[number];
export const koboAnswerSizes=[8,9,10,11,12,13,14,15,16,18,20,22,24,26,28] as const;
export const koboAnswerSizeOptions=(automatic:string):[string,string][]=>[['0',automatic],...koboAnswerSizes.map(size=>[String(size),`${size} px`] as [string,string])];
export const koboChartFontFamily=(font:KoboChartFont,language:string)=>
 [font,...(language==='ar'?['Noto Naskh Arabic']:[]),'Arial','sans-serif'].join(', ');
const legacyTitleSpacing={compact:4.5,standard:9,roomy:18} as const;
export const maxTitleSpacing=36;
export type KoboLabelPosition='auto'|'inside'|'outside';
export type KoboAppearance={title?:string;titleBold?:boolean;titleItalic?:boolean;titleUnderline?:boolean;titleAlign?:'left'|'center'|'right';titleFont?:'inherit'|KoboChartFont;titleSize?:number;titleSpacing?:number|keyof typeof legacyTitleSpacing;titleColor?:string;valueAxis?:'show'|'hide';categoryLabels?:'wrap'|'truncate'|'rotate';metric?:'auto'|'count'|'percent';labels?:'auto'|'hidden'|'count'|'percent'|'both';labelPosition?:KoboLabelPosition;zeroPercentLabels?:'show'|'hide';legend?:'auto'|'hidden'|'top'|'bottom'|'left'|'right';fontFamily?:KoboChartFont;fontSize?:0|typeof koboAnswerSizes[number];height?:0|320|420|560|720;grid?:'auto'|'show'|'hide';bars?:'group'|'stack'};
export const appearanceDefaults={title:'',titleBold:false,titleItalic:false,titleUnderline:false,titleAlign:'center',titleFont:'inherit',titleSize:32,titleSpacing:9,titleColor:'',valueAxis:'show',categoryLabels:'wrap',metric:'auto',labels:'auto',labelPosition:'outside',zeroPercentLabels:'show',legend:'auto',fontFamily:'Helvetica Neue',fontSize:0,height:0,grid:'auto',bars:'group'} as const;
export const resolveAppearance=(value?:KoboAppearance|null)=>({
 ...appearanceDefaults,...value,labelPosition:value?.labelPosition==='inside'?'inside' as const:'outside' as const,
});
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
