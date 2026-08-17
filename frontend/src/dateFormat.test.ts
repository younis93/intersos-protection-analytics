import {describe,expect,it} from "vitest";
import {formatDisplayDate,formatTableValue} from "./dateFormat";

describe("table date formatting",()=>{
  it("uses the requested year-month-day format",()=>{
    expect(formatDisplayDate("2026-07-21T00:00:00")).toBe("2026-July-21");
    expect(formatDisplayDate("9/2/2026")).toBe("2026-February-09");
  });

  it("leaves non-date values unchanged",()=>{
    expect(formatTableValue("Case-2026-01-01")).toBe("Case-2026-01-01");
    expect(formatDisplayDate("2026-15-01")).toBeNull();
  });
});
