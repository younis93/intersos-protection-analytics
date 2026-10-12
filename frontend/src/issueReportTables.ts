import type {IssueFinding} from './sendIssuesApi';

export const escapeReportText=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const display=(value:unknown)=>value===undefined||value===null||value===''?'Not available':String(value);
const identifiers=[['Case ID','caseId'],['Assessment ID','assessmentId'],['Service ID','serviceId'],['Hotline ID','hotlineId'],['Awareness ID','awarenessId']] as const;
interface Column {heading:string;key:string;kind:'reference'|'field'|'detail'|'context'|'number'}

// Match render_draft's table schema, ordering, field de-duplication and fallbacks.
// Arabic detail visibility only affects this column, not the report framing.
export function issueReportTables(rows:IssueFinding[],showArabicDetail=true){
  const groups=new Map<string,IssueFinding[]>();
  for(const row of rows){const key=JSON.stringify([row.reviewPage,row.rule]);const group=groups.get(key)||[];group.push(row);groups.set(key,group);}
  let number=0;
  return Array.from(groups.values(),findings=>{
    const columns:Column[]=[{heading:'#',key:'number',kind:'number'},...identifiers.filter(([,key])=>findings.some(row=>row[key])).map(([heading,key])=>({heading,key,kind:'reference' as const}))];
    if(columns.length===1||findings.some(row=>!identifiers.some(([,key])=>row[key])))columns.push({heading:'Record',key:'recordId',kind:'reference'});
    const excluded=new Set(columns.map(column=>column.heading.toLowerCase()));
    if(excluded.has('case id'))excluded.add('beneficiary id');
    const fields=Array.from(new Set(findings.flatMap(row=>row.affectedFields||[]).filter(field=>!excluded.has(field.toLowerCase()))));
    columns.push(...fields.map(field=>({heading:field,key:field,kind:'field' as const})));
    if(findings.some(row=>row.matchingCases))columns.push({heading:'Matching records and lawyers',key:'matchingCases',kind:'context'});
    const closure=findings[0].rule.startsWith('Open assessment with all services closed');
    if(closure)columns.push({heading:'Closure context',key:'closureContext',kind:'context'});
    columns.push({heading:'Finding detail',key:'detail',kind:'detail'});
    if(showArabicDetail)columns.push({heading:'Finding detail (Arabic)',key:'arabicDetail',kind:'detail'});
    return {page:findings[0].reviewPage,rule:findings[0].rule,columns,rows:findings.map(row=>{
      number++;
      return {number,cells:columns.map(column=>{
        if(column.kind==='number')return String(number);
        if(column.kind==='field')return display(row.affectedFieldValues?.[column.key]);
        if(column.key==='recordId')return row.recordId||`Row ${row.row}`;
        if(column.key==='arabicDetail')return display(row.detailArabic||row.detail);
        if(column.key==='closureContext')return ([['Assessment status',row.assessmentStatus],['Closure request',row.requestForClosedStatus],['Linked services',row.linkedServiceCount],['Service statuses',row.linkedServiceStatuses]] as const).map(([label,value])=>`${label}: ${display(value)}`).join('\n');
        const value=display(row[column.key as keyof IssueFinding]);
        return column.kind==='reference'?value.replace(/,\s*/g,',\n'):value;
      })};
    })};
  });
}

export function renderIssueReportTables(rows:IssueFinding[],showArabicDetail=true){
  const esc=escapeReportText;
  return issueReportTables(rows,showArabicDetail).map(group=>{
    const weight=(column:Column)=>column.kind==='number'?0:column.kind==='reference'?0.7:column.kind==='field'?1:column.kind==='detail'?3:1.6;
    const total=group.columns.reduce((sum,column)=>sum+weight(column),0);
    const numberWidth=Math.max(32,...group.rows.map(row=>String(row.number).length*8+12));
    const columnWidth=(column:Column)=>column.kind==='number'?`${numberWidth}px`:`calc(${weight(column)/total*100}% - ${numberWidth*weight(column)/total}px)`;
    return `<section class="issue-table-group"><h2 dir="auto">${esc(group.page)}: ${esc(group.rule)}</h2><table class="issue-report-table"><colgroup>${group.columns.map(column=>`<col style="width:${columnWidth(column)}">`).join('')}</colgroup><thead><tr>${group.columns.map(column=>`<th scope="col">${esc(column.heading)}</th>`).join('')}</tr></thead><tbody>${group.rows.map(row=>`<tr data-finding="${row.number}">${group.columns.map((column,index)=>`<td style="${column.kind==='number'?'white-space:nowrap;overflow-wrap:normal':''}" data-repeat="${column.kind==='number'||column.kind==='reference'}" dir="${column.key==='arabicDetail'?'rtl':column.kind==='reference'?'ltr':'auto'}">${esc(row.cells[index])}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
  }).join('');
}
