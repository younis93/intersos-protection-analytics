import {describe,it,expect} from 'vitest';
import {pivotColumnSlots,pivotMetricWidth,pivotAnswerWidth} from './koboPivotViewport';
describe('pivot horizontal window',()=>{
 it('counts metric columns and keeps small tables complete',()=>{expect(pivotColumnSlots(20,2,0,800)).toHaveLength(20);expect(pivotColumnSlots(40,1,0,800)).toHaveLength(40);expect(pivotColumnSlots(21,2,0,800).some(slot=>slot.gap)).toBe(true)});
 it('preserves full logical width at the beginning, middle and end',()=>{for(const left of [0,3000,9000]){const slots=pivotColumnSlots(100,2,left,800);expect(slots.reduce((n,slot)=>n+slot.span,0)).toBe(100);expect(slots.filter(slot=>!slot.gap).length).toBeLessThan(12);let offset=0;for(const slot of slots){expect(slot.index).toBe(offset);offset+=slot.span}}});
 it('retains a focused category outside the visible column window',()=>{const slots=pivotColumnSlots(100,2,6000,800,0);expect(slots.find(slot=>slot.index===0)?.gap).toBe(false);expect(slots.filter(slot=>!slot.gap).length).toBeLessThan(14)});
 it('does not split count and percentage pairs',()=>{const index=60,slots=pivotColumnSlots(100,2,pivotAnswerWidth+index*2*pivotMetricWidth,400);expect(slots.some(slot=>!slot.gap&&slot.index===index)).toBe(true);expect(slots.every(slot=>Number.isInteger(slot.span))).toBe(true)});
});
