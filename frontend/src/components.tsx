import {ValueTable} from "./ValueTable";
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {checkedFilterValues, selectAllExcept, toggleFilterValue, filterValue, isExcludedValue} from "./filterSelection";
import {VirtualRows} from "./VirtualRows";
import { createPortal } from "react-dom";
import Plot from "./LazyPlot";
import { sortFilterValues, formatFilterMonth, formatYearMonthFilterValue } from "./dateFormat";
import {
  Check,
  MoreHorizontal,
  ChevronDown,
  Download,
  Expand,
  FileText,
  Search,
  X,
} from "lucide-react";
import type { Chart, Display, Filters, QualityRow, Row, Theme } from "./types";
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

/** Keeps filter values unchanged while omitting Arabic location translations in the UI. */
export const formatProjectLocationLabel = (value: string) =>
  value.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, "").replace(/\s{2,}/g, " ").trim() || value;

export function ExcelDownloadButton({onClick,children="Excel",className="primary",disabled=false,busy:controlledBusy,title}:{onClick:()=>Promise<void>|void;children?:ReactNode;className?:string;disabled?:boolean;busy?:boolean;title?:string}) {
  const [localBusy,setLocalBusy]=useState(false),busy=controlledBusy??localBusy;
  const download=async()=>{if(busy)return;setLocalBusy(true);try{await onClick()}finally{setLocalBusy(false)}};
  const label=title||"Download Excel";
  return <button className={`${className} excel-download-button${busy?" is-preparing":""}`} disabled={disabled||busy} aria-busy={busy} aria-label={busy?"Preparing Excel download":label} title={busy?"Preparing Excel download":label} onClick={()=>void download()}><span className="excel-download-button-content"><Download/>{children}</span>{busy&&<span className="button-spinner excel-download-spinner" aria-hidden="true"/>}</button>;
}

// The top layer escapes clipping without losing each page's inherited menu styles.
function useDropdownPosition(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current, trigger = root.current?.querySelector<HTMLElement>(".app-select-trigger");
    if (!open || !node || !trigger) return;
    node.showPopover();
    const position = () => {
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft || 0, y = viewport?.offsetTop || 0;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const rect = trigger.getBoundingClientRect(), gap = 8, edge = 12;
      const menuWidth = Math.min(Math.max(rect.width, node.classList.contains("checkbox-multi-menu") ? 290 : 220), width - edge * 2);
      const below = Math.max(0, y + height - edge - rect.bottom - gap);
      const above = Math.max(0, rect.top - y - edge - gap);
      const upwards = below < Math.min(node.scrollHeight, 320) && above > below;
      const available = Math.min(upwards ? above : below, height - edge * 2);
      Object.assign(node.style, {position: "fixed", margin: "0", right: "auto", bottom: "auto", minWidth: "0", width: `${menuWidth}px`, maxHeight: `${available}px`, left: `${Math.max(x + edge, Math.min(rect.left, x + width - edge - menuWidth))}px`});
      const menuHeight = Math.min(node.getBoundingClientRect().height, available);
      const top = upwards ? rect.top - gap - menuHeight : rect.bottom + gap;
      node.style.top = `${Math.max(y + edge, Math.min(top, y + height - edge - menuHeight))}px`;
    };
    position();
    (node.querySelector<HTMLElement>("input") || node.querySelector<HTMLElement>("[aria-selected=\"true\"]") || node.querySelector<HTMLElement>("button") || node).focus({preventScroll:true});
    const scroll = (event: Event) => { if (!node.contains(event.target as Node)) position(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && node.contains(event.target as Node) && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close(); trigger.focus({preventScroll:true}); } };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", position);
    viewportListeners(true);
    document.addEventListener("keydown", escape);
    function viewportListeners(add: boolean) {
      const method = add ? "addEventListener" : "removeEventListener";
      window.visualViewport?.[method]("resize", position);
      window.visualViewport?.[method]("scroll", position);
    }
    const observer = new ResizeObserver(position);
    observer.observe(trigger);
    observer.observe(node);
    return () => {
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", position);
      viewportListeners(false);
      document.removeEventListener("keydown", escape);
      observer.disconnect();
      if (node.matches(":popover-open")) node.hidePopover();
    };
  }, [open]);
  return {root, menu};
}

