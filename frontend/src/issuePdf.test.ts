import {afterEach,describe,it,expect,vi} from 'vitest';
import {issueReportHtml,issuePdfFilename,openIssueWhatsapp,type IssueReport} from './issuePdf';

afterEach(()=>vi.unstubAllGlobals());

const report:IssueReport={lawyer:'أحمد <script>alert(1)</script>',language:'bilingual',deadline:'2026-10-20',signature:'Review team\nINTERSOS',rows:[{id:'1',dataset:'assessments',lawyer:'أحمد',rule:'Open assessment with all services closed',ruleArabic:'تقييم مفتوح وجميع الخدمات مغلقة',severity:'High',row:8,caseId:'C-8',assessmentId:'A-1',recordId:'A-1',serviceId:'',awarenessId:'',reviewPage:'Assessments Review',project:'P1',location:'Erbil',detail:'Check <status>',detailArabic:'يرجى مراجعة الحالة',action:'Confirm the assessment closure',affectedFields:['Status'],affectedFieldValues:{Status:'Open'},assessmentStatus:'Open',requestForClosedStatus:'Yes',linkedServiceCount:2,linkedServiceStatuses:'Closed',matchingCases:'C-9 - Sara - اسم مطابق',duplicateMatches:[{caseId:'C-9',row:9,lawyer:'Sara',matchType:'exact',name:'اسم مطابق'}]}]};
describe('Issue PDF report',()=>{
  it('matches email tables with references, affected values, duplicate owners and closure details',()=>{
    const html=issueReportHtml(report);
    for(const text of ['C-8','A-1','C-9','Sara','اسم مطابق','Status','Open','Closed','2026-10-20','Review team','Selected findings','يرجى مراجعة الحالة'])expect(html).toContain(text);
    expect(html).toContain('<table');expect(html).toContain('Finding detail (Arabic)');expect(html).not.toContain('Required action');expect(html).not.toContain('Confirm the assessment closure');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('Check &lt;status&gt;');
  });
  it('only toggles the Arabic detail column and omits empty optional fields',()=>{
    const ar=issueReportHtml({...report,language:'ar',deadline:'',signature:''});
    expect(ar).toContain('Legal data review');expect(ar).toContain('Finding detail (Arabic)');expect(ar).toContain('Check &lt;status&gt;');expect(ar).not.toContain('2026-10-20');
    const en=issueReportHtml({...report,language:'en'});expect(en).toContain('Check &lt;status&gt;');expect(en).not.toContain('يرجى مراجعة الحالة');expect(en).not.toContain('Finding detail (Arabic)');
    for(const html of [ar,en,issueReportHtml(report)]){expect(html).toContain('Prepared for');expect(html).toContain('Selected findings');expect(html).not.toContain('أعدت لصالح');}
  });
  it('keeps Arabic filenames and strips unsafe characters',()=>{expect(issuePdfFilename('أحمد / علي')).toBe('Legal-review-أحمد  علي.pdf');expect(issuePdfFilename('<>')).toBe('Legal-review-findings.pdf');});
  it('includes an escaped additional note without requiring sender details',()=>{
    const html=issueReportHtml({...report,signature:'',additionalNote:'Please check <records>\nيرجى المراجعة'});
    expect(html).toContain('Additional note');expect(html).toContain('Please check &lt;records&gt;');expect(html).toContain('يرجى المراجعة');
    expect(html).not.toContain('report-signature" dir');
    expect(issueReportHtml({...report,signature:'',additionalNote:'   '})).not.toContain('Additional note');
  });
  it('opens the desktop WhatsApp chat without accessing PDF or download APIs',async()=>{
    const open=vi.fn(async()=>true);
    vi.stubGlobal('window',{pywebview:{api:{open_issue_whatsapp:open}}});
    await openIssueWhatsapp('9647709988997');
    expect(open).toHaveBeenCalledWith('9647709988997');
  });
  it('opens the browser chat synchronously and reports blocked popups or invalid numbers',async()=>{
    const popup={opener:{},location:{href:''},close:vi.fn()};
    const open=vi.fn(()=>popup);
    vi.stubGlobal('window',{open});
    const result=openIssueWhatsapp('9647709988997');
    expect(open).toHaveBeenCalledOnce();
    await result;
    expect(popup.opener).toBeNull();
    expect(popup.location.href).toBe('https://web.whatsapp.com/send?phone=9647709988997');
    open.mockClear();
    await expect(openIssueWhatsapp('bad')).rejects.toThrow('valid WhatsApp number');
    expect(open).not.toHaveBeenCalled();
    vi.stubGlobal('window',{open:()=>null});
    await expect(openIssueWhatsapp('9647709988997')).rejects.toThrow('Allow pop-ups');
    vi.stubGlobal('window',{pywebview:{api:{open_issue_whatsapp:async()=>false}}});
    await expect(openIssueWhatsapp('9647709988997')).rejects.toThrow('Unable to open WhatsApp');
  });
});
