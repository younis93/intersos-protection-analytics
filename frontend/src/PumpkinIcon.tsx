import {useId} from 'react';

export default function PumpkinIcon({active=false}:{active?:boolean}){
  const id=useId();
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={active?'is-lit':undefined}>
    <defs>
      <linearGradient id={`${id}-skin`} x1="12" y1="11" x2="29" y2="35" gradientUnits="userSpaceOnUse"><stop stopColor={active?'#ffc86b':'#f8ad51'}/><stop offset=".48" stopColor={active?'#f89532':'#e9822b'}/><stop offset="1" stopColor={active?'#d45a21':'#ba501f'}/></linearGradient>
      <linearGradient id={`${id}-stem`} x1="20" y1="4" x2="23" y2="14" gradientUnits="userSpaceOnUse"><stop stopColor="#a1bd77"/><stop offset="1" stopColor="#526c3b"/></linearGradient>
    </defs>
    <path d="M19 14c-1-4 0-7 4-9l3 1c-4 2-5 4-4 8" fill={`url(#${id}-stem)`}/>
    <path d="M21 11c5-5 9-3 9-3-1 5-5 7-9 5" fill="#83a35c"/>
    <path d="M20 14C5 5-1 29 11 34c3 2 6 1 9 1s6 1 9-1C41 29 35 5 20 14Z" fill={`url(#${id}-skin)`} stroke="#9f491e" strokeWidth=".8"/>
    <path d="M15 14c-6 5-6 15-2 19m12-19c6 5 6 15 2 19M20 15v18" stroke="#a64b23" strokeWidth="1.1" opacity=".42" strokeLinecap="round"/>
    <path d="M11 16c-3 2-4 5-4 8" stroke="#ffdb98" strokeWidth="1.7" strokeLinecap="round" opacity=".7"/>
    <g className="pumpkin-carving" fill={active?'#fff0ac':'#653521'}>
      <path d="m10 23 5-6 2 7Zm20 0-5-6-2 7ZM19 25l1-3 2 3Z"/>
      <path d="m11 27 5 1 2-2 3 2 3-2 5 1-4 5H16Z"/>
    </g>
    {active&&<g fill="#ffe1a0"><path d="m33 8 1-3 1 3 3 1-3 1-1 3-1-3-3-1Z"/><path d="m5 9 .7-2 .6 2 2 .7-2 .6-.6 2-.7-2-2-.6Z"/></g>}
  </svg>;
}