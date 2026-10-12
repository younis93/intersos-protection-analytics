import {describe,it,expect} from 'vitest';
import {issueReportTables,renderIssueReportTables} from './issueReportTables';
import type {IssueFinding} from './sendIssuesApi';
const finding=(patch:Partial<IssueFinding>={}):IssueFinding=>({id:'1',dataset:'beneficiaries',reviewPage:'Beneficiaries Review',rule:'Missing information',ruleArabic:'معلومات ناقصة',severity:'High',row:2,recordId:'C1',caseId:'C1',assessmentId:'',serviceId:'',awarenessId:'',lawyer:'Alice',project:'P1',location:'Erbil',detail:'Check the record',detailArabic:'يرجى مراجعة السجل',action:'Correct',...patch});
describe('Email-compatible PDF tables',()=>{
  it('reserves space for row numbers and keeps multi-digit numbers on one line',()=>{
    const rows=Array.from({length:1234},(_,index)=>finding({id:String(index)}));
    const html=renderIssueReportTables(rows);
    expect(html).toContain('<col style="width:44px">');
    expect(html).toContain('white-space:nowrap;overflow-wrap:normal');
    expect(html).toContain('dir="auto">1234</td>');
  });
  it('hides only the Arabic detail column and keeps the remaining cells aligned',()=>{
    const rows=[finding({matchingCases:'C2 - Sara'})];
    const [shown]=issueReportTables(rows,true),[hidden]=issueReportTables(rows,false);
    const arabicIndex=shown.columns.findIndex(column=>column.key==='arabicDetail');
    expect(hidden.columns).toEqual(shown.columns.filter((_,index)=>index!==arabicIndex));
    expect(hidden.rows[0].cells).toEqual(shown.rows[0].cells.filter((_,index)=>index!==arabicIndex));
  });
  it('groups by review page and rule and numbers findings across groups',()=>{
    const tables=issueReportTables([finding(),finding({id:'2',rule:'Invalid contact'}),finding({id:'3'}),finding({id:'4',reviewPage:'Assessments Review',rule:'Invalid contact'})]);
    expect(tables).toHaveLength(3);expect(tables.map(group=>group.rows.map(row=>row.number))).toEqual([[1,2],[3],[4]]);
  });
  it('matches column order, unions affected fields and avoids repeated identifier columns',()=>{
    const [table]=issueReportTables([finding({affectedFields:['Case ID','Beneficiary ID','Contact Number'],affectedFieldValues:{'Contact Number':'123'},matchingCases:'C2 - Sara'}),finding({assessmentId:'A1',affectedFields:['Contact Number','Name'],affectedFieldValues:{Name:'Ali'}})]);
    expect(table.columns.map(column=>column.heading)).toEqual(['#','Case ID','Assessment ID','Contact Number','Name','Matching records and lawyers','Finding detail','Finding detail (Arabic)']);
    expect(table.rows[0].cells).toEqual(['1','C1','Not available','123','Not available','C2 - Sara','Check the record','يرجى مراجعة السجل']);
  });
  it('adds a record fallback only when needed and formats multiple references like email',()=>{
    const [table]=issueReportTables([finding({caseId:'C1, C2'}),finding({caseId:'',recordId:''})]);
    expect(table.columns.map(column=>column.heading)).toEqual(['#','Case ID','Record','Finding detail','Finding detail (Arabic)']);
    expect(table.rows[0].cells[1]).toBe('C1,\nC2');expect(table.rows[1].cells[2]).toBe('Row 2');
  });
  it('includes closure context with zero linked services and does not add action or severity columns',()=>{
    const [table]=issueReportTables([finding({rule:'Open assessment with all services closed',assessmentStatus:'Open',linkedServiceCount:0,linkedServiceStatuses:'Closed'})]);
    expect(table.columns.map(column=>column.heading)).toEqual(['#','Case ID','Closure context','Finding detail','Finding detail (Arabic)']);
    expect(table.rows[0].cells[2]).toBe('Assessment status: Open\nClosure request: Not available\nLinked services: 0\nService statuses: Closed');
  });
});
