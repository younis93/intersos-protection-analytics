import {describe,expect,it} from "vitest";
import {sortFilterValues,formatDisplayDate,formatStudioDateMonth,formatTableValue,formatYearMonthFilterValue} from "./dateFormat";

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

describe("calendar filter order",()=>{
  it("sorts dates by calendar value and leaves unavailable values last",()=>{
    expect(sortFilterValues("Assessment date",["02/01/2026","15/12/2025","10/02/2026","Unknown"])).toEqual(["10/02/2026","02/01/2026","15/12/2025","Unknown"]);
    expect(sortFilterValues("Months",["January","December","February"])).toEqual(["December","February","January"]);
  });
  it("orders quarters across years and does not mutate the source",()=>{
    const values=["2025-Q4","2026-Q1","2026-Q3"];
    expect(sortFilterValues("Quarters",values)).toEqual(["2026-Q3","2026-Q1","2025-Q4"]);
    expect(values).toEqual(["2025-Q4","2026-Q1","2026-Q3"]);
    expect(sortFilterValues("Quarter",["Q1 2026","Q4 2025","Q2 2026"])).toEqual(["Q2 2026","Q1 2026","Q4 2025"]);
    expect(sortFilterValues("Projects",["B","A"])).toEqual(["B","A"]);
  });
});
