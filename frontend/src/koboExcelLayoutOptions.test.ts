import {describe,it,expect} from 'vitest';
import type {KoboAnalysis} from './koboTypes';
import {defaultExcelGroups,initialExcelGroups,excelGroupChoices,excelSheetPreview,excelSheetName} from './koboExcelLayoutOptions';
const snapshot={groups:[{id:'a',name:'a',label:'First',parent:''},{id:'a/n',name:'n',label:'Nested',parent:'a'},{id:'b',name:'b',label:'Second',parent:''},{id:'c',name:'c',label:'Third',parent:''},{id:'empty',name:'e',label:'Empty',parent:''}],questions:[{id:'q1',group:'a/n'},{id:'q2',group:'a'},{id:'q3',group:'b'},{id:'q4',group:'c'},{id:'q5',group:''}]} as KoboAnalysis;
describe('Excel worksheet choices',()=>{
 it('restores saved choices, including deliberately empty choices and scoped exports',()=>{expect(initialExcelGroups(snapshot)).toEqual(['a','b']);expect(initialExcelGroups(snapshot,[])).toEqual([]);expect(initialExcelGroups(snapshot,['a/n','missing'])).toEqual(['a/n']);expect(initialExcelGroups({...snapshot,questions:[snapshot.questions[2]]},['a','b'])).toEqual(['b'])});
 it('defaults to the first two main groups, ignoring nested and empty groups',()=>{expect(defaultExcelGroups(snapshot)).toEqual(['a','b']);expect(excelGroupChoices(snapshot).map(group=>[group.id,group.count,group.depth])).toEqual([['a',2,0],['a/n',1,1],['b',1,0],['c',1,0]])});
 it('keeps unselected groups on Analysis and ungrouped questions on General',()=>{const sheets=excelSheetPreview(snapshot,['a','b']);expect(sheets.map(sheet=>sheet.sheetName)).toEqual(['First','Second','Analysis','General']);expect(sheets[2].questions.map(question=>question.id)).toEqual(['q4']);expect(excelSheetPreview(snapshot,[]).map(sheet=>sheet.label)).toEqual(['Analysis','General'])});
 it('moves selected nested groups to their own sheet without duplicates',()=>{const sheets=excelSheetPreview(snapshot,['a','a/n']);expect(sheets.map(sheet=>sheet.label)).toEqual(['First','Nested','Analysis','General']);expect(sheets[0].questions.map(question=>question.id)).toEqual(['q2']);expect(sheets[1].questions.map(question=>question.id)).toEqual(['q1']);expect(sheets.flatMap(sheet=>sheet.questions).length).toBe(5)});
 it('handles single-question and ungrouped exports',()=>{const single={...snapshot,questions:[snapshot.questions[0]]};expect(defaultExcelGroups(single)).toEqual(['a']);expect(excelSheetPreview(single,['a/n']).map(sheet=>sheet.label)).toEqual(['Nested']);expect(excelSheetPreview({...snapshot,questions:[snapshot.questions[4]]},[]).map(sheet=>sheet.label)).toEqual(['General'])});
 it('reserves guide and repeat-data sheet names before naming analysis sheets',()=>{
  const data={...snapshot,groups:[{...snapshot.groups[0],label:'Workbook guide'},{...snapshot.groups[1],label:'Visits',repeat:true},{...snapshot.groups[2],label:'Data - Visits'}]};
  const names=excelSheetPreview(data,['a','b']).map(sheet=>sheet.sheetName);
  expect(names).toContain('Workbook guide (2)');expect(names).toContain('Data - Visits (2)');
 });
 it('sanitizes and shortens duplicate sheet names, preserving Arabic labels',()=>{const used=new Set(['data']);expect(excelSheetName('Data',used)).toBe('Data (2)');expect(excelSheetName("'A/B:*?[]\\'",used)).toBe('A B');expect(excelSheetName('الأسرة',used)).toBe('الأسرة');const first=excelSheetName('x'.repeat(50),used),next=excelSheetName('x'.repeat(50),used);expect(first.length).toBe(31);expect(next.length).toBe(31);expect(next).not.toBe(first)});
});
