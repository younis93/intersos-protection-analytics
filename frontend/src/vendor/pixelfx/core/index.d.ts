export interface Frame {w:number;h:number;ox:number;oy:number;color:Uint32Array;light:Uint32Array}
export interface Effect {update(dt:number):void;draw(frame:Frame,layer?:'back'|'front'):void;done():boolean}
export function createFrame(w:number,h:number,ox?:number,oy?:number):Frame;
export function clearFrame(frame:Frame):Frame;
export function composite(frame:Frame,out:Uint8ClampedArray,bg?:number|null,lightK?:number):Uint8ClampedArray;
export function createFx(module:unknown,options?:{x?:number;y?:number;seed?:number;light?:number;palette?:string[];color?:string;hover?:number;face?:boolean;drift?:boolean;height?:number;aim?:number}):Effect;
