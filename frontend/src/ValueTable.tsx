import {Fragment,Children,cloneElement,isValidElement,useLayoutEffect, useRef,useState,type ReactNode, type ComponentPropsWithoutRef} from "react";
import {tableValueAlignment} from "./tableAlignment";
import {ColumnFilterChips,FilterableHeader,localValueLoader,type RecordFilterControl} from './ColumnFilterControls';
import {columnText,filterRecords,type ColumnFilter,type FilterColumn} from './columnFilters';
import {SortableHeader} from './TableControls';

function nodes(children:ReactNode):ReactNode[]{return Children.toArray(children).flatMap(child=>isValidElement<{children?:ReactNode}>(child)&&child.type===Fragment?nodes(child.props.children):[child])}
function nodeText(node:ReactNode):string{
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(!isValidElement<{children?:ReactNode;'aria-hidden'?:boolean|string;'data-filter-value'?:unknown;value?:unknown;awarenessId?:unknown;pnId?:unknown;url?:unknown}>(node)||node.props['aria-hidden']||node.type==='svg'||node.type==='input')return '';
 if('data-filter-value' in node.props)return columnText(node.props['data-filter-value']);
 if(!node.props.children){for(const key of ['value','awarenessId','pnId','url'] as const)if(key in node.props)return columnText(node.props[key])}
 return nodes(node.props.children).map(nodeText).join('');
}
function headingText(node:ReactNode){return nodeText(node).replace(/[▲▼↕↑↓]/g,'').trim()}

export type ValueTableProps=ComponentPropsWithoutRef<'table'>&{recordFilters?:RecordFilterControl|'local';filterColumns?:FilterColumn[]};

function cellText(cell: HTMLTableCellElement): string {
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent?.closest("svg,script,style,[hidden],[aria-hidden=true],.sr-only") || parent?.closest("td,th") !== cell
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  let value = "";
  while (walker.nextNode()) value += walker.currentNode.textContent || "";
  return value;
}

/** Apply value alignment to all cells, including rows updated by child components. */
export function ValueTable({recordFilters,filterColumns,...props}:ValueTableProps) {
  const table = useRef<HTMLTableElement>(null);
  const [localFilters,setLocalFilters]=useState<ColumnFilter[]>([]);
  const sections=recordFilters?nodes(props.children):[];
  const head=sections.find(node=>isValidElement(node)&&node.type==='thead');
  const headerRow=isValidElement<{children?:ReactNode}>(head)?nodes(head.props.children)[0]:null;
  const headers=isValidElement<{children?:ReactNode}>(headerRow)?nodes(headerRow.props.children):[];
  const columns=headers.map((header,index)=>filterColumns?.[index]||{key:headingText(header),label:headingText(header)});
  const body=sections.find(node=>isValidElement(node)&&node.type==='tbody');
  const rows=recordFilters==='local'&&isValidElement<{children?:ReactNode}>(body)?nodes(body.props.children):[];
  const values=rows.map(row=>isValidElement<{children?:ReactNode}>(row)?Object.fromEntries(nodes(row.props.children).map((cell,index)=>[columns[index]?.key||String(index),nodeText(cell)])):{});
  const control=recordFilters==='local'?{filters:localFilters,onChange:setLocalFilters,columns,loadValues:localValueLoader(values,localFilters)}:recordFilters;
  const visible=control&&recordFilters==='local'?new Set(filterRecords(values,control.filters)):null;
  const content=control?sections.map(section=>{
   if(!isValidElement<{children?:ReactNode}>(section))return section;
   if(section===head&&isValidElement<{children?:ReactNode}>(headerRow))return cloneElement(section,{},cloneElement(headerRow,{},headers.map((header,index)=>{
    const column=control.columns?.find(c=>c.key===columns[index].key)||columns[index];
    if(!column.label||!isValidElement<{children?:ReactNode;colSpan?:number;filterControl?:RecordFilterControl;filterColumn?:FilterColumn}>(header)||header.props.colSpan)return header;
    if(header.type===SortableHeader)return cloneElement(header,{filterControl:control,filterColumn:column});
    return cloneElement(header,{},<FilterableHeader column={column} control={control}>{header.props.children}</FilterableHeader>);
   })));
   if(section===body&&visible)return cloneElement(section,{},rows.filter((_,index)=>visible.has(values[index])));
   return section;
  }):props.children;
  useLayoutEffect(() => {
    const node = table.current;
    if (!node) return;
    const update = (cell: HTMLTableCellElement) => {
      if (cell.closest("table") !== node) return;
      const alignment = tableValueAlignment(cellText(cell));
      cell.dataset.valueAlign = alignment;
      cell.dir = alignment === "right" ? "rtl" : "ltr";
    };
    node.querySelectorAll<HTMLTableCellElement>("th,td").forEach(update);
    const pending = new Set<HTMLTableCellElement>();
    let frame: number | undefined;
    const queue = (target: Node) => {
      const element = target instanceof Element ? target : target.parentElement;
      if (!element) return;
      const cell = element.closest<HTMLTableCellElement>("th,td");
      if (cell) pending.add(cell);
      element.querySelectorAll<HTMLTableCellElement>("th,td").forEach(cell => pending.add(cell));
    };
    const observer = new MutationObserver(records => {
      for (const record of records) {
        queue(record.target);
        record.addedNodes.forEach(queue);
      }
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        pending.forEach(cell => {if (node.contains(cell)) update(cell)});
        pending.clear();
      });
    });
    observer.observe(node, {childList: true, characterData: true, subtree: true});
    return () => {observer.disconnect();if (frame !== undefined) cancelAnimationFrame(frame)};
  }, []);
  return <>{control&&<ColumnFilterChips control={{...control,columns:control.columns||columns}}/>}<table {...props} ref={table}>{content}</table>{visible&&Boolean(control?.filters.length)&&<div className="column-filter-result-count" role="status">{visible.size.toLocaleString()} of {rows.length.toLocaleString()} records</div>}</>;
}
