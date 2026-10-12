import {type CSSProperties,type ReactNode,useState} from 'react';

export function HomeLogo({children}:{children?:ReactNode}){
  const [play,setPlay]=useState(0);
  return <button type="button" className="welcome-logo-secret" onClick={()=>setPlay(value=>value+1)} aria-label="Animate INTERSOS home logo">
    <span key={play} className={`home-logo-motion${play?' is-playing':''}`}>
      <span className="welcome-logo-mark"><img src="/intersos-symbol-transparent.png" alt=""/><span className="home-logo-sheen" aria-hidden="true"/></span>
      <span className="welcome-logo-word" aria-hidden="true">{'INTERSOS'.split('').map((letter,index)=><b key={index} style={{'--letter':index} as CSSProperties}>{letter}</b>)}</span>
    </span>
    <span className="sr-only">INTERSOS</span>{children}
  </button>;
}
