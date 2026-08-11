import {describe,expect,it} from "vitest";
import {formatDisplayDate,formatTableValue} from "./dateFormat";

describe("table date formatting",()=>{
  it("uses the requested day-month-year format",()=>{
    expect(formatDisplayDate("2026-07-21T00:00:00")).toBe("21-July-2026");
    expect(formatDisplayDate("9/2/2026")).toBe("09-February-2026");
  });

  it("leaves non-date values unchanged",()=>{
    expect(formatTableValue("Case-2026-01-01")).toBe("Case-2026-01-01");
    expect(formatDisplayDate("2026-15-01")).toBeNull();
  });
});
