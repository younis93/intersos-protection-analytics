import {describe,expect,it} from 'vitest';
import {matchingKoboProjects,type KoboProjectListItem} from './koboProjectList';

const projects:KoboProjectListItem[]=[
 {id:'b',name:'Survey 10',updated:'2026-10-17T09:00:00Z'},
 {id:'a',name:'Survey 2',updated:'2026-10-19T09:00:00Z'},
 {id:'c',name:'Assessment',updated:'2026-10-18T09:00:00Z'},
 {id:'d',name:'تقييم الحماية',updated:'2026-10-16T09:00:00Z'},
];
const ids=(items:KoboProjectListItem[])=>items.map(project=>project.id);

describe('Kobo project search and sorting',()=>{
 it('searches names immediately, ignoring case, whitespace and Unicode presentation differences',()=>{
  expect(ids(matchingKoboProjects(projects,'  sUrVeY  ','date-desc'))).toEqual(['a','b']);
  expect(ids(matchingKoboProjects(projects,'الحماية','date-desc'))).toEqual(['d']);
  expect(ids(matchingKoboProjects(projects,'Ｓｕｒｖｅｙ','date-desc'))).toEqual(['a','b']);
  expect(matchingKoboProjects(projects,'missing','date-desc')).toEqual([]);
 });
 it('sorts by last updated in either direction and handles timestamp offsets',()=>{
  expect(ids(matchingKoboProjects(projects,'','date-desc'))).toEqual(['a','c','b','d']);
  expect(ids(matchingKoboProjects(projects,'','date-asc'))).toEqual(['d','b','c','a']);
  expect(ids(matchingKoboProjects([{id:'a',name:'A',updated:'2026-10-19T09:00:00+03:00'},{id:'b',name:'B',updated:'2026-10-19T07:00:00Z'}],'','date-desc'))).toEqual(['b','a']);
 });
 it('sorts names naturally in both directions and combines search with sorting',()=>{
  expect(ids(matchingKoboProjects(projects,'survey','name-asc'))).toEqual(['a','b']);
  expect(ids(matchingKoboProjects(projects,'survey','name-desc'))).toEqual(['b','a']);
 });
 it('keeps invalid dates last and resolves equal names and dates consistently',()=>{
  const same=[{id:'b',name:'Assessment',updated:'2026-10-19'},{id:'a',name:'Assessment',updated:'2026-10-19'},{id:'z',name:'Assessment',updated:'invalid'}];
  for(const sort of ['date-asc','date-desc','name-asc','name-desc'] as const)expect(ids(matchingKoboProjects(same,'',sort))).toEqual(['a','b','z']);
 });
 it('does not mutate the API list and responds to renamed projects',()=>{
  const original=structuredClone(projects);matchingKoboProjects(projects,'','date-desc');expect(projects).toEqual(original);
  const renamed=projects.map(project=>project.id==='a'?{...project,name:'Household assessment'}:project);
  expect(ids(matchingKoboProjects(renamed,'survey','date-desc'))).toEqual(['b']);
  expect(matchingKoboProjects([],'','name-asc')).toEqual([]);
 });
});
