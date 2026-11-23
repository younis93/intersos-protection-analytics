import {useState,type RefObject} from 'react';
import {Copy,Download,FileText} from 'lucide-react';
import KoboActionMenu from './KoboActionMenu';
import {ExcelDownloadButton} from './SelectionControls';
import {copyKoboChartImage} from './koboCopy';
import type {KoboChartImageView} from './koboChartSpec';
import {resultWithColors} from './koboMarkColors';
import {projectKoboChart} from './koboChartDensity';
import type {KoboQuestionSettings,KoboResult} from './koboTypes';

function chartImageView(host:HTMLElement|null):KoboChartImageView{
 const node=host?.querySelector<HTMLElement>('.kobo-chart');
 const measured=node?Math.round(node.getBoundingClientRect().width/16)*16:0;
 const view={width:Number(node?.dataset.chartWidth)||measured||900,page:Number(node?.dataset.chartPage)||0};
 const plot=node?.querySelector<HTMLElement & Partial<NonNullable<KoboChartImageView['rendered']>>>('.js-plotly-plot');
 const bounds=plot?.querySelector('.svg-container')?.getBoundingClientRect();
 if(plot?.data&&plot.layout&&bounds?.width&&bounds.height&&!node?.querySelector('.kobo-chart-loading-overlay')){
  try{
   const {data,layout}=structuredClone({data:plot.data,layout:plot.layout});
   return {...view,rendered:{data,layout,width:Math.round(bounds.width),height:Math.round(bounds.height)}};
  }catch{
   // Plotly can add non-cloneable state. Use the current settings and category page.
  }
 }
 return view;
}

type Props={
 chartHost:RefObject<HTMLElement|null>;
 result:KoboResult;
 language:string;
 colorSettings:KoboQuestionSettings;
 disabled?:boolean;
 chartDisabled?:boolean;
 pageOnly?:boolean;
 excelTitle?:string;
 copyAction:(action:()=>Promise<void>,successMessage:string)=>Promise<void>;
 onPdf:()=>void|Promise<void>;
 onExcel:()=>void|Promise<void>;
 onError:(message:string)=>void;
};

export default function KoboQuestionExport({chartHost,result,language,colorSettings,disabled,chartDisabled,pageOnly,excelTitle,copyAction,onPdf,onExcel,onError}:Props){
 const [imageAction,setImageAction]=useState<'copy'|'download'|null>(null);
 const run=async(action:()=>void|Promise<void>)=>{
  try{await action()}catch(error){onError(error instanceof Error?error.message:String(error))}
 };
 const exportImage=async(action:'copy'|'download')=>{
  const view={...chartImageView(chartHost.current),pageOnly};
  const chart=resultWithColors(result,colorSettings);
  setImageAction(action);
  try{
   await run(async()=>{
    if(action==='copy')await copyAction(()=>copyKoboChartImage(chart,language,view),'Chart image copied');
    else{
     const {downloadKoboPng}=await import('./KoboChart');
     await downloadKoboPng(chart,language,view);
    }
   });
  }finally{setImageAction(null)}
 };
 const imageDisabled=disabled||chartDisabled||!projectKoboChart(result).denominator||!!imageAction;
 return <KoboActionMenu label="Export" icon={<Download aria-hidden="true"/>}>
  <button type="button" className="soft" disabled={imageDisabled} onClick={()=>void exportImage('copy')}><Copy aria-hidden="true"/> Copy chart image</button>
  <button type="button" className="soft" disabled={imageDisabled} onClick={()=>void exportImage('download')}><Download aria-hidden="true"/> Chart PNG</button>
  <button type="button" className="soft" disabled={disabled} onClick={()=>void run(onPdf)}><FileText aria-hidden="true"/> Question PDF</button>
  <ExcelDownloadButton className="soft" title={excelTitle} disabled={disabled} onClick={()=>run(onExcel)}>Pivot Excel</ExcelDownloadButton>
 </KoboActionMenu>;
}
