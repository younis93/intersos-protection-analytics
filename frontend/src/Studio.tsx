import {useEffect,useMemo,useState} from 'react';
import Plot from 'react-plotly.js';
import {ChevronDown,LayoutDashboard,RotateCcw,Search,SlidersHorizontal,Table2,X} from 'lucide-react';
import {getStudio,getLegalExplorerFilters} from './api';
import {AppSelect,ExportButtons,formatNumber,formatPercent} from './components';
import {transformStudioResult,type StudioView} from './studioChart';
import type {Filters,Measure,Metadata,StudioChartOptions,StudioLabelMode,StudioOrientation,StudioResult,StudioSort,StudioTopN,StudioValueMode,Theme} from './types';

type ChartType='bar'|'stacked'|'line'|'donut'|'heatmap'|'table';
const ink=(theme:Theme)=>theme==='glass-dark'?'#edf7ff':'#263746';
const grid=(theme:Theme)=>theme==='glass-dark'?'rgba(190,215,232,.13)':'rgba(90,115,135,.13)';
const label=(value:string)=>value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
const palette=['#315ea8','#2f8f68','#d4852f','#7759b8','#c94f68','#16858d','#9b6b35','#526d8d'];
const defaultText=['#ffffff','#ffffff','#172334','#ffffff','#ffffff','#ffffff','#ffffff','#ffffff'];
const defaultOptions:StudioChartOptions={sort:'value-desc',topN:'all',valueMode:'count',labelMode:'auto',orientation:'horizontal'};

