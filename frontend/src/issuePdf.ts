import type {IssueFinding} from './sendIssuesApi';
import type {MessageLanguage} from './issueComposerSettings';
import {whatsappPhone} from './whatsappIssues';
import {renderIssueReportTables,escapeReportText} from './issueReportTables';
import {createTextIssuePdf} from './issuePdfDocument';

export interface IssueReport {lawyer:string;rows:IssueFinding[];language:MessageLanguage;deadline:string;signature:string;additionalNote?:string}
const escape=escapeReportText;
export const issuePdfFilename=(lawyer:string)=>`Legal-review-${lawyer.replace(/[^\p{L}\p{N} -]/gu,'').trim()||'findings'}.pdf`;

// Browser text layout preserves Arabic shaping and mixed-direction record references.
export function issueReportHtml(report:IssueReport){
  const {lawyer,rows,language,deadline,signature,additionalNote}=report;
  const label=(en:string,_ar:string)=>escape(en);
  const field=(title:string,value:unknown)=>value===undefined||value===null||value===''?'':`<p dir="auto"><b>${title}:</b> ${escape(value)}</p>`;
  const tables=renderIssueReportTables(rows,language!=='en');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Legal data review</title><style>
  *{box-sizing:border-box}body{margin:0;background:#eaf0f5;color:#203247;font:13px/1.5 'Segoe UI',Arial,sans-serif}.report-page{width:1123px;height:794px;background:white;margin:16px auto;position:relative;padding:24px 28px 38px;overflow:hidden}.report-header{height:72px;border-bottom:3px solid #1482c5;margin-bottom:12px}.brand{color:#087bb8;font-size:11px;font-weight:800;letter-spacing:1.6px}.report-header h1{font-size:20px;line-height:1.2;margin:3px 0;color:#142d46}.report-header small{display:block;margin-top:2px;color:#627589;font-size:10px}.report-body{height:638px;overflow:hidden}.report-page-continuation .report-header{height:36px;display:flex;align-items:center;justify-content:space-between;gap:12px}.report-page-continuation .report-header h1{font-size:15px;margin:0}.report-page-continuation .report-header small{font-size:9px;margin:0}.report-page-continuation .report-body{height:674px}.report-footer{position:absolute;bottom:16px;left:28px;right:28px;border-top:1px solid #d7e2ea;padding-top:8px;font-size:10px;color:#667b8d;display:flex;justify-content:space-between}.report-block{margin:0 0 10px}.summary{padding:10px 12px;background:#eef6fb;border-left:4px solid #1482c5;border-radius:6px}.summary h2{font-size:14px;margin:0 0 4px}.summary p{margin:2px 0;font-size:12px}.issue-table-group{margin:0 0 12px}.issue-table-group h2{font-size:13px;line-height:1.4;color:#164f75;margin:0 0 6px}.issue-report-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11.5px;line-height:1.45}.issue-report-table th,.issue-report-table td{border:1px solid #d4e0eb;padding:5px 6px;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}.issue-report-table th{background:#eaf1f8;color:#183c60;text-align:start;font-weight:700}.issue-report-table tbody tr:nth-child(even){background:#f5f8fc}.issue-report-table tr[data-continuation=true]{background:#f5f8fc}.report-block p{white-space:pre-wrap}.report-signature{white-space:pre-wrap;border-top:1px solid #d9e4ec;padding-top:8px;font-size:12px}p{overflow-wrap:anywhere}span[lang=ar]{display:block}.continuation{font-size:11px;color:#627589}.report-source{display:none}@media(max-width:1140px){body{width:1123px}.report-page{margin:0 auto 16px}}@media print{body{background:white}.report-page{margin:0;break-after:page}}@page{size:A4 landscape;margin:0}
  </style></head><body><template id="report-header"><header class="report-header"><div class="brand">INTERSOS</div><h1>${label('Legal data review','مراجعة البيانات القانونية')}</h1><small>${label('Protection Analysis','تحليل الحماية')} · ${escape(new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Baghdad'}))}</small></header></template><template id="report-footer"><footer class="report-footer"><span class="page-number"></span></footer></template><main id="report-source" class="report-source"><section class="summary report-block"><h2 dir="auto">${label('Prepared for','أعدت لصالح')}: ${escape(lawyer)}</h2><p>${label('Selected findings','الملاحظات المحددة')}: <b>${rows.length}</b></p>${deadline?field(label('Correction deadline','الموعد النهائي للتصحيح'),deadline):''}<p dir="auto">${label('Please review the findings below, correct the source records, and confirm completion.','يرجى مراجعة الملاحظات أدناه وتصحيح سجلات المصدر وتأكيد إتمام التصحيح.')}</p>${additionalNote?.trim()?field('Additional note',additionalNote.trim()):''}</section>${tables}${signature?`<section class="report-block report-signature" dir="auto">${escape(signature)}</section>`:''}</main></body></html>`;
}

// Keep table rows together where possible. Oversized rows continue cell by cell,
// preserving the columns, record references and repeated headers on every page.
export async function paginateIssueReport(doc:Document){
  await doc.fonts.ready;
  const source=doc.getElementById('report-source');
  if(!source||doc.querySelector('.report-page'))return;
  let body!:HTMLElement;
  const newPage=()=>{
    const page=doc.createElement('section');page.className=`report-page${doc.querySelector('.report-page')?' report-page-continuation':''}`;
    page.append((doc.getElementById('report-header') as HTMLTemplateElement).content.cloneNode(true));
    body=doc.createElement('div');body.className='report-body';page.append(body);
    page.append((doc.getElementById('report-footer') as HTMLTemplateElement).content.cloneNode(true));
    doc.body.append(page);
  };
  const fits=()=>body.scrollHeight<=body.clientHeight;
  newPage();
  for(const block of Array.from(source.children)){
    if(block.classList.contains('issue-table-group')){
      const originalRows=Array.from(block.querySelectorAll('tbody > tr'));
      const startTable=(continued=false)=>{
        const shell=block.cloneNode(true) as HTMLElement;
        const tableBody=shell.querySelector('tbody')!;tableBody.replaceChildren();
        if(continued){const note=doc.createElement('span');note.className='continuation';note.textContent=' (continued)';shell.querySelector('h2')!.append(note);}
        body.append(shell);return tableBody;
      };
      let tableBody=startTable();
      for(const originalRow of originalRows){
        tableBody.append(originalRow);
        if(fits())continue;
        const table=tableBody.closest('table')!;
        const heading=tableBody.closest('.issue-table-group')!.querySelector('h2')!;
        const oversized=(originalRow as HTMLElement).offsetHeight>674-(table.querySelector('thead') as HTMLElement).offsetHeight-heading.getBoundingClientRect().height-18;
        const available=body.clientHeight-(originalRow.getBoundingClientRect().top-body.getBoundingClientRect().top)-12;
        originalRow.remove();
        if(!oversized||available<120){
          if(!tableBody.childElementCount)tableBody.closest('.issue-table-group')!.remove();
          if(body.childElementCount)newPage();
          tableBody=startTable(true);tableBody.append(originalRow);
          if(fits())continue;
          originalRow.remove();
        }
        const cells=Array.from(originalRow.children);
        const repeat=cells.map(cell=>cell.getAttribute('data-repeat')==='true'&&(cell.textContent||'').length<180);
        const remaining=cells.map((cell,index)=>repeat[index]?[]:Array.from(cell.textContent||''));
        let continuation=false;
        while(remaining.some(text=>text.length)){
          const fragment=originalRow.cloneNode(true) as HTMLElement;
          fragment.dataset.continuation=String(continuation);
          const fragmentCells=Array.from(fragment.children);
          fragmentCells.forEach((cell,index)=>{if(!repeat[index])cell.textContent='';});
          tableBody.append(fragment);
          if(!fits())throw new Error('Unable to fit report table headers and references on the page.');
          let consumed=0;
          fragmentCells.forEach((cell,index)=>{
            if(repeat[index]||!remaining[index].length)return;
            let low=0,high=remaining[index].length;
            while(low<high){const middle=Math.ceil((low+high)/2);cell.textContent=remaining[index].slice(0,middle).join('');if(fits())low=middle;else high=middle-1;}
            if(low<remaining[index].length){const boundary=remaining[index].slice(0,low).lastIndexOf(' ');if(boundary>low*.8)low=boundary+1;}
            cell.textContent=remaining[index].splice(0,low).join('');consumed+=low;
          });
          if(!consumed)throw new Error('Unable to fit report table text on the page.');
          if(remaining.some(text=>text.length)){newPage();tableBody=startTable(true);continuation=true;}
        }
      }
      continue;
    }
    body!.append(block);
    if(fits())continue;
    block.remove();
    if(body!.childElementCount)newPage();
    body!.append(block);
    if(fits())continue;
    block.remove();
    const heading=block.querySelector('h2');
    const fragments=Array.from(block.childNodes).filter(node=>node!==heading);
    const makeFragment=()=>{
      const shell=block.cloneNode(false) as HTMLElement;
      if(heading)shell.append(heading.cloneNode(true));
      const content=doc.createElement('div');content.className='prose-content';shell.append(content);body.append(shell);return content;
    };
    let content=makeFragment();
    for(const part of fragments){
      content.append(part);
      if(fits())continue;
      const tooTall=part.nodeType===1&&(part as HTMLElement).offsetHeight>body.clientHeight-(heading?.getBoundingClientRect().height||0)-44;
      part.remove();
      if(!tooTall&&content.childNodes.length){newPage();content=makeFragment();content.append(part);if(fits())continue;part.remove();}
      // Keep all text even when a single field exceeds an entire page.
      const remaining=Array.from(part.textContent||'');
      while(remaining.length){
        const paragraph=doc.createElement('p');paragraph.dir='auto';content.append(paragraph);
        let low=0,high=remaining.length;
        while(low<high){const middle=Math.ceil((low+high)/2);paragraph.textContent=remaining.slice(0,middle).join('');if(fits())low=middle;else high=middle-1;}
        if(!low)throw new Error('Unable to fit report text on the page.');
        if(low<remaining.length){const boundary=remaining.slice(0,low).lastIndexOf(' ');if(boundary>low*.8)low=boundary+1;}
        paragraph.textContent=remaining.splice(0,low).join('');
        if(remaining.length){newPage();content=makeFragment();}
      }
    }
  }
  const pages=Array.from(doc.querySelectorAll('.report-page'));
  pages.forEach((page,index)=>{page.querySelector('.page-number')!.textContent=`${index+1} / ${pages.length}`;});
}

export async function prepareIssueReportPreview(doc:Document){
  await paginateIssueReport(doc);
  const view=doc.defaultView;
  if(!view)return;
  const fit=()=>doc.body.style.setProperty('zoom',String(Math.min(1,Math.max(0.1,(view.innerWidth-24)/1123))));
  fit();view.addEventListener('resize',fit);
}

export async function createIssuePdf(report:IssueReport):Promise<Blob>{
  return createTextIssuePdf(report);
}

export function downloadIssuePdf(blob:Blob,lawyer:string){
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=issuePdfFilename(lawyer);anchor.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

export async function openIssueWhatsapp(phone:string){
  const recipient=whatsappPhone(phone);
  if(!recipient)throw new Error('Enter a valid WhatsApp number.');
  const desktop=(window as any).pywebview?.api;
  const popup=desktop?.open_issue_whatsapp?null:window.open('about:blank','_blank');
  if(popup)popup.opener=null;
  try{
    if(!desktop?.open_issue_whatsapp&&!popup)throw new Error('Allow pop-ups to open WhatsApp.');
    if(desktop?.open_issue_whatsapp){if(!await desktop.open_issue_whatsapp(recipient))throw new Error('Unable to open WhatsApp. Try again or open it manually.');}
    else if(popup)popup.location.href='https://web.whatsapp.com/send?phone='+recipient;
  }catch(reason){popup?.close();throw reason;}
}
