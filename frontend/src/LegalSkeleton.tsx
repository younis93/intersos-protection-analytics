
export type SkeletonVariant =
  | "overview"
  | "review"
  | "explorer"
  | "detention"
  | "deportation"
  | "studio"
  | "cases"
  | "lawyers"
  | "indicator"
  | "table";

export function LegalSkeleton({
  variant,
  compact = false,
  embedded = false,
}: {
  variant: SkeletonVariant;
  compact?: boolean;
  embedded?: boolean;
}) {
  const rows = embedded && variant === "explorer" ? 14 : compact ? 3 : variant === "cases" ? 4 : 6;
  const table = (count = rows, kind = "") => <div className={`skeleton-table ${kind}`}><div className="skeleton-table-head" />{Array.from({ length: count }, (_, i) => <div className="skeleton-table-row" key={i}><i/><i/><i/><i/></div>)}</div>;
  const toolbar = (kind = "", controls = 4) => <div className={`skeleton-toolbar ${kind}`} aria-hidden="true">{Array.from({length:controls},(_,i)=><i key={i}/>)}</div>;
  const kpis = (count: number, kind = "") => <div className={`skeleton-kpis ${kind}`}>{Array.from({ length: count }, (_, i) => <div className="skeleton-card" key={i}><i/><i/><i/></div>)}</div>;
  const charts = (count: number, wide = true, kind = "") => <div className={`skeleton-chart-grid ${kind}`}>{Array.from({ length: count }, (_, i) => <div className={`skeleton-chart ${wide && i === 0 ? "wide" : ""}`} key={i}><i/><i/><b/></div>)}</div>;
  const tablePanel=(kind:string,count=rows)=><div className={`skeleton-table-panel ${kind}`}>{table(count,kind)}</div>;
  const dashboard = (cardCount: number, chartCount: number, kind = "") => <>{toolbar(kind)}{kpis(cardCount,kind)}{charts(chartCount,true,kind)}</>;
  const pageContent = (() => {
    if (embedded) return <>{variant === "explorer" && <div className="skeleton-explorer-heading"><i/><i/></div>}{table()}</>;
    if (compact) return table();
    switch (variant) {
      case "overview": return <><div className="skeleton-overview-banner skeleton-banner" />{kpis(4,"overview")}<div className="skeleton-overview-grid">{charts(2,true,"overview")}<div className="skeleton-map"/><>{tablePanel("overview",5)}</></div></>;
      case "deportation": return <>{toolbar("deportation",6)}{kpis(4,"deportation")}{charts(2,true,"deportation")}{tablePanel("deportation",6)}</>;
      case "detention": return <><div className="skeleton-tabs detention"><i/><i/></div>{toolbar("detention",6)}{kpis(4,"detention")}{charts(3,false,"detention")}{tablePanel("detention",7)}</>;
      case "lawyers": return <>{toolbar("lawyers",6)}{kpis(8,"lawyers")}<div className="skeleton-profile"><i/><i/><i/></div>{charts(3,false,"lawyers")}{tablePanel("lawyers",6)}{tablePanel("lawyers monthly",5)}</>;
      case "studio": return <><div className="skeleton-tabs"><i/><i/><i/><i/><i/></div>{toolbar("studio",6)}{kpis(4,"studio")}{charts(3,true,"studio")}{tablePanel("studio",7)}</>;
      case "review": return <><div className="skeleton-review-selector"><i/><i/><i/></div>{toolbar("review",4)}<div className="skeleton-review-tables">{Array.from({length:3},(_,i)=><div className="skeleton-review-table" key={i}>{table(4,"review")}</div>)}</div></>;
      case "explorer": return <><>{toolbar("explorer",5)}</>{tablePanel("explorer",10)}<div className="skeleton-pager"><i/><i/></div></>;
      case "cases": return <><div className="skeleton-case-search"><div className="skeleton-case-heading"><i/><i/></div>{toolbar("cases",4)}</div><div className="skeleton-case-grid">{Array.from({length:rows},(_,i)=><div className="skeleton-case-card" key={i}><i/><i/><i/><i/></div>)}</div></>;
      case "indicator": return <><div className="skeleton-tabs indicator"><i/><i/></div>{toolbar("indicator",6)}<div className="skeleton-indicator-groups">{Array.from({length:3},(_,i)=><div className="skeleton-indicator-group" key={i}><i/><i/>{table(3,"indicator")}</div>)}</div></>;
      default: return table();
    }
  })();
  return (
    <section
      className={`legal-skeleton legal-skeleton-${variant}${compact ? " compact" : ""}${embedded ? " embedded" : ""}`}
      role="status"
      aria-label="Loading page content"
      aria-busy="true"
    >
      {pageContent}
      <span className="sr-only">Loading content</span>
    </section>
  );
}

export function Unavailable({ label }: { label: string }) {
  return (
    <div className="legal-unavailable">
      <strong>{label}</strong>
      <span>Data not loaded</span>
    </div>
  );
}
