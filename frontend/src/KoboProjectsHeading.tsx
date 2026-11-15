import {Calculator,FolderInput,Plus} from 'lucide-react';
import type {ReactNode} from 'react';
import './koboProjects.css';

export function KoboProjectsHeading({custom,onCreate,onCalculator,calculatorIcon,importAction}:{custom:boolean;onCreate?:()=>void;onCalculator?:()=>void;calculatorIcon?:ReactNode;importAction?:ReactNode}){
 return <section className="kobo-page-heading kobo-projects-heading">
  <div><span className="eyebrow">{custom?'CUSTOM ANALYSIS':'SURVEY ANALYSIS'}</span><h1>{custom?'Your Custom Analysis projects':'Your Kobo projects'}</h1></div>
  <div className={`sample-project-actions kobo-project-header-actions${importAction?' has-restore':''}`}>
   {!custom&&<button type="button" className="soft sample-calculator-button" disabled={!onCalculator} onClick={onCalculator}>{calculatorIcon??<Calculator aria-hidden="true"/>}Sample size calculator</button>}
   {importAction}
   <button type="button" className="primary" disabled={!onCreate} onClick={onCreate}><Plus aria-hidden="true"/> New project</button>
  </div>
 </section>;
}

export function KoboProjectsLoadingHeading({custom}:{custom:boolean}){
 return <KoboProjectsHeading custom={custom} importAction={<div className="kobo-backup-restore"><button type="button" className="soft kobo-restore-button" disabled><FolderInput aria-hidden="true"/>Import project</button></div>}/>;
}
