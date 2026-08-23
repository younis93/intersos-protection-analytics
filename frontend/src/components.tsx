import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Plot from "react-plotly.js";
import {
  Check,
  ChevronDown,
  Download,
  Expand,
  FileText,
  Search,
  X,
} from "lucide-react";
import type { Chart, Display, Filters, QualityRow, Row, Theme } from "./types";
import { exportChart } from "./chartExport";
import { exportTableWorkbook } from "./api";

export const formatNumber = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
export const formatPercent = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(n);

/** Keeps stored project values intact while using the concise name in the UI. */
export const formatProjectLabel = (value: string) =>
  value.replace(/^UNHCR\s+2026\s*-\s*/i, "").trim() || value;

export function ExcelDownloadButton({onClick,children="Excel",className="primary",disabled=false,busy:controlledBusy,title}:{onClick:()=>Promise<void>|void;children?:ReactNode;className?:string;disabled?:boolean;busy?:boolean;title?:string}) {
  const [localBusy,setLocalBusy]=useState(false),busy=controlledBusy??localBusy;
  const download=async()=>{if(busy)return;setLocalBusy(true);try{await onClick()}finally{setLocalBusy(false)}};
  const label=title||"Download Excel";
  return <button className={`${className} excel-download-button${busy?" is-preparing":""}`} disabled={disabled||busy} aria-busy={busy} aria-label={busy?"Preparing Excel download":label} title={busy?"Preparing Excel download":label} onClick={()=>void download()}><span className="excel-download-button-content"><Download/>{children}</span>{busy&&<span className="button-spinner excel-download-spinner" aria-hidden="true"/>}</button>;
}

export function AppSelect({
  label,
  value,
  onChange,
  options,
  variant = "field",
  icon: Icon,
  disabled = false,
  ariaLabel,
  searchable = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  variant?: "field" | "theme";
  icon?: any;
  disabled?: boolean;
  ariaLabel?: string;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find(([option]) => option === value)?.[1] || value;
  const isProjectSelect = /^projects?$/i.test(label.trim());
  const displayCaption = (caption: string) =>
    isProjectSelect ? formatProjectLabel(caption) : caption;
  const visibleOptions = searchable
    ? options.filter(([, caption]) => displayCaption(caption).toLowerCase().includes(search.trim().toLowerCase()))
    : options;
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={root} className={`app-select ${variant === "theme" ? "app-select-theme" : ""} ${open ? "open" : ""} ${disabled ? "disabled" : ""}`}>
      {Icon && <Icon className="app-select-icon" />}
      <span className="app-select-label">{label}</span>
      <button
        type="button"
        className="app-select-trigger"
        aria-label={ariaLabel || label}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((shown) => { if (!shown) setSearch(""); return !shown; })}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
      >
        <span>{displayCaption(selected)}</span><ChevronDown />
      </button>
      {open && (
        <div className="app-select-menu" role="listbox" aria-label={`${label} options`}>
          {searchable && <label className="app-select-menu-search"><Search/><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}`}/></label>}
          {visibleOptions.map(([option, caption]) => (
            <button key={option} type="button" role="option" aria-selected={option === value} className={option === value ? "selected" : ""} onClick={() => { onChange(option); setOpen(false); }}>
              <span>{displayCaption(caption)}</span>{option === value && <Check />}
            </button>
          ))}
          {searchable && !visibleOptions.length && <p className="app-select-no-results">No matching options</p>}
        </div>
      )}
    </div>
  );
}

export function CheckboxMultiSelect({label,values,selected,onChange,hideLabel=false}:{label:string;values:string[];selected:string[];onChange:(values:string[])=>void;hideLabel?:boolean}) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState("");
  const root=useRef<HTMLDivElement>(null);const visible=values.filter((item)=>item.toLowerCase().includes(search.toLowerCase()));
  const selectedLabel=label.replace(/ies$/i,"y").replace(/s$/i,"").replace(/\b\w/g,(letter)=>letter.toUpperCase());
  const isProjectFilter=/^projects?$/i.test(label.trim());
  useEffect(()=>{const close=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};window.addEventListener("mousedown",close);return()=>window.removeEventListener("mousedown",close)},[]);
  return <div ref={root} className={`app-select checkbox-multi-select ${hideLabel?"label-hidden":""} ${open?"open":""} ${selected.length?"has-selection":""}`}>{!hideLabel&&<span className="app-select-label">{label}</span>}<button type="button" className="app-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen((value)=>!value)} onKeyDown={(event)=>{if(event.key==="Escape")setOpen(false)}}><span>{selected.length?`${selectedLabel} (${selected.length})`:`All ${label.toLowerCase()}`}</span><ChevronDown/></button>{open&&<div className="app-select-menu checkbox-multi-menu" role="listbox" aria-label={`${label} filters`}><label className="multi-select-search"><Search/><input autoFocus value={search} onChange={(event)=>setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}`}/></label><div>{visible.map((item)=><label className={selected.includes(item)?"selected":""} key={item}><input type="checkbox" checked={selected.includes(item)} onChange={()=>onChange(selected.includes(item)?selected.filter((value)=>value!==item):[...selected,item])}/><span>{isProjectFilter?formatProjectLabel(item):item}</span></label>)}</div>{!visible.length&&<p>No matching options</p>}<footer><button type="button" disabled={!selected.length} onClick={()=>onChange([])}>Clear</button><button type="button" onClick={()=>setOpen(false)}>Done</button></footer></div>}</div>
}

