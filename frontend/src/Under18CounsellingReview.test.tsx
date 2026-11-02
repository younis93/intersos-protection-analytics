import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FindingTable, REVIEW_CHECK_METHODS } from "./LegalReviewPage";

const rule = "Beneficiary below 18 with legal counselling";

// Supply a loaded review response so server rendering covers the real table cells.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => [initial === null ? {
      total: 1, rows: [{ recordId: "S1", row: 2, caseId: "B1", assessmentId: "A1", serviceId: "S1",
        name: "Child Example", dateOfBirth: "22/10/2008", beneficiaryAge: 17,
        serviceDate: "01/02/2026", requestedServiceTypes: "Legal Representation",
        serviceTypeProvided: "Legal Counselling", lawyer: "Lawyer A", project: "P1", location: "Erbil" }],
    } : initial, vi.fn()],
  };
});

describe("Under-18 counselling review", () => {
  it("shows age evidence, service type, and all three identifiers in the table", () => {
    const markup = renderToStaticMarkup(<FindingTable
      dataset="legalservices" rule={rule} search="" nameCompareChars={15} nameCompareCharsInput={15}
      allowNameVariations={false} exactMatchesOnly={false} onExactMatchesOnlyChange={() => {}}
      onNameCompareCharsChange={() => {}} onAllowNameVariationsChange={() => {}}
      nameRecordCount={undefined} eligibleNameRecordCount={undefined} ignoreCourtVerdict={false}
      onIgnoreCourtVerdictChange={() => {}} filters={{}} fieldFilters={{}} comparisonMonth=""
      onOpenCase={() => {}} findingRevision={0} onFindingContextMenu={() => {}} onBulkExclude={() => {}}
    />);
    for (const header of ["Date of birth", "Current age", "Date of service", "Type of Service Provided", "Assessment service needed", "Beneficiary ID", "Assessment ID", "Service ID", "Name", "Lawyer", "Project", "Project location"]) {
      expect(markup).toContain(`class="column-header-label">${header}</div>`);
    }
    expect(markup.indexOf('>Date of birth</div>')).toBeLessThan(markup.indexOf('>Beneficiary ID</div>'));
    expect(markup.indexOf('>Current age</div>')).toBeLessThan(markup.indexOf('>Beneficiary ID</div>'));
    const headers = [...markup.matchAll(/class="column-header-label">([^<]*)<\/div>/g)].map(match => match[1]);
    expect(headers.slice(headers.indexOf("Current age"), headers.indexOf("Current age") + 4))
      .toEqual(["Current age", "Date of service", "Type of Service Provided", "Assessment service needed"]);
    for (const value of ["01/02/2026", "Legal Representation", "22/10/2008", "17", "Legal Counselling", "B1", "A1", "S1", "P1", "Erbil"]) {
      expect(markup).toContain(`>${value}</td>`);
    }
    expect(markup).toContain("<strong>Lawyer A</strong>");
    expect(markup).toContain("Child Example</button>");
  });

  it("explains the current-age check and the birth-date exclusions", () => {
    const method = REVIEW_CHECK_METHODS[rule];
    expect(method.columns).toEqual(["Date of Birth", "Type of Service Provided"]);
    expect(method.logic).toContain("current age");
    expect(method.logic).toContain("future birth dates are excluded");
    expect(method.logic).toContain("recorded Age is not used");
  });
});
