import {describe,it,expect} from 'vitest';
import {KoboSettingsHistory} from './koboSettingsHistory';
import type {KoboSettings} from './koboTypes';
const state=(n:number)=>({version:n,questions:{}} as KoboSettings);
describe('analysis settings history',()=>{
 it('undoes and redoes multiple changes and drops the redo branch on new changes',()=>{
  const h=new KoboSettingsHistory();h.record(state(0),state(1));h.record(state(1),state(2));
  expect(h.undo(state(2))).toEqual(state(1));expect(h.undo(state(1))).toEqual(state(0));expect(h.undo(state(0))).toBeNull();
  expect(h.redo(state(0))).toEqual(state(1));h.record(state(1),state(3));expect(h.redo(state(3))).toBeNull();expect(h.undo(state(3))).toEqual(state(1));
 });
 it('groups continuous input edits until inactivity or blur',()=>{
  const h=new KoboSettingsHistory(),input={};h.record(state(0),state(1),input,1000);h.record(state(1),state(2),input,1200);
  expect(h.past).toHaveLength(1);h.record(state(2),state(3),input,1700);expect(h.past).toHaveLength(2);
  h.endGroup();h.record(state(3),state(4),input,1750);expect(h.past).toHaveLength(3);
 });
 it('bounds history, ignores unchanged values, snapshots values, and resets',()=>{
  const h=new KoboSettingsHistory(),before=state(0);h.record(before,state(1));before.version=999;
  expect(h.past[0].version).toBe(0);expect(h.record(state(1),state(1))).toBe(false);
  for(let n=1;n<110;n++)h.record(state(n),state(n+1));expect(h.past).toHaveLength(100);h.undo(state(110));h.reset();expect(h.past).toEqual([]);expect(h.future).toEqual([]);
 });
});
