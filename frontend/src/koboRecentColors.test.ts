import {afterEach,expect,it,vi} from 'vitest';
import {recentChartColors,rememberChartColor} from './koboRecentColors';

afterEach(()=>vi.unstubAllGlobals());
it('persists the latest nine unique colors, moving reused colors to the front',()=>{
 const saved=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value)});
 for(let index=0;index<12;index++)rememberChartColor(`#${index.toString(16).padStart(6,'0')}`);
 expect(recentChartColors()).toHaveLength(9);
 expect(recentChartColors()[0]).toBe('#00000B');
 expect(recentChartColors()).not.toContain('#000002');
 rememberChartColor('#00000a');
 expect(recentChartColors().slice(0,2)).toEqual(['#00000A','#00000B']);
 expect(JSON.parse([...saved.values()][0])).toEqual(recentChartColors());
 const previous=recentChartColors();rememberChartColor('invalid');expect(recentChartColors()).toEqual(previous);
});
it('normalizes saved colors and discards invalid entries and duplicates',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(['#abc','#AABBCC',null,12,'invalid','#123456'])});
 expect(recentChartColors()).toEqual(['#AABBCC','#123456']);
});
it('keeps color selection usable if local storage is blocked',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')}});
 expect(rememberChartColor('#def')[0]).toBe('#DDEEFF');
 expect(recentChartColors()[0]).toBe('#DDEEFF');
});