// Keep Tab native so every action is reachable; leaving the control closes its popup.
function dropdownBlur(event: React.FocusEvent<HTMLDivElement>, close: () => void) {
  if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
}
function dropdownTriggerKey(event: React.KeyboardEvent<HTMLButtonElement>, open: () => void) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); }
}
function dropdownMenuKey(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement;
  const choices = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role=option], input[type=checkbox]"));
  if (!choices.length) return;
  const index = choices.indexOf(target);
  if (target.matches("input:not([type=checkbox])")) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); choices[event.key === "ArrowDown" ? 0 : choices.length - 1].focus();
      if(event.key === "ArrowUp" && choices[0].matches("input[type=checkbox]")) choices[choices.length - 1].dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}));
    }
    return;
  }
  if (index < 0 || target.matches("input[type=checkbox]")) return;
  let next = index;
  if (event.key === "ArrowDown") next = Math.min(index + 1, choices.length - 1);
  else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = choices.length - 1;
  else return;
  event.preventDefault(); choices[next].focus();
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
  const {root, menu} = useDropdownPosition(open, () => setOpen(false));
  const menuId=useId();
  const orderedValues=sortFilterValues(label,options.map(([value])=>value));
  options=[...options].sort((left,right)=>orderedValues.indexOf(left[0])-orderedValues.indexOf(right[0]));
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
    <div ref={root} onBlur={event=>dropdownBlur(event,()=>setOpen(false))} className={`app-select ${variant === "theme" ? "app-select-theme" : ""} ${open ? "open" : ""} ${disabled ? "disabled" : ""}`}>
      {Icon && <Icon className="app-select-icon" />}
      <span className="app-select-label">{label}</span>
      <button
        type="button"
        className="app-select-trigger"
        aria-label={ariaLabel || label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open?menuId:undefined}
        disabled={disabled}
        onClick={() => setOpen((shown) => { if (!shown) setSearch(""); return !shown; })}
        onKeyDown={event=>dropdownTriggerKey(event,()=>{setSearch("");setOpen(true)})}
      >
        <span>{displayCaption(selected)}</span><ChevronDown />
      </button>
      {open && (
        <div id={menuId} ref={menu} popover="manual" onKeyDown={dropdownMenuKey} className="app-select-menu viewport-dropdown" role="listbox" aria-label={`${label} options`}>
          {searchable && <label className="app-select-menu-search"><Search/><input aria-label={`Search ${label.toLowerCase()}`} autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}`}/></label>}
          {value&&!options.some(([option])=>option===value)&&<p className="filter-empty">{displayCaption(value)} - Unavailable</p>}
          {visibleOptions.map(([option, caption]) => (
            <button key={option} type="button" role="option" aria-selected={option === value} className={option === value ? "selected" : ""} onClick={() => { onChange(option); setOpen(false); root.current?.querySelector<HTMLButtonElement>(".app-select-trigger")?.focus(); }}>
              <span>{displayCaption(caption)}</span>{option === value && <Check />}
            </button>
          ))}
          {searchable && !visibleOptions.length && <p className="app-select-no-results">No matching options</p>}
        </div>
      )}
    </div>
  );
}

export function CheckboxMultiSelect({label,values,selected,onChange,hideLabel=false,guidance}:{label:string;values:string[];selected:string[];onChange:(values:string[])=>void;hideLabel?:boolean;guidance?:string}) {
  const [open,setOpen]=useState(false),[search,setSearch]=useState("");
  const guidanceId=useId(),menuId=useId();
  const {root,menu}=useDropdownPosition(open,()=>setOpen(false));
  const selectedLabel=label.replace(/ies$/i,"y").replace(/s$/i,"").replace(/\b\w/g,(letter)=>letter.toUpperCase());
  const isProjectFilter=/^projects?$/i.test(label.trim());
  const isProjectLocationFilter=/^project\s+locations?$/i.test(label.trim());
  const displayItem=(item:string)=>isProjectFilter?formatProjectLabel(item):isProjectLocationFilter?formatProjectLocationLabel(item):item;
  const visible=useMemo(()=>sortFilterValues(label,values).filter((item)=>displayItem(item).toLowerCase().includes(search.trim().toLowerCase())),[values,search,label]);
  useEffect(()=>{const close=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};window.addEventListener("mousedown",close);return()=>window.removeEventListener("mousedown",close)},[]);
  const checked=checkedFilterValues(selected,values);
  const caption=selected.length?`${selectedLabel} (${checked.length})`:`All ${label.toLowerCase()}`;
  return <div ref={root} onBlur={event=>dropdownBlur(event,()=>setOpen(false))} className={`app-select checkbox-multi-select ${hideLabel?"label-hidden":""} ${open?"open":""} ${selected.length?"has-selection":""}`}>
    {!hideLabel&&<span className="app-select-label">{label}</span>}
    <button type="button" className="app-select-trigger" aria-label={caption} aria-describedby={open&&guidance?guidanceId:undefined} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?menuId:undefined} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>dropdownTriggerKey(event,()=>setOpen(true))}><span>{caption}</span><ChevronDown/></button>
    {open&&<div id={menuId} ref={menu} popover="manual" onKeyDown={dropdownMenuKey} className="app-select-menu checkbox-multi-menu viewport-dropdown" role="dialog" aria-label={`${label} filters`}>
      <label className="multi-select-search"><Search/><input aria-label={`Search ${label.toLowerCase()}`} autoFocus value={search} onChange={event=>setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}`}/></label>
      {guidance&&<p id={guidanceId} className="filter-link-guidance">{guidance}</p>}
      <UnavailableSelections values={values} selected={selected} onChange={onChange} formatCaption={displayItem}/>
      <VirtualRows items={visible} resetKey={search} render={item=><FilterOption values={values} key={item} value={item} caption={displayItem(item)} selected={selected} onChange={onChange}/>}/>
      {!visible.length&&<p>{values.length?"No matching options":"No available options"}</p>}
      <footer><FilterSelectAllButton values={search.trim()?visible:values} matching={Boolean(search.trim())} selected={selected} onChange={onChange}/><button type="button" disabled={!selected.length} onClick={()=>onChange([])}>Reset</button><button type="button" onClick={()=>{setOpen(false);root.current?.querySelector<HTMLButtonElement>(".app-select-trigger")?.focus()}}>Done</button></footer>
    </div>}
  </div>;
}

