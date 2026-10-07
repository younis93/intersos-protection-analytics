import {describe,expect,it} from "vitest";
import {rowOffsets,windowIndexes} from "./virtualWindow";

describe("variable height windows",()=>{
  it("bounds rendered rows with ten-row overscan",()=>{
    const offsets=rowOffsets(10000,new Map(),40);
    const indexes=windowIndexes(offsets,200000,400,null);
    expect(indexes.length).toBeLessThanOrEqual(32);
    expect(indexes[0]).toBe(4990);
    expect(indexes.at(-1)).toBe(5020);
  });
  it("includes a focused offscreen row without rendering the intervening rows",()=>{
    const indexes=windowIndexes(rowOffsets(10000,new Map(),40),200000,400,1);
    expect(indexes).toContain(1);
    expect(indexes.length).toBeLessThanOrEqual(33);
    expect(new Set(indexes).size).toBe(indexes.length);
  });
  it("uses measured heights and handles the start, end and empty list",()=>{
    expect(rowOffsets(3,new Map([[0,80],[2,20]]),40)).toEqual([0,80,120,140]);
    expect(windowIndexes([0],0,400,null)).toEqual([]);
    expect(windowIndexes([0,80,120,140],100000,400,null)).toEqual([0,1,2]);
    expect(windowIndexes([0,80,120,140],0,400,null)).toEqual([0,1,2]);
  });
});
