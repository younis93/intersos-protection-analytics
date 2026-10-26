import {
ArrowRight,
ChevronDown,
Download
} from "lucide-react";
import { useState } from "react";
import { englishOnly,renderCell,value } from './LegalRecordCells';
import { Unavailable } from './LegalSkeleton';
import { ValueTable } from "./ValueTable";
import {
exportLegalCases
} from "./api";
import type { LegalMetadata } from "./types";
import {beneficiaryProfileFields} from './beneficiaryProfile';
export const ASSESSMENT_STATUS_FIELDS = [
  "Date of the Request",
  "Request for Pending Status",
  "Pending Status Approval",
  "Request for Closed Status",
  "Closed Status Approval",
  "Status Comment by Supervisor",
  "Approved By",
];

export const ASSESSMENT_OMIT = [
  "Beneficiary ID",
  "Gender النوع الاجتماعي",
  "DoB / تأريخ الولاده",
  "Age",
  "Age group",
  "Age Gender Group",
  "UNHCR Age Group",
  "Nationality الجنسية",
  "Nationality Stateless",
  "Community Type",
  "Nation of Birth / بلد الولاده",
  "Assessments (Indicator 1)",
  "Legal Service (Type of Service Provided / نوع الخدمة)",
  "Service Status حالة الخدمة",
  "Type of Document نوع الوثيقة",
  "Type of service with Civil",
  "Date Service Completed تاريخ انجاز الخدمة",
  "Protection Category / الفئة الرئيسيه للحمايه",
  "Type of vulnerabilities",
  "Legal Service Type of Service Provided - with Status",
];

export const SERVICE_OMIT = [
  "Is successfully secured civil documentation through ad hoc committee mobile missions",
  "Is successfully secured civil documentation through mobile CAD missions supported",
  "Assessment Status حالة التقييم",
  "Date of Assessment Closure تاريخ إغلاق التقييم",
  "Date of Assessment تاريخ التقييم",
  "Is the beneficiary detained هل المستفيد موقوف",
  "Community Type",
  "Case Complexity from Assessment",
  "Nationality Stateless",
  "Nationality الجنسية",
  "Age Gender Group",
  "UNHCR Age Group",
  "Age group",
  "Age",
  "DoB / تأريخ الولاده",
  "Gender النوع الاجتماعي",
];

export const getField = (row: any, hint: string) => {
  const key = Object.keys(row || {}).find((x) =>
    x.toLowerCase().includes(hint.toLowerCase()),
  );
  return key ? row[key] : "";
};

export function CaseTree({ item, metadata, showBeneficiary = false, onOpenCase }: { item: any; metadata: LegalMetadata; showBeneficiary?: boolean; onOpenCase?: (caseId: string) => void }) {
  const [beneficiaryOpen,setBeneficiaryOpen]=useState(showBeneficiary);
  const counts = item.counts || {},
    caseId = String(item.beneficiary["Case ID"] || ""),
    beneficiaryName = String(item.beneficiary["Name (Filter Color Red)"] || "Name not provided in source");
  return (
    <article className="glass case-card">
      <header>
        <div>
          <span className="eyebrow">BENEFICIARY CASE</span>
          <h3 data-copy-value={beneficiaryName} title="Click to copy beneficiary name">{beneficiaryName}</h3>
          <p>
            Case ID: <strong data-copy-value={caseId} title="Click to copy Case ID">{value(caseId)}</strong>
          </p>
        </div>
        <div className="case-header-actions">
          <div className="case-counts">
            <span>
              <b>{counts.assessments || 0}</b> Assessments
            </span>
            <span>
              <b>{counts.services || 0}</b> Services
            </span>
            {metadata.availability.followupslogbooks && (
              <span>
                <b>{counts.followups || 0}</b> Follow-ups
              </span>
            )}
            {metadata.availability.legalfees && (
              <span>
                <b>{counts.fees || 0}</b> Fees
              </span>
            )}
          </div>
          <div className="case-card-actions">
            {onOpenCase && <button
              className="soft case-view-button"
              onClick={() => onOpenCase(caseId)}
              aria-label={`Open case ${caseId}`}
            >
              View <ArrowRight />
            </button>}
            <button
              className="primary"
              onClick={() => exportLegalCases(caseId, {}, `case-${caseId}.xlsx`)}
            >
              <Download />
              Excel
            </button>
          </div>
        </div>
      </header>
      <details className="beneficiary-profile" open={beneficiaryOpen} onToggle={(event)=>setBeneficiaryOpen(event.currentTarget.open)}>
        <summary>
          Beneficiary information <ChevronDown />
        </summary>
        <RecordGrid row={beneficiaryProfileFields(item.beneficiary)} keepEmpty={['Contact number 1','Contact number 2']} />
      </details>
      <div className="case-timeline">
        <div className="case-level-heading">
          <span>Assessments</span>
          <b>{item.assessments.length}</b>
        </div>
        {item.assessments.length ? (
          item.assessments.map((node: any, i: number) => (
            <AssessmentNode
              key={i}
              node={node}
              metadata={metadata}
              index={i + 1}
            />
          ))
        ) : (
          <div className="nested-empty">No linked assessments</div>
        )}
      </div>
    </article>
  );
}

