import {expect,it} from 'vitest';
import {placeQuestions,suggestColumnPlacement,placementCandidate} from './koboFieldPlacement';
import {reviewForm} from './koboReviewConfig';
import type {KoboQuestion,KoboForm,KoboMapping} from './koboTypes';
const q=(id:string,group='g',placement?:KoboQuestion['placement']):KoboQuestion=>({id,name:id,labels:{en:id},kind:'text',type:'text',group,repeat:'',choices:[],metadata:false,identifying:false,placement});
it('places first, last and relative fields while preserving untouched group slots',()=>{
 const original=[q('a'),q('other','h'),q('b'),q('x','g',{position:'after',reference:'a'}),q('y','g',{position:'first'}),q('z','g',{position:'last'})];
 expect(placeQuestions(original).map(q=>q.id)).toEqual(['y','other','a','x','b','z']);
 expect(placeQuestions([q('a'),q('other','h'),q('b')]).map(q=>q.id)).toEqual(['a','other','b']);
});
it('resolves added-field references and rejects cycles and invalid references',()=>{
 expect(placeQuestions([q('a'),q('b'),q('x','g',{position:'after',reference:'a'}),q('y','g',{position:'after',reference:'x'})]).map(q=>q.id)).toEqual(['a','x','y','b']);
 expect(()=>placeQuestions([q('a','g',{position:'after',reference:'b'}),q('b','g',{position:'after',reference:'a'})])).toThrow('cycle');
 expect(()=>placeQuestions([q('a'),q('x','g',{position:'before',reference:'missing'})])).toThrow('unavailable');
 expect(()=>placeQuestions([q('a','h'),q('x','g',{position:'before',reference:'a'})])).toThrow('selected group');
});
it('suggests by worksheet column neighbors and keeps ambiguous placement manual',()=>{
 const form={questions:[q('a'),q('b'),q('c','h')],groups:[]} as unknown as KoboForm;
 const m=(column:number,question:string,sheet=0):KoboMapping=>({column,question,sheet,header:question,option:'',status:'matched'}),target=m(2,'');
 expect(suggestColumnPlacement(form,[m(1,'a'),m(3,'b')],target,'').suggested?.placement).toEqual({position:'after',reference:'a'});
 expect(suggestColumnPlacement(form,[m(1,'a'),m(3,'c')],target,'').suggested).toBeUndefined();
 expect(suggestColumnPlacement(form,[m(1,'b'),m(3,'a')],target,'').suggested).toBeUndefined();
 expect(suggestColumnPlacement(form,[m(1,'a',1)],target,'').choices).toEqual([]);
});
it('keeps unavailable saved positions editable in import review',()=>{
 const form={questions:[q('a')],groups:[]} as unknown as KoboForm;
 const review=reviewForm(form,{choiceOverrides:{},addedQuestions:[{id:'added_x',label:'X',kind:'text',sheet:0,column:2,repeat:'',group:'g',choices:[],separator:'',placement:{position:'before',reference:'missing'}}]});
 expect(review.questions[1].placement?.reference).toBe('missing');
});

it('allows repairing one saved placement while another reference is still missing',()=>{
 const target=q('x','g',{position:'after',reference:'missing_x'}),other=q('y','g',{position:'after',reference:'missing_y'});
 const form={questions:[q('a'),target,other],groups:[]} as unknown as KoboForm;
 expect(placementCandidate(form,target,'g',{position:'after',reference:'a'}).map(q=>q.id)).toEqual(['a','x','y']);
 expect(()=>placementCandidate(form,target,'g',{position:'after',reference:'x'})).toThrow();
});
