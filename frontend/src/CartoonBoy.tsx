import {useId} from 'react';
import {RIG,armGeometry,legGeometry,handPath,shoeGeometry} from './boyRig';

type ArtProps={id:string;side:'L'|'R'};
function Hand({id,side}:ArtProps){
  const wrist=side==='L'?RIG.pivots.wristL:RIG.pivots.wristR;
  const d=handPath(0,0);
  return <g className={'boy-hand-'+(side==='L'?'left':'right')} transform={'translate('+wrist[0]+' '+wrist[1]+')'}>
    <g transform={side==='R'?'scale(-1 1)':undefined}>
      <path className={'boy-hand-fill-'+side} d={d} fill={'url(#'+id+'-skin)'} stroke="none"/>
      <path className={'boy-hand-outline-'+side} d={d.replace('Z','')} fill="none" stroke="#ad735b" strokeWidth=".85"/>
      <path className={'boy-fingers-'+side} d="M-2 7v3m2-3v4m2-4v3" stroke="#c78b6d" strokeWidth=".55" opacity=".28" fill="none"/>
      <path d="M3 4q-2 1-2 3" stroke="#d39876" strokeWidth=".65" fill="none"/>
    </g>
  </g>;
}
function Arm({id,side}:ArtProps){
  const label=side==='L'?'left':'right',shape=armGeometry(side);
  return <g className={'boy-arm boy-arm-'+label}>
    <path className={'boy-arm-fill-'+side} d={shape.fill} fill={'url(#'+id+'-skin)'} stroke="none"/>
    <path className={'boy-arm-outline-'+side} d={shape.outline} fill="none" stroke="#ad735b" strokeWidth="1"/>
    <g className={'boy-forearm boy-forearm-'+label}><Hand id={id} side={side}/></g>
    <g transform={side==='R'?'translate(160 0) scale(-1 1)':undefined}>
      <path d="M61 95c-6-1-11 2-13 8l-4 11q5 5 12 4l8-16Z" fill={'url(#'+id+'-shirt)'} stroke="#a53e46" strokeWidth="1"/>
      <path d="m46 112q4 4 11 3" fill="none" stroke="#f69b89" strokeWidth="1.1"/>
      <path d="M54 99q-3 3-5 9" fill="none" stroke="#ffb39b" strokeWidth="1.3" opacity=".6"/>
    </g>
  </g>;
}
function Leg({id,side}:ArtProps){
  const label=side==='L'?'front':'back',p=RIG.pivots,ankle=side==='L'?p.footL:p.footR,shape=legGeometry(side),shoe=shoeGeometry(side==='L'?-.35:.35);
  return <g className={'boy-leg boy-leg-'+label}>
    <path className={'boy-leg-fill-'+side} d={shape.fill} fill={'url(#'+id+'-pants)'} stroke="none"/>
    <path className={'boy-leg-outline-'+side} d={shape.outline} fill="none" stroke="#253b52" strokeWidth="1.1"/>
    <g className={'boy-shin boy-shin-'+label}>
      <g className={'boy-foot-'+label} transform={'translate('+ankle[0]+' '+ankle[1]+')'}>
        <g>
          <path className={'boy-shoe-upper-'+side} d={shoe.upper} fill={'url(#'+id+'-shoe)'} stroke="#25384c" strokeWidth="1"/>
          <path className={'boy-shoe-sole-'+side} d={shoe.sole} fill="#e8f0f3" stroke="#607586" strokeWidth=".8"/>
          <path className={'boy-shoe-seam-'+side} d={shoe.seam} fill="none" stroke="#b4c8d0" strokeWidth=".7"/>
          <ellipse cx="0" cy="-2" rx="4.3" ry="2.1" fill="#172a3d" stroke="none"/>
          <path d="M-3-1q2 4 6 5" fill="none" stroke="#5f7891" strokeWidth="2.8"/>
          <path className={'boy-shoe-laces-'+side} d={shoe.laces} fill="none" stroke="#f2f6f8" strokeWidth="1"/>
          <path className={'boy-shoe-toe-'+side} d={shoe.toe} fill="none" stroke="#7390a8" strokeWidth=".9"/>
        </g>
      </g>
      <path d={'M'+(ankle[0]-6.3)+' 179q6.3 2 12.6 0v5q-6.3 3-12.6 0Z'} fill="#405970" stroke="#2b4359" strokeWidth=".8"/>
      <path d={'M'+(ankle[0]-5)+' 180.5q5 1.5 10 0'} fill="none" stroke="#6c8296" strokeWidth=".7"/>
    </g>
  </g>;
}