export function FilterOption({value,caption,values,selected,onChange,...attributes}:{value:string;caption:string;values:string[];selected:string[];onChange:(values:string[])=>void}) {
  const [actions,setActions]=useState(false),checked=checkedFilterValues(selected,values).includes(value);
  return <div {...attributes} onKeyDown={event=>{if(event.key==="Escape"&&actions){event.preventDefault();event.stopPropagation();setActions(false);event.currentTarget.querySelector<HTMLButtonElement>(".filter-option-more")?.focus()}}} className={`filter-option-row ${checked?"selected":""}`}>
    <label><input type="checkbox" aria-label={caption} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();onChange(toggleFilterValue(selected,value,values))}}} checked={checked} onChange={()=>onChange(toggleFilterValue(selected,value,values))}/><span>{caption}</span></label>
    <button type="button" className="filter-option-more" aria-label={`Actions for ${caption}`} aria-expanded={actions} onClick={()=>setActions(open=>!open)}><MoreHorizontal/></button>
    <div className={`filter-option-actions ${actions?"expanded":""}`}>
      <button type="button" aria-label={`Only ${caption}`} onClick={()=>{onChange([value]);setActions(false)}}>Only this</button>
      <button type="button" aria-label={`Exclude ${caption}`} onClick={()=>{onChange(selectAllExcept(values,value));setActions(false)}}>Exclude this</button>
    </div>
  </div>;
}

function UnavailableSelections({values,selected,onChange,formatCaption=(value:string)=>value}:{values:string[];selected:string[];onChange:(values:string[])=>void;formatCaption?:(value:string)=>string}) {
  const unavailable=selected.filter(token=>!isExcludedValue(token)&&!values.includes(token));
  if(!unavailable.length)return null;
  return <section className="filter-unavailable" aria-label="Unavailable selections">{unavailable.map(token=><button type="button" key={token} aria-label={`Remove unavailable ${formatCaption(filterValue(token))}`} onClick={()=>onChange(selected.filter(value=>value!==token))}><span>{formatCaption(filterValue(token))}<small>Unavailable</small></span><X/></button>)}</section>;
}

export function FilterValueList({field="",values,selected,onChange,formatCaption=(value:string)=>value}:{values:string[];selected:string[];onChange:(values:string[])=>void;formatCaption?:(value:string)=>string;field?:string}) {
  values=sortFilterValues(field,values);
  return <><UnavailableSelections values={values} selected={selected} onChange={onChange} formatCaption={formatCaption}/>{!values.length&&<p className="filter-empty">No available options</p>}<FilterBulkActions values={values} selected={selected} onChange={onChange}/><div className="filter-group-actions"><button type="button" disabled={!selected.length} onClick={()=>onChange([])}>Reset</button></div>{values.map(value=><FilterOption values={values} key={value} value={value} caption={formatCaption(value)} selected={selected} onChange={onChange}/>)}</>;
}

function FilterSelectAllButton({values,matching=false,selected,onChange}:{values:string[];matching?:boolean;selected:string[];onChange:(values:string[])=>void}) {
  const complete=!selected.some(isExcludedValue)&&selected.length===values.length&&values.every(value=>selected.includes(value));
  return <button type="button" className="filter-select-all" disabled={!values.length||complete} onClick={()=>onChange([...values])}>{matching?"Select matching":"Select all"} ({values.length})</button>;
}

