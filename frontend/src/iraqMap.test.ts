import {describe,expect,it} from "vitest";
import {mapIntensity,polygonCentroid,projectGovernorates,type MapFeature} from "./iraqMap";

describe("Iraq governorate map geometry",()=>{
  it("creates closed paths without a plot-sized background shape",()=>{
    const features:Array<MapFeature>=Array.from({length:18},(_,index)=>({properties:{shapeName:`Region ${index+1}`},geometry:{type:"Polygon",coordinates:[[[index,0],[index+.8,0],[index+.8,1],[index,1],[index,0]]]}}));
    const shapes=projectGovernorates(features,760,700);
    expect(shapes).toHaveLength(18);
    expect(shapes.every((shape)=>shape.path.startsWith("M")&&shape.path.endsWith("Z"))).toBe(true);
    expect(shapes.every((shape)=>!shape.path.includes("NaN"))).toBe(true);
  });

  it("calculates stable polygon centroids",()=>{
    expect(polygonCentroid([[0,0],[2,0],[2,2],[0,2]])).toEqual([1,1]);
  });

  it("assigns neutral through high intensity buckets",()=>{
    expect(mapIntensity(0,100)).toBe(0);
    expect(mapIntensity(1,100)).toBe(1);
    expect(mapIntensity(25,100)).toBe(3);
    expect(mapIntensity(100,100)).toBe(5);
  });
});
