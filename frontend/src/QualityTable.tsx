import { formatNumber,formatPercent } from './formatting';
import type { QualityRow } from "./types";
import { ValueTable } from "./ValueTable";
export function QualityTable({ rows }: { rows: QualityRow[] }) {
  return (
    <article className="quality-card glass">
      <div className="card-title">
        <div>
          <h3>Automated data-quality checks</h3>
          <p>
            Issues are preserved and excluded only where they would misstate
            time trends.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <ValueTable>
          <thead>
            <tr>
              <th>Area</th>
              <th>Severity</th>
              <th>Check</th>
              <th>Count</th>
              <th>Rate</th>
              <th>Analytical impact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.page}</td>
                <td>
                  <span className={`severity ${r.severity.toLowerCase()}`}>
                    {r.severity}
                  </span>
                </td>
                <td>{r.check}</td>
                <td>{formatNumber(r.count)}</td>
                <td>{formatPercent(r.rate)}</td>
                <td>{r.impact}</td>
              </tr>
            ))}
          </tbody>
        </ValueTable>
      </div>
    </article>
  );
}
