import {describe,it,expect,vi} from 'vitest';
const {readFileSync}=await vi.importActual<{readFileSync:(path:URL)=>{toString:(encoding:string)=>string}}>('node:fs');
import {createKoboPdfDocument} from './koboPdfDocument';
import type {KoboAnalysis,KoboReport} from './koboTypes';
const fonts=['Regular','Bold'].map(style=>readFileSync(new URL(`../node_modules/@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-${style}.ttf`,import.meta.url)).toString('base64'));
const snapshot={settings:{language:'en',filters:[],questions:{},percentageDecimals:0},total:7,filtered:5,questions:[],groups:[],filterSummary:['Location: Baghdad']} as unknown as KoboAnalysis;
const narrative:KoboReport={title:'Protection findings',findings:'Assessment findings. '.repeat(1000),methodology:'Limitations recorded.',recommendations:'Improve service access.',questions:[]};
describe('Reporting workspace PDF',()=>{
 it('creates a paginated portrait PDF without selected questions or chart requests',async()=>{
  const data=await createKoboPdfDocument('Assessment',snapshot,fonts,async()=>{throw new Error('Narrative-only export must not request a chart')},()=>{},false,narrative);
  const pdf=new TextDecoder().decode(data);
  expect(pdf.startsWith('%PDF-')).toBe(true);
  const box=pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/)!;
  expect(Number(box[1])).toBeLessThan(Number(box[2]));
  expect(Number(pdf.match(/\/Count\s+(\d+)/)![1])).toBeGreaterThan(1);
 });
 it('keeps ordinary Analysis empty-question validation unchanged',async()=>{
  await expect(createKoboPdfDocument('Assessment',snapshot,fonts,async()=>'',()=>{})).rejects.toThrow('There are no visible questions');
 });
});
