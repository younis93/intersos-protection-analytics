import {
ChevronDown,
Search,
X
} from "lucide-react";
import { useMemo,useState } from "react";
import { formatFilterMonth,formatYearMonthFilterValue,sortFilterValues } from "./dateFormat";
import { FilterDrawerShell,FilterSection } from './FilterDrawerShell';
import { filterValue,isExcludedValue } from "./filterSelection";
import { formatProjectLabel,formatProjectLocationLabel } from './formatting';
import { FilterBulkActions,FilterOption,FilterValueList,UnavailableSelections } from './SelectionControls';
import type { Filters } from "./types";
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
  if(reviewStyle){if(!open)return null;return <><FilterDrawerShell className="case-filter-drawer" header={<header><div><span className="eyebrow">REVIEW FILTERS</span><h2>Filter all deportation records</h2></div><button onClick={onClose} aria-label="Close filters"><X/></button></header>} footer={<footer><button className="soft" disabled={!Object.values(filters).some((values)=>values.length)} onClick={onReset}>Reset all</button><button className="primary" onClick={onClose}>Apply filters</button></footer>} backdrop={<button className="filter-backdrop" aria-label="Close deportation filters" onClick={onClose}/>}><div className="case-filter-scroll review-checkbox-filters">{availableFilters.map(([field,values])=><FilterSection key={field} open={Boolean(filters[field]?.length)} label={<>{field.replaceAll("_"," ")}</>} badge={<>{filters[field]?.length>0&&<b>{filters[field].length}</b>}</>}><div>{<FilterValueList field={field} values={values} selected={filters[field]||[]} onChange={items=>onChange({...filters,[field]:items})} formatCaption={item=>/project\s+location/i.test(field)?formatProjectLocationLabel(item):/project/i.test(field)?formatProjectLabel(item):formatFilterMonth(item)}/>}</div></FilterSection>)}</div></FilterDrawerShell></>}
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

export function FilterGroup({
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
