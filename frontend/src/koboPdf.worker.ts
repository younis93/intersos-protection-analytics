import arabicRegularUrl from '../node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf?url';
import arabicBoldUrl from '../node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Bold.ttf?url';
import {createKoboPdfDocument} from './koboPdfDocument';
import {koboPdfChartKey} from './koboChartDensity';
import type {KoboAnalysis} from './koboTypes';
let fonts:Promise<string[]>|undefined;
function loadFonts(){return fonts??=Promise.all([arabicRegularUrl,arabicBoldUrl].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error('Unable to load Arabic PDF fonts. Please retry.');const bytes=new Uint8Array(await r.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=0x8000)data+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(data)})).catch(e=>{fonts=undefined;throw e})}


const scope=self as unknown as {postMessage:(message:unknown,transfer?:Transferable[])=>void;onmessage:((event:MessageEvent)=>void)|null};
let deliver:((image:string)=>void)|undefined;
scope.onmessage=async event=>{
 const message=event.data;
 if(message.type==='image'){deliver?.(message.image);deliver=undefined;return}
 if(message.type!=='start')return;
 try{
  const snapshot=message.snapshot as KoboAnalysis;
  const data=await createKoboPdfDocument(message.name,snapshot,await loadFonts(),result=>new Promise(resolve=>{deliver=resolve;scope.postMessage({type:'chart',key:koboPdfChartKey(result)})}),(done,total)=>scope.postMessage({type:'progress',progress:Math.round(done/total*95),message:`Creating PDF: ${done+1}/${total}`}));
  scope.postMessage({type:'complete',data},[data]);
 }catch(error){scope.postMessage({type:'error',message:error instanceof Error?error.message:String(error)})}
};
