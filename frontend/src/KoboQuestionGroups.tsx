import {useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ChartNoAxesCombined,ChevronDown,Layers,Search,Table2,X} from 'lucide-react';
import type {KoboAnalysis,KoboResult} from './koboTypes';
import KoboActionMenu from './KoboActionMenu';
import type {KoboGroupControls} from './KoboDisplayOptions';
import {KoboSidebarGroups} from './KoboGroupNavigation';
import './koboQuestionGroups.css';
import './koboStickyControls.css';

type GroupNode={id:string;label:string;children:(GroupNode|KoboResult)[];ancestors:string[];depth:number;count:number};
const isGroup=(node:GroupNode|KoboResult):node is GroupNode=>'children' in node;
const targetId=(kind:'group'|'question',id:string)=>`kobo-${kind}-${encodeURIComponent(id)}`;
const GENERAL='@kobo/general';

function QuestionGroup({group,expanded,toggle,renderQuestion}:{group:GroupNode;expanded:Set<string>;toggle:(id:string)=>void;renderQuestion:(question:KoboResult)=>ReactNode}){
 const open=expanded.has(group.id),id=targetId('group',group.id);
 return <section className="kobo-question-group">
  <h2 id={id} className="kobo-group-heading" data-group-id={group.id} tabIndex={-1}><button type="button" aria-label={group.label} aria-expanded={open} aria-controls={`${id}-body`} onClick={()=>toggle(group.id)}><span>{group.label}<small>{group.count} questions</small></span><ChevronDown aria-hidden="true"/></button></h2>
  <div id={`${id}-body`} hidden={!open}>{open&&group.children.map(node=>isGroup(node)?<QuestionGroup key={`group:${node.id}`} group={node} expanded={expanded} toggle={toggle} renderQuestion={renderQuestion}/>:<div id={targetId('question',node.id)} className="kobo-question-target" key={`question:${node.id}`} tabIndex={-1} aria-label={node.label}>{renderQuestion(node)}</div>)}</div>
 </section>;
}

