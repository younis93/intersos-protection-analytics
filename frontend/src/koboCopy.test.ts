import {afterEach,describe,expect,it,vi} from 'vitest';
import {createKoboApi} from './koboApi';
import {loadKoboCopyAnalysis,prepareKoboQuestionCopy} from './koboCopy';
import {buildKoboBulkCopy} from './koboBulkCopy';
import {questionDefaults,type KoboAnalysis,type KoboResult,type KoboSettings} from './koboTypes';

afterEach(()=>vi.unstubAllGlobals());

const settings=():KoboSettings=>({version:1,language:'en',filters:[{field:'area',kind:'category',values:['north']}],filterFields:['area'],hidden:['hidden-question'],metadata:false,hideBlanks:true,hideZero:true,hideEmpty:true,questionSort:'form',percentageDecimals:1,questions:{q:{...questionDefaults,breakdownDisplay:'both',hiddenAnswers:['hidden-answer'],pivotSort:{id:'answer',label:'Answer',metric:'answer',direction:'asc'}}}});
function result(breakdown:boolean):KoboResult{
 return {id:'q',name:'q',label:'Question',group:'',kind:'category',repeat:'',denominator:4,missing:0,total:4,rows:[
  {id:'yes',label:'Yes',count:4,percent:100,displayPercent:100,series:breakdown?[{id:'north',count:4,percent:100,displayPercent:100}]:undefined},
  {id:'no',label:'No',count:0,percent:0,displayPercent:0,series:breakdown?[{id:'north',count:0,percent:0,displayPercent:0}]:undefined},
 ],statistics:{},breakdowns:breakdown?[{id:'north',label:'North',denominator:4}]:[],percentageDecimals:1,percentageBasis:'Answered respondents',chart:'bar',colors:{}};
}

describe.each(['kobo','custom'] as const)('%s zero-inclusive copying',workspace=>{
 it.each([false,true])('includes zero rows in single and bulk copies (breakdown: %s)',async breakdown=>{
  const original=settings(),before=structuredClone(original),signal=new AbortController().signal;
  const fetcher=vi.fn(async(url:string,init:RequestInit)=>{
   expect(url).toMatch(new RegExp(`/api/${workspace}/projects/p/analysis$`));
   expect(init.signal).toBe(signal);
   const body=JSON.parse(init.body as string);
   expect(body.settings).toEqual({...before,hideZero:false,hideEmpty:false});
   const full=result(breakdown);
   // The analysis endpoint returns rows in the configured pivot order.
   full.pivotSort=body.settings.questions.q.pivotSort;
   full.rows.reverse();
   if(body.settings.hideZero)full.rows=full.rows.filter(row=>row.count);
   const analysis:KoboAnalysis={settings:body.settings,questions:[full],filterSummary:['Area: North'],total:4,filtered:4,groups:[]};
   return new Response(JSON.stringify(analysis),{status:200});
  });
  vi.stubGlobal('fetch',fetcher);
  const api=createKoboApi(workspace);
  const single=await prepareKoboQuestionCopy(api,'p',original,'q',signal);
  const bulk=await buildKoboBulkCopy(await loadKoboCopyAnalysis(api,'p',original,signal));
  for(const copy of [single,bulk]){
   expect(copy.text).toContain('No\t0\t0.0%');
   expect(copy.text.indexOf('No\t')).toBeLessThan(copy.text.indexOf('Yes\t'));
   expect(copy.html).toContain('x:num="0"');
   expect(copy.html).toContain('>0</td>');
   expect(copy.html).toContain('>0.0%</td>');
   expect(copy.text).not.toContain('hidden-answer');
  }
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string).question).toBe('q');
  expect(JSON.parse(fetcher.mock.calls[1][1].body as string).question).toBe('');
  expect(original).toEqual(before);
 });

 it.each(['count','percent'] as const)('preserves %s-only output and undefined percentages',async display=>{
  const source=settings();source.questions.q.breakdownDisplay=display;
  const full=result(false);full.rows[0].percent=null;full.rows[0].displayPercent=null;
  const api={analyze:vi.fn(async()=>({settings:source,questions:[full]} as KoboAnalysis))};
  const copy=await prepareKoboQuestionCopy(api,'p',source,'q',new AbortController().signal);
  expect(copy.text).toContain(display==='count'?'No\t0\r\n':'No\t0.0%\r\n');
  expect(copy.text).toContain(display==='count'?'Yes\t4\r\n':'Yes\t-\r\n');
  expect(copy.text).toContain(display==='count'?'Answer\tCount':'Answer\tPercent');
 });
});

it('propagates fetch failures and aborts without returning a partial copy',async()=>{
 const api={analyze:vi.fn().mockRejectedValueOnce(new Error('Connection failed')).mockRejectedValueOnce(new DOMException('Cancelled','AbortError'))};
 const controller=new AbortController();
 await expect(prepareKoboQuestionCopy(api,'p',settings(),'q',controller.signal)).rejects.toThrow('Connection failed');
 controller.abort();
 await expect(loadKoboCopyAnalysis(api,'p',settings(),controller.signal)).rejects.toMatchObject({name:'AbortError'});
});

it('reports a question removed from the copy response',async()=>{
 const api={analyze:vi.fn(async()=>({questions:[]} as unknown as KoboAnalysis))};
 await expect(prepareKoboQuestionCopy(api,'p',settings(),'q',new AbortController().signal)).rejects.toThrow('no longer available');
});
