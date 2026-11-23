import type {createKoboApi} from './koboApi';
import {resultWithPivotOrdering} from './koboPivotSort';
import {koboTableHtml,koboTableText} from './koboTableData';
import type {KoboResult,KoboSettings} from './koboTypes';
import type {KoboChartImageView} from './koboChartSpec';

let latestImageCopy=0;
let imageWrite:Promise<void>=Promise.resolve();

export async function copyKoboChartImage(result:KoboResult,language:string,view:KoboChartImageView={width:900,page:0}){
 await copyChartPng(async()=>{
  const {koboChartImage}=await import('./KoboChart');
  const url=await koboChartImage(result,language,'png',undefined,view);
  return (await fetch(url)).blob();
 });
}

export async function copyChartPng(render:()=>Promise<Blob>){
 if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')
  throw new Error('Image copying is unavailable. Use Chart PNG to download the image.');
 const request=++latestImageCopy;
 const png=await render();
 // Write completed images one at a time so a slower earlier render cannot replace a later copy.
 const write=imageWrite.then(async()=>{
  if(request===latestImageCopy)await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
 });
 imageWrite=write.catch(()=>{});
 await write;
}

/** Copy includes zero rows without changing the saved or displayed settings. */
export function loadKoboCopyAnalysis(api:Pick<ReturnType<typeof createKoboApi>,'analyze'>,id:string,settings:KoboSettings,signal:AbortSignal,question=''){
 const snapshot=structuredClone(settings);
 return api.analyze(id,{...snapshot,hideZero:false,hideEmpty:false},signal,question);
}

export async function prepareKoboQuestionCopy(api:Pick<ReturnType<typeof createKoboApi>,'analyze'>,id:string,settings:KoboSettings,question:string,signal:AbortSignal){
 const analysis=await loadKoboCopyAnalysis(api,id,settings,signal,question);
 const result=analysis.questions.find(result=>result.id===question);
 if(!result)throw new Error('This question is no longer available. Refresh the analysis and try again.');
 const config=analysis.settings.questions[question];
 const display=config?.breakdownDisplay||result.breakdownDisplay||'both';
 const sorted=resultWithPivotOrdering(result,config,display,analysis.settings.language,config?.pivotSort??result.pivotSort);
 return {text:koboTableText(sorted,display),html:koboTableHtml(sorted,display)};
}
