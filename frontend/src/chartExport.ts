import {jsPDF} from 'jspdf';
import 'svg2pdf.js';
import notoNaskhArabicUrl from '../node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf?url';

const safeName=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'chart';
const saveBlob=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
const svgFromDataUrl=(dataUrl:string)=>{
  const comma=dataUrl.indexOf(',');
  if(comma<0)throw new Error('The chart SVG could not be prepared.');
  const body=dataUrl.slice(comma+1);
  const markup=dataUrl.slice(0,comma).includes(';base64')?atob(body):decodeURIComponent(body);
  const documentSvg=new DOMParser().parseFromString(markup,'image/svg+xml');
  const error=documentSvg.querySelector('parsererror');
  if(error)throw new Error('The chart SVG could not be parsed.');
  return documentSvg.documentElement as unknown as SVGElement;
};
const bufferToBase64=(buffer:ArrayBuffer)=>{
  const bytes=new Uint8Array(buffer); let binary=''; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
};
const addBilingualFont=async(pdf:jsPDF,svg:SVGElement)=>{
  const fontFile='NotoNaskhArabic-Regular.ttf',fontFamily='NotoNaskhArabic';
  const fontData=await fetch(notoNaskhArabicUrl).then(response=>{
    if(!response.ok)throw new Error('The bilingual export font could not be loaded.');
    return response.arrayBuffer();
  });
  pdf.addFileToVFS(fontFile,bufferToBase64(fontData));
  pdf.addFont(fontFile,fontFamily,'normal');
  const arabic=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;
  svg.querySelectorAll('text').forEach(textNode=>{
    const label=textNode.textContent||'';
    if(!arabic.test(label))return;
    const runs=label.match(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\s]+|[^\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff\s]+/g)||[label];
    textNode.textContent='';
    runs.forEach(run=>{
      const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');
      span.textContent=run;
      if(arabic.test(run)){
        span.setAttribute('font-family',fontFamily);
        span.setAttribute('direction','rtl');
        span.style.fontFamily=fontFamily;
        span.style.unicodeBidi='isolate';
      }else{
        span.setAttribute('font-family','Helvetica');
        span.style.fontFamily='Helvetica';
      }
      textNode.appendChild(span);
    });
  });
};

export async function exportChart(graphDiv:any,title:string,format:'png'|'pdf'){
  if(!graphDiv)throw new Error('Chart is not ready for export.');
  const Plotly=(await import('plotly.js-dist-min')).default;
  const width=1600,height=960;
  const horizontalBars=(graphDiv.data||[]).some((trace:any)=>trace?.type==='bar'&&trace?.orientation==='h');
  const host=document.createElement('div');
  host.style.cssText=`position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;background:#fff;`;
  document.body.appendChild(host);
  const layout={...graphDiv.layout,autosize:false,width,height,paper_bgcolor:'#ffffff',plot_bgcolor:'#ffffff',dragmode:false,title:{text:title,x:.04,xanchor:'left',font:{family:'Helvetica, Arial, sans-serif',size:30,color:'#172b3a'}},font:{family:'Helvetica, Arial, sans-serif',size:16,color:'#263746'},margin:{...(graphDiv.layout?.margin||{}),t:105,l:horizontalBars?390:150,r:70,b:130},xaxis:{...(graphDiv.layout?.xaxis||{}),fixedrange:true,gridcolor:'#e5ebef',linecolor:'#9bacb8',tickfont:{color:'#263746'}},yaxis:{...(graphDiv.layout?.yaxis||{}),fixedrange:true,automargin:true,gridcolor:'#e5ebef',linecolor:'#9bacb8',tickfont:{color:'#263746'}},legend:{...(graphDiv.layout?.legend||{}),font:{color:'#263746'}}};
  try{
    await Plotly.newPlot(host,graphDiv.data,layout,{displayModeBar:false,staticPlot:true,responsive:false});
    if(format==='png'){
      const image=await Plotly.toImage(host,{format:'png',width,height,scale:2});
      saveBlob(await (await fetch(image)).blob(),`${safeName(title)}.png`);
    }else{
      const vector=await Plotly.toImage(host,{format:'svg',width,height});
      const svg=svgFromDataUrl(vector);
      const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
      await addBilingualFont(pdf,svg);
      const pageWidth=pdf.internal.pageSize.getWidth(),pageHeight=pdf.internal.pageSize.getHeight(),margin=10;
      const ratio=Math.min((pageWidth-margin*2)/width,(pageHeight-margin*2)/height);
      const outW=width*ratio,outH=height*ratio;
      await pdf.svg(svg,{x:(pageWidth-outW)/2,y:(pageHeight-outH)/2,width:outW,height:outH});
      saveBlob(pdf.output('blob'),`${safeName(title)}.pdf`);
    }
  }finally{Plotly.purge(host);host.remove()}
}
