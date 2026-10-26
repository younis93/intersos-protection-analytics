import type {Theme} from './types';

const gradients:Record<Theme,string[]>={
 'glass-light':['#174A7E','#2166AC','#3787C0','#529BCC','#73B3D9','#98CBE5','#B7DEEE','#D0EBF5'],
 'glass-dark':['#367BBC','#4499D0','#52B5DE','#65C9E5','#80DBE9','#A2E8EE','#BFEFF3','#DCF8FA'],
 unhcr:['#07527F','#0875AC','#1596C5','#39AED5','#61C3E0','#8CD6EB','#B2E5F3','#D5F2FA'],
 executive:['#6E491A','#916224','#B58133','#CA9C4B','#DCB76A','#E8CD93','#F0DFB5','#F7EDD6'],
 multicolor:['#3155A6','#5367BB','#7B72C7','#A17FCB','#C28BCC','#D999BB','#E9ACAC','#F0C3A3'],
 forest:['#235C41','#347653','#459467','#62AF80','#83C59B','#A4D7B4','#C2E5CD','#DDF1E3'],
};

export function currentKoboTheme():Theme{
 const theme=typeof document==='undefined'?'glass-light':document.documentElement.dataset.theme;
 return theme&&Object.hasOwn(gradients,theme)?theme as Theme:'glass-light';
}
export const koboThemePalette=(theme:Theme=currentKoboTheme())=>gradients[theme]||gradients['glass-light'];
export function koboThemeColor(id:string,theme:Theme=currentKoboTheme()){
 const colors=koboThemePalette(theme);
 let hash=0;for(const char of id)hash=(hash*31+(char.codePointAt(0)||0))>>>0;
 return colors[id==='series'?0:hash%colors.length];
}
export function koboHeatmapScale(theme:Theme=currentKoboTheme(),high?:string):[number,string][]{
 const colors=high?Array.from({length:6},(_,index)=>{
  if(index===5)return high;
  const amount=.08+.92*index/5;
  return '#'+[1,3,5].map(offset=>Math.round(255+(parseInt(high.slice(offset,offset+2),16)-255)*amount).toString(16).padStart(2,'0')).join('');
 }):[...koboThemePalette(theme)].reverse();
 return colors.map((color,index)=>[index/(colors.length-1),color]);
}
