import {useId,useLayoutEffect,useRef} from 'react';
import './koboVisibilityStateIcon.css';

const duration=350;
const easing='cubic-bezier(.22,1,.36,1)';

/** Keep the eye still; only the slash and its clearance move. */
export default function KoboVisibilityStateIcon({hidden}:{hidden:boolean}){
 const id=`kobo-eye-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
 const svg=useRef<SVGSVGElement>(null),previous=useRef(hidden),current=useRef(hidden),busyUntil=useRef(0);
 current.current=hidden;
 const paths=()=>Array.from(svg.current?.querySelectorAll<SVGPathElement>('[data-eye-slash]')||[]);
 const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const cancel=()=>paths().forEach(path=>path.getAnimations().forEach(animation=>animation.cancel()));
 const play=(from?:number)=>{
  const target=current.current?0:1;
  const starts=paths().map(path=>({path,offset:from??parseFloat(getComputedStyle(path).strokeDashoffset)}));
  cancel();
  if(reduced())return;
  busyUntil.current=performance.now()+duration;
  for(const {path,offset} of starts)path.animate([{strokeDashoffset:offset},{strokeDashoffset:target}],{duration,easing});
 };
 useLayoutEffect(()=>{
  if(previous.current===hidden)return;
  previous.current=hidden;
  // Sample the visible position before cancelling a hover replay or interrupted transition.
  play();
 },[hidden]);
 useLayoutEffect(()=>{
  const button=svg.current?.closest('button'),media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const replay=()=>{if(current.current&&!media.matches&&performance.now()>=busyUntil.current)play(1)};
  const focus=()=>{if(button?.matches(':focus-visible'))replay()};
  const preference=()=>{if(media.matches)cancel()};
  button?.addEventListener('pointerenter',replay);
  button?.addEventListener('focus',focus);
  media.addEventListener('change',preference);
  return()=>{button?.removeEventListener('pointerenter',replay);button?.removeEventListener('focus',focus);media.removeEventListener('change',preference);cancel()};
 },[]);
 return <svg ref={svg} className="kobo-visibility-state-icon" data-hidden={hidden} viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  <defs><mask id={id} maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28"><rect x="-2" y="-2" width="28" height="28" fill="white" stroke="none"/><path data-eye-slash d="M3 3 21 21" pathLength="1" stroke="black" strokeWidth="5"/></mask></defs>
  <g mask={`url(#${id})`}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></g>
  <path data-eye-slash d="M3 3 21 21" pathLength="1"/>
 </svg>;
}
