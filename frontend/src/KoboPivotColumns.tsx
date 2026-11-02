import type {PivotSlot} from './koboPivotViewport';
import {pivotAnswerWidth,pivotMetricWidth} from './koboPivotViewport';
export function KoboPivotColumns({slots,metrics,totals}:{slots:PivotSlot[];metrics:number;totals:number}){
 return <colgroup><col style={{width:pivotAnswerWidth}}/>{slots.flatMap(slot=>slot.gap?<col key={`gap${slot.index}`} style={{width:slot.span*metrics*pivotMetricWidth}}/>:Array.from({length:metrics},(_,metric)=><col key={`${slot.index}:${metric}`} style={{width:pivotMetricWidth}}/>))}{Array.from({length:totals},(_,i)=><col key={`total${i}`} style={{width:pivotMetricWidth}}/>)}</colgroup>;
}
export const pivotGapStyle=(span:number,metrics:number)=>({width:span*metrics*pivotMetricWidth,minWidth:span*metrics*pivotMetricWidth,padding:0,border:0});
