import type {ComponentPropsWithoutRef} from 'react';
import type {Theme} from './types';

export const chartInk=(theme:Theme)=>theme==='glass-dark'?'#edf7ff':'#263746';
export const chartGrid=(theme:Theme)=>theme==='glass-dark'?'rgba(190,215,232,.13)':'rgba(90,115,135,.13)';
export const plotConfig={displayModeBar:false,responsive:true,scrollZoom:false,doubleClick:false} as const;
export function ChartFrame(props:ComponentPropsWithoutRef<'div'>){return <div {...props}/>}
export function ChartLoading(){return <div className="loading" role="status">Loading chart…</div>}
