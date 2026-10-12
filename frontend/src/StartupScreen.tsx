import startupLogo from '../public/intersos-startup-logo.svg?raw';
import {type CSSProperties} from 'react';
import {ShieldCheck} from 'lucide-react';
import ProcessingBackground from './ProcessingBackground';

export default function StartupScreen({phase}:{phase:'visible'|'exiting'}){
 const startupEpoch=Number(new URLSearchParams(window.location.search).get('startupEpoch'));
 const startupOffset=Number.isFinite(startupEpoch)&&startupEpoch>0?Math.max(0,Date.now()-startupEpoch):0;
 const style={'--startup-offset':`-${startupOffset}ms`} as CSSProperties;
 return <section className={`app-startup-loading ${startupEpoch?'is-handoff ':''}${phase==='exiting'?'is-exiting':''}`} style={style} role="status" aria-live="polite" aria-label="Starting Iraq Data Analysis" aria-busy="true">
  <ProcessingBackground active/>
  <div className="app-startup-loading-card glass">
   <div className="app-startup-loading-mark"><span className="app-startup-loading-orbit"/><span className="app-startup-loading-logo" dangerouslySetInnerHTML={{__html:startupLogo}}/></div>
   <span className="eyebrow">IRAQ DATA ANALYSIS</span><h1>Preparing your workspace</h1><p>Starting the secure local application.</p>
   <div className="app-startup-loading-progress" aria-hidden="true"><i/></div>
   <footer><ShieldCheck/><span>Local and private data workspace</span></footer>
  </div>
 </section>;
}

