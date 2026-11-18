import type {createKoboApi} from './koboApi';
import {resultWithPivotOrdering} from './koboPivotSort';
import {koboTableHtml,koboTableText} from './koboTableData';
import type {KoboResult,KoboSettings} from './koboTypes';

export async function copyKoboChartImage(result:KoboResult,language:string){
 if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')
  throw new Error('Image copying is unavailable. Use Chart PNG to download the image.');
 const image=import('./KoboChart').then(module=>module.koboChartImage(result,language)).then(async url=>(await fetch(url)).blob());
 await navigator.clipboard.write([new ClipboardItem({'image/png':image})]);
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
