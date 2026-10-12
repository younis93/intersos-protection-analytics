import {fullMonthLabel, type TimelineSeries} from './timelineChart';
import {useEffect,useRef,useState} from 'react';

export default function SingleMonthIndicatorChart({month,series}:{month:string;series:TimelineSeries[]}) {
  const svgRef=useRef<SVGSVGElement>(null),[renderedWidth,setRenderedWidth]=useState(800);
  useEffect(()=>{
    if(!svgRef.current)return;
    const observer=new ResizeObserver(([entry])=>setRenderedWidth(Math.max(320,entry.contentRect.width)));
    observer.observe(svgRef.current);return()=>observer.disconnect();
  },[]);
  const fontScale=800/renderedWidth;
  const width=800,height=360,left=62,right=28,top=54,bottom=64;
  const baseline=height-bottom,plotWidth=width-left-right,plotHeight=baseline-top;
  const maximum=Math.max(1,...series.map(item=>item.values[0]||0))*1.2;
  const slot=plotWidth/Math.max(1,series.length),barWidth=Math.min(120,slot*.55);
  const ticks=Array.from(new Set([0,.25,.5,.75,1].map(ratio=>Math.floor(maximum*ratio))));
  return <div className="indicator-analysis-chart"><svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${fullMonthLabel(month)} indicator comparison`} style={{fontFamily:'Arial, sans-serif'}}>
    <rect width={width} height={height} rx="18" fill="var(--panel-strong)"/>
    {ticks.map(value=>{const y=baseline-value/maximum*plotHeight;return <g key={value}><line x1={left} x2={width-right} y1={y} y2={y} stroke="var(--line)"/><text x={left-12} y={y+4} textAnchor="end" style={{fontSize:10*fontScale,fill:'var(--muted)'}}>{new Intl.NumberFormat('en-US',value>=10000?{notation:'compact',maximumFractionDigits:1}:{}).format(value)}</text></g>})}
    {series.map((item,index)=>{const value=item.values[0]||0,x=left+slot*(index+.5),barHeight=value/maximum*plotHeight,y=baseline-barHeight;return <g key={item.label}>
      <title>{`${item.label}: ${value.toLocaleString('en-US')} - ${fullMonthLabel(month)}`}</title>
      <rect data-series={item.label} x={x-barWidth/2} y={y} width={barWidth} height={barHeight} fill={item.color}/>
      <text className="single-month-value" x={x} y={y-12*fontScale} textAnchor="middle" style={{fill:'var(--ink)',fontSize:14*fontScale,fontWeight:700}}>{value.toLocaleString('en-US')}</text>
    </g>})}
    <text x={left+plotWidth/2} y={height-25} textAnchor="middle" style={{fill:'var(--ink)',fontSize:12*fontScale,fontWeight:600}}>{fullMonthLabel(month)}</text>
  </svg><footer style={{flexWrap:"wrap",color:'var(--muted)'}}>{series.map(item=><span key={item.label}><i style={{background:item.color}}/>{item.label}</span>)}</footer></div>;
}
