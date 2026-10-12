// Uses synthetic findings only. Run with Vite on port 5188.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),entry=path.join(root,'frontend/src/issuePdfCheck.tsx'),html=path.join(root,'frontend/issue-pdf-check.html');
(async()=>{let browser;const created=[];try{
  assert(!fs.existsSync(entry)&&!fs.existsSync(html));
  fs.writeFileSync(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import SendIssues from './SendIssues';import {setLegalRevision,invalidateLegalQueries} from './legalQueryCache';import './styles.css';setLegalRevision('pdf-test');(window as any).invalidate=invalidateLegalQueries;(window as any).opened=[];(window as any).pywebview={api:{open_issue_whatsapp:async(phone:string)=>{(window as any).opened.push(phone);return true;}}};createRoot(document.getElementById('root')!).render(<div className="app-shell legal-shell" style={{display:'block',padding:24}}><SendIssues revision="pdf-test"/></div>);`);created.push(entry);
  fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/issuePdfCheck.tsx"></script>');created.push(html);
  browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let revision='pdf-test';
  page.on('pageerror',error=>errors.push(String(error)));
  const rows=Array.from({length:4},(_,index)=>({id:'f'+index,dataset:'beneficiaries',lawyer:'أحمد علي',rule:'Missing contact information',ruleArabic:'معلومات الاتصال غير مكتملة',severity:'High',row:index+2,caseId:'C-'+index,recordId:'C-'+index,reviewPage:'Beneficiaries Review',project:'P1',location:'Erbil',detail:index===3?'LONG-BEGIN '+('Check the source record. يرجى مراجعة سجل المصدر. '.repeat(150))+' LONG-END':'Review the contact information and update the source record.',detailArabic:index===3?'LONG-BEGIN '+('يرجى مراجعة السجل وتحديث البيانات. '.repeat(180))+' LONG-END':'يرجى مراجعة معلومات الاتصال وتحديث سجل المصدر.',action:'Confirm the correction with the review team.',affectedFields:['Contact Number'],affectedFieldValues:{'Contact Number':'Not provided'},matchingCases:index===0?'C-99 - سارة محمد - اسم مطابق':'',duplicateMatches:index===0?[{caseId:'C-99',row:99,lawyer:'سارة محمد',matchType:'exact',name:'اسم مطابق'}]:[]}));
  rows.push({...rows[0],id:'f4',dataset:'assessments',reviewPage:'Assessments Review',rule:'Open assessment with all services closed',ruleArabic:'تقييم مفتوح وجميع الخدمات مغلقة',assessmentId:'A-1',serviceId:'S-1',affectedFields:['Assessment ID','Status'],affectedFieldValues:{Status:'Open'},matchingCases:'',duplicateMatches:[],detail:'Check closure',detailArabic:'يرجى مراجعة إغلاق التقييم',assessmentStatus:'Open',requestForClosedStatus:'Yes',linkedServiceCount:0,linkedServiceStatuses:'Closed'});
  rows.push({...rows[0],id:'f5',dataset:'legalservices',reviewPage:'Legal Services Review',rule:'Missing date',ruleArabic:'التاريخ مفقود',caseId:'',recordId:'R-5',serviceId:'',affectedFields:['Date of Service Provision'],affectedFieldValues:{},matchingCases:'',duplicateMatches:[],detail:'Check date',detailArabic:'يرجى مراجعة التاريخ'});
  await page.route('**/api/legal/send-issues/**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(route.request().url().endsWith('/contacts')?{contacts:{},whatsappNumbers:{}}:{revision,lawyers:['أحمد علي'],rows,total:rows.length,contacts:{},whatsappNumbers:{}})}));
  await page.goto((process.env.APP_TEST_URL||'http://127.0.0.1:5188')+'/issue-pdf-check.html');
  // Compare every table header and cell against the actual email renderer.
  const python=process.env.PYTHON_PATH||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  const emailTables=JSON.parse(execFileSync(python,['-c',`
import json, sys
from html.parser import HTMLParser
from backend.send_issues import render_draft, DraftRequest
class Tables(HTMLParser):
 def __init__(self):
  super().__init__(); self.tables=[]; self.cell=None; self.row=None
 def handle_starttag(self,tag,attrs):
  if tag=='table': self.tables.append({'headers':[], 'rows':[]})
  if tag=='tr': self.row=[]
  if tag in ('th','td'): self.cell=''
 def handle_data(self,data):
  if self.cell is not None: self.cell+=data
 def handle_endtag(self,tag):
  if tag in ('th','td'): self.row.append(self.cell); self.cell=None
  if tag=='tr':
   if not self.tables[-1]['headers']: self.tables[-1]['headers']=self.row
   else: self.tables[-1]['rows'].append(self.row)
rows=json.loads(sys.stdin.buffer.read().decode('utf-8'))
html,_,_=render_draft(DraftRequest(revision='test',lawyer='Test',ids=[r['id'] for r in rows]),'test@example.org',rows)
parser=Tables(); parser.feed(html); print(json.dumps(parser.tables,ensure_ascii=True))
`],{cwd:root,input:JSON.stringify(rows),encoding:'utf8',env:{...process.env,PYTHONPATH:[root,path.join(root,'.venv/Lib/site-packages'),process.env.PYTHONPATH||''].join(path.delimiter)}}));
  const pdfTables=await page.evaluate(async rows=>{
    const {issueReportTables}=await import('/src/issueReportTables.ts');
    return issueReportTables(rows).map(group=>({headers:group.columns.map(column=>column.heading),rows:group.rows.map(row=>row.cells)}));
  },rows);
  assert.deepEqual(pdfTables,emailTables);
  // Reproduce missing deferred export assets after the app has loaded. PDF
  // generation must use the libraries already included in the startup bundle.
  const lateLibraryRequests=[];
  await page.route(/\/(?:assets|node_modules\/\.vite\/deps)\/[^/]*(?:jspdf|html2canvas)[^/]*\.js/,route=>{lateLibraryRequests.push(route.request().url());return route.abort();});
  await page.getByRole('checkbox',{name:'Select all filtered findings across all pages'}).check();
  const pdf=page.getByRole('button',{name:'PDF (6)',exact:true});assert(await pdf.isEnabled());
  assert(await page.getByRole('button',{name:'Prepare Email (6)',exact:true}).isDisabled());
  await pdf.click();await page.getByRole('heading',{name:'PDF report for أحمد علي'}).waitFor();
  const frame=page.frameLocator('iframe[title="PDF report preview"]');await frame.locator('.report-page').first().waitFor();
  const pageCount=await frame.locator('.report-page').count();assert(pageCount>2);
  assert(pageCount<=6,`Compact report regressed to ${pageCount} pages; previous layout used 11`);
  assert.equal(await frame.locator('.report-body').evaluateAll(nodes=>nodes.every(n=>n.scrollHeight<=n.clientHeight)),true);
  assert.equal(await frame.locator('.report-page').evaluateAll(pages=>pages.every(page=>{
    const body=page.querySelector('.report-body'),footer=page.querySelector('.report-footer'),subtitle=page.querySelector('.report-header small'),header=page.querySelector('.report-header');
    return body.getBoundingClientRect().bottom<footer.getBoundingClientRect().top&&subtitle.getBoundingClientRect().bottom<header.getBoundingClientRect().bottom;
  })),true);
  const reportText=await frame.locator('body').innerText();assert(reportText.includes('LONG-BEGIN')&&reportText.includes('LONG-END'));assert(reportText.includes('سارة محمد'));
  const englishText=await frame.locator('.issue-report-table tbody td:nth-last-child(2)').allTextContents();
  const arabicText=await frame.locator('.issue-report-table tbody td:last-child').allTextContents();
  assert.equal((englishText.join('').match(/Check the source record\./g)||[]).length,150);
  assert.equal((arabicText.join('').match(/يرجى مراجعة السجل وتحديث البيانات\./g)||[]).length,180);
  assert(await frame.locator('.issue-report-table').count()>1);
  assert(await frame.locator('.issue-report-table').evaluateAll(tables=>tables.every(table=>table.querySelector('thead')&&table.getBoundingClientRect().width<=table.parentElement.getBoundingClientRect().width)));
  await page.screenshot({path:path.join(root,'output/send-issues-pdf-composer.png')});
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();const download=await downloadPromise;
  assert(download.suggestedFilename().endsWith('.pdf'));fs.mkdirSync(path.join(root,'output/pdf'),{recursive:true});await download.saveAs(path.join(root,'output/pdf/send-issues-synthetic-preview.pdf'));
  const textPdf=JSON.parse(execFileSync(python,['-c',`
import json, re, sys
import pypdfium2
from pypdf import PdfReader
from pypdf.generic import ContentStream
reader=PdfReader(sys.argv[1])
assert sum(len(page.images) for page in reader.pages)==0, 'PDF must contain text rather than page images'
chunks=[str(args[1]['/ActualText']) for page in reader.pages for args,op in ContentStream(page.get_contents(),reader).operations if op==b'BDC']
text=' '.join(chunks)
assert len(re.findall(r'\\bCheck\\b',text))==152, 'English findings were truncated'
assert text.count('البيانات.')==180, 'Arabic finding was truncated'
assert text.count('LONG-BEGIN')==2 and text.count('LONG-END')==2
for value in ['C-0','C-3','C-99','A-1','S-1','R-5','Linked services: 0','Finding detail (Arabic)']:
 assert value in text, value
document=pypdfium2.PdfDocument(sys.argv[1])
extracted=' '.join(page.get_textpage().get_text_range() for page in document)
assert 'يرجى مراجعة' in extracted and 'أحمد علي' in extracted, 'Arabic must copy as logical Unicode'
assert 'Check the source record.' in extracted
print(json.dumps({'pages':len(reader.pages),'images':0,'searchableEnglish':True,'searchableArabic':True,'longTextPreserved':True}))
`,path.join(root,'output/pdf/send-issues-synthetic-preview.pdf')],{cwd:root,encoding:'utf8'}));
  await page.getByText('PDF downloaded.',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  assert(await frame.locator('body').evaluate(n=>n.getBoundingClientRect().width<=window.innerWidth));
  await page.screenshot({path:path.join(root,'output/send-issues-pdf-mobile.png')});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Close PDF preview'}).click();await page.getByRole('button',{name:'WhatsApp (6)',exact:true}).click();
  await page.getByRole('heading',{name:'WhatsApp PDF for أحمد علي'}).waitFor();assert(await page.getByRole('button',{name:'Open WhatsApp',exact:true}).isDisabled());
  await page.getByRole('textbox',{name:'WhatsApp number',exact:true}).fill('07701234567');
  let chatDownloadedPdf=false;page.on('download',()=>chatDownloadedPdf=true);
  await page.getByRole('button',{name:'Open WhatsApp',exact:true}).click();
  await page.getByText('WhatsApp opened.',{exact:true}).waitFor();assert.equal(chatDownloadedPdf,false);assert.deepEqual(await page.evaluate(()=>window.opened),['9647701234567']);
  // A new source revision must invalidate the draft rather than export stale rows.
  revision='pdf-new';let unexpectedDownload=false;page.on('download',()=>unexpectedDownload=true);
  await page.getByRole('button',{name:'Download PDF',exact:true}).click();await page.getByText('Review findings changed. Select the current findings and prepare a new message.',{exact:true}).waitFor();assert.equal(unexpectedDownload,false);
  assert.deepEqual(lateLibraryRequests,[]);assert.deepEqual(errors,[]);console.log(JSON.stringify({pageCount,previousPageCount:11,textPdf,noDeferredPdfLibraries:true,emailTableParity:true,arabic:true,longFindingPreserved:true,pdfWithoutContacts:true,whatsappPdf:true,revisionGuard:true,pageErrors:errors}));
}finally{await browser?.close();for(const file of created)fs.rmSync(file,{force:true});}})().catch(error=>{console.error(error);process.exit(1)});
