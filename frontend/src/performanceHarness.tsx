import {ValueTable} from "./ValueTable";
// Standalone development entry used by scripts/check_windowed_lists.cjs.
import {useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {CheckboxMultiSelect} from "./components";
import {VirtualRows} from "./VirtualRows";
import "./styles.css";

function Harness() {
  const [selected,setSelected]=useState<string[]>([]),[query,setQuery]=useState("");
  const options=useMemo(()=>Array.from({length:2000},(_,index)=>`Option ${String(index).padStart(4,"0")}`),[]);
  const rows=useMemo(()=>Array.from({length:2000},(_,index)=>({id:index,text:`Synthetic row ${index} `+"wrapped text ".repeat(index%5*12)})),[]);
  const filtered=useMemo(()=>rows.filter(row=>row.text.includes(query)),[rows,query]);
  return <main style={{padding:24}}><CheckboxMultiSelect label="Options" values={[...options]} selected={selected} onChange={setSelected}/><output data-testid="selection">{selected.join(",")}</output><label>Result search<input aria-label="Result search" value={query} onChange={event=>setQuery(event.target.value)}/></label><output data-testid="all-records">{filtered.length}</output><div className="legal-table-wrap" data-testid="windowed-table" style={{height:360,maxHeight:360,width:600}}><ValueTable><thead><tr><th>ID</th><th>Text</th></tr></thead><VirtualRows items={filtered} table columns={2} estimate={80} render={row=><tr key={row.id}><td>{row.id}</td><td style={{width:350,whiteSpace:"normal"}}>{row.text}</td></tr>}/></ValueTable></div></main>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
