import {formatPercent} from './koboPercentages';
export const koboChartFonts=['Helvetica Neue','Aptos','Arial','Arial Narrow','Calibri','Cambria','Century Gothic','Consolas','Courier New',
 'Garamond','Georgia','Palatino Linotype','Segoe UI','Tahoma','Times New Roman','Trebuchet MS','Verdana'] as const;
type KoboChartFont=typeof koboChartFonts[number];
export const koboAnswerSizes=[8,9,10,11,12,13,14,15,16,18,20,22,24,26,28] as const;
export const answerSizeRange={min:8,max:36,initial:14};
export const koboAnswerSizeOptions=(automatic:string):[string,string][]=>[['0',automatic],...koboAnswerSizes.map(size=>[String(size),`${size} px`] as [string,string])];
export const koboChartFontFamily=(font:KoboChartFont,language:string)=>
 [font,...(language==='ar'?['Noto Naskh Arabic']:[]),'Arial','sans-serif'].join(', ');
const legacyTitleSpacing={compact:4.5,standard:9,roomy:18} as const;
export const maxTitleSpacing=36;
export type KoboLabelPosition='auto'|'inside'|'outside';
type ChartAlignment='left'|'center'|'right';
type LegendVerticalAlignment='top'|'middle'|'bottom';
type BarWidthPreset='narrow'|'medium'|'standard';
type BarWidth=BarWidthPreset|'custom';
export const barWidthRange={min:10,max:100,initial:80};
type AnswerSpacing='compact'|'standard'|'spacious';
export const chartHeights={min:240,initial:480,max:1600};
export const chartWidthPresets={
 compact:{label:'Compact',width:480},
 narrow:{label:'Narrow',width:640},
 medium:{label:'Medium',width:800},
 wide:{label:'Wide',width:1000},
 'extra-wide':{label:'Extra wide',width:1280},
} as const;
export const chartWidths={min:360,narrow:chartWidthPresets.narrow.width,max:1600};
export type KoboAppearance={title?:string;titleBold?:boolean;titleItalic?:boolean;titleUnderline?:boolean;titleAlign?:ChartAlignment;titleFont?:'inherit'|KoboChartFont;titleSize?:number;titleSpacing?:number|keyof typeof legacyTitleSpacing;titleColor?:string;valueAxis?:'show'|'hide';horizontalAxisLine?:'show'|'hide';verticalAxisLine?:'show'|'hide';categoryLabels?:'wrap'|'truncate'|'rotate';categoryLabelSize?:0|typeof koboAnswerSizes[number];categoryLabelLines?:0|1|2|3|4|5;metric?:'auto'|'count'|'percent';labels?:'auto'|'hidden'|'count'|'percent'|'both';labelPosition?:KoboLabelPosition;zeroPercentLabels?:'show'|'hide';legend?:'auto'|'hidden'|'top'|'bottom'|'left'|'right';legendAlign?:ChartAlignment;legendVerticalAlign?:LegendVerticalAlignment;barWidth?:BarWidth;customBarWidth?:number;chartWidthMode?:'auto'|keyof typeof chartWidthPresets|'custom';chartWidth?:number;answerSpacing?:AnswerSpacing;fontFamily?:KoboChartFont;fontSize?:number;height?:0|320|420|560|720;customHeight?:number;grid?:'auto'|'show'|'hide';bars?:'group'|'stack'};
export const appearanceDefaults={title:'',titleBold:false,titleItalic:false,titleUnderline:false,titleAlign:'center',titleFont:'inherit',titleSize:32,titleSpacing:9,titleColor:'',valueAxis:'show',horizontalAxisLine:'show',verticalAxisLine:'show',categoryLabels:'wrap',categoryLabelSize:0,categoryLabelLines:0,metric:'auto',labels:'auto',labelPosition:'outside',zeroPercentLabels:'show',legend:'auto',legendAlign:'left',legendVerticalAlign:'top',barWidth:'standard',customBarWidth:barWidthRange.initial,chartWidthMode:'auto',chartWidth:chartWidths.narrow,answerSpacing:'standard',fontFamily:'Helvetica Neue',fontSize:0,height:0,customHeight:0,grid:'auto',bars:'group'} as const;
export function resolveAppearance(value?:(KoboAppearance&{valueAxisLine?:'show'|'hide'})|null){
 const {valueAxisLine,...appearance}=value??{};
 const previousLine=valueAxisLine??appearance.valueAxis??'show';
 return {
  ...appearanceDefaults,...appearance,
  horizontalAxisLine:appearance.horizontalAxisLine??previousLine,
  verticalAxisLine:appearance.verticalAxisLine??previousLine,
  labelPosition:appearance.labelPosition==='inside'?'inside' as const:'outside' as const,
 };
}
export function valueAxisVisibility(appearance:Pick<Required<KoboAppearance>,'valueAxis'>){
 return appearance.valueAxis==='hide'?{showticklabels:false,ticks:'' as const,title:{text:''}}:{};
}
export function chartAxisLines(appearance:Pick<Required<KoboAppearance>,'horizontalAxisLine'|'verticalAxisLine'>,axis:'x'|'y',numeric:boolean){
 const horizontal=appearance.horizontalAxisLine==='show',vertical=appearance.verticalAxisLine==='show';
 return {showline:axis==='x'?horizontal:vertical,zeroline:numeric&&(axis==='x'?vertical:horizontal)};
}
export function requestedChartHeight(appearance:Pick<KoboAppearance,'height'|'customHeight'>){
 return appearance.customHeight||appearance.height||0;
}
export function chartLegendPlacement(position:KoboAppearance['legend'],alignment:ChartAlignment,leftX=-.02,vertical:LegendVerticalAlignment='top'){
 const sideY=vertical==='top'?1:vertical==='middle'?.5:0;
 if(position==='left')return {orientation:'v',x:leftX,xanchor:'right',y:sideY,yanchor:vertical,yref:'paper'} as const;
 if(position==='right')return {orientation:'v',x:1.03,xanchor:'left',y:sideY,yanchor:vertical,yref:'paper'} as const;
 const top=position==='top';
 return {orientation:'h',x:alignment==='center'?.5:alignment==='right'?1:0,xanchor:alignment,
  y:top?.99:.01,yanchor:top?'top':'bottom',yref:'container'} as const;
}
// The narrower category bands also reduce the visible gap between answer rows.
const barGaps:Record<BarWidthPreset,number>={narrow:.24,medium:.23,standard:.2};
const columnGaps:Record<BarWidthPreset,number>={narrow:.28,medium:.23,standard:.2};
const columnBand:Record<BarWidthPreset,number>={narrow:.62,medium:.79,standard:1};
const barPitch:Record<BarWidthPreset,number>={narrow:.70,medium:.84,standard:1};
export function barWidthLayout({barWidth,customBarWidth}:Pick<Required<KoboAppearance>,'barWidth'|'customBarWidth'>,horizontal:boolean){
 if(barWidth==='custom')return {gap:(100-customBarWidth)/100,pitch:1,columnShare:1};
 return {gap:(horizontal?barGaps:columnGaps)[barWidth],pitch:barPitch[barWidth],columnShare:columnBand[barWidth]};
}
export function columnDomain(columnShare:number):[number,number]{
 const inset=(1-columnShare)/2;
 return [inset,1-inset];
}
export function fixedChartWidth(appearance?:KoboAppearance){
 const mode=appearance?.chartWidthMode;
 if(!mode||mode==='auto')return undefined;
 if(mode==='custom')return appearance.chartWidth??chartWidths.narrow;
 return chartWidthPresets[mode]?.width;
}
export const answerRowPadding:Record<AnswerSpacing,number>={compact:6,standard:14,spacious:28};
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
