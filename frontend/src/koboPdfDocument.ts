import {displayPercent,formatPercent} from './koboPercentages';
import {jsPDF} from 'jspdf';
import {koboPdfChartPanels} from './koboChartDensity';
import type {KoboAnalysis,KoboResult,KoboRow} from './koboTypes';

export async function createKoboPdfDocument(name:string,snapshot:KoboAnalysis,loaded:string[],imageFor:(result:KoboResult)=>Promise<string>,progress:(done:number,total:number)=>void){
 if(!snapshot.questions.length)throw new Error('There are no visible questions to export.');
 const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4',compress:true,putOnlyUsedFonts:true});
 for(const[i,style]of ['normal','bold'].entries()){pdf.addFileToVFS(`KoboArabic-${style}.ttf`,loaded[i]);pdf.addFont(`KoboArabic-${style}.ttf`,'KoboArabic',style)}
 pdf.setProperties({title:name,author:'INTERSOS',creator:'INTERSOS Protection Analysis',subject:'Kobo Analysis report'});
 const Engine=(jsPDF as unknown as {__bidiEngine__:new(options:object)=>{doBidiReorder:(s:string)=>string}}).__bidiEngine__;
 const bidi=new Engine({isInputVisual:false,isOutputVisual:true,isOutputRtl:false});
 const arabic=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
 const runs=/([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+)/;
 const width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight(),margin=36,bottom=height-48,available=width-2*margin;
 const rtl=snapshot.settings.language==='ar';
 const percent=(entry:{percent:number|null;displayPercent?:number|null})=>formatPercent(displayPercent(entry),snapshot.settings.percentageDecimals??0,rtl?'ar':'en');
 const totalPercent=formatPercent(100,snapshot.settings.percentageDecimals??0,rtl?'ar':'en');
 const number=(n:number)=>new Intl.NumberFormat(rtl?'ar':'en',{maximumFractionDigits:1}).format(n);
 function prepare(value:string,size:number,bold=false){return bidi.doBidiReorder(pdf.processArabic(value)).split(runs).filter(Boolean).map(text=>{const font=arabic.test(text)?'KoboArabic':'helvetica';pdf.setFont(font,bold?'bold':'normal');pdf.setFontSize(size);return{text,font,width:pdf.getTextWidth(text)}})}
 const measurements=new Map<string,number>();
 function measure(value:string,size:number,bold=false){const key=JSON.stringify([value,size,bold]);const cached=measurements.get(key);if(cached!==undefined)return cached;const width=prepare(value,size,bold).reduce((s,r)=>s+r.width,0);measurements.set(key,width);return width}
 function draw(value:string,x:number,y:number,size=9,bold=false,right=false,color='#243746'){const parts=prepare(value,size,bold);if(right)x-=parts.reduce((s,r)=>s+r.width,0);pdf.setTextColor(color);const write=(pdf.internal as typeof pdf.internal&{write:(s:string)=>void}).write;const actual='FEFF'+Array.from({length:value.length},(_,i)=>value.charCodeAt(i).toString(16).padStart(4,'0')).join('');write(`/Span << /ActualText <${actual}> >> BDC`);for(const part of parts){pdf.setFont(part.font,bold?'bold':'normal');pdf.setFontSize(size);pdf.text(part.text,x,y,{isInputVisual:true,isOutputVisual:true,isInputRtl:false,isOutputRtl:false} as Parameters<jsPDF['text']>[3]);x+=part.width}write('EMC')}
 function wrap(value:string,maxWidth:number,size=9,bold=false){const out:string[]=[];for(const para of value.replace(/\r\n?/g,'\n').split('\n')){let line='';for(const word of para.split(/\s+/).filter(Boolean)){if(measure(line?line+' '+word:word,size,bold)<=maxWidth){line=line?line+' '+word:word;continue}if(line)out.push(line);line='';for(const c of Array.from(word)){if(measure(line+c,size,bold)>maxWidth&&line){out.push(line);line=''}line+=c}}out.push(line)}return out}
 const navy='#234c70',blue='#2587b9',muted='#63788a',line='#d8e2ea';
 let y=0;
 const date=new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Baghdad'});
 const textX=rtl?width-margin:margin;
 function page(first=false){
  if(!first)pdf.addPage();
  draw('INTERSOS',margin,27,10,true,false,navy);
  draw(rtl?'تحليل الاستبيان':'SURVEY ANALYSIS',margin+70,27,8,false,false,muted);
  draw(date,width-margin,27,8,false,true,muted);
  pdf.setDrawColor(blue);pdf.setLineWidth(1.2);pdf.line(margin,41,width-margin,41);y=62;
 }
 function paragraph(value:string,size=10,bold=false,color='#243746'){
  const leading=size*1.45;
  for(const text of wrap(value,available,size,bold)){
   if(y+leading>bottom)page();
   draw(text,textX,y+size,size,bold,rtl,color);y+=leading;
  }
  y+=8;
 }
 function shorten(value:string,maxWidth:number,size:number,bold=false){
  if(measure(value,size,bold)<=maxWidth)return value;
  let text=value;while(text&&measure(text+'...',size,bold)>maxWidth)text=Array.from(text).slice(0,-1).join('');
  return text+'...';
 }
 function cappedLines(value:string,maxWidth:number,size:number,bold:boolean,limit:number){
  const lines=wrap(value,maxWidth,size,bold);
  if(lines.length>limit){lines.length=limit;lines[limit-1]=shorten(lines[limit-1]+'...',maxWidth,size,bold)}
  return lines;
 }
 page(true);y=77;
 paragraph(rtl?'تقرير تحليل الاستبيان':'Survey analysis report',11,true,blue);
 paragraph(name,25,true,navy);
 y+=9;
 const cards=[{value:snapshot.filtered,label:rtl?'الاستجابات المشمولة':'Responses in this analysis'},{value:snapshot.total,label:rtl?'إجمالي الاستجابات':'Total responses'},{value:snapshot.questions.length,label:rtl?'الأسئلة المشمولة':'Questions included'}];
 const cardWidth=(available-24)/3;
 if(y+80>bottom)page();
 cards.forEach((card,index)=>{
  const x=margin+(rtl?2-index:index)*(cardWidth+12);
  pdf.setFillColor('#edf4f8');pdf.roundedRect(x,y,cardWidth,76,7,7,'F');
  draw(number(card.value),rtl?x+cardWidth-16:x+16,y+31,24,true,rtl,navy);
  draw(card.label,rtl?x+cardWidth-16:x+16,y+55,10,false,rtl,muted);
 });
 y+=103;
 paragraph(rtl?'عوامل التصفية النشطة':'Active filters',12,true,navy);
 if(!snapshot.settings.filters.length)paragraph(rtl?'جميع الاستجابات. لا توجد عوامل تصفية نشطة.':'All responses. No active filters.',10,false,muted);
 else for(const summary of snapshot.filterSummary)paragraph(summary,10);
 y+=10;
 paragraph(rtl?'قراءة هذا التقرير':'Reading this report',12,true,navy);
 paragraph(rtl?'تعتمد النسب على المستجيبين الذين أجابوا عن كل سؤال ضمن عوامل التصفية المحددة. قد يتجاوز مجموع نسب أسئلة الاختيار المتعدد 100٪. تُعرض الإجابات الفارغة بشكل منفصل عند تضمينها. تستخدم الأقسام المتكررة عدد إدخالاتها كأساس للحساب.':'Percentages use respondents who answered each question within the selected filters. Multi-select percentages may total more than 100%. Blank answers are shown separately when included. Repeat sections use repeat-entry denominators.',10,false,muted);
 const groups=new Map(snapshot.groups.map(g=>[g.id,g]));
 const statisticLabels:Record<string,[string,string]>={mean:['Mean','المتوسط'],median:['Median','الوسيط'],min:['Minimum','الحد الأدنى'],max:['Maximum','الحد الأقصى'],standardDeviation:['Standard deviation','الانحراف المعياري']};
 let completed=0;
 for(const result of snapshot.questions){
  progress(completed++,snapshot.questions.length);
  const chain:string[]=[],seen=new Set<string>();let gid=result.group;
  while(gid&&!seen.has(gid)){seen.add(gid);const group=groups.get(gid);if(!group)break;chain.unshift(group.label||group.name);gid=group.parent}
  const breadcrumbs=chain.length?cappedLines(chain.join(' / '),available,9,false,2):[];
  const continuedTitle=cappedLines((rtl?'تابع: ':'Continued: ')+result.label,available,14,true,2);
  const continuationTop=62+breadcrumbs.length*13+(breadcrumbs.length?7:0)+continuedTitle.length*20+19;
  function questionPage(continued=false){
   page();
   for(const text of breadcrumbs){draw(text,textX,y+9,9,false,rtl,muted);y+=13}
   if(breadcrumbs.length)y+=7;
   if(continued){for(const text of continuedTitle){draw(text,textX,y+14,14,true,rtl,navy);y+=20}y+=8}
   else paragraph(result.label,17,true,navy);
   pdf.setDrawColor(line);pdf.setLineWidth(.5);pdf.line(margin,y+2,width-margin,y+2);y+=11;
  }
  questionPage();
  const stats=Object.entries(result.statistics).filter(([key,value])=>key!=='count'&&Number.isFinite(value)).map(([key,value])=>`${statisticLabels[key]?.[rtl?1:0]||key.replace(/([A-Z])/g,' $1')}: ${number(value)}`);
  if(stats.length)paragraph(stats.join('   |   '),9,false,muted);
  if(!result.rows.length){paragraph(rtl?'لا توجد إجابات ضمن عوامل التصفية الحالية.':'No answered responses under the current filters.',10,false,muted);continue}
  const chartPanels=result.denominator?koboPdfChartPanels(result):[];
  if(chartPanels.length>1){
   let offset=0;
   for(let index=0;index<chartPanels.length;index++){
    if(index||bottom-y<200)questionPage(true);
    const chart=chartPanels[index];
    paragraph(rtl?`الرسم ${index+1} من ${chartPanels.length} - الفئات ${offset+1} إلى ${offset+chart.rows.length}`:`Chart ${index+1} of ${chartPanels.length} - Categories ${offset+1}-${offset+chart.rows.length}`,9,false,muted);
    const image=await imageFor(chart),properties=pdf.getImageProperties(image);
    const placement=fitKoboPdfImage(properties.width,properties.height,available,bottom-y);
    pdf.addImage(image,'PNG',margin+placement.x,y,placement.width,placement.height,undefined,'FAST');
    offset+=chart.rows.length;
   }
   questionPage(true);
  }
  const breakdownDisplay=snapshot.settings.questions[result.id]?.breakdownDisplay||'both';
  const metrics=breakdownDisplay==='both'?['count','percent']:[breakdownDisplay];
  const breakdownMetric=breakdownDisplay==='count'?'#':breakdownDisplay==='percent'?'%':'# / %';
  const hasBreakdown=result.breakdowns.length>0,tableWidth=hasBreakdown||chartPanels.length>1?available:(available-24)*.5;
  const panels=hasBreakdown?Array.from({length:Math.ceil(result.breakdowns.length/5)},(_,i)=>result.breakdowns.slice(i*5,i*5+5)):[[]];
  for(let panelIndex=0;panelIndex<panels.length;panelIndex++){
   const panel=panels[panelIndex];if(panelIndex)questionPage(true);
   const headings=[rtl?'الإجابة':'Answer',...panel.map(b=>`${b.label}\n${breakdownMetric}`),...(!hasBreakdown?metrics.map(metric=>metric==='count'?'#':'%'):[])];
   const numericWidth=panel.length?(tableWidth-Math.max(180,tableWidth*.36))/panel.length:54;
   const widths=[tableWidth-numericWidth*(headings.length-1),...headings.slice(1).map(()=>numericWidth)];
   const fontSize=9,leading=13,padding=7;
   const textCells=(values:string[],bold=false)=>values.map((value,index)=>wrap(value,widths[index]-2*padding,fontSize,bold));
   const rowHeight=(cells:string[][])=>Math.max(...cells.map(cell=>cell.length))*leading+2*padding;
   const headerCells=textCells(headings,true),headerHeight=rowHeight(headerCells);
   const tableX=rtl?width-margin-tableWidth:margin;
   const drawCells=(cells:string[][],height:number,style:'header'|'total'|'normal'|'alternate'='normal')=>{
    let x=rtl?tableX+tableWidth:tableX;
    for(let index=0;index<cells.length;index++){
     if(rtl)x-=widths[index];
     pdf.setFillColor(style==='header'?navy:style==='total'?'#e4eef5':style==='alternate'?'#f4f7fa':'#ffffff');
     pdf.setDrawColor(style==='header'?navy:line);pdf.setLineWidth(.4);pdf.rect(x,y,widths[index],height,'FD');
     const right=rtl||index>0;
     cells[index].forEach((text,lineIndex)=>draw(text,right?x+widths[index]-padding:x+padding,y+padding+fontSize+lineIndex*leading,fontSize,style==='header'||style==='total',right,style==='header'?'#ffffff':'#243746'));
     if(!rtl)x+=widths[index];
    }
    y+=height;
   };
   const bodyCapacity=bottom-continuationTop-headerHeight;
   if(bodyCapacity<leading+2*padding)throw new Error('A breakdown heading is too long to fit on a PDF page. Shorten its label and export again.');
   function tableHeader(requiredHeight=leading+2*padding){
    if(y+headerHeight+requiredHeight>bottom)questionPage(true);
    drawCells(headerCells,headerHeight,'header');
   }
   function nextTablePage(){questionPage(true);tableHeader()}
   const rowValues=(row:KoboRow)=>[row.label,...panel.map(b=>{const series=row.series?.find(series=>series.id===b.id);return series?(breakdownDisplay==='count'?number(series.count):breakdownDisplay==='percent'?percent(series):`${number(series.count)} / ${percent(series)}`):'-'}),...(!hasBreakdown?metrics.map(metric=>metric==='count'?number(row.count):percent(row)):[])];
   const totals=[rtl?'الإجمالي':'Total',...panel.map(column=>breakdownDisplay==='count'?number(column.denominator):breakdownDisplay==='percent'?(column.denominator?totalPercent:'-'):`${number(column.denominator)} / ${column.denominator?totalPercent:'-'}`),...(!hasBreakdown?metrics.map(metric=>metric==='count'?number(result.denominator):result.denominator?totalPercent:'-'):[])];
   const totalCells=textCells(totals,true),totalHeight=rowHeight(totalCells);
   if(panelIndex===0&&chartPanels.length===1){
    if(bottom-y<180)questionPage(true);
    const image=await imageFor(chartPanels[0]),properties=pdf.getImageProperties(image);
    const boxWidth=hasBreakdown?available:available-tableWidth-24;
    const completeTableHeight=hasBreakdown?headerHeight+totalHeight+result.rows.reduce((sum,row)=>sum+rowHeight(textCells(rowValues(row))),0):0;
    const combinedChartHeight=bottom-y-completeTableHeight-18;
    const boxHeight=Math.min(hasBreakdown?(combinedChartHeight>=180?Math.min(320,combinedChartHeight):320):340,bottom-y);
    const placement=fitKoboPdfImage(properties.width,properties.height,boxWidth,boxHeight);
    const boxX=hasBreakdown?margin:rtl?margin:margin+tableWidth+24;
    pdf.addImage(image,'PNG',boxX+placement.x,y+(hasBreakdown?0:placement.y),placement.width,placement.height,undefined,'FAST');
    if(hasBreakdown)y+=placement.height+18;
   }
   tableHeader(Math.min(bodyCapacity,result.rows.slice(0,2).reduce((sum,row)=>sum+rowHeight(textCells(rowValues(row))),0)));
   function tableRow(cells:string[][],style:'normal'|'alternate'|'total',reserve=0){
    const fullHeight=rowHeight(cells);
    if(fullHeight+reserve<=bodyCapacity&&y+fullHeight+reserve>bottom)nextTablePage();
    let offset=0;const lines=Math.max(...cells.map(cell=>cell.length));
    while(offset<lines){
     let fits=Math.floor((bottom-y-2*padding)/leading);
     if(fits<1){nextTablePage();fits=Math.floor((bottom-y-2*padding)/leading)}
     const count=Math.min(fits,lines-offset);
     drawCells(cells.map(cell=>cell.slice(offset,offset+count)),count*leading+2*padding,style);
     offset+=count;if(offset<lines)nextTablePage();
    }
   }
   for(let index=0;index<result.rows.length;index++)tableRow(textCells(rowValues(result.rows[index])),index%2?'alternate':'normal',index===result.rows.length-1?totalHeight:0);
   tableRow(totalCells,'total');
  }
 }
 const pages=pdf.getNumberOfPages();
 for(let index=1;index<=pages;index++){
  pdf.setPage(index);pdf.setDrawColor(line);pdf.setLineWidth(.5);pdf.line(margin,height-33,width-margin,height-33);
  draw(shorten(name,available-80,7),rtl?width-margin:margin,height-19,7,false,rtl,muted);
  draw(`${index} / ${pages}`,rtl?margin:width-margin,height-19,8,false,!rtl,muted);
 }
 return pdf.output('arraybuffer');
}

/** Contain the chart in its slot using one scale factor, including custom heights. */
export function fitKoboPdfImage(imageWidth:number,imageHeight:number,boxWidth:number,boxHeight:number){
 if(![imageWidth,imageHeight,boxWidth,boxHeight].every(value=>Number.isFinite(value)&&value>0))throw new Error('Invalid PDF chart dimensions.');
 const scale=Math.min(boxWidth/imageWidth,boxHeight/imageHeight),width=imageWidth*scale,height=imageHeight*scale;
 return{x:(boxWidth-width)/2,y:(boxHeight-height)/2,width,height};
}
