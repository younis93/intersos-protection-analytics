import {useState,type PointerEvent} from 'react';

type Hsv={hue:number;saturation:number;brightness:number};
const defaultHex='#1683D8';

function hexToHsv(hex:string,previous?:Hsv):Hsv{
 const [red,green,blue]=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255);
 const brightness=Math.max(red,green,blue),chroma=brightness-Math.min(red,green,blue);
 if(!chroma)return {hue:previous?.hue??0,saturation:brightness?0:previous?.saturation??0,brightness};
 const sector=brightness===red?(green-blue)/chroma:brightness===green?2+(blue-red)/chroma:4+(red-green)/chroma;
 return {hue:(sector*60+360)%360,saturation:chroma/brightness,brightness};
}

function hsvToHex({hue,saturation,brightness}:Hsv){
 const channel=(offset:number)=>{
  const sector=(offset+hue/60)%6;
  const value=brightness*(1-saturation*Math.max(0,Math.min(sector,4-sector,1)));
  return Math.round(value*255).toString(16).padStart(2,'0');
 };
 return ('#'+channel(5)+channel(3)+channel(1)).toUpperCase();
}

export default function KoboColorWheel({hex,onColor}:{hex:string|null;onColor:(hex:string)=>void}){
 const [selection,setSelection]=useState(()=>({hex:hex??defaultHex,hsv:hexToHsv(hex??defaultHex)}));
 const hsv=!hex||hex===selection.hex?selection.hsv:hexToHsv(hex,selection.hsv);
 const angle=hsv.hue*Math.PI/180;
 const x=50+Math.sin(angle)*hsv.saturation*50;
 const y=50-Math.cos(angle)*hsv.saturation*50;
 const select=(value:Hsv)=>{
  const next=hsvToHex(value);
  setSelection({hex:next,hsv:value});
  if(next!==hex)onColor(next);
 };
 const selectPoint=(event:PointerEvent<HTMLDivElement>)=>{
  const box=event.currentTarget.getBoundingClientRect();
  const dx=(event.clientX-box.left)/box.width*2-1;
  const dy=(event.clientY-box.top)/box.height*2-1;
  const saturation=Math.min(1,Math.hypot(dx,dy));
  const hue=saturation?(Math.atan2(dx,-dy)*180/Math.PI+360)%360:hsv.hue;
  select({...hsv,hue,saturation});
 };
 return <details className="kobo-color-wheel">
  <summary>Color wheel</summary>
  <div className="kobo-color-wheel-controls">
   <div className="kobo-color-wheel-disc" aria-hidden="true" onPointerDown={event=>{
    if(!event.isPrimary||event.button!==0)return;
    event.currentTarget.setPointerCapture(event.pointerId);
    selectPoint(event);
   }} onPointerMove={event=>{
    if(event.currentTarget.hasPointerCapture(event.pointerId))selectPoint(event);
   }}>
    <span className="kobo-color-wheel-shade" style={{opacity:1-hsv.brightness}}/>
    <span className="kobo-color-wheel-marker" style={{left:x+'%',top:y+'%',background:hsvToHex(hsv)}}/>
   </div>
   <label className="kobo-color-wheel-brightness">
    <span>Brightness</span>
    <input type="range" min={0} max={100} value={Math.round(hsv.brightness*100)} onChange={event=>select({...hsv,brightness:Number(event.target.value)/100})}/>
   </label>
  </div>
 </details>;
}
