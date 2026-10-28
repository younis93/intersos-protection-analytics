import {ChevronRight,Download,FolderInput,LoaderCircle} from 'lucide-react';
import './legalProjectTransfer.css';

export default function LegalProjectTransfer({canExport,exporting,onImport,onExport}:{canExport:boolean;exporting:boolean;onImport:()=>void;onExport:()=>void}){
 return <div className="legal-project-transfer" role="group" aria-label="Project backup">
  <div className="legal-project-transfer-heading"><span>Project backup</span><span className="legal-project-format">ZIP / Protected</span></div>
  <button type="button" role="menuitem" className="legal-project-action" onClick={onImport}>
   <span className="legal-project-action-icon" aria-hidden="true"><FolderInput/></span>
   <span className="legal-project-action-copy"><strong>Import project</strong><small>Open a ZIP or protected project and replace this workspace.</small></span>
   <ChevronRight className="legal-project-action-arrow" aria-hidden="true"/>
  </button>
  <button type="button" role="menuitem" className="legal-project-action" disabled={!canExport||exporting} aria-busy={exporting} onClick={onExport}>
   <span className={`legal-project-action-icon${exporting?' is-loading':''}`} aria-hidden="true">{exporting?<LoaderCircle/>:<Download/>}</span>
   <span className="legal-project-action-copy"><strong>{exporting?'Exporting project...':'Export project'}</strong><small>{canExport?'Save data and review decisions, with optional encryption.':'Load data to export a project ZIP.'}</small></span>
   <ChevronRight className="legal-project-action-arrow" aria-hidden="true"/>
  </button>
 </div>;
}
