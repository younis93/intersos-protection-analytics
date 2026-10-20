import {describe,it,expect} from 'vitest';
import {koboQuestionType} from './koboQuestionPresentation';
import {koboCopyCell} from './koboClipboard';
import type {KoboQuestion,KoboResult} from './koboTypes';
describe('question presentation',()=>{
 it.each([['category','select_one age','Single choice'],['multiple','select_multiple needs','Multiple choice'],['number','integer','Number'],['number','decimal','Number'],['date','date','Date'],['text','text','Text']] as const)('labels %s using the original %s type',(kind,type,label)=>{expect(koboQuestionType({kind,type} as KoboQuestion,{kind} as KoboResult,'en')).toEqual({label,tooltip:`Original XLSForm type: ${type}`})});
 it('falls back to the analysis kind and supports Arabic',()=>{expect(koboQuestionType(undefined,{kind:'number'} as KoboResult,'ar')).toEqual({label:'رقم',tooltip:'Analysis type: number'})});
 it('marks only the supplied cell value for copying without losing zero or percent formatting',()=>{expect(koboCopyCell('0')['data-kobo-copy-value']).toBe('0');expect(koboCopyCell('14.63%')['data-kobo-copy-value']).toBe('14.63%');expect(koboCopyCell('العمر').tabIndex).toBe(0)});
});
