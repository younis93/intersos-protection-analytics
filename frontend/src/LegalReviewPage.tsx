import {AwarenessIdButton} from './DeportationCaseModal';
import {AnimatedActionIcon} from './AnimatedActionIcon';

import {
AlertTriangle,
ArrowRight,
Ban,
CheckCheck,
CheckCircle2,
CircleHelp,
Eraser,
FileQuestion,
Search,
X
} from "lucide-react";
import { Children,Fragment,isValidElement,useEffect,useRef,useState,type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
createDuplicateExclusion,
createDuplicateExclusionsBulk,
downloadExcelUrl,
duplicateExclusionsExportUrl,
getDuplicateExclusions,
getLegalReview,
importDuplicateExclusions,
legalReviewExportUrl,
restoreDuplicateExclusion
} from "./api";
import { formatProjectLabel } from './formatting';
import { checkedFilterValues } from './filterSelection';
import { labels,LegalPage } from './legalPageMetadata';
import { LegalScrollControls } from './LegalScrollControls';
import { LegalSkeleton } from './LegalSkeleton';
import { reviewColumnIndices } from "./reviewColumnOrder";
import ReviewFiltersDrawer from "./ReviewFiltersDrawer";
import { ExcelDownloadButton } from './SelectionControls';
import { RowSelectionCheckbox } from './TableControls';
import type { DuplicateExclusion,LegalFlag,LegalReview } from "./types";
import { ValueTable } from "./ValueTable";

export const AMAL_HIDDEN_ASSESSMENT_RULES = new Set([
  "Detention/immigration inconsistency",
  "Detained beneficiary has counselling only",
  "Detention Governorate mismatch",
  "Detained beneficiary below 10 years",
]);

export const ASSESSMENT_REVIEW_TAIL_RULES = new Set([
  "Open assessment with all services closed",
  "Pending assessment",
  "Type of document in Assessments vs Services",
  "Representation while not detained",
  "Detention/immigration inconsistency",
]);

export const LEGAL_SERVICES_REVIEW_FIRST_RULES = [
  "Duplicate service",
  "Duplicate service without Assessment ID",
  "Current and previous month duplicate",
  "Legal service date after today",
];

export const exclusionRuleClass = (rule: string) => rule === "Possible duplicate name" || rule === "Possible duplicate contact and name" ? "duplicates" : rule === "Invalid contact number" ? "contacts" : rule === "Marital status below 18" ? "marital" : "spouse";

export const displayReviewRule = (rule: string) => rule === "Possible duplicate contact and name"
  ? "Possible duplicate contact and name (UNHCR, ID, ASSIST or spouse name required)"
  : rule;

export const announceLegalCopy = (value: string) => window.dispatchEvent(new CustomEvent<string>("legal-copy", { detail: value }));

export const REVIEW_CHECK_METHODS: Record<string, { columns: string[]; logic: string }> = {
  "Duplicate detained-person name and caller match": { columns: ["Name of the detained person", "Name of the caller"], logic: "Compares both complete normalized names across separate hotline records. Both columns must match the same other record and neither may be blank. It does not compare the detained-person name against the caller name within a record. Each record appears once across the name-check tables: combined, exact duplicate, caller match, then similar name." },
  "Duplicate detained-person name": { columns: ["Name of the detained person"], logic: "Compares complete normalized nonblank detained-person names across all hotline records. Records with both names duplicated in the same other record are listed in the combined table." },
  "Similar detained-person name": { columns: ["Name of the detained person"], logic: "Compares the configured leading normalized characters, allowing 90% similarity when spelling variations are enabled. Records already listed in the combined, exact-duplicate, or caller-match table are omitted." },
  "Detained-person name matches caller": { columns: ["Name of the detained person", "Name of the caller"], logic: "Checks whether either name contains the other as complete words within this hotline record. Records already listed in the combined or exact-duplicate table are omitted." },
  "Detained without lawyer referral": { columns: ["Is the beneficiary detained", "Refer to Lawyer"], logic: "Flags explicit Yes detention answers with a blank lawyer referral." },
  "Not detained and not referred to helpline": { columns: ["Is the beneficiary detained", "Has the beneficiary referred to the helpline?"], logic: "Flags records with explicit No answers to both questions. Blank answers do not count as No." },
  "High priority without lawyer referral": { columns: ["Priority", "Refer to Lawyer"], logic: "Flags High priority records with a blank lawyer referral." },
  "Possible duplicate name": { columns: ["Name (Filter Color Red)", "Project"], logic: "Normalizes names, groups them within the permitted project group, then compares the configured leading characters (or exact names when Exact matches is enabled)." },
  "Possible duplicate contact and name": { columns: ["Contact Number", "Name (Filter Color Red)", "# UNHCR", "ID Number", "Individual Number ASSISIT", "Spouse name", "Project"], logic: "Within the permitted project group, flags records with the same nonblank normalized contact number, at least 90% full-name similarity, and one populated identity marker on each record." },
  "Invalid contact number": { columns: ["Contact Number / Phone Number"], logic: "Keeps normalized phone numbers that are not blank, one digit, or 11 digits, after excluding configured system prefixes." },
  "Case without assessment": { columns: ["Case ID", "# total assessments"], logic: "Flags beneficiaries whose total assessment count is zero." },
  "Invalid age": { columns: ["Age", "Date of Birth", "Spouse DoB"], logic: "Flags missing, non-numeric, negative, or implausible age values, plus nonblank Spouse DoB values that are invalid or after today." },
  "Marital status below 18": { columns: ["Marital Status", "Date of Birth"], logic: "Flags married beneficiaries whose current age calculated from date of birth is below 18." },
  "Spouse below 18": { columns: ["Marital Status", "Spouse DoB"], logic: "Flags partnered beneficiaries whose spouse current age calculated from Spouse DoB is below 18." },
  "Check Community Type vs Nationality": { columns: ["Community Type", "Nationality", "Project"], logic: "Checks permitted Community Type/Nationality combinations and the IDP AMAL Camp project requirement." },
  "Beneficiary has multiple assessments": { columns: ["Beneficiary ID", "Date of Assessment", "Assessment Status"], logic: "Flags assessments repeated in the same assessment month, or Open assessments when the beneficiary has two or more Open assessments." },
  "Selected month with previous assessment": { columns: ["Beneficiary ID", "Date of Assessment", "Created On"], logic: "From Created On August 2026 onward, flags repeated assessment history except an immediate previous-month assessment created on days 1–4 of the following month." },
  "Assessment without services": { columns: ["# Total Services", "Assessment ID", "Legal Services: Assessment ID"], logic: "Flags zero Total Services; when that column is unavailable, flags assessments with no linked service." },
  "Pending assessment": { columns: ["Assessment Status"], logic: "Filters Assessment Status values containing Pending." },
  "Open counselling-only assessment": { columns: ["Assessment Status", "Type of Legal Service Needed"], logic: "Filters Open assessments whose requested service includes counselling but not assistance or representation." },
  "Open assessment with all services closed": { columns: ["Assessment Status", "Assessment ID", "Legal Services: Assessment ID", "Legal Services: Service Status"], logic: "Flags Open assessments that have at least one linked legal service and every linked service has a closed or completed status." },
  "Detention/immigration inconsistency": { columns: ["Community Type", "Date of Assessment", "Is the beneficiary detained", "Is it an immigration related charge"], logic: "Applies to 2026+ refugee assessments and flags inconsistent detention and immigration-charge responses." },
  "Blank legal service need": { columns: ["Type of Legal Service Needed"], logic: "Flags blank or whitespace-only legal-service-need values." },
  "Detained beneficiary has counselling only": { columns: ["Assessment ID", "Is the beneficiary detained", "Is it an immigration related charge", "Legal Services: Type of Service Provided"], logic: "Flags detained immigration cases with linked services containing counselling only." },
  "Adult representation without counselling": { columns: ["Age", "Created On", "Type of Legal Service Needed", "Legal Services: Type of Service Provided"], logic: "From 2026 onward, flags adults requesting both representation and counselling when linked legal services have no counselling. Cases in Assessment without services are excluded." },
  "Representation while not detained": { columns: ["Community Type", "Created On", "Is the beneficiary detained", "Legal Services: Type of Service Provided"], logic: "Flags non-IDP, not-detained assessments created in 2026 or later with linked assistance or representation services." },
  "Detained beneficiary below 10 years": { columns: ["Is the beneficiary detained", "Date of Birth"], logic: "Flags detained assessment records where the current age calculated from Date of Birth is below 10." },
  "Type of document in Assessments vs Services": { columns: ["Date of Assessment", "Type of Documents to be issued", "Legal Services: Type of Document", "Assessment ID"], logic: "For assessments dated in 2026 or later, compares requested assessment documents with Type of Document across all linked legal services and identifies the missing side. Cases in Assessment without services are excluded." },
  "Type of Legal Service in Assessment vs Services": { columns: ["Date of Assessment", "Type of Legal Service Needed", "Legal Services: Type of Service Provided", "Assessment ID"], logic: "For assessments dated in 2026 or later, flags requested legal service types that are missing from every linked legal service. Cases in Assessment without services are excluded." },
  "Duplicate service": { columns: ["Beneficiary ID", "Assessment ID", "Type of Service Provided", "Type of Document"], logic: "Flags repeated nonblank combinations of Beneficiary ID, Assessment ID, Type of Service Provided, and Type of Document." },
  "Duplicate service without Assessment ID": { columns: ["Beneficiary ID", "Type of Service Provided", "Type of Document"], logic: "Flags repeated nonblank combinations of Beneficiary ID, Type of Service Provided, and Type of Document across all Assessment IDs." },
  "Detention Governorate mismatch": { columns: ["Detention Governorate", "Project", "Project Location"], logic: "Flags an assessment when its Detention Governorate does not match either its Project or Project Location governorate." },
  "Assessment date after today": { columns: ["Date of Assessment", "Date of the released or deported", "Date of Detention", "Date of Assessment Closure", "Date of the Request"], logic: "Flags any populated assessment date that is later than today." },
  "Current and previous month duplicate": { columns: ["Beneficiary ID", "Date of Service Provision", "Created On"], logic: "From Created On August 2026 onward, flags repeated service history in the selected provision month, except an immediate previous-month service created on days 1-4 of the following month." },
  "Orphaned assessment relationship": { columns: ["Legal Services: Assessment ID", "Assessments: Assessment ID"], logic: "Flags service Assessment IDs that do not exist in the imported Assessments file." },
  "Missing Type of Document": { columns: ["Type of Document"], logic: "Flags blank or whitespace-only Type of Document values." },
  "Legal service date after today": { columns: ["Date of Service Provision", "Date Service Completed", "Date of Issuance"], logic: "Flags any populated legal-service date that is later than today." },
  "Duplicate participant in session": { columns: ["Participant Name", "Session Topic"], logic: "Normalizes participant names and flags duplicate name/session-topic pairs." },
  "Possible duplicate participant name": { columns: ["Participant Name", "Session Topic"], logic: "Normalizes names and flags repeated participants only when their duplicate records are in different session topics." },
};

