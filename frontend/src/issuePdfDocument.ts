import {jsPDF} from 'jspdf';
import arabicRegularUrl from '../node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf?url';
import arabicBoldUrl from '../node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Bold.ttf?url';
import {issueReportTables} from './issueReportTables';
import type {IssueReport} from './issuePdf';

let fontData:Promise<string[]>|undefined;
function loadFonts(){
  return fontData??=Promise.all([arabicRegularUrl,arabicBoldUrl].map(async url=>{
    const response=await fetch(url);
    if(!response.ok)throw new Error('The PDF Arabic font could not be loaded. Please try again.');
    const bytes=new Uint8Array(await response.arrayBuffer());
    let binary='';
    for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    return btoa(binary);
  })).catch(error=>{fontData=undefined;throw error;});
}

const arabic=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
const arabicRuns=/([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+)/;
const actualText=(text:string)=>'FEFF'+Array.from({length:text.length},(_,i)=>text.charCodeAt(i).toString(16).padStart(4,'0')).join('');
type BidiEngine={doBidiReorder:(text:string)=>string};

// Draw real PDF text and vector borders directly. Browser screenshots and
// hidden export iframes are deliberately absent from this download path.
export async function createTextIssuePdf(report:IssueReport):Promise<Blob>{
  if(!report.rows.length)throw new Error('Select at least one finding for this lawyer.');
  const fonts=await loadFonts();
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true,putOnlyUsedFonts:true});
  for(const [index,style] of ['normal','bold'].entries()){
    const file=`IssueArabic-${style}.ttf`;
    pdf.addFileToVFS(file,fonts[index]);pdf.addFont(file,'IssueArabic',style);
  }
  pdf.setProperties({title:'Legal data review',subject:`Selected findings for ${report.lawyer}`,author:'INTERSOS',creator:'INTERSOS Protection Analysis'});
  const Engine=(jsPDF as unknown as {__bidiEngine__:new(options:object)=>BidiEngine}).__bidiEngine__;
  const bidi=new Engine({isInputVisual:false,isOutputVisual:true,isOutputRtl:false});
  const write=(value:string)=>(pdf.internal as typeof pdf.internal&{write:(value:string)=>void}).write(value);
  const pageWidth=pdf.internal.pageSize.getWidth(),pageHeight=pdf.internal.pageSize.getHeight();
  const margin=21,width=pageWidth-margin*2,bottom=pageHeight-39,padding=4,fontSize=8.5,lineHeight=12.5;
  const label=(en:string,_ar:string)=>en;
  const date=new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Baghdad'});
  const cache=new Map<string,{runs:{text:string;font:string;width:number}[];width:number}>();
  const layout=(text:string,size:number,bold=false)=>{
    const key=JSON.stringify([text,size,bold]);
    const cached=cache.get(key);if(cached)return cached;
    const visual=bidi.doBidiReorder(pdf.processArabic(text));
    const runs=visual.split(arabicRuns).filter(Boolean).map(text=>{
      const font=arabic.test(text)?'IssueArabic':'helvetica';
      pdf.setFont(font,bold?'bold':'normal');pdf.setFontSize(size);
      return {text,font,width:pdf.getTextWidth(text)};
    });
    const result={runs,width:runs.reduce((sum,run)=>sum+run.width,0)};
    cache.set(key,result);return result;
  };
  const text=(value:string,x:number,y:number,size=fontSize,bold=false,align:'left'|'right'='left',color='#203247')=>{
    if(!value)return;
    const prepared=layout(value,size,bold);
    if(align==='right')x-=prepared.width;
    pdf.setTextColor(color);
    // ActualText preserves the original logical Unicode when copying/searching
    // Arabic, even though visible glyphs are shaped and ordered for display.
    write(`/Span << /ActualText <${actualText(value)}> >> BDC`);
    for(const run of prepared.runs){
      pdf.setFont(run.font,bold?'bold':'normal');pdf.setFontSize(size);
      pdf.text(run.text,x,y,{isInputVisual:true,isOutputVisual:true,isInputRtl:false,isOutputRtl:false} as Parameters<jsPDF['text']>[3]);
      x+=run.width;
    }
    write('EMC');
  };
  const wrap=(value:string,maxWidth:number,size=fontSize,bold=false)=>{
    const result:string[]=[];
    for(const paragraph of value.replace(/\r\n?/g,'\n').split('\n')){
      let line='';
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        const candidate=line?`${line} ${word}`:word;
        if(layout(candidate,size,bold).width<=maxWidth){line=candidate;continue;}
        if(line){result.push(line);line='';}
        let remaining=Array.from(word);
        while(remaining.length&&layout(remaining.join(''),size,bold).width>maxWidth){
          let low=1,high=remaining.length;
          while(low<high){const middle=Math.ceil((low+high)/2);if(layout(remaining.slice(0,middle).join(''),size,bold).width<=maxWidth)low=middle;else high=middle-1;}
          result.push(remaining.splice(0,low).join(''));
        }
        line=remaining.join('');
      }
      result.push(line);
    }
    return result;
  };
  let y=0;
  const newPage=(first=false)=>{
    if(!first)pdf.addPage();
    if(first){
      text('INTERSOS',margin,30,9,true,'left','#087bb8');
      text(label('Legal data review','مراجعة البيانات القانونية'),margin,50,15,true,'left','#142d46');
      text(`${label('Protection Analysis','تحليل الحماية')} - ${date}`,margin,64,8);
      y=76;
    }else{
      text(label('Legal data review','مراجعة البيانات القانونية'),margin,31,11,true,'left','#142d46');
      text(date,pageWidth-margin,31,8,false,'right');y=42;
    }
    pdf.setDrawColor('#1482c5');pdf.setLineWidth(1.5);pdf.line(margin,y,pageWidth-margin,y);y+=12;
  };
  newPage(true);
  const summary=[
    ...wrap(`${label('Prepared for','أعدت لصالح')}: ${report.lawyer}`,width-24,10,true),
    ...wrap(`${label('Selected findings','الملاحظات المحددة')}: ${report.rows.length}`,width-24),
    ...(report.deadline?wrap(`${label('Correction deadline','الموعد النهائي للتصحيح')}: ${report.deadline}`,width-24):[]),
    ...wrap(label('Please review the findings below, correct the source records, and confirm completion.','يرجى مراجعة الملاحظات أدناه وتصحيح سجلات المصدر وتأكيد إتمام التصحيح.'),width-24),
    ...(report.additionalNote?.trim()?wrap(`Additional note: ${report.additionalNote.trim()}`,width-24):[]),
  ];
  for(let offset=0;offset<summary.length;){
    const count=Math.min(summary.length-offset,Math.floor((bottom-y-16)/lineHeight));
    if(count<1){newPage();continue;}
    pdf.setFillColor('#eef6fb');pdf.rect(margin,y,width,count*lineHeight+16,'F');
    pdf.setFillColor('#1482c5');pdf.rect(margin,y,3,count*lineHeight+16,'F');
    for(let i=0;i<count;i++)text(summary[offset+i],margin+12,y+12+i*lineHeight,offset+i===0?10:fontSize,offset+i===0);
    y+=count*lineHeight+26;offset+=count;
    if(offset<summary.length)newPage();
  }
  for(const group of issueReportTables(report.rows,report.language!=='en')){
    const weights:number[]=group.columns.map(column=>column.kind==='number'?0:column.kind==='reference'?.7:column.kind==='field'?1:column.kind==='detail'?3:1.6);
    const numberWidth=Math.max(24,...group.rows.map(row=>layout(String(row.number),fontSize).width+padding*2));
    const total=weights.reduce((sum,value)=>sum+value,0),widths=weights.map((value,i)=>group.columns[i].kind==='number'?numberWidth:value/total*(width-numberWidth));
    const headings=group.columns.map((column,i)=>wrap(column.heading,widths[i]-padding*2,fontSize,true));
    const headerHeight=Math.max(...headings.map(lines=>lines.length))*lineHeight+padding*2;
    const drawRow=(cells:string[][],height:number,header=false,alternate=false)=>{
      let x=margin;
      cells.forEach((lines,i)=>{
        pdf.setFillColor(header?'#eaf1f8':alternate?'#f5f8fc':'#ffffff');
        pdf.setDrawColor('#d4e0eb');pdf.setLineWidth(.5);pdf.rect(x,y,widths[i],height,'FD');
        const rtl=!header&&(group.columns[i].key==='arabicDetail'||/^[^A-Za-z\u0600-\u06ff]*[\u0600-\u06ff]/.test(lines.join(' ')));
        for(let n=0;n<lines.length;n++)text(lines[n],rtl?x+widths[i]-padding:x+padding,y+padding+fontSize+n*lineHeight,fontSize,header,rtl?'right':'left',header?'#183c60':'#203247');
        x+=widths[i];
      });
      y+=height;
    };
    const startTable=(continued=false)=>{
      const title=wrap(`${group.page}: ${group.rule}${continued?' (continued)':''}`,width,10,true);
      const required=title.length*14+6+headerHeight+lineHeight+padding*2;
      if(y+required>bottom)newPage();
      for(const line of title){text(line,margin,y+10,10,true,'left','#164f75');y+=14;}y+=6;
      drawRow(headings,headerHeight,true);
    };
    startTable();
    for(const row of group.rows){
      const cells=row.cells.map((value,i)=>group.columns[i].kind==='number'?[value]:wrap(value,widths[i]-padding*2));
      const repeated=cells.map((lines,i)=>(group.columns[i].kind==='number'||group.columns[i].kind==='reference')&&lines.length<=3);
      let remaining=cells.map(lines=>[...lines]);
      const wholeHeight=Math.max(...cells.map(lines=>lines.length))*lineHeight+padding*2;
      // Keep normal rows together, but use remaining space for oversized rows.
      if(y+wholeHeight>bottom&&wholeHeight<=bottom-54-headerHeight-34){newPage();startTable(true);}
      while(remaining.some(lines=>lines.length)){
        let count=Math.floor((bottom-y-padding*2)/lineHeight);
        const minimum=Math.max(1,...cells.map((lines,i)=>repeated[i]?lines.length:1));
        if(count<minimum){newPage();startTable(true);count=Math.floor((bottom-y-padding*2)/lineHeight);}
        const fragment=remaining.map((lines,i)=>repeated[i]?cells[i]:lines.slice(0,count));
        const height=Math.max(...fragment.map(lines=>lines.length))*lineHeight+padding*2;
        drawRow(fragment,height,false,row.number%2===0);
        remaining=remaining.map((lines,i)=>repeated[i]?[]:lines.slice(count));
        if(remaining.some(lines=>lines.length)){newPage();startTable(true);}
      }
    }
    y+=12;
  }
  const signature=report.signature?wrap(report.signature,width,9):[];
  for(const line of signature){if(y+14>bottom)newPage();text(line,margin,y+10,9);y+=14;}
  const pages=pdf.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    pdf.setPage(i);pdf.setDrawColor('#d7e2ea');pdf.setLineWidth(.5);pdf.line(margin,pageHeight-28,pageWidth-margin,pageHeight-28);
    text(`${i} / ${pages}`,pageWidth-margin,pageHeight-15,7.5,false,'right','#667b8d');
  }
  return pdf.output('blob');
}
