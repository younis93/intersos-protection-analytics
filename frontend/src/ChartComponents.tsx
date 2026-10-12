import {
Download,
Expand,
FileText,
X
} from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { createPortal } from "react-dom";
import { exportTableWorkbook } from "./api";
import { ChartFrame,chartGrid,chartInk,plotConfig } from './ChartPrimitives';
import { formatNumber,formatPercent } from './formatting';
import Plot from "./LazyPlot";
import { ExcelDownloadButton } from './SelectionControls';
import { fullMonthLabel,isSingleMonth,singleMonthTraces } from "./timelineChart";
import type { Chart,Display,Row,Theme } from "./types";
import { ValueTable } from "./ValueTable";

export const wrapAxisLabel=(label:string,max=30)=>{
  const words=label.trim().split(/\s+/),lines:string[]=[];
  for(const word of words){const last=lines.at(-1);if(!last||last.length+word.length+1>max)lines.push(word);else lines[lines.length-1]=`${last} ${word}`}
  return lines.join("<br>");
};

export const compactDetentionLabel=(title:string,label:string)=>{
  if(title==="Detaining Authority")return wrapAxisLabel(label);
  if(!["Detaining Authority","Possible Charges"].includes(title))return label;
  const english=label.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g,"").replace(/\s*[-–:|/]\s*$/g,"").replace(/\s{2,}/g," ").trim();
  return english.replace(/Other\s*\(please specify in the comments section\)/i,"Other").replace(/Residency department/i,"Residency Department")||label;
};

export const categoryPalette = ["#1877c9", "#2f9e68", "#d97706", "#7c5cc4", "#d9485f", "#168a91", "#9a6b35", "#536d88", "#b85c9e", "#6d8f38", "#e06b3c", "#3f73a8"];

