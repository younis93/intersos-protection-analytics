import {questionFilterNote} from './koboQuestionFilterState';
import {koboTableHtml,koboTableText} from './koboTableData';
import {resolvePivotSort,sortPivotRows,type PivotSort} from './koboPivotSort';
import type {KoboAnalysis} from './koboTypes';

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export async function buildKoboBulkCopy(analysis:KoboAnalysis,stores?:Map<string,Map<string,unknown>>,progress?:(message:string)=>void){
 const html:string[]=[],text:string[]=[];
 for(const [index,result] of analysis.questions.entries()){
  const display=analysis.settings.questions[result.id]?.breakdownDisplay||result.breakdownDisplay||'both';
  const retained=stores?.get(result.id)?.get('pivotSort') as PivotSort|null|undefined;
  const sort=resolvePivotSort(result,display,result.pivotSort||retained);
  const rows=result.pivotSort?result.rows:sortPivotRows(result,sort,analysis.settings.language);
  const notes=[questionFilterNote(result.filterMode)||'Uses page filters.',...(result.filterSummary||analysis.filterSummary),`Percentage basis: ${result.percentageBasis}`];
  const table=koboTableHtml(result,display,rows).match(/<body>([\s\S]*)<\/body>/)?.[1];
  if(!table)throw new Error(`Unable to format the pivot for ${result.label}. No tables were copied.`);
  html.push(`<section><h2>${escape(result.label)}</h2><p>${notes.map(escape).join('<br>')}</p>${table}</section>`);
  text.push(`${notes.join('\r\n')}\r\n${koboTableText(result,display,rows)}`);
  progress?.(`Preparing table ${index+1} of ${analysis.questions.length}`);
  if(index%8===0)await new Promise<void>(resolve=>setTimeout(resolve,0));
 }
 if(!html.length)throw new Error('There are no enabled pivot tables to copy.');
 return {html:`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>${html.join('<br>')}</body></html>`,text:text.join('\r\n\r\n'),count:html.length};
}
