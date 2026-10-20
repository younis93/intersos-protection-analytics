import {ChevronsDownUp,ChevronsUpDown,Palette,RotateCcw,SlidersHorizontal} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import KoboActionMenu from './KoboActionMenu';
import {koboDisplayDefaults} from './koboBulkSettings';
import type {KoboSettings} from './koboTypes';
import {allQuestionValueDisplay,sharedValueDisplay} from './koboValueDisplay';
import './koboDisplayOptions.css';
import KoboSegmentedControl from './KoboSegmentedControl';
export type KoboGroupControls={expandAll:()=>void;collapseAll:()=>void;allExpanded:boolean;allCollapsed:boolean};
export default function KoboDisplayOptions({settings,questionIds,onChange,onCustomizeAll,groups,busy}:{settings:KoboSettings;questionIds:readonly string[];onChange:(settings:KoboSettings)=>void;onCustomizeAll:()=>void;groups:KoboGroupControls;busy:boolean}){
 const changed=settings.questionSort!==koboDisplayDefaults.questionSort||(settings.percentageDecimals??0)!==0;
 const values=sharedValueDisplay(settings,questionIds);
 return <KoboActionMenu className="kobo-display-options" label="Display options" icon={<SlidersHorizontal aria-hidden="true"/>} closeOnSelect={false}>
  <div className="kobo-options-popup">
   <header className="kobo-options-heading"><strong>Display options</strong><small>Arrange and style your analysis</small></header>
   <div className="kobo-options-body" role="region" aria-label="Display controls" tabIndex={0}>
   <button className="kobo-options-customize" type="button" aria-label="Customize all questions" disabled={busy} onClick={onCustomizeAll}><Palette aria-hidden="true"/><span><strong>Customize all questions</strong><small>Charts, colors and up to 3 breakdowns</small></span></button>
   <section className="kobo-options-section kobo-options-values"><h3>Values & percentages</h3><div className="kobo-options-control"><span>Values for all questions</span><KoboSegmentedControl label="Values for all questions" disabled={!questionIds.length} value={values} options={[["count","#","Counts"],["percent","%","Percentages"],["both","Both","Counts and percentages"]]} onChange={value=>onChange(allQuestionValueDisplay(settings,questionIds,value))}/>{!values&&<small className="kobo-value-custom">Mixed / Custom</small>}</div><small>Updates every table and chart, including hidden questions.</small><div className="kobo-options-control"><span>Percentage decimal places</span><div className="kobo-options-precision"><KoboSegmentedControl label="Percentage decimal places" value={settings.percentageDecimals??0} options={[[0,"0","0 decimal places"],[1,"1","1 decimal place"],[2,"2","2 decimal places"]]} onChange={value=>onChange({...settings,percentageDecimals:value})}/><small className="kobo-options-example" aria-live="polite">Example: <strong>{(42).toFixed(settings.percentageDecimals??0)}%</strong></small></div></div><small>Single-answer distributions total 100%. Multiple-choice percentages may exceed 100%.</small></section>
   <section className="kobo-options-section"><h3>Organization</h3><AppSelect label="Question order" value={settings.questionSort} options={[["form","Form order"],["name-asc","Question name A-Z"],["name-desc","Question name Z-A"],["answered-desc","Answered high to low"],["answered-asc","Answered low to high"]]} onChange={value=>onChange({...settings,questionSort:value as KoboSettings['questionSort']})}/>
    <div className="kobo-options-group-actions"><button type="button" disabled={groups.allExpanded} onClick={groups.expandAll}><ChevronsUpDown/>Expand all groups</button><button type="button" disabled={groups.allCollapsed} onClick={groups.collapseAll}><ChevronsDownUp/>Collapse all groups</button></div>
   </section>
   <section className="kobo-options-section"><h3>Survey labels</h3><AppSelect label="Survey label language" value={settings.language} options={[["en","English"],["ar","Arabic"]]} onChange={value=>onChange({...settings,language:value as KoboSettings['language']})}/></section>

   </div>
   <footer className="kobo-options-footer"><button type="button" disabled={!changed} onClick={()=>onChange({...settings,questionSort:koboDisplayDefaults.questionSort,percentageDecimals:0})}><RotateCcw/>Reset display options</button><small>Resets question order and percentage precision.</small></footer>
  </div>
 </KoboActionMenu>;
}