export function FlowCard({rows,theme}:{rows:{source:string;target:string;count:number}[];theme:Theme}) {
  const [graph,setGraph]=useState<any>(null);
  const max=Math.max(...rows.map(row=>row.count),1);
  return <article className="chart-card glass wide"><div className="card-title"><div><h3>Nationality by deportation destination</h3><p>Each circle is a route; size and label show distinct deportation records</p></div><ExportButtons graph={graph} title="Nationality by deportation destination"/></div><ChartFrame className="plot-shell flow"><Plot key={`flow-${theme}`} useResizeHandler onInitialized={(_,gd)=>setGraph(gd)} data={[{type:"scatter",mode:"markers+text",x:rows.map(row=>row.target),y:rows.map(row=>row.source),text:rows.map(row=>formatNumber(row.count)),textposition:"middle center",textfont:{color:"#fff",size:12},marker:{size:rows.map(row=>22+Math.sqrt(row.count/max)*64),color:rows.map((_,i)=>categoryPalette[i%categoryPalette.length]),line:{color:"rgba(255,255,255,.9)",width:2},opacity:.9},customdata:rows.map(row=>[row.source,row.target,row.count]),hovertemplate:"%{customdata[0]} → %{customdata[1]}<br>%{customdata[2]:,.0f} records<extra></extra>"} as any]} layout={{autosize:true,height:390,margin:{l:30,r:30,t:22,b:65},paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",font:{family:"DM Sans,Segoe UI,sans-serif",color:chartInk(theme),size:11},xaxis:{title:"Deported to",gridcolor:chartGrid(theme),fixedrange:true,automargin:true},yaxis:{title:"Nationality",gridcolor:chartGrid(theme),fixedrange:true,automargin:true},showlegend:false}} config={plotConfig} style={{width:"100%",height:"100%"}}/></ChartFrame></article>
}

export function ChartCard({
  chart,
  display,
  onSelect,
  theme,
}: {
  chart: Chart;
  display: Display;
  onSelect: (field: string, value: string) => void;
  theme: Theme;
}) {
  const [modal, setModal] = useState(false),
    [graph, setGraph] = useState<any>(null);
  const rows = [...chart.rows].reverse();
  const priorityColors:Record<string,string>={High:"#dc2626",Medium:"#d97706",Low:"#16a34a","Not recorded":"#94a3b8"};
  const values = rows.map((r) => (display === "percent" ? r.percent : r.count));
  const text = rows.map((r) =>
    display === "count"
      ? formatNumber(r.count)
      : display === "percent"
        ? formatPercent(r.percent)
        : `${formatNumber(r.count)} · ${formatPercent(r.percent)}`,
  );
  return (
    <article className={`chart-card glass${chart.kind==="wide-bar"||["Detaining Authority","Possible Charges"].includes(chart.title)?" wide":""}`}>
      <div className="card-title">
        <div>
          <h3>{chart.title}</h3>
          {chart.multiChoice && <p>Selections are non-additive</p>}
        </div>
        <div className="chart-actions">
          <ExportButtons graph={graph} title={chart.title} />
          <button className="expand-button" onClick={() => setModal(true)}>
            <Expand />
            Pivot table
          </button>
        </div>
      </div>
      <ChartFrame className="plot-shell">
        <Plot
          key={`${chart.id}-${theme}`}
          revision={chart.rows.reduce((n, r) => n + r.count, 0)}
          useResizeHandler
          onInitialized={(_, gd) => setGraph(gd)}
          data={[
            {
              type: "bar",
              orientation: "h",
              x: values,
              y: rows.map((r) => compactDetentionLabel(chart.title,r.label)),
              customdata: rows.map((r) => r.filterValue || r.label),
              text,
              textposition: "auto",
              hovertemplate: "%{y}<br>%{text}<extra></extra>",
              marker: {
                color: chart.title === "Priority" ? rows.map((row)=>priorityColors[row.label]||"#64748b") : theme === "multicolor" ? rows.map((_, index) => categoryPalette[index % categoryPalette.length]) : "#1683d8",
                line: { color: "rgba(255,255,255,.55)", width: 1 },
              },
            },
          ]}
          layout={{
            autosize: true,
            height: Math.max(290, rows.length * 34),
            margin: { l: chart.title === "Detaining Authority" ? 260 : 18, r: 16, t: 8, b: 36 },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: {
              family: "DM Sans,Segoe UI,sans-serif",
              color: chartInk(theme),
            },
            dragmode: false,
            uirevision: "locked",
            xaxis: {
              gridcolor: chartGrid(theme),
              zeroline: false,
              tickformat: display === "percent" ? ".0%" : ",d",
              fixedrange: true,
            },
            yaxis: { automargin: true, fixedrange: true },
            showlegend: false,
          }}
          config={plotConfig}
          style={{ width: "100%", height: "100%" }}
          onClick={(e) => {
            const p = e.points?.[0];
            if (p) onSelect(chart.id, String(p.customdata || p.y));
          }}
        />
      </ChartFrame>
      {modal && (
        <PivotModal
          title={chart.title}
          rows={chart.rows}
          onClose={() => setModal(false)}
        />
      )}
    </article>
  );
}

export function TrendCard({
  rows,
  comparisonRows,
  hoverMetrics,
  primaryLabel,
  comparisonLabel = "Completed",
  display,
  title = "Activity over time",
  subtitle = "Monthly, valid reporting dates only",
  onSelect,
  onRemove,
  theme,
  selected = [],
}: {
  rows: Row[];
  comparisonRows?: Row[];
  hoverMetrics?: {label:string;icon:string;color:string;rows:{label:string;count:number}[]}[];
  primaryLabel?: string;
  comparisonLabel?: string;
  display: Display;
  title?: string;
  subtitle?: string;
  onSelect?: (months: string[], replace?: boolean) => void;
  onRemove?: (month: string) => void;
  theme: Theme;
  selected?: string[];
}) {
  const [modal, setModal] = useState(false),
    [graph, setGraph] = useState<any>(null);
  const dragAnchor = useRef<number | null>(null);
  const vals = rows.map((r) => (display === "percent" ? r.percent : r.count));
  const comparisonByMonth = new Map((comparisonRows || []).map((r) => [r.label, r]));
  const hoverMetricMaps = (hoverMetrics || []).map((metric) => new Map(metric.rows.map((row) => [row.label, row.count])));
  const hoverValues = rows.map((row) => hoverMetricMaps.map((metric) => metric.get(row.label) || 0));
  const hoverMetricTemplate = (hoverMetrics || []).map((metric,index) => `<span style="color:${metric.color}">${metric.icon}</span>&nbsp; ${metric.label}&nbsp;&nbsp;<b>%{customdata[${index}]:,.0f}</b>`).join("<br>");
  const comparisonVals = rows.map((r) => {
    const match = comparisonByMonth.get(r.label);
    return display === "percent" ? (match?.percent || 0) : (match?.count || 0);
  });
  const singleMonth=isSingleMonth(rows.map(row=>row.label));
  const bars=singleMonthTraces(rows.map(row=>row.label),[
    {label:primaryLabel||(comparisonRows?"Started":title),values:vals,color:"#1683d8",customdata:hoverMetrics?.length?hoverValues:undefined,
      hovertemplate:hoverMetrics?.length?`<b>${primaryLabel||title}</b>&nbsp;&nbsp;%{y:${display==="percent"?".1%":",.0f"}}<br>${hoverMetricTemplate}<extra></extra>`:undefined},
    ...(comparisonRows?[{label:comparisonLabel,values:comparisonVals,color:"#2f9e68"}]:[]),
  ],selected,chartInk(theme),display==="percent");
  const chooseRange = (a: number, b: number) =>
    onSelect?.(
      rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.label),
      true,
    );
  useEffect(() => {
    const stopDragging = () => { dragAnchor.current = null; };
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);
  return (
    <article className="chart-card glass wide">
      <div className="card-title">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}{onSelect ? " · Click a month or drag across months to select a range" : ""}</p>
        </div>
        <div className="chart-actions">
          <ExportButtons graph={graph} title={title} />
          <button className="expand-button" onClick={() => setModal(true)}>
            <Expand />
            Pivot table
          </button>
        </div>
      </div>
      <ChartFrame className="plot-shell trend" style={{height:330}}>
        <Plot
          key={`trend-${singleMonth?"bars":"line"}-${theme}-${title}-${selected.join("|") || "all"}`}
          revision={rows.reduce((n, r) => n + r.count, 0)}
          useResizeHandler
          onInitialized={(_, gd) => setGraph(gd)}
          data={singleMonth?bars:[
            {
              type: "scatter",
              mode: "lines+markers+text",
              name: primaryLabel || (comparisonRows ? "Started" : title),
              x: rows.map((r) => r.label),
              y: vals,
              selectedpoints: selected.length ? rows
                .map((r, i) => (selected.includes(r.label) ? i : -1))
                .filter((i) => i >= 0) : undefined,
              selected: { marker: { color: "#1683d8", size: 11 } },
              unselected: selected.length ? { marker: { opacity: 0.58 } } : undefined,
              line: { color: "#1683d8", width: 3, shape: "spline" },
              marker: {
                size: 9,
                color: "#fff",
                line: { color: "#1683d8", width: 3 },
              },
              fill: "tozeroy",
              fillcolor: "rgba(22,131,216,.10)",
              customdata: hoverMetrics?.length ? hoverValues : undefined,
              hovertemplate: hoverMetrics?.length
                ? `<b>${primaryLabel || title}</b>&nbsp;&nbsp;%{y:,.0f}<br>${hoverMetricTemplate}<extra></extra>`
                : `<b>${primaryLabel || (comparisonRows ? "Started" : title)}</b><br>%{y:,.0f}<extra></extra>`,
              text: vals.map((value) => display === "percent" ? formatPercent(value) : formatNumber(value)),
              textposition: "top center",
              textfont: { color: chartInk(theme), size: 12 },
              cliponaxis: false,
            },
            ...(comparisonRows ? [{
              type: "scatter" as const,
              mode: "lines+markers+text" as const,
              name: comparisonLabel,
              x: rows.map((r) => r.label),
              y: comparisonVals,
              line: { color: "#2f9e68", width: 3, shape: "spline" as const },
              marker: { size: 8, color: "#fff", line: { color: "#2f9e68", width: 3 } },
              text: comparisonVals.map((value) => display === "percent" ? formatPercent(value) : formatNumber(value)),
              textposition: "bottom center" as const,
              hovertemplate: `<b>${comparisonLabel}</b><br>%{y:,.0f}<extra></extra>`,
              textfont: { color: chartInk(theme), size: 12 },
              cliponaxis: false,
            }] : []),
            ...(selected.length ? [{
              type: "scatter" as const,
              mode: "markers" as const,
              name: "Selected detained month",
              x: rows.filter((row)=>selected.includes(row.label)).map((row)=>row.label),
              y: rows.map((row,index)=>({row,value:vals[index]})).filter(({row})=>selected.includes(row.label)).map(({value})=>value),
              marker: {size:16,color:"#1683d8",line:{color:"#fff",width:3}},
              hovertemplate: `%{x}<br>${primaryLabel||title}: %{y:,.0f}<extra></extra>`,
              showlegend: false,
            }] : []),
            ...(selected.length&&comparisonRows ? [{
              type: "scatter" as const,
              mode: "markers" as const,
              name: "Selected released month",
              x: rows.filter((row)=>selected.includes(row.label)).map((row)=>row.label),
              y: rows.map((row,index)=>({row,value:comparisonVals[index]})).filter(({row})=>selected.includes(row.label)).map(({value})=>value),
              marker: {size:14,color:"#2f9e68",symbol:"diamond" as const,line:{color:"#fff",width:3}},
              hovertemplate: `%{x}<br>${comparisonLabel}: %{y:,.0f}<extra></extra>`,
              showlegend: false,
            }] : []),
          ]}
          layout={{
            barmode: "group",
            autosize: true,
            height: 330,
            margin: { l: 50, r: 20, t: 15, b: 82 },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: {
              family: "DM Sans,Segoe UI,sans-serif",
              color: chartInk(theme),
            },
            dragmode: onSelect ? "select" : false,
            selectdirection: "h",
            uirevision: "locked",
            hovermode: "x unified",
            hoverlabel: {
              bgcolor: theme === "glass-dark" ? "#102737" : "#ffffff",
              bordercolor: theme === "glass-dark" ? "#3c7798" : "#9bb9ca",
              font: { family: "DM Sans,Segoe UI,sans-serif", color: chartInk(theme), size: 13 },
              align: "left",
            },
            shapes: singleMonth?[]:selected.map((month)=>({type:"line" as const,xref:"x" as const,yref:"paper" as const,x0:month,x1:month,y0:0,y1:1,line:{color:"rgba(22,131,216,.38)",width:2,dash:"dot" as const}})),
            xaxis: {
              gridcolor: chartGrid(theme), fixedrange: false, type: "category",
              tickmode: "array",
              tickvals: rows.map((r) => r.label),
              ticktext: rows.map((r) => singleMonth?fullMonthLabel(r.label):new Intl.DateTimeFormat("en", {month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(`${r.label}-01T00:00:00Z`))),
              tickangle: singleMonth?0:-45,
              range: singleMonth?[-.65,.65]:undefined,
              automargin: true,
            },
            yaxis: {
              gridcolor: chartGrid(theme),
              rangemode: "tozero",
              range: singleMonth?[0,Math.max(1,...vals,...(comparisonRows?comparisonVals:[]))*1.2]:undefined,
              automargin: true,
              tickformat: display === "percent" ? ".0%" : ",d",
              fixedrange: true,
            },
            showlegend: Boolean(comparisonRows),
            legend: { orientation: "h", x: 0, y: 1.14 },
          }}
          config={plotConfig}
          style={{ width: "100%", height: "100%" }}
          onClick={(e) => {
            const p = e.points?.[0];
            if (p && onSelect) onSelect([String(p.x)]);
          }}
          onSelected={(e) => {
            const months = Array.from(new Set((e?.points || []).map((p: any) => String(p.x))));
            if (months.length)
              onSelect?.(rows.filter((r) => months.includes(r.label)).map((r) => r.label), true);
          }}
        />
      </ChartFrame>
      {onSelect && <div className="timeline-chips" aria-label="Month range selector">
        {rows.map((r, i) => (
          <button
            key={r.label}
            className={selected.includes(r.label) ? "selected" : ""}
            onMouseDown={() => { dragAnchor.current = i; chooseRange(i, i); }}
            onMouseEnter={(e) => {
              if (dragAnchor.current !== null && (e.buttons & 1)) chooseRange(dragAnchor.current, i);
            }}
            onClick={() => { if (dragAnchor.current === null) onSelect?.([r.label]); }}
          >
            <span>{new Intl.DateTimeFormat("en", {month: "short", year: "numeric", timeZone: "UTC"}).format(new Date(`${r.label}-01T00:00:00Z`))}</span>
            {selected.includes(r.label) && onRemove && <X className="timeline-chip-remove" role="button" aria-label={`Remove ${r.label} filter`} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => {event.stopPropagation();onRemove(r.label)}}/>}
          </button>
        ))}
      </div>}
      {modal && (
        <PivotModal title={title} rows={rows} onClose={() => setModal(false)} />
      )}
    </article>
  );
}

export function ExportButtons({ graph, title }: { graph: any; title: string }) {
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState("");
  const run = async (format: "png" | "pdf") => {
    if (!graph || busy) return;
    setBusy(true);
    setDone("");
    try {
      const {exportChart} = await import("./chartExport");
      await exportChart(graph, title, format);
      setDone(format.toUpperCase());
      setTimeout(() => setDone(""), 1800);
    } catch {
      setDone("Error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="export-buttons">
      <button
        disabled={!graph || busy}
        onClick={() => run("png")}
        title="Download high-resolution PNG"
      >
        <Download />
        {busy ? "Exporting…" : done === "PNG" ? "Saved" : "PNG"}
      </button>
      <button
        disabled={!graph || busy}
        onClick={() => run("pdf")}
        title="Download PDF"
      >
        <FileText />
        {busy ? "Exporting…" : done === "PDF" ? "Saved" : "PDF"}
      </button>
      {done === "Error" && <span className="export-error">Export failed</span>}
    </div>
  );
}

export function pivotRows(rows: Row[]) {
  const total=rows.reduce((sum,row)=>sum+row.count,0);
  return rows.map((row)=>({...row,percent:row.percent || (total?row.count/total:0)}));
}

export function DataTable({ rows }: { rows: Row[] }) {
  const displayRows=pivotRows(rows);
  return (
    <div className="table-wrap">
      <ValueTable>
        <thead>
          <tr>
            <th>Category</th>
            <th>#</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{formatNumber(r.count)}</td>
              <td>{formatPercent(r.percent)}</td>
            </tr>
          ))}
        </tbody>
      </ValueTable>
    </div>
  );
}

export function PivotModal({
  title,
  rows,
  onClose,
}: {
  title: string;
  rows: Row[];
  onClose: () => void;
}) {
  const [downloading,setDownloading]=useState(false);
  const downloadExcel=async()=>{setDownloading(true);try{await exportTableWorkbook(`${title.replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"interactive-detail"}.xlsx`,["Category","Count","Percent"],pivotRows(rows).map((row)=>({Category:row.label,Count:row.count,Percent:`${(row.percent*100).toFixed(1)}%`})));}finally{setDownloading(false)}};
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="pivot-modal glass"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} pivot table`}
      >
        <header>
          <div>
            <span>Interactive detail</span>
            <h2>{title}</h2>
            <p>Counts and percentages use the active dashboard filters.</p>
          </div>
          <div className="pivot-actions">
            <ExcelDownloadButton className="primary pivot-download" onClick={downloadExcel} busy={downloading}/>
            <button className="icon" onClick={onClose} aria-label="Close pivot table">
              <X />
            </button>
          </div>
        </header>
        <DataTable rows={rows} />
      </section>
    </div>,
    document.body,
  );
}
