import {
Check,
ChevronDown,
Download,
MoreHorizontal,
Search,
X
} from "lucide-react";
import { memo,type ReactNode,useEffect,useId,useLayoutEffect,useMemo,useRef,useState } from "react";
import { sortFilterValues } from "./dateFormat";
import { checkedFilterValues,filterValue,isExcludedValue,selectAllExcept,toggleFilterValue } from "./filterSelection";
import { formatProjectLabel,formatProjectLocationLabel } from './formatting';
import { VirtualRows } from "./VirtualRows";
export function ExcelDownloadButton({onClick,children="Excel",className="primary",disabled=false,busy:controlledBusy,title}:{onClick:()=>Promise<void>|void;children?:ReactNode;className?:string;disabled?:boolean;busy?:boolean;title?:string}) {
  const [localBusy,setLocalBusy]=useState(false),busy=controlledBusy??localBusy;
  const download=async()=>{if(busy)return;setLocalBusy(true);try{await onClick()}finally{setLocalBusy(false)}};
  const label=title||"Download Excel";
  return <button className={`${className} excel-download-button${busy?" is-preparing":""}`} disabled={disabled||busy} aria-busy={busy} aria-label={busy?"Preparing Excel download":label} title={busy?"Preparing Excel download":label} onClick={()=>void download()}><span className="excel-download-button-content"><Download/>{children}</span>{busy&&<span className="button-spinner excel-download-spinner" aria-hidden="true"/>}</button>;
}

export // The top layer escapes clipping without losing each page's inherited menu styles.
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
    const firstFocus=node.querySelector<HTMLElement>("input") || node.querySelector<HTMLElement>("[aria-selected=\"true\"]") || node.querySelector<HTMLElement>("button") || node;
    firstFocus.focus({preventScroll:true});
    const list=firstFocus.closest<HTMLElement>('[data-virtual-rows]');
    if(list&&firstFocus.matches('[role=option]'))list.scrollTop+=firstFocus.getBoundingClientRect().top-list.getBoundingClientRect().top;
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

export // Keep Tab native so every action is reachable; leaving the control closes its popup.
function dropdownBlur(event: React.FocusEvent<HTMLDivElement>, close: () => void) {
  if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
}

export function dropdownTriggerKey(event: React.KeyboardEvent<HTMLButtonElement>, open: () => void) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); open(); }
}

export function dropdownMenuKey(event: React.KeyboardEvent<HTMLDivElement>) {
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement;
  const choices = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[role=option], input[type=checkbox]"));
  if (!choices.length) return;
  const index = choices.indexOf(target);
  if (target.matches("input:not([type=checkbox])")) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); choices[event.key === "ArrowDown" ? 0 : choices.length - 1].focus();
      if(event.key === "ArrowUp") choices[choices.length - 1].dispatchEvent(new KeyboardEvent("keydown",{key:"End",bubbles:true}));
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
  options=useMemo(()=>{
    const orderedValues=sortFilterValues(label,options.map(([value])=>value));
    const positions=new Map(orderedValues.map((value,index)=>[value,index]));
    return [...options].sort((left,right)=>positions.get(left[0])!-positions.get(right[0])!);
  },[label,options]);
  const selected = options.find(([option]) => option === value)?.[1] || value;
  const isProjectSelect = /^projects?$/i.test(label.trim());
  const displayCaption = (caption: string) =>
    isProjectSelect ? formatProjectLabel(caption) : caption;
  const visibleOptions = useMemo(()=>searchable
    ? options.filter(([, caption]) => displayCaption(caption).toLowerCase().includes(search.trim().toLowerCase()))
    : options,[options,searchable,search,isProjectSelect]);
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
          <VirtualRows items={visibleOptions} enabled={visibleOptions.length>60} resetKey={search} initialFocusIndex={searchable?null:Math.max(0,visibleOptions.findIndex(([option])=>option===value))} render={([option, caption]) => (
            <button key={option} type="button" role="option" aria-selected={option === value} className={option === value ? "selected" : ""} onClick={() => { onChange(option); setOpen(false); root.current?.querySelector<HTMLButtonElement>(".app-select-trigger")?.focus(); }}>
              <span>{displayCaption(caption)}</span>{option === value && <Check />}
            </button>
          )}/>
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
  const ordered=useMemo(()=>sortFilterValues(label,values),[values,label]);
  const visible=useMemo(()=>ordered.filter((item)=>displayItem(item).toLowerCase().includes(search.trim().toLowerCase())),[ordered,search,label]);
  useEffect(()=>{const close=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node))setOpen(false)};window.addEventListener("mousedown",close);return()=>window.removeEventListener("mousedown",close)},[]);
  const checked=useMemo(()=>checkedFilterValues(selected,values),[selected,values]);
  const checkedSet=useMemo(()=>new Set(checked),[checked]);
  const caption=selected.length?`${selectedLabel} (${checked.length})`:`All ${label.toLowerCase()}`;
  return <div ref={root} onBlur={event=>dropdownBlur(event,()=>setOpen(false))} className={`app-select checkbox-multi-select ${hideLabel?"label-hidden":""} ${open?"open":""} ${selected.length?"has-selection":""}`}>
    {!hideLabel&&<span className="app-select-label">{label}</span>}
    <button type="button" className="app-select-trigger" aria-label={caption} aria-describedby={open&&guidance?guidanceId:undefined} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?menuId:undefined} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>dropdownTriggerKey(event,()=>setOpen(true))}><span>{caption}</span><ChevronDown/></button>
    {open&&<div id={menuId} ref={menu} popover="manual" onKeyDown={dropdownMenuKey} className="app-select-menu checkbox-multi-menu viewport-dropdown" role="dialog" aria-label={`${label} filters`}>
      <label className="multi-select-search"><Search/><input aria-label={`Search ${label.toLowerCase()}`} autoFocus value={search} onChange={event=>setSearch(event.target.value)} placeholder={`Search ${label.toLowerCase()}`}/></label>
      {guidance&&<p id={guidanceId} className="filter-link-guidance">{guidance}</p>}
      <UnavailableSelections values={values} selected={selected} onChange={onChange} formatCaption={displayItem}/>
      <VirtualRows items={visible} enabled={visible.length>60} resetKey={search} render={item=><FilterOption values={values} key={item} value={item} caption={displayItem(item)} selected={selected} checked={checkedSet.has(item)} onChange={onChange}/>}/>
      {!visible.length&&<p>{values.length?"No matching options":"No available options"}</p>}
      <footer><FilterSelectAllButton values={search.trim()?visible:values} matching={Boolean(search.trim())} selected={selected} onChange={onChange}/><button type="button" disabled={!selected.length} onClick={()=>onChange([])}>Reset</button><button type="button" onClick={()=>{setOpen(false);root.current?.querySelector<HTMLButtonElement>(".app-select-trigger")?.focus()}}>Done</button></footer>
    </div>}
  </div>;
}

