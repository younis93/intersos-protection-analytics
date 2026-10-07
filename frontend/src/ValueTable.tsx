import {useLayoutEffect, useRef, type ComponentPropsWithoutRef} from "react";
import {tableValueAlignment} from "./tableAlignment";

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
export function ValueTable(props: ComponentPropsWithoutRef<"table">) {
  const table = useRef<HTMLTableElement>(null);
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
  return <table {...props} ref={table}/>;
}
