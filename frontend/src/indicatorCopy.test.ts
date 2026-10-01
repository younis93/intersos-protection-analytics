import { describe, expect, it } from "vitest";
import { indicatorLines } from "./indicatorCopy";
import type { IndicatorReportItem, IndicatorSection } from "./types";

const section = (id: string, rows: Array<[string, string, number]>) => ({
  id,
  label: id,
  rows: rows.map(([project, location, value]) => ({project, location, values: [value, ...Array(12).fill(0)]})),
  totals: Array(13).fill(0),
  total: 0,
  warnings: {unclassified: 0, unknownLocation: 0},
}) satisfies IndicatorSection;

const item = (sections: IndicatorSection[], children: IndicatorReportItem[] = []) => ({
  id: "parent",
  title: "Parent",
  source: "Assessments",
  dateField: "Date",
  rule: "Rule",
  population: "all",
  total: 0,
  sections,
  children,
  contributions: {},
}) satisfies IndicatorReportItem;

describe("indicator clipboard rows", () => {
  it("copies blanks for zero counts and activity columns while preserving demographic counts", () => {
    const sections = [section("syrian", [["North", "Erbil", 1]]), section("non-syrian", [["North", "Erbil", 4]])];
    sections[0].rows[0].values = [...Array.from({length: 12}, (_, index) => index + 1), 78];
    sections[1].rows[0].values[12] = 4;
    const source = item(sections);

    const values = indicatorLines(source, {projects: [], locations: []})[0].split("\t");

    expect(values).toEqual([...Array.from({length: 12}, (_, index) => String(index + 1)), "", "4", ...Array(12).fill("")]);
    expect(source.sections[0].rows[0].values[12]).toBe(78);
    expect(source.sections[1].rows[0].values[12]).toBe(4);
  });

  it("copies only the selected project and location", () => {
    const source=item([section("refugee", [["North", "Erbil", 1], ["South", "Baghdad", 2]])]);
    expect(indicatorLines(source, {projects:["North"], locations:["Erbil"]})).toEqual([`1${"\t".repeat(12)}`]);
  });

  it("aligns populations by project and location instead of row position", () => {
    const source=item([
      section("syrian", [["North", "Erbil", 1], ["South", "Baghdad", 2]]),
      section("non-syrian", [["South", "Baghdad", 3], ["North", "Erbil", 4]]),
    ]);
    const lines=indicatorLines(source, {projects:[], locations:["Erbil"]});
    expect(lines).toHaveLength(1);
    expect(lines[0].split("\t")[0]).toBe("1");
    expect(lines[0].split("\t")[13]).toBe("4");
  });

  it("does not append child indicator rows to a parent copy", () => {
    const child={...item([section("child", [["North", "Erbil", 9]])]),id:"child"};
    const source=item([section("parent", [["North", "Erbil", 1]])],[child]);
    expect(indicatorLines(source, {projects:[],locations:[]})).toHaveLength(1);
    expect(indicatorLines(source, {projects:[],locations:[]})[0].split("\t")[0]).toBe("1");
  });
});
