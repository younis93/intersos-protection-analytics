const Line=({width='100%'}:{width?:string})=><i style={{width}}/>;

export default function SendIssuesSkeleton(){
  return <div className="si-loading-skeleton" aria-hidden="true" inert>
    <div className="si-workspace">
      <aside className="glass si-lawyers si-skeleton-lawyers">
        <div className="si-search si-skeleton-search"><Line/></div>
        {Array.from({length:6},(_,index)=><button type="button" className={index===0?'active':''} tabIndex={-1} key={index}>
          <strong><Line width="75%"/></strong><span><Line width="65%"/></span><small><Line width="95%"/></small>
        </button>)}
      </aside>
      <div className="si-findings">
        <section className="glass si-lawyer-heading si-skeleton-heading">
          <div className="si-lawyer-identity"><h2><Line width="75%"/></h2><p><Line width="90%"/></p></div>
          <div className="si-lawyer-message-actions"><button className="soft" type="button"><Line width="125px"/></button><button className="soft si-whatsapp-action" type="button"><Line width="105px"/></button><button className="soft" type="button"><Line width="65px"/></button></div>
          <div className="si-message-readiness"><span><Line width="160px"/></span>{Array.from({length:3},(_,index)=><small key={index}><Line width="214px"/></small>)}</div>
        </section>
        <div className="si-selection si-skeleton-selection"><input type="checkbox" tabIndex={-1} readOnly/><span><Line width="235px"/></span><button className="soft" type="button"><Line width="105px"/></button></div>
        {Array.from({length:2},(_,group)=><section className="glass si-group si-skeleton-table" key={group}>
          <header><input type="checkbox" tabIndex={-1} readOnly/><div><h3><Line width="220px"/></h3><small><Line width="380px"/></small></div></header>
          <div className="si-table-scroll"><table><thead><tr>{['si-select-column','si-reference-column','si-reference-column','si-reference-column','si-issue-column','si-prose-column'].map((column,index)=><th className={column} key={index}><Line width={index===0?'32px':'75%'}/></th>)}</tr></thead>
            <tbody><tr><td className="si-select-column"><input type="checkbox" tabIndex={-1} readOnly/></td>{Array.from({length:3},(_,index)=><td className="si-reference-column" key={index}><Line width="60%"/></td>)}<td className="si-issue-column"><Line width="85%"/><Line/><Line width="65%"/><Line width="45%"/></td><td className="si-prose-column"><Line width="90%"/><Line width="75%"/></td></tr></tbody>
          </table></div>
          <footer><span><Line width="65px"/></span><button className="soft" type="button"><Line width="50px"/></button><span><Line width="70px"/></span><button className="soft" type="button"><Line width="30px"/></button></footer>
        </section>)}
      </div>
    </div>
  </div>;
}
