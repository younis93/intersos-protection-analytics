import {type CSSProperties,type ReactNode,useState} from 'react';

export function HomeLogo({children}:{children?:ReactNode}){
  const [play,setPlay]=useState(0);
  return <button type="button" className="welcome-logo-secret" onClick={()=>setPlay(value=>value+1)} aria-label="Animate INTERSOS home logo">
    <span key={play} className={`home-logo-motion${play?' is-playing':''}`}>
      <span className="home-logo-halo" aria-hidden="true"/>
      <svg className="home-logo-orbit" viewBox="0 0 200 200" aria-hidden="true"><circle className="home-logo-orbit-track" cx="100" cy="100" r="83"/><circle className="home-logo-orbit-arc" cx="100" cy="100" r="83"/></svg>
      <span className="welcome-logo-mark"><img src="/intersos-symbol-transparent.png" alt=""/><span className="home-logo-sheen" aria-hidden="true"/></span>
      <span className="welcome-logo-word" aria-hidden="true">{'INTERSOS'.split('').map((letter,index)=><b key={index} style={{'--letter':index} as CSSProperties}>{letter}</b>)}</span>
    </span>
    <span className="sr-only">INTERSOS</span>{children}
  </button>;
}
