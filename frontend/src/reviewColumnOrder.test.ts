import { describe, expect, it } from "vitest";
import { reviewColumnIndices } from "./reviewColumnOrder";

const prefix = ["", "Finding detail", "Recommended action", "Lawyer"];
const ordered = (dataset: string, rule: string, columns: string[], fields: string[]) => {
  const labels = [...prefix, ...columns];
  return reviewColumnIndices(dataset, rule, labels, fields).map((index) => labels[index]);
};

describe("Review table column order", () => {
  it("puts name and phone issue fields before beneficiary identifiers", () => {
    expect(ordered("beneficiaries", "Possible duplicate contact and name",
      ["Priority", "Project", "Name", "Phone number", "Case ID", "Assessment ID", "Service ID"],
      ["Contact Number", "Name (Filter Color Red)", "Project"]))
      .toEqual([...prefix, "Phone number", "Name", "Project", "Case ID", "Priority"]);
  });
  it("keeps comparison fields together and assessment identifiers after them", () => {
    expect(ordered("assessments", "Type of document in Assessments vs Services",
      ["Priority", "Case ID", "Assessment ID", "Service ID", "Date of assessment", "Finding", "Assessment documents", "Service documents"],
      ["Date of Assessment", "Type of Documents to be issued", "Legal Services: Type of Document", "Assessment ID"]))
      .toEqual([...prefix, "Date of assessment", "Assessment documents", "Service documents", "Finding", "Case ID", "Assessment ID", "Priority"]);
  });
  it("keeps all legal service identifiers after duplicate fields", () => {
    expect(ordered("legalservices", "Duplicate service",
      ["Priority", "Assessment ID", "Type of Service Provided", "Type of Document", "Beneficiary ID", "Service ID"],
      ["Beneficiary ID", "Assessment ID", "Type of Service Provided", "Type of Document"]))
      .toEqual([...prefix, "Type of Service Provided", "Type of Document", "Beneficiary ID", "Assessment ID", "Service ID", "Priority"]);
  });
  it("puts both hotline names after referral and keeps unrelated IDs hidden", () => {
    const labels = ["", "Finding detail", "Recommended action", "Lawyer referral", "Finding severity", "Detained-person name", "Phone number", "Caller name", "Case ID", "Assessment ID", "Service ID"];
    const order = reviewColumnIndices("legalhotlines", "Detained-person name matches caller", labels, ["Name of the detained person", "Name of the caller"]);
    expect(order.map((index) => labels[index])).toEqual(["", "Finding detail", "Recommended action", "Lawyer referral", "Detained-person name", "Caller name", "Finding severity", "Phone number"]);
    // The same indices preserve correspondence between table headers and source cells.
    const values = labels.map((_, index) => `cell-${index}`);
    expect(order.map((index) => values[index])).toEqual(["cell-0", "cell-1", "cell-2", "cell-3", "cell-5", "cell-7", "cell-4", "cell-6"]);
  });
  it("distinguishes hotline source priority from finding severity", () => {
    expect(ordered("legalhotlines", "High priority without lawyer referral", ["Finding severity", "Priority", "Detained"], ["Priority", "Refer to Lawyer"]))
      .toEqual([...prefix, "Priority", "Finding severity", "Detained"]);
  });
  it("displays repeated conditional columns only once and keeps the action cell", () => {
    expect(ordered("assessments", "Open assessment with all services closed",
      ["Case ID", "Assessment ID", "Assessment status", "Linked services", "Service statuses", "Assessment status", ""],
      ["Assessment Status", "Legal Services: Service Status"]))
      .toEqual([...prefix, "Assessment status", "Service statuses", "Linked services", "Case ID", "Assessment ID", ""]);
  });
  it("places awareness name and topic first without showing legal identifiers", () => {
    expect(ordered("awareness", "Duplicate participant in session", ["Priority", "Name", "Awareness ID", "Session topic"], ["Participant Name", "Session Topic"]))
      .toEqual([...prefix, "Name", "Session topic", "Priority", "Awareness ID"]);
  });
});