export default function KoboQuestionGroups({analysis,renderQuestion,tools,tableOnly,onTableOnlyChange,renderTable,renderFilters}:{analysis:KoboAnalysis;tableOnly:boolean;onTableOnlyChange:(value:boolean)=>void;renderTable:(groupId:string,questionSearch:string)=>ReactNode;renderQuestion:(question:KoboResult)=>ReactNode;tools?:ReactNode|((groups:KoboGroupControls)=>ReactNode);renderFilters?:(pinned:boolean)=>ReactNode}){
 const tree=useMemo(()=>{
  const groups=new Map(analysis.groups.map(group=>[group.id,group])),nodes=new Map<string,GroupNode>(),roots:GroupNode[]=[];
  const ensure=(id:string,seen=new Set<string>()):GroupNode=>{
   const existing=nodes.get(id);if(existing)return existing;
   const source=groups.get(id),node:GroupNode={id,label:id===GENERAL?'General':source?.label||id,children:[],ancestors:[],depth:0,count:0};nodes.set(id,node);seen.add(id);
   if(source?.parent&&!seen.has(source.parent)){const parent=ensure(source.parent,seen);node.ancestors=[...parent.ancestors,parent.id];node.depth=node.ancestors.length;parent.children.push(node)}else roots.push(node);
   return node;
  };
  for(const question of analysis.questions){const node=ensure(question.group||GENERAL);node.children.push(question);node.count++;for(const id of node.ancestors)nodes.get(id)!.count++}
  const order=new Map(analysis.groups.map((group,index)=>[group.id,index]));roots.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));
  const list:GroupNode[]=[];const visit=(node:GroupNode)=>{list.push(node);const children=node.children.filter(isGroup).sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));let index=0;node.children=node.children.map(child=>isGroup(child)?children[index++]:child);children.forEach(visit)};roots.forEach(visit);
  const defaults=new Set<string>();let first:GroupNode|undefined=roots[0];while(first){defaults.add(first.id);const child:GroupNode|KoboResult|undefined=first.children[0];first=child&&isGroup(child)?child:undefined}
  return{roots,nodes,list,defaults};
 },[analysis]);
 const[expanded,setExpanded]=useState(()=>tree.defaults),[search,setSearch]=useState(''),[active,setActive]=useState(tree.roots[0]?.id||''),[jump,setJump]=useState<{kind:'group'|'question';id:string;serial:number}|null>(null);
 const[tableGroup,setTableGroup]=useState('@all');
 const[questionSearch,setQuestionSearch]=useState(''),[searchCollapsed,setSearchCollapsed]=useState<{query:string;ids:Set<string>}>({query:'',ids:new Set()});
 useEffect(()=>{if(!tree.nodes.has(active))setActive(tree.roots[0]?.id||'')},[tree,active]);
 const questionQuery=questionSearch.trim().normalize('NFC').toLocaleLowerCase();
 useEffect(()=>{if(!questionQuery)setSearchCollapsed(current=>current.query?{query:'',ids:new Set()}:current)},[questionQuery]);
 const filtered=useMemo(()=>{
  const matches=(question:KoboResult)=>`${question.label} ${question.name} ${question.id}`.normalize('NFC').toLocaleLowerCase().includes(questionQuery);
  const prune=(group:GroupNode):GroupNode=>{const children=group.children.map(child=>isGroup(child)?prune(child):child).filter(child=>isGroup(child)?child.count>0:matches(child));return {...group,children,count:children.reduce((count,child)=>count+(isGroup(child)?child.count:1),0)}};
  return questionQuery?{roots:tree.roots.map(prune).filter(group=>group.count>0),count:analysis.questions.filter(matches).length}:{roots:tree.roots,count:analysis.questions.length};
 },[tree,analysis.questions,questionQuery]);
 const effectiveExpanded=useMemo(()=>questionQuery?new Set(tree.list.filter(group=>searchCollapsed.query!==questionQuery||!searchCollapsed.ids.has(group.id)).map(group=>group.id)):expanded,[questionQuery,tree,expanded,searchCollapsed]);
 const host=useRef<HTMLDivElement>(null),toolbar=useRef<HTMLDivElement>(null);
 const sentinel=useRef<HTMLSpanElement>(null),[pinned,setPinned]=useState(false);
 const previousView=useRef(tableOnly);
 useLayoutEffect(()=>{if(previousView.current===tableOnly)return;previousView.current=tableOnly;host.current?.scrollIntoView({block:'start',behavior:'instant'})},[tableOnly]);
 const toggle=(id:string)=>{if(questionQuery){setSearchCollapsed(current=>{const ids=new Set(current.query===questionQuery?current.ids:[]);if(ids.has(id))ids.delete(id);else ids.add(id);return{query:questionQuery,ids}});return}toggleNormal(id)};
 const toggleNormal=(id:string)=>setExpanded(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next});
 const navigate=(group:GroupNode,question?:KoboResult)=>{if(tableOnly){setTableGroup(group.id);setQuestionSearch('');return}setQuestionSearch('');setExpanded(current=>new Set([...current,...group.ancestors,group.id]));setActive(group.id);setJump(current=>({kind:question?'question':'group',id:question?.id||group.id,serial:(current?.serial||0)+1}));setSearch('')};
 useLayoutEffect(()=>{
  if(!jump||tableOnly)return;const node=document.getElementById(targetId(jump.kind,jump.id));
  const align=()=>node?.scrollIntoView({block:'start',behavior:'instant'});
  align();node?.focus({preventScroll:true});
  // Deferred content can settle after the jump. Briefly anchor its heading, yielding to user input.
  let frame=requestAnimationFrame(align);
  const resize=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(align)});
  if(host.current)resize.observe(host.current);
  const events=['wheel','touchstart','pointerdown','keydown'] as const;
  const stop=()=>{cancelAnimationFrame(frame);resize.disconnect();events.forEach(event=>window.removeEventListener(event,stop));clearTimeout(timer)};
  const timer=setTimeout(stop,750);
  events.forEach(event=>window.addEventListener(event,stop,{passive:true}));
  return stop;
 },[jump,tableOnly]);
 useEffect(()=>{
  const node=host.current,bar=toolbar.current;if(!node||!bar)return;
  const topbar=node.closest('.kobo-shell')?.querySelector<HTMLElement>('.topbar');
  let root:HTMLElement|null=node.parentElement;while(root&&!(root.scrollHeight>root.clientHeight+1&&/auto|scroll/.test(getComputedStyle(root).overflowY)))root=root.parentElement;
  const headings=Array.from(node.querySelectorAll<HTMLElement>(tableOnly?'.kobo-no-heading':'.kobo-group-heading'));let observer:IntersectionObserver|undefined,pinObserver:IntersectionObserver|undefined;
  const observe=()=>{
   const top=topbar?.getBoundingClientRect().height||0,offset=top+bar.getBoundingClientRect().height+24;
   node.style.setProperty('--kobo-nav-top',`${top+8}px`);
   pinObserver?.disconnect();
   pinObserver=new IntersectionObserver(([entry])=>setPinned(!entry.isIntersecting&&entry.boundingClientRect.top<(entry.rootBounds?.top??top+8)),{root,rootMargin:`-${top+8}px 0px 0px 0px`,threshold:0});
   if(sentinel.current)pinObserver.observe(sentinel.current);
   node.style.setProperty('--kobo-jump-offset',`${offset}px`);
   observer?.disconnect();
   observer=new IntersectionObserver(()=>{
    const boundary=(root?.getBoundingClientRect().top||0)+offset+1;
    // Measure group headings only when a boundary is crossed, never question cards per scroll frame.
    let current=headings[0];for(const heading of headings){if(heading.getBoundingClientRect().top<=boundary)current=heading;else break}
    if(current?.dataset.groupId)setActive(current.dataset.groupId);
   },{root,rootMargin:`-${offset}px 0px 0px 0px`,threshold:0});
   headings.forEach(heading=>observer!.observe(heading));
  };
  observe();const resize=new ResizeObserver(observe);resize.observe(bar);if(topbar)resize.observe(topbar);
  return()=>{resize.disconnect();observer?.disconnect();pinObserver?.disconnect()};
 },[tree,effectiveExpanded,questionQuery,tableOnly]);
 const setAllGroups=(open:boolean)=>{if(questionQuery)setSearchCollapsed({query:questionQuery,ids:new Set(open?[]:tree.list.map(group=>group.id))});else setExpanded(new Set(open?tree.list.map(group=>group.id):[]))};
 const groupControls:KoboGroupControls={expandAll:()=>setAllGroups(true),collapseAll:()=>setAllGroups(false),allExpanded:tree.list.every(group=>effectiveExpanded.has(group.id)),allCollapsed:tree.list.every(group=>!effectiveExpanded.has(group.id))};
 const query=search.trim().toLocaleLowerCase();
 return <div ref={host} className="kobo-analysis-sections">
  <KoboSidebarGroups groups={tree.list} active={tableOnly?tableGroup:active} onNavigate={id=>{const group=tree.nodes.get(id);if(group)navigate(group)}} language={analysis.settings.language}/>
  <span ref={sentinel} className="kobo-controls-sentinel" aria-hidden="true"/>
  <div ref={toolbar} className={`kobo-sticky-controls${pinned?' is-pinned':''}`} aria-label="Analysis controls">
   {renderFilters&&<div className="kobo-sticky-filter-slot">{renderFilters(pinned)}</div>}
   <div className="kobo-analysis-toolbar" aria-label="Analysis navigation">
   <div className="kobo-analysis-toolbar-header">
   <div className="kobo-analysis-heading"><span className="kobo-section-icon"><ChartNoAxesCombined aria-hidden="true"/></span><div><h2>Questions & charts</h2><small>{questionQuery?`${filtered.count} of ${analysis.questions.length} questions`:`${analysis.questions.length} questions shown`}</small></div></div>
    <div className="kobo-analysis-view-switch" role="group" aria-label="Analysis view"><button type="button" aria-label="Charts view" aria-pressed={!tableOnly} onClick={()=>onTableOnlyChange(false)} title="Tables and charts"><ChartNoAxesCombined aria-hidden="true"/>{'Charts view'}</button><button type="button" aria-label="Table view" aria-pressed={tableOnly} onClick={()=>onTableOnlyChange(true)} title="Browse response rows and columns"><Table2 aria-hidden="true"/>{'Table view'}</button></div>
    <div className="kobo-analysis-tools">{typeof tools==='function'?tools(groupControls):tools}</div>
   </div>
   <div className="kobo-analysis-toolbar-controls">
   <label className="kobo-question-search"><Search aria-hidden="true"/><input aria-label="Search questions" placeholder="Search questions…" value={questionSearch} onChange={event=>setQuestionSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setQuestionSearch('')}}/>{questionSearch&&<button type="button" className="soft" aria-label="Clear question search" onClick={()=>setQuestionSearch('')}><X aria-hidden="true"/></button>}</label>
   <KoboActionMenu label={tableOnly?(tree.nodes.get(tableGroup)?.label||'All groups'):(tree.nodes.get(active)?.label||'View group')} ariaLabel="Navigate questions" icon={<Layers aria-hidden="true"/>} className="kobo-navigator">
    <label className="kobo-navigator-search"><Search aria-hidden="true"/><input aria-label="Find a question or group" placeholder="Find a question or group" value={search} onChange={event=>setSearch(event.target.value)}/></label>
    <div className="kobo-navigator-results">{tableOnly&&<button type="button" className="kobo-nav-group" aria-current={tableGroup==='@all'?'location':undefined} onClick={()=>{setTableGroup('@all');setQuestionSearch('')}}>All groups</button>}{tree.list.map(group=>{
     const groupMatch=group.label.toLocaleLowerCase().includes(query),questions=group.children.filter((child):child is KoboResult=>!isGroup(child)).filter(question=>`${question.label} ${question.name}`.toLocaleLowerCase().includes(query));
     if(query&&!groupMatch&&!questions.length)return null;
     return <div key={group.id} style={{paddingInlineStart:Math.min(group.depth,3)*12}}><button type="button" className="kobo-nav-group" aria-current={(tableOnly?tableGroup:active)===group.id?'location':undefined} onClick={()=>navigate(group)}><span>{group.label}</span><small>{group.count}</small></button>{!tableOnly&&query&&questions.map(question=><button type="button" key={question.id} className="kobo-nav-question" onClick={()=>navigate(group,question)}><span>{question.label}</span><small>{question.name}</small></button>)}</div>;
    })}{query&&!tree.list.some(group=>group.label.toLocaleLowerCase().includes(query))&&!analysis.questions.some(question=>`${question.label} ${question.name}`.toLocaleLowerCase().includes(query))&&<p className="kobo-nav-empty" role="status">No matching questions or groups.</p>}</div>
   </KoboActionMenu>
   </div>
  </div>
  </div>
  {questionQuery&&<p className="kobo-search-scope" role="status">Exports include all enabled questions. Search only changes this view.</p>}
  {!tableOnly&&questionQuery&&!filtered.count&&<div className="glass kobo-empty"><h3>No matching questions</h3><p>Try another question title, name, or identifier.</p><button className="soft" onClick={()=>setQuestionSearch('')}>Clear search</button></div>}
  {tableOnly&&renderTable(tableGroup,questionSearch)}
  <div className="kobo-analysis-card-list" hidden={tableOnly}>{filtered.roots.map(group=><QuestionGroup key={group.id} group={group} expanded={effectiveExpanded} toggle={toggle} renderQuestion={renderQuestion}/>)}</div>
 </div>;
}
