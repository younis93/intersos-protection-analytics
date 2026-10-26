import type {ComponentPropsWithoutRef} from 'react';
import type {Theme} from './types';

export const chartInk=(theme:Theme)=>theme==='glass-dark'?'#edf7ff':theme==='forest'?'#18251d':'#263746';
export const chartGrid=(theme:Theme)=>theme==='glass-dark'?'rgba(190,215,232,.13)':theme==='forest'?'rgba(20,83,45,.13)':'rgba(90,115,135,.13)';
export const chartPrimary='#1683d8';
export const chartAccent=(theme?:Theme)=>theme==='forest'?'#15803d':chartPrimary;
export const categoryPalette=["#1877c9","#2f9e68","#d97706","#7c5cc4","#d9485f","#168a91","#9a6b35","#536d88","#b85c9e","#6d8f38","#e06b3c","#3f73a8"];
export function chartCategoryColor(id:string){let hash=0;for(const c of id)hash=(hash*31+(c.codePointAt(0)||0))>>>0;return categoryPalette[hash%categoryPalette.length]}
export const plotConfig={displayModeBar:false,responsive:true,scrollZoom:false,doubleClick:false} as const;
export function ChartFrame(props:ComponentPropsWithoutRef<'div'>){return <div {...props}/>}
export function ChartLoading(){return <div className="loading" role="status">Loading chart…</div>}