export function KpiCard({
  label,
  value,
  format,
}: {
  label: string;
  value: number;
  format: string;
}) {
  const descriptions: Record<string,string> = {
    "Open caseload": "Distinct assessments not marked closed",
    "Beneficiaries served": "Unique beneficiary IDs with a service record",
    "Service coverage": "Beneficiaries served ÷ beneficiaries assessed",
  };
  return (
    <article className="kpi-card glass">
      <span>{label}</span>
      <strong>
        {format === "percent" ? formatPercent(value) : formatNumber(value)}
      </strong>
      {descriptions[label] && <small>{descriptions[label]}</small>}
    </article>
  );
}

const chartInk = (theme: Theme) =>
  theme === "glass-dark" ? "#edf7ff" : "#263746";
const chartGrid = (theme: Theme) =>
  theme === "glass-dark" ? "rgba(190,215,232,.13)" : "rgba(90,115,135,.13)";
const categoryPalette = ["#1877c9", "#2f9e68", "#d97706", "#7c5cc4", "#d9485f", "#168a91", "#9a6b35", "#536d88", "#b85c9e", "#6d8f38", "#e06b3c", "#3f73a8"];
const plotConfig = {
  displayModeBar: false,
  responsive: true,
  scrollZoom: false,
  doubleClick: false,
} as const;

