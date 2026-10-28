import {analysisWorkspace} from './koboApi';
import {KoboProjectImportButton,useKoboProjectImport} from './KoboProjectImport';
import {useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowDownUp,ChartNoAxesCombined,Plus,Search} from 'lucide-react';
import {AppSelect} from './SelectionControls';
import {SearchField} from './TableControls';
import KoboProjectCard from './KoboProjectCard';
import SampleSizeCalculator,{SampleCalculatorIcon} from './SampleSizeCalculator';
import {matchingKoboProjects,type KoboProjectListItem,type KoboProjectSort} from './koboProjectList';
import './koboProjects.css';

const sortOptions:[KoboProjectSort,string][]=[['date-desc','Last updated · Newest first'],['date-asc','Last updated · Oldest first'],['name-asc','Name · A to Z'],['name-desc','Name · Z to A']];

export default function KoboProjects({projects,onCreate,onRename,onDelete,headerAction,headerFeedback,onImported}:{onImported?:(id:string)=>void;headerAction?:ReactNode;headerFeedback?:ReactNode;projects:KoboProjectListItem[];onCreate:()=>void;onRename:(project:KoboProjectListItem)=>void;onDelete:(project:KoboProjectListItem)=>void}){
 const custom=analysisWorkspace()==='custom';
 const projectImport=useKoboProjectImport(onImported);
 const importButton=()=>onImported?<KoboProjectImportButton busy={projectImport.busy} onClick={projectImport.open}/>:null;
 const[search,setSearch]=useState(''),[sort,setSort]=useState<KoboProjectSort>('date-desc');
 const toolbar=useRef<HTMLElement>(null);
 const[calculatorOpen,setCalculatorOpen]=useState(false);
 const visible=useMemo(()=>matchingKoboProjects(projects,search,sort),[projects,search,sort]);
 return <>
  {onImported&&projectImport.fileInput}
  <section className="kobo-page-heading kobo-projects-heading"><div><span className="eyebrow">{custom?'CUSTOM ANALYSIS':'SURVEY ANALYSIS'}</span><h1>{custom?'Your Custom Analysis projects':'Your Kobo projects'}</h1></div><div className={`sample-project-actions kobo-project-header-actions${headerAction||onImported?' has-restore':''}`}>{!custom&&<button type="button" className="soft sample-calculator-button" onClick={()=>setCalculatorOpen(true)}><SampleCalculatorIcon/>Sample size calculator</button>}{headerAction??importButton()}<button type="button" className="primary" onClick={onCreate}><Plus/> New project</button></div></section>
  {headerFeedback}
  {!custom&&calculatorOpen&&<SampleSizeCalculator onClose={()=>setCalculatorOpen(false)}/>}
  {!!projects.length&&<section ref={toolbar} className="glass kobo-project-toolbar" aria-label="Project search and sorting">
   <SearchField label="Search projects" placeholder="Search projects by name…" value={search} onChange={setSearch} clearable/>
   <p className="kobo-project-count" role="status" aria-live="polite"><strong>{visible.length.toLocaleString()}</strong>{search.trim()?` of ${projects.length.toLocaleString()} projects`:visible.length===1?'project':'projects'}</p>
   <AppSelect label="Sort by" ariaLabel="Sort projects" icon={ArrowDownUp} value={sort} options={sortOptions} onChange={value=>setSort(value as KoboProjectSort)}/>
  </section>}
  <div className="kobo-projects">{visible.map(project=><KoboProjectCard key={project.id} project={project} onRename={()=>onRename(project)} onDelete={()=>onDelete(project)}/>)}</div>
  {!!projects.length&&!visible.length&&<section className="glass kobo-empty kobo-project-no-results"><Search aria-hidden="true"/><h2>No projects found</h2><p>Try another project name or clear your search.</p><button type="button" className="soft" onClick={()=>{setSearch('');toolbar.current?.querySelector('input')?.focus()}}>Clear search</button></section>}
  {!projects.length&&<section className="glass kobo-empty kobo-welcome"><ChartNoAxesCombined/><h2>{custom?'From your spreadsheet to a clear report':'From Kobo responses to a clear report'}</h2><p>{custom?'Upload an Excel workbook or CSV file, review your columns and start analyzing.':'Upload an XLSForm with an Excel or CSV export to get started.'} Your projects and settings stay on this computer.</p><div className="kobo-welcome-actions"><button type="button" className="primary" onClick={onCreate}>Create your first project</button>{importButton()}</div></section>}
 </>;
}
