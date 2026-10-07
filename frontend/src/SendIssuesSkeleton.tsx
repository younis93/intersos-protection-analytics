export default function SendIssuesSkeleton(){
  return <div className="si-loading-skeleton" aria-hidden="true">
    <div className="si-workspace"><aside className="glass si-skeleton-lawyers"><i className="si-skeleton-search"/>{Array.from({length:6},(_,index)=><div className="si-skeleton-person" key={index}><i/><i/></div>)}</aside><div className="si-findings"><div className="glass si-skeleton-heading"><i/><i/><i className="si-skeleton-readiness"/></div>{Array.from({length:2},(_,group)=><section className="glass si-skeleton-table" key={group}><i className="si-skeleton-title"/><div>{Array.from({length:5},(_,row)=><div className="si-skeleton-row" key={row}>{Array.from({length:5},(_,column)=><i key={column}/>)}</div>)}</div></section>)}</div></div>
  </div>;
}
