import {describe,it,expect} from 'vitest';
import {canLink,linkColumn,mergedQuestions,setMergeRule} from './koboImportLinks';
import type {KoboMapping,KoboQuestion} from './koboTypes';
const question={id:'sex',name:'sex',kind:'category',repeat:'',type:'select_one',labels:{en:'Sex'},group:'',metadata:false,identifying:false,choices:[]} as KoboQuestion;
const old={sheet:0,column:0,header:'old_sex',question:'',option:'',status:'unmatched'} as KoboMapping;
const current={...old,column:1,header:'sex',question:'sex',status:'matched'};
describe('historical form links',()=>{
 it('links without mutating source mappings and clears stale answer rules',()=>{const source={...old,answerMap:{a:'b'},mergeMode:'priority' as const};const result=linkColumn([source,current],source,'sex');expect(source.question).toBe('');expect(result[0].answerMap).toEqual({});expect(result[0].mergeMode).toBe('');expect(mergedQuestions(result).get('sex')).toHaveLength(2)});
 it('keeps split option columns distinct from historical merges',()=>{expect(mergedQuestions([current,{...old,question:'sex',option:'a',status:'matched'}]).size).toBe(0)});
 it('sets explicit conflict decisions and stable source order',()=>{const links=linkColumn([old,current],old,'sex');const result=setMergeRule(links,'sex','priority',['0:1','0:0']);expect(result.map(m=>m.priority)).toEqual([1,0]);expect(result.every(m=>m.mergeMode==='priority')).toBe(true);expect(links[0].mergeMode).toBe('')});
 it('blocks incompatible types and repeat contexts',()=>{expect(canLink(old,question,'')).toBe(true);expect(canLink({...old,sourceKind:'number'},question,'')).toBe(false);expect(canLink({...old,sheet:1},question,'members')).toBe(false);expect(canLink({...old,sourceRepeat:'members'},question,'')).toBe(false);expect(canLink(old,{...question,repeat:'members'},'members')).toBe(true)});
});
