export function rowOffsets(count:number, heights:Map<number,number>, estimate:number) {
  const offsets=[0];
  for(let index=0;index<count;index++)offsets.push(offsets[index]+(heights.get(index)||estimate));
  return offsets;
}

export function windowIndexes(offsets:number[],top:number,height:number,focus:number|null,overscan=10) {
  const count=offsets.length-1;
  const locate=(value:number)=>{let low=0,high=count;while(low<high){const mid=(low+high)>>1;if(offsets[mid+1]<=value)low=mid+1;else high=mid}return low};
  const start=Math.max(0,locate(Math.max(0,top))-overscan);
  const end=Math.min(count,locate(Math.max(0,top)+height)+overscan+1);
  const indexes=Array.from({length:Math.max(0,end-start)},(_,index)=>start+index);
  if(focus!==null&&focus>=0&&focus<count&&!indexes.includes(focus))indexes.push(focus);
  return indexes.sort((a,b)=>a-b);
}