/** Continuous limb contours have no transverse elbow/knee outline. Hands articulate at wrists. */
export function CartoonBoy(){
  const id=useId().replace(/:/g,'');
  const eyeClip=(side:string)=>'url(#'+id+'-eye-'+side+')';
  return <svg className="cartoon-boy" viewBox="0 0 160 210" aria-hidden="true">
    <defs>
      <linearGradient id={id+'-skin'} x1="0" y1="0" x2="1" y2=".5"><stop stopColor="#ffdab7"/><stop offset=".55" stopColor="#f5bf97"/><stop offset="1" stopColor="#e9a77e"/></linearGradient>
      <linearGradient id={id+'-shirt'} x1="0" y1="0" x2=".9" y2="1"><stop stopColor="#f47a67"/><stop offset=".55" stopColor="#df5353"/><stop offset="1" stopColor="#b73646"/></linearGradient>
      <linearGradient id={id+'-pants'} x1="0" y1="0" x2="1" y2=".35"><stop stopColor="#4b6278"/><stop offset=".55" stopColor="#344c64"/><stop offset="1" stopColor="#293f56"/></linearGradient>
      <linearGradient id={id+'-shoe'} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#526e88"/><stop offset=".55" stopColor="#344e68"/><stop offset="1" stopColor="#21394f"/></linearGradient>
      <linearGradient id={id+'-cap'} x1=".2" y1="0" x2=".8" y2="1"><stop stopColor="#fff"/><stop offset=".7" stopColor="#f2f6f8"/><stop offset="1" stopColor="#d0dde6"/></linearGradient>
      <radialGradient id={id+'-cheek'}><stop stopColor="#e9907e" stopOpacity=".55"/><stop offset="1" stopColor="#e9907e" stopOpacity="0"/></radialGradient>
      <clipPath id={id+'-eye-left'}><ellipse cx="69" cy="62" rx="5.8" ry="7.3"/></clipPath>
      <clipPath id={id+'-eye-right'}><ellipse cx="92" cy="62" rx="5.8" ry="7.3"/></clipPath>
      <clipPath id={id+'-whites'}><ellipse cx="69" cy="62" rx="4.8" ry="6.3"/><ellipse cx="92" cy="62" rx="4.8" ry="6.3"/></clipPath>
    </defs>
    <ellipse className="boy-shadow" cx="80" cy="201" rx="32" ry="5" fill="#243b53" opacity=".16"/>
    <g className="boy-stool" opacity="0" stroke="#95745d" strokeWidth="1" strokeLinejoin="round">
      <path d="m60 158-4 39h6l5-39m27 0 7 39h6l-6-39" fill="#bd9776"/>
      <path d="M59 181h43" fill="none" stroke="#a98363" strokeWidth="3"/>
      <rect x="54" y="150" width="53" height="11" rx="5" fill="#e9c9a7"/>
      <path d="M59 153h41" stroke="#fff0d9" strokeWidth="1.6"/>
    </g>
    <g className="boy-rig" strokeLinecap="round" strokeLinejoin="round">
      <Leg id={id} side="R"/><Leg id={id} side="L"/>
      <g className="boy-hips">
        <path d="M60 133q20-6 40 0l1 13q-9 6-20 2-11 4-22-2Z" fill={'url(#'+id+'-pants)'}/>
        <path d="m81 140-.5 8" fill="none" stroke="#2c4359" strokeWidth=".7"/>
      </g>
      <g className="boy-upper-body">
        <g className="boy-torso">
        <path className="boy-body-shell" d="M61 95q19-9 38 0l7 39q-2 7-26 7t-26-7Z" fill={'url(#'+id+'-shirt)'} stroke="#a53e46" strokeWidth="1.1"/>
        <path d="m63 102-4 29q10 5 21 5" fill="none" stroke="#f7917d" strokeWidth="2" opacity=".7"/>
        <path d="M96 106q2 16 6 27-5 5-14 5" fill="#ad3546" opacity=".25"/>
        <path d="M72 84v10q8 8 16 0V84" fill={'url(#'+id+'-skin)'} stroke="#ba805f" strokeWidth=".9"/>
        <path d="M68 94q12 11 24 0" fill="none" stroke="#a63945" strokeWidth="3"/>
        <path d="M69 93q11 9 22 0" fill="none" stroke="#f89b86" strokeWidth="1.4"/>
        <rect x="75" y="108" width="12" height="14" rx="2" fill="#fff8ed" stroke="#c65b58" strokeWidth=".7"/>
        <circle cx="81" cy="114" r="3.6" fill="#438fbc"/>
        <path d="M78.5 114h5m-2.5-2.5v5" fill="none" stroke="#fff" strokeWidth=".8"/>
        <path d="M77 119h8" stroke="#b1cbd8" strokeWidth=".7"/>
        </g>
        <g className="boy-book" opacity="0">
          <path d="m56 121 24 4 24-4v26l-24 5-24-5Z" fill="#397ca5" stroke="#275c7b" strokeWidth="1"/>
          <path d="m59 124 21 4 21-4v19l-21 5-21-5Z" fill="#fff8e6" stroke="#e2d8c2" strokeWidth=".7"/>
          <path d="M80 128v20m-17-17 12 2m-12 3 12 2m10-5 12-2m-12 7 12-2" fill="none" stroke="#a7b7b7" strokeWidth=".8"/>
        </g>
        <Arm id={id} side="L"/><Arm id={id} side="R"/>
        <g className="boy-head">
          <ellipse cx="51" cy="61" rx="5.5" ry="8.2" fill={'url(#'+id+'-skin)'} stroke="#b27a5c" strokeWidth=".9"/>
          <ellipse cx="109" cy="61" rx="5.5" ry="8.2" fill={'url(#'+id+'-skin)'} stroke="#b27a5c" strokeWidth=".9"/>
          <path d="M50 59q4-4 4 3m54-3q-3-4-3 3" fill="none" stroke="#d29370" strokeWidth="1.2"/>
          <path className="boy-head-shell" d="M53 43q-1-22 27-23t28 23l-3 29q-4 17-24 18-22-1-27-18Z" fill={'url(#'+id+'-skin)'} stroke="#ac7457" strokeWidth="1"/>
          <path d="M53 59q-8-9-4-23 3-16 25-17 29-4 35 18l-2 21-5-12q-20 4-35-6l-9 10-1 10Z" fill="#48382f"/>
          <path d="M54 38q12-14 27-13" fill="none" stroke="#705348" strokeWidth="2" opacity=".55"/>
          <path className="boy-cap-shell" d="M50 35q1-23 29-24 28-1 31 27-29 6-60-3Z" fill={'url(#'+id+'-cap)'} stroke="#7f94a5" strokeWidth="1"/>
          <path d="M80 12q-7 8-6 23" stroke="#c3d0da" strokeWidth="1" fill="none"/>
          <path d="M54 28q5-11 19-13" stroke="#fff" strokeWidth="2.1" fill="none"/>
          <path className="boy-cap-brim" d="M50 34q27-4 59 3 10 3 5 7-33-1-62-5Z" fill="#f5f9fb" stroke="#859aab" strokeWidth="1"/>
          <path d="M55 37q26-1 48 3" stroke="#fff" strokeWidth="1.5" fill="none"/>
          <g className="boy-face">
            <path d="M63 52q6-3 12-1m11 0q6-2 12 2" stroke="#624237" strokeWidth="2" fill="none"/>
            <g className="boy-eyes">
              <ellipse cx="69" cy="62" rx="4.8" ry="6.3" fill="#fff"/>
              <ellipse cx="92" cy="62" rx="4.8" ry="6.3" fill="#fff"/>
              <g clipPath={'url(#'+id+'-whites)'}>
                <g className="boy-pupils">
                  <ellipse cx="70" cy="63" rx="2.7" ry="4" fill="#344a59"/><ellipse cx="93" cy="63" rx="2.7" ry="4" fill="#344a59"/>
                  <ellipse cx="70.3" cy="63.5" rx="1.4" ry="2.6" fill="#243442"/><ellipse cx="93.3" cy="63.5" rx="1.4" ry="2.6" fill="#243442"/>
                  <circle cx="70.6" cy="61" r="1.05" fill="#fff"/><circle cx="93.6" cy="61" r="1.05" fill="#fff"/>
                </g>
              </g>
              <rect className="boy-lid-left" x="63" y="54" width="12" height="0" fill="#f5bf97" clipPath={eyeClip('left')}/>
              <rect className="boy-lid-right" x="86" y="54" width="12" height="0" fill="#f0b58d" clipPath={eyeClip('right')}/>
              <path className="boy-lash-left" d="M65 62q4 3 8 0" fill="none" stroke="#99674f" strokeWidth=".9" opacity="0"/>
              <path className="boy-lash-right" d="M88 62q4 3 8 0" fill="none" stroke="#99674f" strokeWidth=".9" opacity="0"/>
            </g>
            <path d="m80 63-2 7q2 2 5 0" fill="none" stroke="#ce916e" strokeWidth="1"/>
            <ellipse cx="61" cy="73" rx="8" ry="4" fill={'url(#'+id+'-cheek)'}/><ellipse cx="100" cy="73" rx="8" ry="4" fill={'url(#'+id+'-cheek)'}/>
            <path className="boy-smile" d="M70 77q11 6 22-1-2 10-11 10-8 0-11-9Z" fill="#8d4d44" stroke="#a45e4e" strokeWidth=".6"/>
            <path d="M73 78q8 3 16-.5l-1 3q-7 3-13 0Z" fill="#fff7ed"/>
            <path d="M77 85q5-3 9-.6" fill="none" stroke="#d3877d" strokeWidth="1.6"/>
          </g>
        </g>
      </g>
    </g>
    <g className="boy-ball" opacity="0">
      <circle cx="126" cy="187" r="11" fill="#61afd0" stroke="#367c9e" strokeWidth="1"/>
      <path d="m126 177 4 7-4 7-5-7Zm0 14v7m-5-14-5-3m14 3 6-3" stroke="#eef9fc" strokeWidth="1.5" fill="none"/>
      <path d="M119 179q3-3 7-2" stroke="#b4e7ef" strokeWidth="1.5" fill="none"/>
    </g>
    <g className="boy-thought" opacity="0" fill="#fff" stroke="#b6cbdb" strokeWidth=".8">
      <circle cx="116" cy="38" r="3"/><circle cx="123" cy="27" r="4"/><rect x="113" y="3" width="40" height="19" rx="9"/>
      <g fill="#5c87a5" stroke="none"><circle cx="124" cy="12" r="1.5"/><circle cx="133" cy="12" r="1.5"/><circle cx="142" cy="12" r="1.5"/></g>
    </g>
  </svg>;
}