export default function Studio({metadata,theme,sourceOptions,studioLoader,excludeFields}:{metadata:Metadata;theme:Theme;sourceOptions?:[string,string][];studioLoader?:typeof getStudio;excludeFields?:(field:string)=>boolean}){
  const sources=sourceOptions||[['assessment','Assessments'],['services','Legal Services'],['deportation','Deportation']];
  const [source,setSource]=useState(sources[0][0]),[row,setRow]=useState('project'),[column,setColumn]=useState(''),[measure,setMeasure]=useState<Measure>('records'),[chartType,setChartType]=useState<ChartType>('bar'),[filters,setFilters]=useState<Filters>({}),[drawer,setDrawer]=useState(false),[filterSearch,setFilterSearch]=useState(''),[availableFilters,setAvailableFilters]=useState<Record<string,string[]>>({}),[result,setResult]=useState<StudioResult|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[graph,setGraph]=useState<any>(null);
  const [options,setOptions]=useState<StudioChartOptions>(defaultOptions);
  const [customColors,setCustomColors]=useState(false),[markColors,setMarkColors]=useState<Record<string,string>>({}),[textColors,setTextColors]=useState<Record<string,string>>({});
  const sourceMeta=metadata.pages[source];
  const dimensions=(sourceMeta?.dimensions||Object.keys(sourceMeta?.filters||{})).filter(field=>!excludeFields?.(field));
  const activeCount=Object.values(filters).reduce((total,values)=>total+values.length,0);
  const hasSeries=Boolean(column);

  useEffect(()=>{setFilters({});setColumn('');setMeasure('records');setRow(metadata.pages[source]?.dimensions?.[0]||'project')},[source,metadata]);
  useEffect(()=>{let active=true;getLegalExplorerFilters(source).then((result)=>{if(active)setAvailableFilters(Object.fromEntries(result.columns.filter(column=>!excludeFields?.(column.name)).map((column)=>[column.name,column.values])))}).catch(()=>{if(active)setAvailableFilters(Object.fromEntries(Object.entries(sourceMeta?.filters||{}).filter(([field])=>!excludeFields?.(field))))});return()=>{active=false}},[source,sourceMeta,excludeFields]);
  useEffect(()=>{if(!row)return;const controller=new AbortController();setBusy(true);setError('');(studioLoader||getStudio)(source,row,column,filters,measure,controller.signal).then(setResult).catch(reason=>{if(reason.name!=='AbortError')setError(reason.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[source,row,column,filters,measure,studioLoader]);
  useEffect(()=>{setOptions(current=>({...current,orientation:chartType==='bar'?'horizontal':chartType==='stacked'?'vertical':current.orientation,valueMode:!column&&['percent-row','percent-series'].includes(current.valueMode)?'percent-total':current.valueMode}))},[chartType,column]);

  const view=useMemo(()=>result?transformStudioResult(result,options):null,[result,options]);
  const colorKeys=useMemo(()=>view?(view.columns.length>1?view.columns:view.rows):[],[view]);
  const chart=useMemo(()=>buildChart(view,chartType,theme,options,customColors?markColors:{},customColors?textColors:{}),[view,chartType,theme,options,customColors,markColors,textColors]);
  const setOption=<K extends keyof StudioChartOptions>(key:K,value:StudioChartOptions[K])=>setOptions(current=>({...current,[key]:value}));
  const valueOptions:[string,string][]=hasSeries
    ?[['count','Count'],['percent-total','% of filtered total'],['percent-series','% within series'],['percent-row','% within row']]
    :[['count','Count'],['percent-total','% of filtered total']];
  const showOrientation=chartType==='bar'||chartType==='stacked';
  const showLabels=!['table','heatmap'].includes(chartType);

  return <>
    <div className="studio-toolbar glass">
      <div className="studio-heading"><LayoutDashboard/><div><strong>Analysis builder</strong><span>Choose a source, one or two dimensions, and a visual.</span></div></div>
      <div className="studio-controls">
        <Select label="Source sheet" value={source} onChange={setSource} options={sources}/>
        <Select label="Rows / X-axis" value={row} onChange={setRow} options={dimensions.map(dimension=>[dimension,label(dimension)])} searchable/>
        <Select label="Columns / Series" value={column} onChange={setColumn} options={[['','None'],...dimensions.filter(dimension=>dimension!==row).map(dimension=>[dimension,label(dimension)] as [string,string])]} searchable/>
        <Select label="Measure" value={measure} onChange={value=>setMeasure(value as Measure)} options={source==='deportation'?[['records','PN IDs']]:[['records',source==='services'?'Service IDs':'Assessment IDs'],['beneficiaries','Unique beneficiaries']]}/>
        <Select label="Output" value={chartType} onChange={value=>setChartType(value as ChartType)} options={[['bar','Ranked bar'],['stacked','Stacked bar'],['line','Line'],['donut','Donut'],['heatmap','Heatmap'],['table','Pivot table']]}/>
      </div>
      <section className="studio-options" aria-label="Chart options">
        <SlidersHorizontal className="studio-options-icon" aria-hidden="true"/>
        <div className="studio-option-grid">
          <Select label="Sort categories" value={options.sort} onChange={value=>setOption('sort',value as StudioSort)} options={[['value-desc','Value: high to low'],['value-asc','Value: low to high'],['label-asc','Label: A to Z'],['label-desc','Label: Z to A'],['source','Source order']]}/>
          <Select label="Categories" value={String(options.topN)} onChange={value=>setOption('topN',value==='all'?'all':Number(value) as StudioTopN)} options={[['all','All categories'],['5','Top 5 + Other'],['10','Top 10 + Other'],['15','Top 15 + Other'],['20','Top 20 + Other']]}/>
          <Select label="Values" value={options.valueMode} onChange={value=>setOption('valueMode',value as StudioValueMode)} options={valueOptions}/>
          {showLabels&&<Select label="Data labels" value={options.labelMode} onChange={value=>setOption('labelMode',value as StudioLabelMode)} options={[['auto','Automatic'],['show','Always show'],['hide','Hide']]}/>}
          {showOrientation&&<Select label="Orientation" value={options.orientation} onChange={value=>setOption('orientation',value as StudioOrientation)} options={[['horizontal','Horizontal'],['vertical','Vertical']]}/>}
        </div>
      </section>
      <div className="studio-actions studio-shared-filter-actions"><button className="primary" onClick={()=>setDrawer(true)}><SlidersHorizontal/>All filters {activeCount>0&&<b>{activeCount}</b>}</button><button className="soft" disabled={!activeCount} onClick={()=>setFilters({})}><RotateCcw/>Clear</button></div>
      {theme==='multicolor'&&chartType!=='table'&&<section className="studio-color-panel"><div className="studio-color-head"><div><strong>Answer colors</strong><span>Use the curated palette or customize chart and label colors independently.</span></div><label className="color-toggle"><input type="checkbox" checked={customColors} onChange={event=>setCustomColors(event.target.checked)}/><i/><span>Custom colors</span></label></div>{customColors&&<div className="studio-color-grid">{colorKeys.map((key,index)=><div className="answer-color" key={key}><span title={key}>{key}</span><label>Chart<input type="color" value={markColors[key]||palette[index%palette.length]} onChange={event=>setMarkColors(colors=>({...colors,[key]:event.target.value}))}/></label><label>Text<input type="color" value={textColors[key]||defaultText[index%defaultText.length]} onChange={event=>setTextColors(colors=>({...colors,[key]:event.target.value}))}/></label></div>)}</div>}</section>}
    </div>
    {error&&<div className="error glass">{error}</div>}
    <article className="studio-canvas glass"><div className="card-title"><div><h3>{label(row)}{column?` by ${label(column)}`:''}</h3><p>{result?`${formatNumber(result.total)} filtered ${measure==='beneficiaries'?'beneficiaries':'records'} · 2026 YTD`:''}</p></div><div className="chart-actions">{chartType!=='table'&&<ExportButtons graph={graph} title={`${label(row)}${column?` by ${label(column)}`:''}`}/>}<span className="studio-badge"><Table2/>{chartType==='table'?'Pivot':'Interactive chart'}</span></div></div>{busy&&!result?<div className="loading"><div/><span>Building analysis…</span></div>:chartType==='table'?<StudioTable view={view}/>:chart&&<div className="studio-plot"><Plot key={`${source}-${row}-${column}-${chartType}-${theme}`} useResizeHandler onInitialized={(_,graphDiv)=>setGraph(graphDiv)} data={chart.data as any} layout={chart.layout as any} config={{displayModeBar:false,responsive:true,scrollZoom:false,doubleClick:false}} style={{width:'100%',height:'100%'}}/></div>}</article>
    {drawer&&<><button className="filter-backdrop" aria-label="Close Custom Builder filters" onClick={()=>setDrawer(false)}/><aside className="case-filter-drawer analytics-filter-drawer"><header><div><span className="eyebrow">ANALYTICS STUDIO FILTERS</span><h2>Filter Custom Builder</h2></div><button onClick={()=>setDrawer(false)} aria-label="Close filters"><X/></button></header><label className="filter-search"><Search/><input value={filterSearch} onChange={(event)=>setFilterSearch(event.target.value)} placeholder="Search filters"/></label><div className="case-filter-scroll">{Object.entries(availableFilters).filter(([field])=>field.toLowerCase().includes(filterSearch.toLowerCase())).map(([field,values])=><details key={field} open={Boolean(filters[field]?.length)}><summary><span>{label(field)}</span>{filters[field]?.length>0&&<b>{filters[field].length}</b>}<ChevronDown/></summary><div>{values.map((value)=><label key={value}><input type="checkbox" checked={filters[field]?.includes(value)||false} onChange={()=>setFilters(current=>({...current,[field]:current[field]?.includes(value)?current[field].filter((item)=>item!==value):[...(current[field]||[]),value]}))}/><span>{value}</span></label>)}</div></details>)}</div><footer><button className="soft" disabled={!activeCount} onClick={()=>setFilters({})}>Clear all</button><button className="primary" onClick={()=>setDrawer(false)}>Apply filters {activeCount>0&&`(${activeCount})`}</button></footer></aside></>}
  </>;
}

function Select({label:caption,value,onChange,options,searchable=false}:{label:string;value:string;onChange:(value:string)=>void;options:string[][];searchable?:boolean}){return <AppSelect label={caption} value={value} onChange={onChange} options={options as [string,string][]} searchable={searchable}/>}
const valueTitle=(mode:StudioValueMode)=>mode==='count'?'Count':mode==='percent-total'?'Percent of filtered total':mode==='percent-series'?'Percent within series':'Percent within row';
const valueText=(value:number,mode:StudioValueMode)=>mode==='count'?formatNumber(value):`${value.toFixed(1)}%`;

function buildChart(view:StudioView|null,type:ChartType,theme:Theme,options:StudioChartOptions,marks:Record<string,string>,texts:Record<string,string>){
  if(!view||!view.cells.length)return null;
  const {rows,columns}=view;
  const cell=(row:string,column:string)=>view.cells.find(item=>item.row===row&&item.column===column)!;
  const percentageAxis=options.valueMode!=='count';
  const axis={gridcolor:grid(theme),fixedrange:true,automargin:true,ticksuffix:percentageAxis?'%':undefined};
  const common={autosize:true,height:560,margin:{l:90,r:35,t:35,b:90},paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:'DM Sans,Segoe UI,sans-serif',color:ink(theme)},dragmode:false,uirevision:'studio',xaxis:{...axis},yaxis:{...axis},legend:{orientation:'h',y:1.08},showlegend:columns.length>1};
  const custom=(item:ReturnType<typeof cell>)=>[item.count,item.displayPercent*100,item.totalShare*100,item.value];
  const selectedHover=options.valueMode==='count'?'':`<br>${valueTitle(options.valueMode)}: %{customdata[3]:.1f}%`;
  const hover=(series:string,categoryToken:string)=>`${categoryToken}${columns.length>1?`<br>Series: ${series}`:''}<br>Count: %{customdata[0]:,.0f}${selectedHover}<br>Share of filtered total: %{customdata[2]:.1f}%<extra></extra>`;
  if(type==='heatmap'&&columns.length>1)return{data:[{type:'heatmap',x:columns,y:rows,z:rows.map(row=>columns.map(column=>cell(row,column).value)),customdata:rows.map(row=>columns.map(column=>custom(cell(row,column)))),colorscale:[[0,'#edf2fb'],[1,marks[columns[0]]||'#315ea8']],colorbar:{title:percentageAxis?'%':'Count'},hovertemplate:`%{y}<br>Series: %{x}<br>Count: %{customdata[0]:,.0f}${selectedHover}<br>Share of filtered total: %{customdata[2]:.1f}%<extra></extra>`}],layout:common};
  if(type==='donut'&&columns.length===1)return{data:[{type:'pie',labels:rows,values:rows.map(row=>cell(row,columns[0]).count),hole:.58,textinfo:options.labelMode==='hide'?'none':options.labelMode==='show'?'label+percent':'percent',marker:{colors:rows.map((row,index)=>marks[row]||palette[index%palette.length])},textfont:{color:rows.map((row,index)=>texts[row]||defaultText[index%defaultText.length])},customdata:rows.map(row=>custom(cell(row,columns[0]))),hovertemplate:`%{label}<br>Count: %{customdata[0]:,.0f}<br>Percent of filtered total: %{customdata[2]:.1f}%<extra></extra>`}],layout:{...common,margin:{l:30,r:30,t:30,b:30},showlegend:false}};
  const horizontal=(type==='bar'||type==='stacked')&&options.orientation==='horizontal';
  const traces=columns.map((column,index)=>{
    const single=columns.length===1;
    const items=rows.map(row=>cell(row,column));
    const values=items.map(item=>item.value);
    const labels=options.labelMode==='hide'?undefined:options.labelMode==='show'||rows.length<=12?values.map(value=>valueText(value,options.valueMode)):undefined;
    return {type:type==='line'?'scatter':'bar',orientation:horizontal?'h':undefined,mode:type==='line'?'lines+markers+text':undefined,name:column,x:horizontal?values:rows,y:horizontal?rows:values,text:labels,textposition:type==='line'?'top center':horizontal?'outside':'auto',cliponaxis:false,marker:{color:single?rows.map((row,rowIndex)=>marks[row]||palette[rowIndex%palette.length]):marks[column]||palette[index%palette.length]},line:{width:3,color:marks[column]||palette[index%palette.length]},textfont:{color:single?rows.map((row,rowIndex)=>texts[row]||defaultText[rowIndex%defaultText.length]):texts[column]||defaultText[index%defaultText.length]},customdata:items.map(custom),hovertemplate:hover(column,horizontal?'%{y}':'%{x}')};
  });
  const layout=horizontal?{...common,margin:{...common.margin,l:150},xaxis:{...axis,title:valueTitle(options.valueMode)},yaxis:{gridcolor:grid(theme),fixedrange:true,automargin:true,autorange:'reversed'},barmode:type==='stacked'?'stack':'group'}:{...common,yaxis:{...axis,title:valueTitle(options.valueMode)},barmode:type==='stacked'?'stack':'group'};
  return {data:traces,layout};
}

function StudioTable({view}:{view:StudioView|null}){
  if(!view)return null;
  return <div className="table-wrap studio-table"><table><thead><tr><th>Category</th>{view.columns.map(column=><th key={column}>{column}</th>)}<th>Total</th></tr></thead><tbody>{view.rows.map(row=>{const cells=view.columns.map(column=>view.cells.find(cell=>cell.row===row&&cell.column===column)!);const total=cells.reduce((sum,cell)=>sum+cell.count,0);return <tr key={row}><td>{row}</td>{cells.map(cell=><td key={cell.column}>{formatNumber(cell.count)} · {formatPercent(cell.totalShare)}</td>)}<td><strong>{formatNumber(total)}</strong></td></tr>})}</tbody></table></div>;
}