export const duplicatePalette = [
  "var(--review-duplicate-1)", "var(--review-duplicate-2)",
  "var(--review-duplicate-3)", "var(--review-duplicate-4)",
  "var(--review-duplicate-5)", "var(--review-duplicate-6)",
  "var(--review-duplicate-7)", "var(--review-duplicate-8)",
];

export const duplicateColor = (key = "") => duplicatePalette[[...key].reduce((total, char) => total + char.charCodeAt(0), 0) % duplicatePalette.length];

export // Flatten conditional column fragments so headers and cells share one ordering.
function reviewTableCells(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? reviewTableCells(child.props.children)
      : [child],
  );
}

export function ReviewPage({
  dataset,
  onOpenCase,
}: {
  dataset: string;
  onOpenCase: (caseId: string) => void;
}) {
  return (
    <ReviewPageBody
      dataset={dataset}
      onOpenCase={onOpenCase}
      comparisonMonth=""
    />
  );
}

export function FindingTable({
  dataset,
  rule,
  closureRequestGroup,
  search,
  nameCompareChars,
  nameCompareCharsInput,
  allowNameVariations,
  exactMatchesOnly,
  onExactMatchesOnlyChange,
  onNameCompareCharsChange,
  onAllowNameVariationsChange,
  nameRecordCount,
  eligibleNameRecordCount,
  ignoreCourtVerdict,
  onIgnoreCourtVerdictChange,
  filters,
  fieldFilters,
  comparisonMonth,
  onOpenCase,
  findingRevision,
  onFindingContextMenu,
  onBulkExclude,
}: {
  dataset: string;
  rule: string;
  closureRequestGroup?: boolean;
  search: string;
  nameCompareChars: number;
  nameCompareCharsInput: number;
  allowNameVariations: boolean;
  exactMatchesOnly: boolean;
  onExactMatchesOnlyChange: (value: boolean) => void;
  onNameCompareCharsChange: (value: number) => void;
  onAllowNameVariationsChange: (value: boolean) => void;
  nameRecordCount: number | undefined;
  eligibleNameRecordCount: number | undefined;
  ignoreCourtVerdict: boolean;
  onIgnoreCourtVerdictChange: (value: boolean) => void;
  filters: Record<string, string>;
  fieldFilters: Record<string,string[]>;
  comparisonMonth: string;
  onOpenCase: (caseId: string) => void;
  findingRevision: number;
  onFindingContextMenu: (event: React.MouseEvent, row: LegalFlag) => void;
  onBulkExclude: (rows: LegalFlag[]) => void;
}) {
  const [result, setResult] = useState<LegalReview | null>(null),
    [helpOpen, setHelpOpen] = useState(false),
    [error, setError] = useState(""),
    [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const page=1;
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    getLegalReview(
      dataset,
      search,
      rule,
      page,
      filters,
      comparisonMonth,
      nameCompareChars,
      allowNameVariations,
      exactMatchesOnly,
      controller.signal,
      fieldFilters,
    )
      .then((x) => {
        if (controller.signal.aborted) return;
        setResult(x);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [dataset, rule, search, page, filters, fieldFilters, comparisonMonth, nameCompareChars, allowNameVariations, exactMatchesOnly, findingRevision]);
  const copyDuplicateName=async(name:string)=>{
    if(!name)return;
    try{await navigator.clipboard.writeText(name)}catch{const field=document.createElement("textarea");field.value=name;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();document.execCommand("copy");field.remove()}
    announceLegalCopy(name);
  };
  const visibleRows=(result?.rows||[]).filter((row)=>(!ignoreCourtVerdict || !/court verdict|\bother\b|اخرى/i.test(row.typeOfDocument||"")) && (closureRequestGroup === undefined || ((row.requestForClosedStatus || "").trim().toLowerCase() === "yes") === closureRequestGroup));
  const tableTitle = closureRequestGroup === undefined ? displayReviewRule(rule) : closureRequestGroup ? "Open assessment with all services closed (Closure requested by lawyer)" : "Open assessment with all services closed (Closure not requested by lawyer)";
  const tableGroups = [{title: "", rows: visibleRows.map((row, index) => ({row, index}))}];
  const rowKey = (row: LegalFlag, index: number) => dataset === "legalhotlines" ? row.hotlineId || row.recordId : `${row.recordId || row.row}|${row.caseId}|${row.assessmentId}|${row.serviceId}|${row.awarenessId}|${index}`;
  const isExcludable = (row: LegalFlag) => (dataset === "legalhotlines" && Boolean(row.hotlineId)) || (dataset === "assessments" && Boolean(row.assessmentId)) || (dataset === "legalservices" && Boolean(row.serviceId)) || (dataset === "awareness" && Boolean(row.awarenessId || row.name)) || (dataset === "beneficiaries" && Boolean(row.caseId));
  const excludableRows = visibleRows.filter(isExcludable);
  const selectedRows = visibleRows.filter((row, index) => isExcludable(row) && selectedRowKeys.includes(rowKey(row, index)));
  useEffect(() => {
    setSelectedRowKeys([]);
  }, [dataset, rule, search, page, filters, fieldFilters, comparisonMonth, nameCompareChars, allowNameVariations, exactMatchesOnly, findingRevision, ignoreCourtVerdict]);
  const hotlineSourceColumns = dataset === "legalhotlines" ? Object.keys(result?.rows[0]?.sourceFields || {}) : [];
  const tableHeaders = reviewTableCells(<>
    <th className="review-selection-column"><RowSelectionCheckbox label={`Select visible records for ${displayReviewRule(rule)}`} total={excludableRows.length} selectedCount={selectedRows.length} disabled={!excludableRows.length} onChange={checked=>setSelectedRowKeys(checked?visibleRows.map((row,index)=>isExcludable(row)?rowKey(row,index):'').filter(Boolean):[])}/></th>
    <th>Finding detail</th>
    <th>Recommended action</th>
    <th>{dataset === "legalhotlines" ? "Lawyer referral" : "Lawyer"}</th>
    <th>Project</th>
    <th>Project location</th>{rule === "Detention Governorate mismatch" && <th>Detention Governorate mismatch</th>}
    <th>{dataset === "legalhotlines" ? "Detained-person name" : "Name"}</th>
    {(rule === "Marital status below 18" || rule === "Spouse below 18") && <th>Marital status</th>}
    {rule === "Spouse below 18" && <><th>Spouse name</th><th>Spouse date of birth</th><th>Spouse current age</th></>}
    <th>Phone number</th>
    {dataset === "beneficiaries" && <th>Date of birth</th>}
    {dataset === "legalhotlines" ? (
      <><th>Contact date</th><th>Caller name</th><th>Detained</th><th>Helpline referral</th><th>Priority</th>{hotlineSourceColumns.map((column) => <th key={column}>{column}</th>)}</>
    ) : dataset === "awareness" ? (
      <><th>Awareness ID</th><th>Session topic</th></>
    ) : (
      <>{dataset !== "legalservices" ? <th>Case ID</th> : rule !== "Duplicate service" && rule !== "Duplicate service without Assessment ID" && <th>Beneficiary ID</th>}{(rule === "Possible duplicate name" || rule === "Possible duplicate contact and name") && <><th>Date of Identification</th><th>Created On</th><th>Fee ID</th><th>Amount Spent (IQD)</th><th>Type of Legal Service Needed</th></>}<th>Assessment ID</th>{dataset === "assessments" && <th>Date of assessment</th>}{rule === "Open counselling-only assessment" && <><th>Assessment status</th><th>Type of Legal Service Needed</th></>}{rule === "Detention/immigration inconsistency" && <><th>Is the beneficiary detained</th><th>Is it an immigration related charge?</th></>}{rule === "Detained beneficiary below 10 years" && <><th>Is the beneficiary detained</th><th>Date of birth</th><th>Current age</th></>}{rule === "Selected month with previous assessment" && <th>Created On</th>}{rule === "Representation while not detained" && <th>Type of documents to be issued</th>}{rule === "Type of document in Assessments vs Services" && <><th>Finding</th><th>Assessment documents</th><th>Service documents</th></>}{rule === "Type of Legal Service in Assessment vs Services" && <><th>Assessment service needed</th><th>Service type provided</th></>}{(rule === "Duplicate service" || rule === "Duplicate service without Assessment ID") && <><th>Beneficiary ID</th><th>Type of Service Provided</th><th>Type of Document</th><th>Please specify the Court Verdict</th><th>Type of Document if Other</th><th>Legal Concern Specified</th><th>Legal Concern</th></>}<th>Service ID</th></>
    )}
    {rule === "Open assessment with all services closed" && <><th>Assessment status</th><th>Request for Closed Status</th><th>Linked services</th><th>Service statuses</th></>}
    <th></th>
  </>);
  const columnLabels = tableHeaders.map((header) => isValidElement<{children?: ReactNode}>(header) && typeof header.props.children === "string" ? header.props.children : "");
  const columnOrder = reviewColumnIndices(dataset, rule, columnLabels, REVIEW_CHECK_METHODS[rule]?.columns || []);
  const cellsForRow = (r: LegalFlag, i: number) => reviewTableCells(<>
      <td className="review-selection-column"><input aria-label={`Select ${r.name || r.caseId || r.assessmentId || r.serviceId || r.awarenessId || "record"}`} type="checkbox" disabled={!isExcludable(r)} checked={selectedRowKeys.includes(rowKey(r, i))} onChange={() => setSelectedRowKeys((current) => current.includes(rowKey(r, i)) ? current.filter((key) => key !== rowKey(r, i)) : [...current, rowKey(r, i)])} /></td>
      <td>{r.duplicateRecheck && <span className="duplicate-recheck-badge">Recheck</span>}{r.detail}</td>
      <td className="action-cell">{r.action}</td>
      <td>
        <strong>{r.lawyer || (dataset === "legalhotlines" ? "Not recorded" : "Unassigned")}</strong>
      </td>
      <td>{r.project ? formatProjectLabel(r.project) : "-"}</td>
      <td>{r.location || "-"}</td>{rule === "Detention Governorate mismatch" && <td>{r.detentionGovernorate || "Missing"}</td>}
      <td
        className={r.duplicateGroup ? `duplicate-name-cell ${r.nameMatchMode === "exact" ? "exact-duplicate-name" : "variation-duplicate-name"}` : ""}
        style={r.duplicateGroup && r.nameMatchMode !== "exact" ? { background: `linear-gradient(90deg, ${duplicateColor(r.duplicateGroup)} 0%, ${duplicateColor(r.duplicateGroup)} ${r.duplicateSimilarity ?? 90}%, color-mix(in srgb,var(--panel-strong) 42%,transparent) ${r.duplicateSimilarity ?? 90}%, transparent 100%)` } : undefined}
        onCopy={(event) => {
          event.preventDefault();
          event.clipboardData.setData("text/plain", r.name || "");
          if (r.name) announceLegalCopy(r.name);
        }}
      >
        {r.name?<button type="button" className="duplicate-name-copy" onClick={()=>void copyDuplicateName(r.name)} title={dataset === "legalhotlines" ? "Copy detained-person name" : "Copy beneficiary name"} aria-label={`Copy ${r.name}`}>{r.name}</button>:<strong>Not provided</strong>}
        {r.duplicateSimilarity !== undefined && <span className="duplicate-match-badge" aria-hidden="true">{r.duplicateSimilarity}% match</span>}
        {r.nameMatchMode === "exact" && <span className="exact-duplicate-badge" aria-hidden="true">Exact duplicate</span>}
      </td>
      {(rule === "Marital status below 18" || rule === "Spouse below 18") && <td>{r.maritalStatus || "-"}</td>}
      {rule === "Spouse below 18" && <><td><strong>{r.spouseName || "Not provided"}</strong></td><td>{r.spouseDateOfBirth || "-"}</td><td>{r.spouseAge ?? "-"}</td></>}
      <td>{r.phone || "-"}</td>
      {dataset === "beneficiaries" && <td>{r.dateOfBirth || "-"}{rule === "Marital status below 18" && r.beneficiaryAge !== null && r.beneficiaryAge !== undefined ? ` (${r.beneficiaryAge})` : ""}</td>}
      {dataset === "legalhotlines" ? (
        <><td>{r.contactDate}</td><td>{r.callerName}</td><td>{r.beneficiaryDetained}</td><td>{r.helplineReferral}</td><td>{r.priority || "-"}</td>{hotlineSourceColumns.map((column) => <td key={column}>{r.sourceFields?.[column] || "-"}</td>)}</>
      ) : dataset === "awareness" ? (
        <><td><AwarenessIdButton awarenessId={r.awarenessId || r.recordId}/></td><td>{r.sessionTopic || "-"}</td></>
      ) : (
        <>{(dataset !== "legalservices" || (rule !== "Duplicate service" && rule !== "Duplicate service without Assessment ID")) && <td>{r.caseId || "-"}</td>}{(rule === "Possible duplicate name" || rule === "Possible duplicate contact and name") && <><td>{r.identificationDate || "-"}</td><td>{r.createdOn || "-"}</td><td>{r.feeId || "-"}</td><td>{r.amountSpentIqd || "-"}</td><td>{r.legalServiceNeeded || "-"}</td></>}<td>{r.assessmentId || "-"}</td>{dataset === "assessments" && <td>{r.assessmentDate || "-"}</td>}{rule === "Open counselling-only assessment" && <><td>{r.assessmentStatus || "-"}</td><td>{r.legalServiceNeeded || "-"}</td></>}{rule === "Detention/immigration inconsistency" && <><td>{r.beneficiaryDetained || "-"}</td><td>{r.immigrationRelatedCharge || "-"}</td></>}{rule === "Detained beneficiary below 10 years" && <><td>{r.beneficiaryDetained || "-"}</td><td>{r.dateOfBirth || "-"}</td><td>{r.beneficiaryAge ?? "-"}</td></>}{rule === "Selected month with previous assessment" && <td>{r.createdOn || "-"}</td>}{rule === "Representation while not detained" && <td>{r.typeOfDocument || "-"}</td>}{rule === "Type of document in Assessments vs Services" && <><td>{r.comparisonFinding || "-"}</td><td>{r.assessmentDocuments || "-"}</td><td>{r.serviceDocuments || "-"}</td></>}{rule === "Type of Legal Service in Assessment vs Services" && <><td>{r.requestedServiceTypes || "-"}</td><td>{r.providedServiceTypes || "-"}</td></>}{(rule === "Duplicate service" || rule === "Duplicate service without Assessment ID") && <><td>{r.caseId || "-"}</td><td>{r.serviceTypeProvided || "-"}</td><td>{r.typeOfDocument || "-"}</td><td>{r.courtVerdictDetail || "-"}</td><td>{r.otherDocumentDetail || "-"}</td><td>{r.legalConcernSpecified || "-"}</td><td>{r.legalConcern || "-"}</td></>}<td>{r.serviceId || "-"}</td></>
      )}
      {rule === "Open assessment with all services closed" && <><td>{r.assessmentStatus || "-"}</td><td>{r.requestForClosedStatus || "-"}</td><td>{r.linkedServiceCount ?? 0}</td><td>{r.linkedServiceStatuses || "-"}</td></>}
      <td>
        {r.caseId && (
          <button
            className="table-action"
            onClick={() => onOpenCase(r.caseId)}
          >
            Open case
            <ArrowRight />
          </button>
        )}
      </td>
  </>);
  return (
    <section className="glass finding-table-section">
      <header>
        <div className="finding-title-wrap">
          <button className="finding-help-button" type="button" aria-label={`How to check ${rule}`} title="How to check" aria-expanded={helpOpen} onClick={() => setHelpOpen((current) => !current)}><CircleHelp /></button>
          <div><h3>{tableTitle}</h3></div>
        </div>
        <div className="finding-table-pagination">
          {(rule === "Possible duplicate name" || rule === "Similar detained-person name") && (
            <section className={`name-sensitivity-panel finding-name-matching${exactMatchesOnly ? " disabled" : ""}`} title={exactMatchesOnly ? "Name matching controls are ignored while only 100% matches is selected." : undefined}>
              <div className="name-match-title">
                <span>NAME MATCHING</span>
                <strong>Duplicate names</strong>
              </div>
              <label className="name-similarity-slider">
                <span className="sr-only">Characters compared</span>
                <input aria-label="Characters compared" type="range" min="10" max="30" step="1" value={nameCompareCharsInput} disabled={exactMatchesOnly} style={{background:`linear-gradient(90deg, var(--blue) 0%, var(--blue) ${((nameCompareCharsInput - 10) / 20) * 100}%, color-mix(in srgb,var(--blue) 14%,var(--line)) ${((nameCompareCharsInput - 10) / 20) * 100}%, color-mix(in srgb,var(--blue) 14%,var(--line)) 100%)`}} onChange={(event) => onNameCompareCharsChange(Number(event.target.value))} />
              </label>
              <b className="name-character-value">{nameCompareCharsInput} chars</b>
              <label className="name-variation-option">
                <input type="checkbox" checked={allowNameVariations} disabled={exactMatchesOnly} onChange={(event) => onAllowNameVariationsChange(event.target.checked)} />
                <span>Spelling variations</span>
              </label>
              {nameRecordCount === 0 ? (
                <small className="name-empty-message">No names are loaded. Import the review dataset to use duplicate-name matching.</small>
              ) : eligibleNameRecordCount === 0 ? (
                <small className="name-empty-message">No names are long enough for {nameCompareChars} characters. Move the slider lower to include shorter names.</small>
              ) : null}
            </section>
          )}
          {rule === "Possible duplicate name" && (
            <label className="exact-match-filter">
              <input type="checkbox" checked={exactMatchesOnly} onChange={(event) => onExactMatchesOnlyChange(event.target.checked)} />
              <span>Only 100% matches</span>
            </label>
          )}
          {(rule === "Duplicate service" || rule === "Duplicate service without Assessment ID") && <label className="exact-match-filter"><input type="checkbox" checked={ignoreCourtVerdict} onChange={(event)=>onIgnoreCourtVerdictChange(event.target.checked)}/><span>Ignore Court Verdict and Other</span></label>}
          <div className="indicator-total-block finding-total">
            <strong>{visibleRows.length.toLocaleString()}</strong>
            <span>Total</span>
          </div>
        </div>
      </header>
      {selectedRows.length > 0 && (
        <div className="review-bulk-action-bar" role="status">
          <span><b>{selectedRows.length}</b> selected</span>
          <button className="soft" onClick={() => setSelectedRowKeys([])}>Clear selection</button>
          <button className="review-bulk-exclude" onClick={() => onBulkExclude(selectedRows)}><Ban /> Exclude selected</button>
        </div>
      )}
      {helpOpen && (() => { const method=dataset === "legalhotlines" && rule === "Invalid contact number" ? {columns:["Contact Number / Phone Number"],logic:"Checks populated numbers only. Removes spaces, hyphens and parentheses, then requires exactly 10 digits. Country codes and other characters are invalid."} : REVIEW_CHECK_METHODS[rule] || {columns:["Imported source record"],logic:"Flags records matching this review rule."}; return <aside className="finding-check-guidance" role="note"><CircleHelp /><div><strong>Detection methodology</strong><p>{method.logic}</p><div className="finding-method-columns"><span>Columns checked</span>{method.columns.map((column) => <b key={column}>{column}</b>)}</div></div></aside>; })()}
      {error && <div className="error">{error}</div>}
      {result?.unavailableRules?.[rule] && <div className="error" role="status">This check is unavailable. {result.unavailableRules[rule]}</div>}
      {!result ? (
        <LegalSkeleton variant="table" compact />
      ) : visibleRows.length === 0 ? (
        <div className="review-clear compact">
          <CheckCircle2 />
          <div>
            <h3>{result.unavailableRules?.[rule] ? "Required columns are unavailable" : "No matching records"}</h3>
            <p>{result.unavailableRules?.[rule] ? "Import the required hotline columns to run this check." : "No records match this finding and the active filters."}</p>
          </div>
        </div>
      ) : (
        <>
          {tableGroups.map((group) => <div key={group.title || rule}>
            {group.title && <header><h4>{group.title}</h4><p>{group.rows.length.toLocaleString()} records</p></header>}
            {group.rows.length === 0 ? <div className="review-clear compact">No matching records</div> : <>
          <div className="legal-table-wrap">
            <ValueTable>
              <thead>
                <tr>
                  {columnOrder.map((index) => <Fragment key={index}>{tableHeaders[index]}</Fragment>)}
                </tr>
              </thead>
              <tbody>
                {group.rows.map(({row: r, index: i}) => { const cells = cellsForRow(r, i); return (
                  <tr key={`${r.row}-${i}`} className={(rule === "Duplicate detained-person name and caller match" || rule === "Duplicate detained-person name" || rule === "Similar detained-person name" || rule === "Duplicate service" || rule === "Duplicate service without Assessment ID" || rule === "Beneficiary has multiple assessments" || rule === "Duplicate participant in session") && r.duplicateGroup ? "duplicate-service-row" : ""} style={(rule === "Duplicate detained-person name and caller match" || rule === "Duplicate detained-person name" || rule === "Similar detained-person name" || rule === "Duplicate service" || rule === "Duplicate service without Assessment ID" || rule === "Beneficiary has multiple assessments" || rule === "Duplicate participant in session") && r.duplicateGroup ? { background: duplicateColor(r.duplicateGroup) } : undefined} onContextMenu={(event) => {
                    if ((dataset === "legalhotlines" && r.hotlineId) || (dataset === "assessments" && r.assessmentId) || (dataset === "legalservices" && r.serviceId) || (dataset === "awareness" && (r.awarenessId || r.name)) || (dataset === "beneficiaries" && r.caseId)) onFindingContextMenu(event, r);
                  }}>
                    {columnOrder.map((index) => <Fragment key={index}>{cells[index]}</Fragment>)}
                  </tr>
                ); })}
              </tbody>
            </ValueTable>
          </div>
            </>}
          </div>)}
        </>
      )}
    </section>
  );
}

export function ReviewPageBody({
  dataset,
  onOpenCase,
  comparisonMonth,
}: {
  dataset: string;
  onOpenCase: (caseId: string) => void;
  comparisonMonth: string;
}) {
  const [summary, setSummary] = useState<LegalReview | null>(null),
    [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState(""),
    [nameCompareChars, setNameCompareChars] = useState(15),
    [appliedNameCompareChars, setAppliedNameCompareChars] = useState(15),
    [allowNameVariations, setAllowNameVariations] = useState(dataset === "legalhotlines"),
    [exactMatchesOnly, setExactMatchesOnly] = useState(dataset !== "legalhotlines"),
    [ignoreCourtVerdictByRule, setIgnoreCourtVerdictByRule] = useState<Record<string, boolean>>({}),
    [selectedRules, setSelectedRules] = useState<string[]>([]),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [fieldFilters, setFieldFilters] = useState<Record<string,string[]>>({}),
    [drawer, setDrawer] = useState(false),
    [excludedDuplicates, setExcludedDuplicates] = useState<DuplicateExclusion[]>([]),
    [excludedManagerOpen, setExcludedManagerOpen] = useState(false),
    [exclusionCandidates, setExclusionCandidates] = useState<LegalFlag[] | null>(null),
    [exclusionImportOpen, setExclusionImportOpen] = useState(false),
    [exclusionFile, setExclusionFile] = useState<File | null>(null),
    [exclusionImportRules, setExclusionImportRules] = useState<string[]>([]),
    [exclusionImportResult, setExclusionImportResult] = useState(""),
    [exclusionImportError, setExclusionImportError] = useState(""),
    [duplicateMenu, setDuplicateMenu] = useState<{x:number;y:number;row:LegalFlag} | null>(null),
    [findingRevisions, setFindingRevisions] = useState<Record<string, number>>({}),
    [reviewActionsOpen, setReviewActionsOpen] = useState(false),
    [exclusionRuleFilter, setExclusionRuleFilter] = useState(""),
    [exclusionSearch, setExclusionSearch] = useState(""),
    [selectedExcludedFindings, setSelectedExcludedFindings] = useState<string[]>([]),
    [restoreConfirmation, setRestoreConfirmation] = useState<DuplicateExclusion[] | null>(null),
    [exclusionSort, setExclusionSort] = useState<{key:string;direction:"asc"|"desc"}>({key:"rule",direction:"asc"}),
    [exclusionBusy, setExclusionBusy] = useState(false),
    [initialized, setInitialized] = useState(false),
    [defaultRules, setDefaultRules] = useState<string[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const previousDataset = useRef(dataset);
  useEffect(() => {
    if (previousDataset.current === dataset) return;
    previousDataset.current = dataset;
    setSelectedRules([]);
    setDefaultRules([]);
    setInitialized(false);
    setFilters({});
    setFieldFilters({});
    setIgnoreCourtVerdictByRule({});
    setAllowNameVariations(dataset === "legalhotlines");
    setExactMatchesOnly(dataset !== "legalhotlines");
  }, [dataset]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedNameCompareChars(nameCompareChars), 250);
    return () => window.clearTimeout(timer);
  }, [nameCompareChars]);
  const loadExcludedDuplicates = () => getDuplicateExclusions().then((result) => setExcludedDuplicates(result.rows)).catch(() => setExcludedDuplicates([]));
  useEffect(() => {
    void loadExcludedDuplicates();
  }, [dataset]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    getLegalReview(
      dataset,
      debouncedSearch,
      "",
      1,
      filters,
      comparisonMonth,
      appliedNameCompareChars,
      allowNameVariations,
      false,
      controller.signal,
      fieldFilters,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setSummary(result);
        if (!initialized) {
          const beneficiaryDefaults = ["Possible duplicate name", "Possible duplicate contact and name", "Invalid contact number", "Case without assessment", "Invalid age"];
          const assessmentDeferredDefaults = new Set(["Representation while not detained", "Detention/immigration inconsistency", "Detained beneficiary below 10 years"]);
          const awarenessDeferredDefaults = new Set(["Possible duplicate participant name"]);
          const defaults = dataset === "legalhotlines"
            ? ["Duplicate detained-person name and caller match", "High priority without lawyer referral"]
            : dataset === "beneficiaries"
              ? beneficiaryDefaults.filter((rule) => (result.ruleCounts[rule] || 0) > 0)
              : Object.entries(result.ruleCounts).filter(([rule, count]) => count > 0 && (dataset !== "assessments" || !assessmentDeferredDefaults.has(rule)) && (dataset !== "awareness" || !awarenessDeferredDefaults.has(rule))).map(([rule]) => rule);
          setSelectedRules(defaults);
          setDefaultRules(defaults);
          setInitialized(true);
        }
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message || "Unable to load review data.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [dataset, debouncedSearch, filters, fieldFilters, comparisonMonth, appliedNameCompareChars, allowNameVariations, findingRevisions]);
  const reviewProjects=filters.project?[filters.project]:fieldFilters.project?.length?checkedFilterValues(fieldFilters.project,summary?.filterOptions.project||[]):summary?.filterOptions.project||[];
  const amalProjectOnly = dataset === "assessments" && reviewProjects.length>0 && reviewProjects.every(project=>/\bamal\b/i.test(project)),
    rules = Object.entries(summary?.ruleCounts || {}).map(([rule, count]) => [rule, count] as const).filter(([rule]) => !amalProjectOnly || !AMAL_HIDDEN_ASSESSMENT_RULES.has(rule)),
    baseOrderedRules = dataset === "assessments" ? [...rules.filter(([rule]) => !ASSESSMENT_REVIEW_TAIL_RULES.has(rule)), ...rules.filter(([rule]) => ASSESSMENT_REVIEW_TAIL_RULES.has(rule))] : dataset === "legalservices" ? [...LEGAL_SERVICES_REVIEW_FIRST_RULES.map((rule) => rules.find(([name]) => name === rule)).filter((item): item is typeof rules[number] => Boolean(item)), ...rules.filter(([rule]) => !LEGAL_SERVICES_REVIEW_FIRST_RULES.includes(rule))] : rules,
    orderedRules = [...baseOrderedRules.filter(([rule]) => defaultRules.includes(rule)), ...baseOrderedRules.filter(([rule]) => !defaultRules.includes(rule))],
    activeFilters = Object.values(filters).filter(Boolean).length+Object.values(fieldFilters).reduce((sum,values)=>sum+values.length,0),
    visibleExcludedFindings = excludedDuplicates.filter((entry) => {
      if ((entry.dataset || "beneficiaries") !== dataset || (exclusionRuleFilter && entry.rule !== exclusionRuleFilter)) return false;
      const query=exclusionSearch.trim().toLocaleLowerCase();
      return !query || [entry.rule,entry.identifierValue,entry.caseId,entry.name,entry.project,entry.source,entry.excludedAt].some((value)=>String(value||"").toLocaleLowerCase().includes(query));
    }),
    pendingDuplicateRechecks = excludedDuplicates.filter((entry) => (entry.dataset || "beneficiaries") === dataset && entry.pendingRecheck),
    pendingDuplicateRules = Array.from(new Set(pendingDuplicateRechecks.map((entry) => entry.rule)));
  useEffect(() => {
    if (amalProjectOnly) setSelectedRules((current) => current.filter((rule) => !AMAL_HIDDEN_ASSESSMENT_RULES.has(rule)));
  }, [amalProjectOnly]);
  const sortedExcludedFindings = [...visibleExcludedFindings].sort((left,right) => {
    const value=(entry:DuplicateExclusion) => exclusionSort.key === "identifier" ? entry.identifierValue || entry.caseId : exclusionSort.key === "page" ? entry.dataset || "beneficiaries" : String(entry[exclusionSort.key as keyof DuplicateExclusion] || "");
    const result=value(left).localeCompare(value(right),undefined,{numeric:true,sensitivity:"base"}); return exclusionSort.direction === "asc" ? result : -result;
  });
  const toggleExclusionSort = (key:string) => setExclusionSort((current) => ({key,direction:current.key === key && current.direction === "asc" ? "desc" : "asc"}));
  const exclusionKey = (entry: DuplicateExclusion) => `${entry.dataset || "beneficiaries"}|${entry.rule}|${entry.identifierType || "caseId"}|${entry.identifierValue || entry.caseId}`;
  const restoreExcludedEntries = async (selected: DuplicateExclusion[]) => {
    if (!selected.length) return;
    setExclusionBusy(true);
    try {
      let latest:{rows:DuplicateExclusion[];count:number}|null=null;
      for (const entry of selected) latest=await restoreDuplicateExclusion(entry.identifierValue || entry.caseId,entry.rule,entry.dataset || "",entry.identifierType || "");
      if (latest) setExcludedDuplicates(latest.rows);
      setSelectedExcludedFindings([]);
      setFindingRevisions((current)=>Object.fromEntries(selected.map((entry)=>[entry.rule,(current[entry.rule]||0)+1])));
      setRestoreConfirmation(null);
    } finally { setExclusionBusy(false); }
  };
  const excelAction=<ExcelDownloadButton disabled={selectedRules.length === 0} onClick={()=>downloadExcelUrl(legalReviewExportUrl(dataset, comparisonMonth, appliedNameCompareChars, allowNameVariations, exactMatchesOnly, selectedRules, filters, debouncedSearch, Object.entries(ignoreCourtVerdictByRule).filter(([,ignored])=>ignored).map(([rule])=>rule),fieldFilters),`${dataset}-review-findings.xlsx`)}/>;
  const toggleRule = (rule: string) =>
    setSelectedRules((current) =>
      current.includes(rule)
        ? current.filter((x) => x !== rule)
        : [...current, rule],
    );
  const exclusionIdentity = (row: LegalFlag) => dataset === "legalhotlines" ? ["hotlineId",row.hotlineId || row.recordId] : dataset === "assessments" ? ["assessmentId",row.assessmentId] : dataset === "legalservices" ? ["serviceId",row.serviceId] : dataset === "awareness" ? (row.awarenessId ? ["awarenessId",row.awarenessId] : ["awarenessName",row.name]) : ["caseId",row.caseId];
  const excludeFindings = async () => {
    if (!exclusionCandidates?.length) return;
    setExclusionBusy(true);
    try {
      const records = exclusionCandidates.map((candidate) => {
        const [identifierType,identifierValue] = exclusionIdentity(candidate);
        return { caseId: candidate.caseId, dataset, identifierType, identifierValue, rule: candidate.rule, name: candidate.name, project: candidate.project, source: `${labels[dataset as LegalPage]} Review`, duplicateContext: candidate.duplicateContext };
      });
      const result = records.length === 1
        ? await createDuplicateExclusion(records[0])
        : await createDuplicateExclusionsBulk(records);
      setExcludedDuplicates(result.rows);
      setFindingRevisions((current) => ({ ...current, ...Object.fromEntries(exclusionCandidates.map((candidate) => [candidate.rule, (current[candidate.rule] || 0) + 1])) }));
      setExclusionCandidates(null);
    } finally { setExclusionBusy(false); }
  };
  const restoreExcludedFinding = async (caseId: string, rule: string, item?: DuplicateExclusion) => {
    setExclusionBusy(true);
    try {
      const result = await restoreDuplicateExclusion(caseId, rule, item?.dataset || "", item?.identifierType || "");
      setExcludedDuplicates(result.rows);
      setFindingRevisions((current) => ({ ...current, [rule]: (current[rule] || 0) + 1 }));
    } finally { setExclusionBusy(false); }
  };
  return (
    <>
      {busy && !summary && (
        <LegalSkeleton variant="review" />
      )}
      {error && (
        <div className="error glass">
          {error}
          <button onClick={() => setFilters((current) => ({ ...current }))}>
            Retry
          </button>
        </div>
      )}
      {pendingDuplicateRechecks.length > 0 && (
        <aside className="glass duplicate-recheck-notice" role="status">
          <AlertTriangle />
          <div><strong>{pendingDuplicateRechecks.length} excluded duplicate {pendingDuplicateRechecks.length === 1 ? "finding has" : "findings have"} changed</strong><span>New or removed matching records changed the reviewed duplicate group. These findings are back in the Review tables.</span></div>
          <button className="primary" onClick={() => { setSelectedRules((current) => Array.from(new Set([...current,...pendingDuplicateRules]))); setFilters({}); setSearch(""); window.setTimeout(() => document.querySelector(".finding-tables")?.scrollIntoView({behavior:"smooth",block:"start"}),50); }}>Review now</button>
        </aside>
      )}
      <div className="glass review-finding-selector">
        <header>
          <div className="review-selector-actions">
            <h3>Choose review tables</h3>
          </div>
          <div className="review-selector-buttons">
            <button
              className="soft review-selector-button select-all-button"
              onClick={() => setSelectedRules(orderedRules.map(([rule]) => rule))}
            >
              <CheckCheck /> Select all
            </button>
            <button className="soft review-selector-button clear-selection-button" onClick={() => { setSelectedRules([]); setFilters({}); setFieldFilters({}); }}>
              <Eraser /> Reset
            </button>
            {true && (
              <div className="review-actions-wrap review-selector-exclude-actions">
                <button className="soft review-selector-button review-actions-toggle" aria-expanded={reviewActionsOpen} aria-haspopup="menu" onClick={() => setReviewActionsOpen((value) => !value)}>
                  <Ban /> Exclude
                </button>
                {reviewActionsOpen && <div className="review-actions-menu finding-exclusion-menu" role="menu">
                  <button className="all-findings" role="menuitem" onClick={() => { setExclusionRuleFilter(""); setSelectedExcludedFindings([]); setReviewActionsOpen(false); setExcludedManagerOpen(true); void loadExcludedDuplicates(); }}>Excluded findings for this page <b>{visibleExcludedFindings.length}</b></button>
                  <button className="all-findings" role="menuitem" onClick={() => { setExclusionImportRules([]); setExclusionImportResult(""); setExclusionImportError(""); setReviewActionsOpen(false); setExclusionImportOpen(true); }}>Import exclusions</button>
                </div>}
              </div>
            )}
          </div>
        </header>
        <div>
          {orderedRules.map(([rule, count]) => (
            <label className="finding-check" key={rule}>
              <input
                type="checkbox"
                checked={selectedRules.includes(rule)}
                onChange={() => toggleRule(rule)}
              />
              <span>{displayReviewRule(rule)}</span>
              <b title={summary?.unavailableRules?.[rule]}>{summary?.unavailableRules?.[rule] ? "Unavailable" : count.toLocaleString()}</b>
            </label>
          ))}
        </div>
      </div>
      <LegalScrollControls compactActions={excelAction} search={search} onSearch={setSearch} searchPlaceholder="Search records" onFilters={()=>setDrawer(true)} activeCount={activeFilters} onClear={()=>{setFilters({});setFieldFilters({});}}>
      <div className="legal-toolbar review-toolbar professional-review-toolbar">
        <label>
          <Search />
          <input
            className="table-search-input"
            placeholder="Search records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className="soft case-filter-button"
          onClick={() => setDrawer(true)}
        >
          <AnimatedActionIcon type="filters"/>
          Filters{activeFilters > 0 && <b>{activeFilters}</b>}
        </button>
        {excelAction}

      </div>
      </LegalScrollControls>
      {selectedRules.length === 0 ? (
        <div className="glass review-empty-selection">
          <FileQuestion />
          <h3>Select one or more findings</h3>
          <p>Each selected finding will appear in its own table.</p>
        </div>
      ) : (
        <div className="finding-tables">
          {orderedRules.map(([rule]) => rule).filter((rule) => selectedRules.includes(rule)).flatMap((rule) => (dataset === "assessments" && rule === "Open assessment with all services closed" ? [true, false] : [undefined]).map((closureRequestGroup) => (
            <FindingTable
              key={`${rule}-${closureRequestGroup}`}
              closureRequestGroup={closureRequestGroup}
              dataset={dataset}
              rule={rule}
              search={debouncedSearch}
              nameCompareChars={appliedNameCompareChars}
              nameCompareCharsInput={nameCompareChars}
              allowNameVariations={allowNameVariations}
              exactMatchesOnly={exactMatchesOnly}
              onExactMatchesOnlyChange={setExactMatchesOnly}
              onNameCompareCharsChange={setNameCompareChars}
              onAllowNameVariationsChange={setAllowNameVariations}
              nameRecordCount={summary?.nameRecordCount}
              eligibleNameRecordCount={summary?.eligibleNameRecordCount}
              ignoreCourtVerdict={Boolean(ignoreCourtVerdictByRule[rule])}
              onIgnoreCourtVerdictChange={(ignored)=>setIgnoreCourtVerdictByRule((current)=>({...current,[rule]:ignored}))}
              filters={filters}
              fieldFilters={fieldFilters}
              comparisonMonth={comparisonMonth}
              onOpenCase={onOpenCase}
              findingRevision={findingRevisions[rule] || 0}
              onFindingContextMenu={(event, row) => { event.preventDefault(); setDuplicateMenu({ x: event.clientX, y: event.clientY, row }); }}
              onBulkExclude={(rows) => setExclusionCandidates(rows)}
            />
          )))}
        </div>
      )}
      {duplicateMenu && (
        <>
          <button className="duplicate-context-backdrop" aria-label="Close duplicate actions" onClick={() => setDuplicateMenu(null)} />
          <div className="duplicate-context-menu" style={{ left: duplicateMenu.x, top: duplicateMenu.y }} role="menu">
            <button role="menuitem" onClick={() => { setExclusionCandidates([duplicateMenu.row]); setDuplicateMenu(null); }}>
              Exclude this record from this finding
            </button>
          </div>
        </>
      )}
      {exclusionCandidates?.length && (
        <div className="duplicate-exclusion-modal">
          <button className="case-modal-backdrop" aria-label="Cancel exclusion" onClick={() => setExclusionCandidates(null)} />
          <section className="duplicate-exclusion-panel">
            <span className="eyebrow">REVIEW FINDING</span>
            <h2>Exclude {exclusionCandidates.length === 1 ? "this record" : `${exclusionCandidates.length} records`}?</h2>
            <p>{exclusionCandidates.length === 1 ? <>This record will be hidden only from <strong>{exclusionCandidates[0].rule}</strong> and its related Excel rows.</> : <>These records will be hidden only from <strong>{exclusionCandidates[0].rule}</strong> and its related Excel rows.</>} The source CSV remains unchanged.</p>
            {exclusionCandidates.length === 1 && <dl><div><dt>Finding</dt><dd>{exclusionCandidates[0].rule}</dd></div><div><dt>Case ID</dt><dd>{exclusionCandidates[0].caseId}</dd></div><div><dt>Name</dt><dd>{exclusionCandidates[0].name || "Not provided"}</dd></div><div><dt>Project</dt><dd>{exclusionCandidates[0].project || "Not provided"}</dd></div></dl>}
            <footer><button className="soft" onClick={() => setExclusionCandidates(null)} disabled={exclusionBusy}>Cancel</button><button className="primary" onClick={excludeFindings} disabled={exclusionBusy}>{exclusionBusy ? "Saving…" : exclusionCandidates.length === 1 ? "Exclude record" : `Exclude ${exclusionCandidates.length} records`}</button></footer>
          </section>
        </div>
      )}
      {excludedManagerOpen && createPortal(
        <div className="duplicate-exclusion-modal" role="dialog" aria-modal="true" aria-label="Local exclusion register">
          <button className="case-modal-backdrop" aria-label="Close excluded findings" onClick={() => setExcludedManagerOpen(false)} />
          <section className="duplicate-exclusion-panel duplicate-exclusion-manager">
            <header><div><span className="eyebrow">LOCAL EXCLUSION REGISTER</span><h2>{labels[dataset as LegalPage]} - {exclusionRuleFilter || "Excluded findings"} ({visibleExcludedFindings.length})</h2></div><button onClick={() => setExcludedManagerOpen(false)}><X /></button></header>
            <p>Only exclusions for this review page are shown. Restoring a record returns it only to its selected finding when it still meets that finding’s rule.</p>
            <div className="excluded-findings-actions">
              <label className="excluded-findings-search"><Search /><input type="search" value={exclusionSearch} onChange={(event)=>setExclusionSearch(event.target.value)} placeholder="Search exclusions" aria-label="Search excluded findings" /></label>
              <button className="soft" disabled={!selectedExcludedFindings.length || exclusionBusy} onClick={() => setRestoreConfirmation(sortedExcludedFindings.filter((entry) => selectedExcludedFindings.includes(exclusionKey(entry))))}>Restore selected ({selectedExcludedFindings.length})</button>
              <ExcelDownloadButton className="primary excluded-findings-excel" onClick={()=>downloadExcelUrl(duplicateExclusionsExportUrl(),"excluded-findings.xlsx")}>Excel</ExcelDownloadButton>
            </div>
            <div className="legal-table-wrap"><ValueTable className="excluded-findings-table"><thead><tr><th><input aria-label="Select all excluded findings" type="checkbox" checked={sortedExcludedFindings.length>0 && sortedExcludedFindings.every((entry)=>selectedExcludedFindings.includes(exclusionKey(entry)))} onChange={(event) => setSelectedExcludedFindings(event.target.checked ? sortedExcludedFindings.map(exclusionKey) : [])} /></th>{[["rule","Finding"],["identifier","Identifier"],["name","Name"],["project","Project"],["excludedAt","Date excluded"],["source","Source context"]].map(([key,label]) => <th key={key}><button onClick={() => toggleExclusionSort(key)}>{label}{exclusionSort.key === key ? exclusionSort.direction === "asc" ? " ▲" : " ▼" : " ↕"}</button></th>)}<th>Status</th><th></th></tr></thead><tbody>{sortedExcludedFindings.length ? sortedExcludedFindings.map((entry) => <tr key={exclusionKey(entry)}><td><input aria-label={`Select ${entry.identifierValue || entry.caseId}`} type="checkbox" checked={selectedExcludedFindings.includes(exclusionKey(entry))} onChange={() => setSelectedExcludedFindings((current) => current.includes(exclusionKey(entry)) ? current.filter((key) => key !== exclusionKey(entry)) : [...current,exclusionKey(entry)])} /></td><td><span className={`excluded-finding-tag ${exclusionRuleClass(entry.rule)}`}>{entry.rule}</span></td><td>{entry.identifierValue || entry.caseId}</td><td>{entry.name || "—"}</td><td>{entry.project ? formatProjectLabel(entry.project) : "—"}</td><td>{entry.excludedAt ? new Date(entry.excludedAt).toLocaleString() : "—"}</td><td>{entry.source || "—"}</td><td>{entry.pendingRecheck ? <span className="duplicate-recheck-badge">Recheck</span> : "Excluded"}</td><td><button className="soft" onClick={() => setRestoreConfirmation([entry])} disabled={exclusionBusy}>Restore</button></td></tr>) : <tr><td colSpan={9}>No records are excluded on this review page.</td></tr>}</tbody></ValueTable></div>
          </section>
        </div>,
        document.body,
      )}
      {restoreConfirmation && createPortal(
        <div className="duplicate-exclusion-modal" role="dialog" aria-modal="true" aria-label="Confirm restore exclusions">
          <button className="case-modal-backdrop" aria-label="Cancel restore" onClick={() => !exclusionBusy && setRestoreConfirmation(null)} />
          <section className="duplicate-exclusion-panel restore-confirmation-panel">
            <span className="eyebrow">CONFIRM RESTORE</span>
            <h2>Restore {restoreConfirmation.length === 1 ? "this exclusion" : `${restoreConfirmation.length} exclusions`}?</h2>
            <p>The restored record{restoreConfirmation.length === 1 ? "" : "s"} will appear again only when it still matches the relevant review finding. Source files will not be changed.</p>
            <footer><button className="soft" disabled={exclusionBusy} onClick={() => setRestoreConfirmation(null)}>Cancel</button><button className="primary" disabled={exclusionBusy} onClick={() => void restoreExcludedEntries(restoreConfirmation)}>{exclusionBusy ? "Restoring…" : "Confirm restore"}</button></footer>
          </section>
        </div>, document.body,
      )}
      {exclusionImportOpen && createPortal(
        <div className="duplicate-exclusion-modal" role="dialog" aria-modal="true" aria-label="Import exclusions">
          <button className="case-modal-backdrop" aria-label="Close exclusion import" onClick={() => setExclusionImportOpen(false)} />
          <section className="duplicate-exclusion-panel exclusion-import-panel">
            <header className="exclusion-import-header"><div><span className="eyebrow">BULK EXCLUSIONS</span><h2>Import IDs for selected findings</h2></div><button className="exclusion-modal-close" aria-label="Close import exclusions" title="Close" onClick={() => setExclusionImportOpen(false)}><X /></button></header>
            <p>Choose the finding tables to exclude from, then upload CSV or Excel. The app automatically uses {dataset === "beneficiaries" ? "Case ID or Beneficiary ID" : dataset === "assessments" ? "Assessment ID" : dataset === "legalservices" ? "Service ID" : dataset === "legalhotlines" ? "Record identifier from a Hotline Review export" : "Awareness ID"} from the file.</p>
            <div className="exclusion-import-rules"><span>Exclude from these tables</span>{orderedRules.map(([rule]) => <label key={rule}><input type="checkbox" checked={exclusionImportRules.includes(rule)} onChange={() => setExclusionImportRules((current) => current.includes(rule) ? current.filter((item) => item !== rule) : [...current, rule])} /><span>{rule}</span></label>)}</div>
            <label className="exclusion-file-picker" htmlFor="exclusion-import-file"><span>Choose file</span><small>{exclusionFile?.name || "CSV, XLSX, or XLS"}</small></label>
            <input id="exclusion-import-file" className="exclusion-file-input" type="file" accept=".csv,.xlsx,.xls" onChange={(event) => { setExclusionFile(event.target.files?.[0] || null); setExclusionImportResult(""); setExclusionImportError(""); }} />
            {exclusionImportResult && <p className="exclusion-import-success" role="status"><CheckCircle2 />{exclusionImportResult}</p>}
            {exclusionImportError && <p className="error" role="alert">{exclusionImportError}</p>}
            <footer><button className="soft" onClick={() => setExclusionImportOpen(false)}>Cancel</button><button className="primary" disabled={!exclusionFile || !exclusionImportRules.length || exclusionBusy} onClick={async () => { if (!exclusionFile) return; setExclusionBusy(true); setExclusionImportError(""); setExclusionImportResult(""); try { const type=dataset === "legalhotlines" ? "hotlineId" : dataset === "assessments" ? "assessmentId" : dataset === "legalservices" ? "serviceId" : dataset === "awareness" ? "awarenessId" : "caseId"; const result=await importDuplicateExclusions(exclusionFile,dataset,type,exclusionImportRules); setExcludedDuplicates(result.rows); setExclusionImportResult(`Successfully imported ${result.imported} exclusion${result.imported === 1 ? "" : "s"} from ${result.column}. ${result.duplicates} already existed; ${result.invalid} invalid.`); setFindingRevisions((current)=>({...current,...Object.fromEntries(exclusionImportRules.map((rule)=>[rule,(current[rule]||0)+1]))})); } catch (reason) { setExclusionImportError(reason instanceof Error ? reason.message : "The exclusion file could not be imported."); } finally { setExclusionBusy(false); } }}>{exclusionBusy ? "Importing…" : "Import exclusions"}</button></footer>
          </section>
        </div>, document.body,
      )}
      {drawer && <ReviewFiltersDrawer dataset={dataset} options={summary?.filterOptions} filters={filters} onChange={setFilters} fieldOptions={summary?.fieldFilterOptions} fieldFilters={fieldFilters} onFieldChange={setFieldFilters} onClose={()=>setDrawer(false)}/>}
    </>
  );
}
