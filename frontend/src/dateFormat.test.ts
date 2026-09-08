import {describe,expect,it} from "vitest";
import {formatDisplayDate,formatStudioDateMonth,formatTableValue,formatYearMonthFilterValue} from "./dateFormat";

describe("table date formatting",()=>{
  it("uses the requested year-month-day format",()=>{
    expect(formatDisplayDate("2026-07-21T00:00:00")).toBe("2026-July-21");
    expect(formatDisplayDate("9/2/2026")).toBe("2026-February-09");
  });

  it("leaves non-date values unchanged",()=>{
    expect(formatTableValue("Case-2026-01-01")).toBe("Case-2026-01-01");
    expect(formatDisplayDate("2026-15-01")).toBeNull();
  });

  it("formats Analytics Studio date filters as numeric year-month",()=>{
    expect(formatStudioDateMonth("2026-02")).toBe("2026-02");
    expect(formatStudioDateMonth("2026-2-15")).toBe("2026-02");
    expect(formatStudioDateMonth("2026-02-15 00:00:00")).toBe("2026-02");
    expect(formatStudioDateMonth("15/02/2026")).toBe("2026-02");
    expect(formatStudioDateMonth("Case-2026-02")).toBe("Case-2026-02");
    expect(formatYearMonthFilterValue("Date of Identification", "2026-02-15 00:00:00")).toBe("2026-02");
    expect(formatYearMonthFilterValue("Created On", "15/02/2026")).toBe("2026-02");
    expect(formatYearMonthFilterValue("Case ID", "2026-02")).toBe("2026-02");
  });
});
