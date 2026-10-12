import { formatNumber,formatPercent } from './formatting';
export function KpiCard({
  label,
  value,
  format,
}: {
  label: string;
  value: number;
  format: string;
}) {
  const descriptions: Record<string,string> = {
    "Open caseload": "Distinct assessments not marked closed",
    "Beneficiaries served": "Unique beneficiary IDs with a service record",
    "Service coverage": "Beneficiaries served ÷ beneficiaries assessed",
  };
  return (
    <article className="kpi-card glass">
      <span>{label}</span>
      <strong>
        {format === "percent" ? formatPercent(value) : formatNumber(value)}
      </strong>
      {descriptions[label] && <small>{descriptions[label]}</small>}
    </article>
  );
}