export function FlowCard({rows,theme}:{rows:{source:string;target:string;count:number}[];theme:Theme}) {
  const [graph,setGraph]=useState<any>(null);
  const max=Math.max(...rows.map(row=>row.count),1);
  return <article className="chart-card glass wide"><div className="card-title"><div><h3>Nationality by deportation destination</h3><p>Each circle is a route; size and label show distinct deportation records</p></div><ExportButtons graph={graph} title="Nationality by deportation destination"/></div><div className="plot-shell flow"><Plot key={`flow-${theme}`} useResizeHandler onInitialized={(_,gd)=>setGraph(gd)} data={[{type:"scatter",mode:"markers+text",x:rows.map(row=>row.target),y:rows.map(row=>row.source),text:rows.map(row=>formatNumber(row.count)),textposition:"middle center",textfont:{color:"#fff",size:12},marker:{size:rows.map(row=>22+Math.sqrt(row.count/max)*64),color:rows.map((_,i)=>categoryPalette[i%categoryPalette.length]),line:{color:"rgba(255,255,255,.9)",width:2},opacity:.9},customdata:rows.map(row=>[row.source,row.target,row.count]),hovertemplate:"%{customdata[0]} → %{customdata[1]}<br>%{customdata[2]:,.0f} records<extra></extra>"} as any]} layout={{autosize:true,height:390,margin:{l:30,r:30,t:22,b:65},paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",font:{family:"DM Sans,Segoe UI,sans-serif",color:chartInk(theme),size:11},xaxis:{title:"Deported to",gridcolor:chartGrid(theme),fixedrange:true,automargin:true},yaxis:{title:"Nationality",gridcolor:chartGrid(theme),fixedrange:true,automargin:true},showlegend:false}} config={plotConfig} style={{width:"100%",height:"100%"}}/></div></article>
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
  const values = rows.map((r) => (display === "percent" ? r.percent : r.count));
  const text = rows.map((r) =>
    display === "count"
      ? formatNumber(r.count)
      : display === "percent"
        ? formatPercent(r.percent)
        : `${formatNumber(r.count)} · ${formatPercent(r.percent)}`,
  );
  return (
    <article className="chart-card glass">
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
      <div className="plot-shell">
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
              y: rows.map((r) => r.label),
              text,
              textposition: "auto",
              hovertemplate: "%{y}<br>%{text}<extra></extra>",
              marker: {
                color: theme === "multicolor" ? rows.map((_, index) => categoryPalette[index % categoryPalette.length]) : "#1683d8",
                line: { color: "rgba(255,255,255,.55)", width: 1 },
              },
            },
          ]}
          layout={{
            autosize: true,
            height: Math.max(290, rows.length * 34),
            margin: { l: 18, r: 16, t: 8, b: 36 },
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
            if (p) onSelect(chart.id, String(p.y));
          }}
        />
      </div>
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
  const comparisonVals = rows.map((r) => {
    const match = comparisonByMonth.get(r.label);
    return display === "percent" ? (match?.percent || 0) : (match?.count || 0);
  });
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
      <div className="plot-shell trend">
        <Plot
          key={`trend-${theme}-${title}-${selected.join("|") || "all"}`}
          revision={rows.reduce((n, r) => n + r.count, 0)}
          useResizeHandler
          onInitialized={(_, gd) => setGraph(gd)}
          data={[
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
              hovertemplate: `<b>${primaryLabel || (comparisonRows ? "Started" : title)}</b><br>%{y:,.0f}<extra></extra>`,
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
            shapes: selected.map((month)=>({type:"line" as const,xref:"x" as const,yref:"paper" as const,x0:month,x1:month,y0:0,y1:1,line:{color:"rgba(22,131,216,.38)",width:2,dash:"dot" as const}})),
            xaxis: {
              gridcolor: chartGrid(theme), fixedrange: false, type: "category",
              tickmode: "array",
              tickvals: rows.map((r) => r.label),
              ticktext: rows.map((r) => new Intl.DateTimeFormat("en", {month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(`${r.label}-01T00:00:00Z`))),
              tickangle: -45,
              automargin: true,
            },
            yaxis: {
              gridcolor: chartGrid(theme),
              rangemode: "tozero",
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
      </div>
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

function pivotRows(rows: Row[]) {
  const total=rows.reduce((sum,row)=>sum+row.count,0);
  return rows.map((row)=>({...row,percent:row.percent || (total?row.count/total:0)}));
}

function DataTable({ rows }: { rows: Row[] }) {
  const displayRows=pivotRows(rows);
  return (
    <div className="table-wrap">
      <table>
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
      </table>
    </div>
  );
}

function PivotModal({
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

export function FilterDrawer({
  open,
  available,
  filters,
  onClose,
  onChange,
  onReset,
}: {
  open: boolean;
  available: Record<string, string[]>;
  filters: Filters;
  onClose: () => void;
  onChange: (f: Filters) => void;
  onReset: () => void;
}) {
  const reviewStyle=available.__reviewStyle?.includes("true")||false;
  const datePriority: Record<string, number> = { year: 0, quarter: 1, month: 2 };
  const availableFilters = Object.entries(available).filter(([field])=>field!=="__reviewStyle").sort(
    ([left], [right]) => (datePriority[left] ?? 3) - (datePriority[right] ?? 3),
  );
  if(reviewStyle){if(!open)return null;return <><button className="filter-backdrop" aria-label="Close deportation filters" onClick={onClose}/><aside className="case-filter-drawer"><header><div><span className="eyebrow">REVIEW FILTERS</span><h2>Filter all deportation records</h2></div><button onClick={onClose} aria-label="Close filters"><X/></button></header><div className="case-filter-scroll review-checkbox-filters">{availableFilters.map(([field,values])=><details key={field} open={Boolean(filters[field]?.length)}><summary><span>{field.replaceAll("_"," ")}</span>{filters[field]?.length>0&&<b>{filters[field].length}</b>}<ChevronDown/></summary><div>{values.map((item)=><label key={item}><input type="checkbox" checked={filters[field]?.includes(item)||false} onChange={()=>{const selected=filters[field]||[];onChange({...filters,[field]:selected.includes(item)?selected.filter((value)=>value!==item):[...selected,item]})}}/><span>{/project/i.test(field)?formatProjectLabel(item):item}</span></label>)}</div></details>)}</div><footer><button className="soft" disabled={!Object.values(filters).some((values)=>values.length)} onClick={onReset}>Clear all</button><button className="primary" onClick={onClose}>Apply filters</button></footer></aside></>}
  return (
    <aside className={`filter-drawer glass ${open ? "open" : ""}${reviewStyle ? " review-style-filter" : ""}`}><div className="filter-scroll">
      <div className="filter-head">
        <div>
          <span>{reviewStyle ? "REVIEW FILTERS" : "Dashboard controls"}</span>
          <h2>{reviewStyle ? "Filter all deportation records" : "Filters"}</h2>
        </div>
        <button className="icon" onClick={onClose}>
          <X />
        </button>
      </div>
      <button className="reset" onClick={onReset}>
        {reviewStyle ? "Clear all" : "Reset all filters"}
      </button>
      <div className="filter-list">
        {availableFilters.map(([field, values]) => (
          <FilterGroup
            key={field}
            field={field}
            values={values}
            selected={filters[field] || []}
            onChange={(selected) => onChange({ ...filters, [field]: selected })}
          />
        ))}
      </div>
      </div>
    </aside>
  );
}

function FilterGroup({
  field,
  values,
  selected,
  onChange,
}: {
  field: string;
  values: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  const shown = useMemo(
    () =>
      values
        .filter((v) => v.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 100),
    [values, search],
  );
  return (
    <div className="filter-group">
      <button onClick={() => setOpen(!open)}>
        <span>
          {field.replaceAll("_", " ")}{" "}
          {selected.length ? `(${selected.length})` : ""}
        </span>
        <ChevronDown className={open ? "rotated" : ""} />
      </button>
      {open && (
        <div className="filter-options">
          <label className="search">
            <Search />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search values"
            />
          </label>
          {shown.map((v) => (
            <label className="check" key={v}>
              <input
                type="checkbox"
                checked={selected.includes(v)}
                onChange={() =>
                  onChange(
                    selected.includes(v)
                      ? selected.filter((x) => x !== v)
                      : [...selected, v],
                  )
                }
              />
              <span className="box">{selected.includes(v) && <Check />}</span>
              <span>{v}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActiveFilters({
  filters,
  onRemove,
}: {
  filters: Filters;
  onRemove: (field: string, value: string) => void;
}) {
  const entries = Object.entries(filters).flatMap(([f, vs]) =>
    vs.map((v) => [f, v] as const),
  );
  if (!entries.length) return null;
  return (
    <div className="active-filters">
      {entries.map(([f, v]) => (
        <button key={`${f}-${v}`} onClick={() => onRemove(f, v)}>
          <span>
            {f.replaceAll("_", " ")}: {v}
          </span>
          <X />
        </button>
      ))}
    </div>
  );
}

export function QualityTable({ rows }: { rows: QualityRow[] }) {
  return (
    <article className="quality-card glass">
      <div className="card-title">
        <div>
          <h3>Automated data-quality checks</h3>
          <p>
            Issues are preserved and excluded only where they would misstate
            time trends.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Area</th>
              <th>Severity</th>
              <th>Check</th>
              <th>Count</th>
              <th>Rate</th>
              <th>Analytical impact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.page}</td>
                <td>
                  <span className={`severity ${r.severity.toLowerCase()}`}>
                    {r.severity}
                  </span>
                </td>
                <td>{r.check}</td>
                <td>{formatNumber(r.count)}</td>
                <td>{formatPercent(r.rate)}</td>
                <td>{r.impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
