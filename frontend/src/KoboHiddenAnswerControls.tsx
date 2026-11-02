export function KoboHiddenAnswerControls({mode,onChange}:{mode:'adjust'|'keep-original';onChange:(mode:'adjust'|'keep-original')=>void}){
 return <div className="kobo-answer-percentage-buttons" role="group" aria-label="Hidden answer percentages" onPointerDown={event=>event.stopPropagation()} onClick={event=>event.stopPropagation()}>
  <button type="button" aria-label="Adjust percentages" aria-pressed={mode==='adjust'} title="Adjust percentages" onClick={()=>onChange('adjust')}>Adjust %</button>
  <button type="button" aria-label="Keep original percentages" aria-pressed={mode==='keep-original'} title="Keep original percentages" onClick={()=>onChange('keep-original')}>Keep original %</button>
 </div>;
}
