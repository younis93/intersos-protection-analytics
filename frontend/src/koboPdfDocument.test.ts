import {describe,it,expect} from 'vitest';
import {fitKoboPdfImage} from './koboPdfDocument';

describe('PDF chart containment',()=>{
 it.each([[2600,1500,770,320],[2600,2016,375,340],[2600,896,770,320],[800,1800,375,260],[1600,1600,375,340]])('preserves %s x %s image proportions inside %s x %s', (width,height,boxWidth,boxHeight)=>{
  const placed=fitKoboPdfImage(width,height,boxWidth,boxHeight);
  expect(placed.width/placed.height).toBeCloseTo(width/height,10);
  expect(placed.width).toBeLessThanOrEqual(boxWidth+1e-9);
  expect(placed.height).toBeLessThanOrEqual(boxHeight+1e-9);
  expect(placed.x*2+placed.width).toBeCloseTo(boxWidth,10);
  expect(placed.y*2+placed.height).toBeCloseTo(boxHeight,10);
 });
 it('rejects invalid dimensions instead of producing a broken PDF',()=>{
  expect(()=>fitKoboPdfImage(0,750,770,320)).toThrow('Invalid PDF chart dimensions');
  expect(()=>fitKoboPdfImage(1300,750,770,NaN)).toThrow('Invalid PDF chart dimensions');
 });
});
