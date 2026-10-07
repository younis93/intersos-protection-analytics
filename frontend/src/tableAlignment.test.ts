import {expect, it} from "vitest";
import {tableValueAlignment} from "./tableAlignment";

it.each([
  ["Noor Ismail", "left"], ["UNHCR 2026 - Erbil", "left"], ["B15974", "left"],
  ["عبدالهادي موفق حسين", "right"], ["  (محمد أحمد)", "right"], ["\u200fالعراق / Iraq", "right"],
  ["Iraq / العراق", "left"], ["15974", "center"], ["-1,234.50", "center"],
  ["٣٤٥", "center"], ["۱۲۳", "center"], ["25.5%", "center"],
  ["2026-January-28", "center"], ["1 Assessments 2 Services", "center"],
  ["", "center"], ["-", "center"],
])("aligns %j as %s", (value, alignment) => {
  expect(tableValueAlignment(value)).toBe(alignment);
});