export function AssessmentNode({
  node,
  metadata,
  index,
}: {
  node: any;
  metadata: LegalMetadata;
  index: number;
}) {
  const id = node.assessment["Assessment ID"],
    need = englishOnly(
      getField(node.assessment, "Type of Legal Service Needed"),
    );
  return (
    <details className="assessment-node">
      <summary>
        <div className="node-title">
          <span>Assessment {index}</span>
          <strong>{need}</strong>
          <small>{value(id)}</small>
        </div>
        <div>
          <b>{node.services.length}</b> services
          <ChevronDown />
        </div>
      </summary>
      <RecordGrid row={node.assessment} omit={[...ASSESSMENT_OMIT, ...Object.keys(node.assessment).filter((key) => ASSESSMENT_STATUS_FIELDS.some((field) => key.trim().toLowerCase().includes(field.toLowerCase())))]} />
      <div className="case-level-heading"><span>Status requests and approvals</span></div>
      <RecordGrid row={Object.fromEntries(ASSESSMENT_STATUS_FIELDS.map((field) => [field, getField(node.assessment, field) || "-"]))} />
      <div className="service-list">
        <div className="case-level-heading">
          <span>Legal services</span>
          <b>{node.services.length}</b>
        </div>
        {node.services.length ? (
          node.services.map((service: any, i: number) => (
            <ServiceNode
              key={i}
              node={service}
              metadata={metadata}
              index={i + 1}
            />
          ))
        ) : (
          <div className="nested-empty">
            No legal services linked to this assessment
          </div>
        )}
      </div>
    </details>
  );
}

export function ServiceNode({
  node,
  metadata,
  index,
}: {
  node: any;
  metadata: LegalMetadata;
  index: number;
}) {
  const serviceType = englishOnly(
    getField(node.service, "Type of Service Provided"),
  );
  return (
    <details className="service-node">
      <summary>
        <div className="node-title">
          <span>Service {index}</span>
          <strong>{serviceType}</strong>
          <small>{value(node.service["Service ID"])}</small>
        </div>
        <div className="nested-counts">
          {metadata.availability.followupslogbooks && (
            <b>{node.followups.length} follow-ups</b>
          )}
          {metadata.availability.legalfees && <b>{node.fees.length} fees</b>}
          <ChevronDown />
        </div>
      </summary>
      <RecordGrid row={node.service} omit={SERVICE_OMIT} />
      <div className="service-children">
        {metadata.availability.followupslogbooks ? (
          <NestedTable title="Follow-ups" rows={node.followups} />
        ) : (
          <Unavailable label="Follow-ups" />
        )}
        {metadata.availability.legalfees ? (
          <NestedTable title="Legal fees" rows={node.fees} />
        ) : (
          <Unavailable label="Legal fees" />
        )}
      </div>
    </details>
  );
}

export function NestedTable({ title, rows }: { title: string; rows: any[] }) {
  const columns = Array.from(
    new Set(
      rows.flatMap((row) =>
        Object.keys(row).filter((key) => row[key] !== "" && row[key] !== null),
      ),
    ),
  );
  return (
    <section className="nested-records nested-table">
      <h4>
        {title} <b>{rows.length}</b>
      </h4>
      {rows.length ? (
        <div>
          <ValueTable>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>{renderCell(row[c], c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </ValueTable>
        </div>
      ) : (
        <div className="nested-empty">No linked {title.toLowerCase()}</div>
      )}
    </section>
  );
}

export function RecordGrid({ row, omit = [], keepEmpty = [] }: { row: any; omit?: string[]; keepEmpty?: string[] }) {
  return (
    <div className="case-record">
      {Object.entries(row)
        .filter(
          ([k, v]) =>
            (keepEmpty.includes(k) || (v !== "" && v !== null)) &&
            !omit.some(
              (item) => k.trim().toLowerCase() === item.trim().toLowerCase(),
            ),
        )
        .map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <strong>{keepEmpty.includes(k) && (v === '' || v === null || v === undefined) ? '' : renderCell(v, k)}</strong>
          </div>
        ))}
    </div>
  );
}
