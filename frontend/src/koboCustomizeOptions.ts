import {categoryPalette} from './ChartPrimitives';
import {koboThemePalette,koboThemeColor,currentKoboTheme} from './koboThemeColors';
import type {Theme} from './types';
import {questionSettingsFor,type KoboQuestionSettings,type KoboResult,type KoboSettings} from './koboTypes';
import {koboScreenChartRows,projectKoboChart} from './koboChartDensity';
import {chartPercent,percentageDecimals} from './koboPercentages';
import {measured} from './koboMeasures';

export const koboPalettes:{name:NonNullable<KoboQuestionSettings['palette']>;label?:string;description:string;colors:string[];byValue?:boolean}[]=[
 {name:'Balanced',description:"A versatile mix for everyday reporting",colors:categoryPalette},
 {"name": "Solid blue", "description": "One blue for every answer and series", "colors": ["#1683D8"]},
 {"name": "Ocean", "description": "Deep blues, teal, and indigo", "colors": ["#1E3A5F", "#247BA0", "#329D9C", "#5E60CE", "#427AA1", "#6B8E9B"]},
 {"name": "Botanical", "description": "Natural greens and warm earth tones", "colors": ["#245C4A", "#4E7C59", "#849B55", "#B18A45", "#8F5D5D", "#5D7285"]},
 {"name": "Jewel", "description": "Rich, balanced colors for comparisons", "colors": ["#3155A6", "#7851A9", "#B54B73", "#C77B32", "#218577", "#506680"]},
 {"name": "Contrast", "description": "Distinct colors for category comparisons", "colors": ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#7A5A00", "#555555"]},

 {name:'Blue',byValue:true,label:'Theme gradient',description:'Follows the theme and uses darker shades for larger category values',get colors(){return koboThemePalette()}},
 {name:'Navy',description:'Ink navy through soft harbor blue',colors:['#102E50','#194979','#2C659C','#4B83B6','#78A6CA','#AACBE2'],byValue:true},
 {name:'Cobalt',description:'Royal blue through soft cornflower',colors:['#203589','#304CB0','#4567CA','#6285DF','#8CA8EC','#B5C7F5'],byValue:true},
 {name:'Steel Blue',description:'Muted slate through silver blue',colors:['#263D58','#3B5771','#53728D','#6D8EA7','#91ADBF','#B9CDD8'],byValue:true},
 {name:'Glacier Blue',description:'Deep marine blue through glacial cyan',colors:['#07516D','#0D6E8F','#158BAB','#35A6C1','#66BED2','#A2D7E3'],byValue:true},
 {name:'Coastal',description:'Marine blue, sea green, coral, and sand',colors:['#176691','#248675','#C6674A','#A77728','#745589','#536D80']},
 {name:'Earth Tones',description:'Clay, olive, ochre, and slate',colors:['#AC573C','#647640','#A77B32','#556E82','#8B5163','#38796F']},
 {name:'Orchard',description:'Plum, berry, leaf green, and apricot',colors:['#694786','#AE4565','#398253','#BD742E','#3F70A5','#866C38']},
 {name:'Teal',description:"Calm shades of green and teal",colors:['#145A58','#207D78','#339D94','#62B6A8','#95CFC0','#C4E5D8']},
 {name:'Warm',description:"Warm amber and terracotta tones",colors:['#8C3B2A','#B45232','#D57641','#E6A15B','#EEC486','#F3DEB7']},
];
export function normalizeHex(text:string){
 const value=text.trim().replace(/^#/,'');
 if(!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))return null;
 return '#'+(value.length===3?value.split('').map(c=>c+c).join(''):value).toUpperCase();
}
export function customizeDraft(result:KoboResult,settings:KoboSettings):KoboQuestionSettings{
 const cfg=questionSettingsFor(result,settings.questions[result.id],settings.percentageDefault);
 return {...cfg,percentageMode:result.respondentBasis?.active?'legacy-respondents':settings.questions[result.id]?.percentageMode||(result.percentageMode==='answer-filter'?undefined:result.percentageMode)||'legacy-respondents',chart:cfg.chart||result.chart,breakdown:'',breakdowns:[...(cfg.breakdowns?.length?cfg.breakdowns:cfg.breakdown?[cfg.breakdown]:[])],colors:{...cfg.colors}};
}
export function calculationKey(cfg:KoboQuestionSettings){
 return JSON.stringify([cfg.filterMode,cfg.ownFilters,cfg.answerFilters, cfg.connectionSource,cfg.connectionRules,cfg.connectedPercentageMode,cfg.connectedAnswerScope,cfg.additiveAnswerScope,cfg.hiddenAnswerPercentageMode,cfg.percentageBase,cfg.percentageParent,cfg.chartTopN,cfg.chartOther,cfg.percentageGroupLevel,cfg.percentageMode,cfg.numericMode,cfg.bins,cfg.dateUnit,cfg.chart,cfg.chart==='line'?cfg.trendDateField||'':'',cfg.trendUnit||'month',cfg.calculation||null,cfg.answerShareQuestion||'',cfg.answerShareAnswer||'',cfg.answerStackMode||null,cfg.answerSort,cfg.breakdowns?.length?cfg.breakdowns:cfg.breakdown?[cfg.breakdown]:[]]);
}
export function colorEntries(result:KoboResult){
 if(result.answerStack)return projectKoboChart(result).breakdowns;
 return result.chart==='heatmap'?[{id:'series',label:'Heatmap high value'}]:result.chart==='line'&&result.trend?result.trend.series:result.breakdowns.length?result.breakdowns:result.chart==='line'?[{id:'series',label:'Line series'}]:result.rows.filter(row=>row.id!=='__blank__');
}
export function defaultKoboColor(result:KoboResult,id:string,theme:Theme=currentKoboTheme()){
 return koboThemeColor(result.chart==='heatmap'||result.chart==='line'&&!result.trend&&!result.breakdowns.length?'series':id,theme);
}
export function paletteColors(ids:string[],palette:string[],existing:Record<string,string>={}){
 const colors={...existing};[...new Set(ids)].sort().forEach((id,index)=>{colors[id]=palette[index%palette.length]});return colors;
}

export function resolveKoboColors(result:KoboResult,palette:KoboQuestionSettings['palette'],overrides:Record<string,string>,theme:Theme=currentKoboTheme()):Record<string,string>{
 result=projectKoboChart(result);
 const preset=koboPalettes.find(option=>option.name===palette);
 const options=palette==='Blue'?koboThemePalette(theme):preset?.colors;
 if(result.stackedAnswers){
  const shades=options||koboThemePalette(theme);
  return {...Object.fromEntries(result.breakdowns.map((answer,index)=>[answer.id,shades[index%shades.length]])),...overrides};
 }
 if(!options)return {...overrides};
 const colors:Record<string,string>={};
 if(preset?.byValue&&!result.breakdowns.length&&result.chart!=='line'&&result.chart!=='heatmap'){
  const isMeasured=measured(result);
  const percent=result.appearance?.metric==='percent'&&(!isMeasured||(result.measure?.operation==='sum'&&!!result.percentageMode&&result.percentageMode!=='legacy-respondents'));
  const decimals=percentageDecimals(result);
  const rows=(isMeasured?result.rows:koboScreenChartRows(result)).filter(row=>row.id!=='__blank__');
  const values=rows.map(row=>(percent?chartPercent(row,decimals):isMeasured?row.value:row.count)??0);
  const ranked=[...new Set(values)].sort((a,b)=>b-a);
  const shades=new Map(ranked.map((value,index)=>[value,options[Math.round(index*(options.length-1)/Math.max(1,ranked.length-1))]]));
  rows.forEach((row,index)=>{colors[row.id]=shades.get(values[index])!});
  return {series:options[0],...colors,...overrides};
 }
 const series=palette==='Blue'?[]:result.trend?.series??[];
 for(const entry of [...result.rows,...result.breakdowns,...series,{id:'series'}]){
  let hash=0;
  for(const char of entry.id)hash=(hash*31+(char.codePointAt(0)||0))>>>0;
  colors[entry.id]=options[entry.id==='series'?0:hash%options.length];
 }
 return {...colors,...overrides};
}
