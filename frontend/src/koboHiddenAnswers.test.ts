import {expect,it} from 'vitest';
import {hiddenAnswerOptions,restoreHiddenSelection} from './koboHiddenAnswers';
import type {KoboQuestion,KoboResult} from './koboTypes';
const question={choices:[{name:'a',labels:{en:'Same'}},{name:'b',labels:{en:'Same'}}]} as KoboQuestion;
const result={rows:[],percentageRows:[{id:'text',label:'Retained text'}]} as unknown as KoboResult;
it('resolves labels and distinguishes duplicates, blanks and unavailable answers',()=>{
 const options=hiddenAnswerOptions(['a','b','text','__blank__','gone'],question,result,'en');
 expect(options.map(o=>o.label)).toEqual(['Same','Same','Retained text','Blank / unanswered','gone']);
 expect(options.map(o=>o.showCode)).toEqual([true,true,false,false,false]);
 expect(hiddenAnswerOptions(['a'],question,result,'en',[{id:'a',label:'Renamed'}])[0].label).toBe('Renamed');
 expect(hiddenAnswerOptions(['__blank__'],question,result,'ar')[0].label).toBe('فارغ / دون إجابة');
});
it('removes only selected IDs from the latest hidden list',()=>{
 expect(restoreHiddenSelection(['a','b','new'],['a','stale'])).toEqual(['b','new']);
 expect(restoreHiddenSelection(['a','b'],[])).toEqual(['a','b']);
 expect(restoreHiddenSelection(['a','b'],['a','b'])).toEqual([]);
});
