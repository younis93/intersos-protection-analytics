import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import KoboPivotTable from './KoboPivotTable';
import KoboAnswerActions from './KoboAnswerActions';
import type {KoboResult} from './koboTypes';

const result:KoboResult={id:'q',name:'q',label:'Question',group:'',kind:'category',repeat:'',denominator:4,missing:0,total:4,rows:[{id:'a',label:'A',count:3,percent:75},{id:'__blank__',label:'No response',count:1,percent:25}],statistics:{},breakdowns:[],percentageBasis:'Respondents',chart:'bar',colors:{}};

describe('fixed pivot answer actions',()=>{
 it('uses one explicit action button and leaves answer text as text',()=>{
  const html=renderToStaticMarkup(<KoboPivotTable result={result} language="en" limit={10} onEditAnswer={()=>{}} onHideAnswer={()=>{}} onRestoreAnswers={()=>{}}/>);
  expect(html.match(/class="soft kobo-answer-menu-trigger"/g)).toHaveLength(2);
  expect(html).not.toContain('kobo-answer-edit-shortcut');
  expect(html).not.toContain('aria-label="Edit answer');
  expect(html).toContain('aria-label="Answer options: A"');
  expect(html).toContain('aria-haspopup="menu"');
  expect(html.split('<tfoot>')[1]).not.toContain('kobo-answer-menu-trigger');
 });
 it('keeps fixed layout direction independent from the answer text direction',()=>{
  const html=renderToStaticMarkup(<KoboAnswerActions label="English" language="ar" hiddenCount={0} onHide={()=>{}}>English</KoboAnswerActions>);
  expect(html).toContain('class="kobo-answer-actions" dir="rtl"');
  expect(html).toContain('class="kobo-answer-label" dir="auto"');
 });
 it('retains plain cells in tables without any answer actions',()=>{
  const html=renderToStaticMarkup(<KoboPivotTable result={result} language="en" limit={10}/>);
  expect(html).not.toContain('kobo-answer-menu-trigger');
 });
 it('supports editing without requiring hide permissions',()=>{
  const html=renderToStaticMarkup(<KoboPivotTable result={result} language="en" limit={10} onEditAnswer={()=>{}}/>);
  expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(2);
 });
});
