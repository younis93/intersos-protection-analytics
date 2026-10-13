import {SharedFilterDrawer} from './SharedFilterDrawer';
import {
ChevronDown,
Search
} from "lucide-react";
import { useMemo,useState } from "react";
import { formatFilterMonth,formatYearMonthFilterValue,sortFilterValues } from "./dateFormat";
import { formatProjectLabel,formatProjectLocationLabel } from './formatting';
import { FilterBulkActions,FilterOption,UnavailableSelections } from './SelectionControls';
import type { Filters } from "./types";
import { VirtualRows } from './VirtualRows';
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
  return <SharedFilterDrawer open={open} title={reviewStyle?"Filter all deportation records":"Filters"} eyebrow={reviewStyle?"REVIEW FILTERS":"Dashboard controls"} onClose={onClose} onReset={onReset}
    fields={availableFilters.map(([field,values])=>({key:field,label:field.replaceAll("_"," "),values,selected:filters[field]||[],onChange:(items:string[])=>onChange({...filters,[field]:items}),formatCaption:(item:string)=>reviewStyle?(/project\s+location/i.test(field)?formatProjectLocationLabel(item):/project/i.test(field)?formatProjectLabel(item):formatFilterMonth(item)):formatYearMonthFilterValue(field,item)}))}/>;
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
          <VirtualRows items={shown} enabled={shown.length>60} resetKey={search} render={v=><FilterOption values={values} key={v} value={v} caption={formatYearMonthFilterValue(field,v)} selected={selected} onChange={onChange}/>}/>
        </div>
      )}
    </div>
  );
}
