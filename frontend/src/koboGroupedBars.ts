function visibleBar(value:number|null){
 return value!==null&&Number.isFinite(value)&&value!==0;
}

/** Preserve series widths while centering the visible bars on each category tick. */
export function groupedBarPositions(series:readonly (readonly (number|null)[])[],gap:number,groupGap=0){
 if(series.length<2)return undefined;
 const values=series[0];
 const visibleCounts=values.map((_,row)=>series.reduce((count,trace)=>count+Number(visibleBar(trace[row])),0));
 if(!visibleCounts.some(count=>count>0&&count<series.length))return undefined;
 const slot=(1-gap)/series.length,width=slot*(1-groupGap);
 const nextVisibleIndex=values.map(()=>0);
 return series.map((trace,seriesIndex)=>({
  width,
  offset:trace.map((value,row)=>{
   const visible=visibleBar(value);
   const index=visible?nextVisibleIndex[row]++:seriesIndex;
   const count=visible?visibleCounts[row]:series.length;
   return (index-(count-1)/2)*slot-width/2;
  }),
 }));
}