export const FilterOption=memo(function FilterOption({value,caption,values,selected,onChange,checked:knownChecked,...attributes}:{value:string;caption:string;values:string[];selected:string[];onChange:(values:string[])=>void;checked?:boolean}) {
  const [actions,setActions]=useState(false),checked=knownChecked??checkedFilterValues(selected,values).includes(value);
  return <div {...attributes} onKeyDown={event=>{if(event.key==="Escape"&&actions){event.preventDefault();event.stopPropagation();setActions(false);event.currentTarget.querySelector<HTMLButtonElement>(".filter-option-more")?.focus()}}} className={`filter-option-row ${checked?"selected":""}`}>
    <label><input type="checkbox" aria-label={caption} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();onChange(toggleFilterValue(selected,value,values))}}} checked={checked} onChange={()=>onChange(toggleFilterValue(selected,value,values))}/><span>{caption}</span></label>
    <button type="button" className="filter-option-more" aria-label={`Actions for ${caption}`} aria-expanded={actions} onClick={()=>setActions(open=>!open)}><MoreHorizontal/></button>
    <div className={`filter-option-actions ${actions?"expanded":""}`}>
      <button type="button" aria-label={`Only ${caption}`} onClick={()=>{onChange([value]);setActions(false)}}>Only this</button>
      <button type="button" aria-label={`Exclude ${caption}`} onClick={()=>{onChange(selectAllExcept(values,value));setActions(false)}}>Exclude this</button>
    </div>
  </div>;
});

export function UnavailableSelections({values,selected,onChange,formatCaption=(value:string)=>value}:{values:string[];selected:string[];onChange:(values:string[])=>void;formatCaption?:(value:string)=>string}) {
  const unavailable=selected.filter(token=>!isExcludedValue(token)&&!values.includes(token));
  if(!unavailable.length)return null;
  return <section className="filter-unavailable" aria-label="Unavailable selections">{unavailable.map(token=><button type="button" key={token} aria-label={`Remove unavailable ${formatCaption(filterValue(token))}`} onClick={()=>onChange(selected.filter(value=>value!==token))}><span>{formatCaption(filterValue(token))}<small>Unavailable</small></span><X/></button>)}</section>;
}

export function FilterValueList({field="",values,selected,onChange,formatCaption=(value:string)=>value}:{values:string[];selected:string[];onChange:(values:string[])=>void;formatCaption?:(value:string)=>string;field?:string}) {
  values=useMemo(()=>sortFilterValues(field,values),[field,values]);
  const checked=useMemo(()=>new Set(checkedFilterValues(selected,values)),[selected,values]);
  return <><UnavailableSelections values={values} selected={selected} onChange={onChange} formatCaption={formatCaption}/>{!values.length&&<p className="filter-empty">No available options</p>}<FilterBulkActions values={values} selected={selected} onChange={onChange}/><div className="filter-group-actions"><button type="button" disabled={!selected.length} onClick={()=>onChange([])}>Reset</button></div><VirtualRows items={values} enabled={values.length>60} render={value=><FilterOption values={values} key={value} value={value} caption={formatCaption(value)} selected={selected} checked={checked.has(value)} onChange={onChange}/>}/></>;
}

export function FilterSelectAllButton({values,matching=false,selected,onChange}:{values:string[];matching?:boolean;selected:string[];onChange:(values:string[])=>void}) {
  const complete=!selected.some(isExcludedValue)&&selected.length===values.length&&values.every(value=>selected.includes(value));
  return <button type="button" className="filter-select-all" disabled={!values.length||complete} onClick={()=>onChange([...values])}>{matching?"Select matching":"Select all"} ({values.length})</button>;
}

export function FilterBulkActions({values,matching=values,searching=false,selected,onChange}:{values:string[];matching?:string[];searching?:boolean;selected:string[];onChange:(values:string[])=>void}) {
  const isExactSelection=(options:string[])=>!selected.some(isExcludedValue)&&selected.length===options.length&&options.every(value=>selected.includes(value));
  return <section className="filter-bulk-actions"><button type="button" disabled={!values.length||isExactSelection(values)} onClick={()=>onChange([...values])}>Select all {values.length}</button>{searching&&<button type="button" disabled={!matching.length||isExactSelection(matching)} onClick={()=>onChange([...matching])}>Select matching {matching.length}</button>}</section>;
}
