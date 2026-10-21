import {categoryPalette,chartCategoryColor,chartPrimary} from './ChartPrimitives';
import {questionDefaults,type KoboQuestionSettings,type KoboResult,type KoboSettings} from './koboTypes';

export const koboPalettes=[
 {name:'Balanced',description:"A versatile mix for everyday reporting",colors:categoryPalette},
 {"name": "Solid blue", "description": "One blue for every answer and series", "colors": ["#1683D8"]},
 {"name": "Ocean", "description": "Deep blues, teal, and indigo", "colors": ["#1E3A5F", "#247BA0", "#329D9C", "#5E60CE", "#427AA1", "#6B8E9B"]},
 {"name": "Botanical", "description": "Natural greens and warm earth tones", "colors": ["#245C4A", "#4E7C59", "#849B55", "#B18A45", "#8F5D5D", "#5D7285"]},
 {"name": "Jewel", "description": "Rich, balanced colors for comparisons", "colors": ["#3155A6", "#7851A9", "#B54B73", "#C77B32", "#218577", "#506680"]},
 {"name": "Contrast", "description": "Distinct colors for category comparisons", "colors": ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#7A5A00", "#555555"]},

 {name:'Blue',description:"Blue gradient from navy to light blue",colors:['#174A7E','#2166AC','#3787C0','#65A9CF','#9CCAE1','#C6E2EF']},
 {name:'Teal',description:"Calm shades of green and teal",colors:['#145A58','#207D78','#339D94','#62B6A8','#95CFC0','#C4E5D8']},
 {name:'Warm',description:"Warm amber and terracotta tones",colors:['#8C3B2A','#B45232','#D57641','#E6A15B','#EEC486','#F3DEB7']},
];
export function normalizeHex(text:string){
 const value=text.trim().replace(/^#/,'');
 if(!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))return null;
 return '#'+(value.length===3?value.split('').map(c=>c+c).join(''):value).toUpperCase();
}
export function customizeDraft(result:KoboResult,settings:KoboSettings):KoboQuestionSettings{
 const cfg={...questionDefaults,...settings.questions[result.id]};
 return {...cfg,chart:cfg.chart||result.chart,breakdown:'',breakdowns:[...(cfg.breakdowns?.length?cfg.breakdowns:cfg.breakdown?[cfg.breakdown]:[])],colors:{...cfg.colors}};
}
export function calculationKey(cfg:KoboQuestionSettings){
 return JSON.stringify([cfg.numericMode,cfg.bins,cfg.dateUnit,cfg.chart==='histogram',cfg.chart==='line'?cfg.trendDateField||'':'',cfg.trendUnit||'month',cfg.answerSort,cfg.breakdowns?.length?cfg.breakdowns:cfg.breakdown?[cfg.breakdown]:[]]);
}
export function colorEntries(result:KoboResult){
 return result.chart==='heatmap'?[{id:'series',label:'Heatmap high value'}]:result.chart==='line'&&result.trend?result.trend.series:result.breakdowns.length?result.breakdowns:result.chart==='line'?[{id:'series',label:'Line series'}]:result.rows.filter(row=>row.id!=='__blank__');
}
export function defaultKoboColor(result:KoboResult,id:string){
 return result.chart==='heatmap'?chartPrimary:result.trend||result.breakdowns.length||['pie','donut'].includes(result.chart)?chartCategoryColor(id):chartPrimary;
}
export function paletteColors(ids:string[],palette:string[],existing:Record<string,string>={}){
 const colors={...existing};[...new Set(ids)].sort().forEach((id,index)=>{colors[id]=palette[index%palette.length]});return colors;
}

export function resolveKoboColors(result:KoboResult,palette:KoboQuestionSettings['palette'],overrides:Record<string,string>){
 const colors:Record<string,string>={};const options=koboPalettes.find(option=>option.name===palette)?.colors;
 if(options)for(const entry of [...result.rows,...result.breakdowns,{id:'series'}]){
  let hash=0;for(const char of entry.id)hash=(hash*31+(char.codePointAt(0)||0))>>>0;
  colors[entry.id]=options[entry.id==='series'?0:hash%options.length];
 }
 return {...colors,...overrides};
}
