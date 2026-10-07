import {matchesSelection} from "./filterSelection";
import type { IndicatorReport, IndicatorReportItem } from "./types";

export interface IndicatorCopyScope {
  projects: string[];
  locations: string[];
  quarters: string[];
  months: string[];
  communityTypes: string[];
}

const sameSelection = (left: string[] = [], right: string[] = []) =>
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);

export const reportMatchesIndicatorScope = (report: IndicatorReport | null, scope: IndicatorCopyScope) => Boolean(report
  && sameSelection(report.activeFilters.projects, scope.projects)
  && sameSelection(report.activeFilters.locations, scope.locations)
  && sameSelection(report.activeFilters.quarters, scope.quarters)
  && sameSelection(report.activeFilters.months, scope.months)
  && sameSelection(report.activeFilters.communityTypes, scope.communityTypes));

export const findIndicatorItem = (report: IndicatorReport, id: string) => {
  for (const group of report.groups) {
    for (const item of group.indicators) {
      if (item.id === id) return item;
      const child = item.children.find((entry) => entry.id === id);
      if (child) return child;
    }
  }
  return undefined;
};

export const indicatorLines = (item: IndicatorReportItem, scope: Pick<IndicatorCopyScope, "projects" | "locations">) => {
  const rowKeys: string[] = [];
  const rowsBySection = item.sections.map((section) => {
    const rows = new Map<string, number[]>();
    for (const row of section.rows) {
      if (!matchesSelection(row.project,scope.projects)) continue;
      if (!matchesSelection(row.location,scope.locations)) continue;
      const key = `${row.project}\u0000${row.location}`;
      if (!rowKeys.includes(key)) rowKeys.push(key);
      rows.set(key, [...row.values.slice(0, 12), 0]);
    }
    return rows;
  });
  return rowKeys.map((key) => item.sections.flatMap((_, index) => rowsBySection[index].get(key) || Array(13).fill(0)).map((value) => value === 0 ? "" : value).join("\t"));
};