function FilterBulkActions({values,matching=values,searching=false,selected,onChange}:{values:string[];matching?:string[];searching?:boolean;selected:string[];onChange:(values:string[])=>void}) {
  const isExactSelection=(options:string[])=>!selected.some(isExcludedValue)&&selected.length===options.length&&options.every(value=>selected.includes(value));
  return <section className="filter-bulk-actions"><button type="button" disabled={!values.length||isExactSelection(values)} onClick={()=>onChange([...values])}>Select all {values.length}</button>{searching&&<button type="button" disabled={!matching.length||isExactSelection(matching)} onClick={()=>onChange([...matching])}>Select matching {matching.length}</button>}</section>;
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
const wrapAxisLabel=(label:string,max=30)=>{
  const words=label.trim().split(/\s+/),lines:string[]=[];
  for(const word of words){const last=lines.at(-1);if(!last||last.length+word.length+1>max)lines.push(word);else lines[lines.length-1]=`${last} ${word}`}
  return lines.join("<br>");
};
const compactDetentionLabel=(title:string,label:string)=>{
  if(title==="Detaining Authority")return wrapAxisLabel(label);
  if(!["Detaining Authority","Possible Charges"].includes(title))return label;
  const english=label.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g,"").replace(/\s*[-–:|/]\s*$/g,"").replace(/\s{2,}/g," ").trim();
  return english.replace(/Other\s*\(please specify in the comments section\)/i,"Other").replace(/Residency department/i,"Residency Department")||label;
};
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

function pivotRows(rows: Row[]) {
  const total=rows.reduce((sum,row)=>sum+row.count,0);
  return rows.map((row)=>({...row,percent:row.percent || (total?row.count/total:0)}));
}

function DataTable({ rows }: { rows: Row[] }) {
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
  const availableFilters = Object.entries(available).filter(([field])=>field!=="__reviewStyle").map(([field,values]):[string,string[]]=>[field,sortFilterValues(field,values)]).sort(
    ([left], [right]) => (datePriority[left] ?? 3) - (datePriority[right] ?? 3),
  );
  if(reviewStyle){if(!open)return null;return <><button className="filter-backdrop" aria-label="Close deportation filters" onClick={onClose}/><aside className="case-filter-drawer"><header><div><span className="eyebrow">REVIEW FILTERS</span><h2>Filter all deportation records</h2></div><button onClick={onClose} aria-label="Close filters"><X/></button></header><div className="case-filter-scroll review-checkbox-filters">{availableFilters.map(([field,values])=><details key={field} open={Boolean(filters[field]?.length)}><summary><span>{field.replaceAll("_"," ")}</span>{filters[field]?.length>0&&<b>{filters[field].length}</b>}<ChevronDown/></summary><div>{<FilterValueList field={field} values={values} selected={filters[field]||[]} onChange={items=>onChange({...filters,[field]:items})} formatCaption={item=>/project\s+location/i.test(field)?formatProjectLocationLabel(item):/project/i.test(field)?formatProjectLabel(item):formatFilterMonth(item)}/>}</div></details>)}</div><footer><button className="soft" disabled={!Object.values(filters).some((values)=>values.length)} onClick={onReset}>Reset all</button><button className="primary" onClick={onClose}>Apply filters</button></footer></aside></>}
  return (
    <aside className={`filter-drawer glass ${open ? "open" : ""}${reviewStyle ? " review-style-filter" : ""}`}><div className="filter-scroll">
      <div className="filter-head">
        <div>
          <span>{reviewStyle ? "REVIEW FILTERS" : "Dashboard controls"}</span>
          <h2>{reviewStyle ? "Filter all deportation records" : "Filters"}</h2>
        </div>
        <button className="icon" onClick={onClose} aria-label="Close filters">
          <X />
        </button>
      </div>
      <button className="reset" onClick={onReset}>
        {reviewStyle ? "Reset all" : "Reset all filters"}
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
      sortFilterValues(field,values)
        .filter((v) => v.toLowerCase().includes(search.trim().toLowerCase())),
    [values, search, field],
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
          <UnavailableSelections values={values} selected={selected} onChange={onChange}/>
          <FilterBulkActions values={values} matching={shown} searching={Boolean(search.trim())} selected={selected} onChange={onChange}/><div className="filter-group-actions"><button type="button" disabled={!selected.length} onClick={()=>onChange([])}>Reset</button></div>
          {shown.slice(0,100).map(v=><FilterOption values={values} key={v} value={v} caption={formatYearMonthFilterValue(field,v)} selected={selected} onChange={onChange}/>)}
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
    vs.filter(v=>!isExcludedValue(v)).map((v) => [f, v] as const),
  );
  if (!entries.length) return null;
  return (
    <div className="active-filters">
      {entries.map(([f, v]) => (
        <button key={`${f}-${v}`} onClick={() => onRemove(f, v)}>
          <span>
            {f.replaceAll("_", " ")}: {formatYearMonthFilterValue(f,filterValue(v))}
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
        <ValueTable>
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
        </ValueTable>
      </div>
    </article>
  );
}
