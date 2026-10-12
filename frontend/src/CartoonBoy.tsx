import {useId} from 'react';

/** Original vector character with independently articulated joints. */
export function CartoonBoy(){
  const id=useId().replace(/:/g,'');
  return <svg className="cartoon-boy" viewBox="0 0 160 210" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-skin`} x2=".8" y2="1"><stop stopColor="#ffdab8"/><stop offset="1" stopColor="#eda981"/></linearGradient>
      <linearGradient id={`${id}-shirt`} x2="1" y2="1"><stop stopColor="#ef655a"/><stop offset="1" stopColor="#b8313b"/></linearGradient>
      <linearGradient id={`${id}-pants`} x2="1" y2="1"><stop stopColor="#36435c"/><stop offset="1" stopColor="#1c273c"/></linearGradient>
      <linearGradient id={`${id}-cap`} x2=".5" y2="1"><stop stopColor="#fff"/><stop offset="1" stopColor="#d8e6ef"/></linearGradient>
    </defs>
    <ellipse className="boy-shadow" cx="80" cy="201" rx="33" ry="5" fill="#243b53" opacity=".16"/>
    <g className="boy-stool" stroke="#866a50" strokeWidth="1.2"><path d="m59 158-4 40h6l6-40m27 0 7 40h6l-5-40" fill="#c5a27e"/><rect x="54" y="151" width="53" height="10" rx="4" fill="#e3c29b"/><path d="M60 182h40" fill="none"/></g>
    <g className="boy-rig" stroke="#533e3b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <g className="boy-leg boy-leg-back">
        <path d="M82 137h18l-3 30H83z" fill={`url(#${id}-pants)`}/>
        <g className="boy-shin boy-shin-back"><path d="M83 164h14l-1 27H82z" fill={`url(#${id}-pants)`}/><path d="M82 187h14l8 7q3 5-3 5H81q-4-2 1-12" fill="#25324b"/><path d="M81 197h22" stroke="#f3f7fa" strokeWidth="3"/></g>
      </g>
      <g className="boy-leg boy-leg-front">
        <path d="M62 137h19l-1 30H64z" fill={`url(#${id}-pants)`}/>
        <g className="boy-shin boy-shin-front"><path d="M64 164h15l-2 27H64z" fill={`url(#${id}-pants)`}/><path d="M64 187h13l3 9q0 4-6 3H56q-5-3 1-7z" fill="#25324b"/><path d="M55 197h24" stroke="#f3f7fa" strokeWidth="3"/></g>
      </g>
      <g className="boy-upper-body">
        <g className="boy-arm boy-arm-left">
          <path d="M59 97q-12 0-15 18l10 4 12-17" fill={`url(#${id}-shirt)`}/>
          <path d="m46 114-4 19q-1 5 4 7l8-2 2-20" fill={`url(#${id}-skin)`}/>
          <g className="boy-forearm boy-forearm-left"><path d="m44 133-1 17q-2 8 3 10 5 2 7-4l2-18" fill={`url(#${id}-skin)`}/><path d="m48 150 3-3" fill="none"/></g>
        </g>
        <path d="M62 93q18-6 36 0l8 43q-24 11-49 0z" fill={`url(#${id}-shirt)`}/>
        <path d="M71 86v11q9 9 18 0V85" fill={`url(#${id}-skin)`}/>
        <path d="M69 96q11 9 22 0" fill="none" stroke="#952a34" strokeWidth="2"/>
        <path d="m64 126 2 8m31-7-1 7" stroke="#f78477" fill="none"/>
        <rect x="76" y="108" width="10" height="11" rx="1" fill="#fff" stroke="none" opacity=".9"/><circle cx="81" cy="113.5" r="3.3" fill="#438cc4" stroke="none"/><path d="M78 113.5h6m-3-3v6" stroke="#fff" strokeWidth=".65"/>
        <g className="boy-arm boy-arm-right">
          <path d="M99 97q13 1 16 17l-11 5-11-17" fill={`url(#${id}-shirt)`}/>
          <path d="m105 116 2 19q1 6 7 5l4-5-4-20" fill={`url(#${id}-skin)`}/>
          <g className="boy-forearm boy-forearm-right"><path d="m108 133 2 18q-2 6 2 9 5 3 8-3l-1-21" fill={`url(#${id}-skin)`}/><path d="m114 151 3-3" fill="none"/></g>
        </g>
        <g className="boy-head">
          <ellipse cx="57" cy="66" rx="6" ry="9" fill={`url(#${id}-skin)`}/><ellipse cx="102" cy="66" rx="6" ry="9" fill={`url(#${id}-skin)`}/>
          <path d="M57 53q0-23 24-23 25 0 24 26l-4 20q-3 15-20 16-20 0-24-17z" fill={`url(#${id}-skin)`}/>
          <path d="M58 64q-6-10-4-22 2-15 19-17 27-7 33 14l-2 24-6-15q-17 5-28-4l-8 10z" fill="#473631"/>
          <path d="M56 42q0-25 25-26 25 0 27 25-22 6-52 1" fill={`url(#${id}-cap)`}/>
          <path d="M81 17q-8 8-7 23" stroke="#bfcedb" fill="none"/>
          <path d="M56 40q29-6 55 3 5 2 0 6-25 0-53-4z" fill="#f5f9fc"/>
          <path d="m67 57 8-1m13 0 8 2" stroke="#674539" strokeWidth="2"/>
          <g className="boy-eyes" stroke="none"><ellipse cx="71" cy="65" rx="4" ry="5.5" fill="#fff"/><ellipse cx="92" cy="65" rx="4" ry="5.5" fill="#fff"/><g className="boy-pupils"><ellipse cx="72" cy="66" rx="2.2" ry="3.4" fill="#30394b"/><ellipse cx="93" cy="66" rx="2.2" ry="3.4" fill="#30394b"/><circle cx="72.5" cy="64.5" r=".8" fill="#fff"/><circle cx="93.5" cy="64.5" r=".8" fill="#fff"/></g></g>
          <path d="m81 67-2 6h4" fill="none" stroke="#cb8a6e"/>
          <ellipse cx="64" cy="75" rx="4" ry="2" fill="#e99585" opacity=".5" stroke="none"/><ellipse cx="98" cy="75" rx="4" ry="2" fill="#e99585" opacity=".5" stroke="none"/>
          <path className="boy-smile" d="M73 79q8 9 16 0-8 3-16 0" fill="#8d4e45"/><path d="M76 80h10" stroke="#fff" strokeWidth="2"/>
        </g>
      </g>
      <g className="boy-book"><path d="m57 121 23 4 23-4v26l-23 5-23-5z" fill="#447fb2"/><path d="m61 124 19 4 19-4v19l-19 5-19-5z" fill="#f2f6e9"/><path d="M80 128v20m-15-17 10 2m-10 4 10 2m10-6 10-2m-10 8 10-2" fill="none" stroke="#9caeb1"/></g>
    </g>
    <g className="boy-ball"><circle cx="126" cy="187" r="11" fill="#5caed6" stroke="#236a98" strokeWidth="1.2"/><path d="m126 177 4 7-4 7-5-7zm0 14v7m-5-14-5-3m14 3 6-3" stroke="#f0f8ff" strokeWidth="1.5" fill="none"/></g>
    <g className="boy-thought" fill="#fff" stroke="#b6cbdb"><circle cx="116" cy="38" r="3"/><circle cx="123" cy="27" r="4"/><rect x="113" y="3" width="40" height="19" rx="9"/><g fill="#5c87a5" stroke="none"><circle cx="124" cy="12" r="1.5"/><circle cx="133" cy="12" r="1.5"/><circle cx="142" cy="12" r="1.5"/></g></g>
  </svg>;
}
