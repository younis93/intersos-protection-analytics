import {createContext,memo,useContext,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Background,Controls,Handle,Position,ReactFlow,ReactFlowProvider,useReactFlow,useViewport,type NodeProps,type ReactFlowInstance} from '@xyflow/react';
import {ChevronDown,ChevronRight,Folder,Repeat,Workflow} from 'lucide-react';
import {flowItems,flowRelated,flowRepresentative,isQuestion,ROOT,TECHNICAL,type FlowData,type FlowItem,type FlowView} from './koboQuestionFlowModel';
import {layoutQuestionFlow,type DiagramNode,type FlowRouteData} from './koboQuestionFlowLayout';
import {QuestionPreview,type FlowText} from './koboQuestionFlowPresentation';
import '@xyflow/react/dist/style.css';
import KoboFlowRoute from './KoboFlowRoute';

type Actions={onSelect:(id:string)=>void;onToggle:(id:string)=>void;onPreview:(item:FlowItem|null)=>void;onOpenSection?:(id:string)=>void;t:FlowText};
const ActionsContext=createContext<Actions>(null!);
const FlowCard=memo(function FlowCard({id,data}:NodeProps<DiagramNode>){
 const {onSelect,onToggle,onPreview,onOpenSection,t}=useContext(ActionsContext),item=data.item,group=data.group,container=group&&!data.collapsed&&!data.horizontal&&id!==ROOT;
 return <div className={`qf-node${container?' qf-group-container':''}${group?' qf-group-node':''}${data.technical?' qf-technical-node':''}`} style={{'--qf-header-height':`${data.headerHeight}px`} as CSSProperties}>
  <Handle type="target" position={data.horizontal?Position.Left:Position.Top}/>
  <button className="qf-node-main nodrag" onClick={()=>group&&id!==ROOT?onToggle(id):item&&onSelect(id)} onMouseEnter={()=>item&&onPreview(item)} onMouseLeave={()=>onPreview(null)} onFocus={()=>item&&onPreview(item)} onBlur={()=>onPreview(null)} onKeyDown={event=>{if(event.key==='Escape')onPreview(null)}} aria-expanded={group&&id!==ROOT?!data.collapsed:undefined} aria-label={data.label}>
   <span className="qf-node-eyebrow">{group?<>{id===ROOT?<Workflow/>:item?.repeat?<Repeat/>:<Folder/>}{item?.repeat?t('Repeat group','مجموعة متكررة'):t('Group','مجموعة')}{id!==ROOT&&(data.collapsed?<ChevronRight/>:<ChevronDown/>)}</>:<>{t('QUESTION','سؤال')} {item&&isQuestion(item)?String(item.number).padStart(2,'0'):''}<span>{item&&isQuestion(item)?t(item.type==='calculate'?'Calculation':item.kind==='category'?'Single choice':item.kind==='multiple'?'Multiple choice':item.kind==='number'?'Number':item.kind==='date'?'Date':'Text',item.type==='calculate'?'حساب':item.kind==='category'?'اختيار واحد':item.kind==='multiple'?'اختيار متعدد':item.kind==='number'?'رقم':item.kind==='date'?'تاريخ':'نص'):''}</span></>}</span>
   <strong dir="auto">{data.label}</strong>
   {group?<small>{data.count} {t(data.count===1?'question':'questions','أسئلة')}</small>:<span className="qf-node-foot"><code>{item?.name}</code>{!!item?.connections.conditions.length&&<small>{t('Conditional','مشروط')}</small>}</span>}
   {!!item?.connections.issues.length&&<span className="qf-node-review">{t('Needs review','تحتاج مراجعة')}</span>}
  </button>
  {group&&item&&<button className="qf-node-group-details nodrag" onClick={()=>onSelect(id)} aria-label={t('Details: ','تفاصيل: ')+data.label}>{t('Details','التفاصيل')}</button>}
  {group&&item&&!data.technical&&onOpenSection&&<button className="qf-node-open-section nodrag" onClick={()=>onOpenSection(id)}>{t('Open section','فتح القسم')}</button>}
  <Handle type="source" position={data.horizontal?Position.Right:Position.Bottom}/>
 </div>;
});
const nodeTypes={flowCard:FlowCard};
const edgeTypes={flowRoute:KoboFlowRoute};
type Props={data:FlowData;view:Exclude<FlowView,'outline'>;collapsed:Set<string>;selected:string;matches:string[]|null;onToggle:(id:string)=>void;onSelect:(id:string)=>void;onOpenSection?:(id:string)=>void;layoutKey?:string;focusSectionId?:string;t:FlowText};
function DiagramContent({data,view,collapsed,selected,matches,onToggle,onSelect,onOpenSection,layoutKey,focusSectionId,t}:Props){
 const[graph,setGraph]=useState<(Awaited<ReturnType<typeof layoutQuestionFlow>>&{view:FlowView;layoutKey?:string})|null>(null),[error,setError]=useState(''),[preview,setPreview]=useState<FlowItem|null>(null),[busy,setBusy]=useState(true),[attempt,setAttempt]=useState(0);
 const[inspected,setInspected]=useState<FlowRouteData|null>(null),inspectionOpener=useRef<HTMLElement|null>(null),inspectionPanel=useRef<HTMLElement>(null);
 const {zoom}=useViewport();
 const flow=useReactFlow<DiagramNode>(),instance=useRef<ReactFlowInstance<DiagramNode>|null>(null),surface=useRef<HTMLDivElement>(null),initialized=useRef<string|null>(null),focused=useRef(''),viewports=useRef(new Map<string,{x:number;y:number;zoom:number}>());
 const items=useMemo(()=>flowItems(data),[data]),related=useMemo(()=>flowRelated(data,selected),[data,selected]);
 useEffect(()=>{let active=true;setBusy(true);setError('');setPreview(null);setInspected(null);layoutQuestionFlow(data,view,collapsed).then(next=>{if(active){setGraph({...next,view,layoutKey});setBusy(false)}}).catch(reason=>{if(active){setError(String(reason.message||reason));setBusy(false)}});return()=>{active=false}},[data,view,collapsed,attempt,layoutKey]);
 useEffect(()=>()=>{if(instance.current)viewports.current.set(`${view}:${layoutKey||''}`,instance.current.getViewport())},[view,layoutKey]);
 useEffect(()=>{
  if(!graph||graph.view!==view||graph.layoutKey!==layoutKey||!surface.current||initialized.current===`${view}:${layoutKey||''}`)return;
  const timer=setTimeout(()=>{
   const key=`${view}:${layoutKey||''}`,saved=viewports.current.get(key);initialized.current=key;
   if(saved){void instance.current?.setViewport(saved,{duration:0});return}
   const first=focusSectionId?data.questions.find(q=>q.groupPath.includes(focusSectionId)&&!q.metadata):undefined;const firstNode=first?graph.nodes.find(n=>n.id===first.id):undefined;if(firstNode){let x=firstNode.position.x,y=firstNode.position.y,parent=firstNode.parentId;while(parent){const ancestor=graph.nodes.find(n=>n.id===parent);if(!ancestor)break;x+=ancestor.position.x;y+=ancestor.position.y;parent=ancestor.parentId}const available=surface.current?.clientWidth||600;void instance.current?.setViewport({x:Math.max(24,(available-300*.9)/2)-x*.9,y:90-y*.9,zoom:.9},{duration:0});return}
   const roots=graph.nodes.filter(n=>!n.parentId),left=Math.min(0,...roots.map(n=>n.position.x)),right=Math.max(300,...roots.map(n=>n.position.x+Number(n.style?.width||300))),top=Math.min(0,...roots.map(n=>n.position.y)),available=surface.current?.clientWidth||600,zoom=.9;
   void instance.current?.setViewport({x:Math.max(24,(available-(right-left)*zoom)/2)-left*zoom,y:28-top*zoom,zoom},{duration:0});
  },80);
  return()=>clearTimeout(timer);
 },[graph,view,layoutKey,focusSectionId,data]);
 useEffect(()=>{
  if(!selected){focused.current='';return}
  if(!graph||graph.view!==view||focused.current===`${view}:${selected}`)return;
  const id=flowRepresentative(selected,items,collapsed);if(!graph.nodes.some(node=>node.id===id))return;
  const timer=setTimeout(()=>{focused.current=`${view}:${selected}`;const node=graph.nodes.find(n=>n.id===id)!,position=flow.getInternalNode(id)?.internals.positionAbsolute;if(node.data.group&&position)void flow.setCenter(position.x+Math.min(Number(node.style?.width)/2,170),position.y+node.data.headerHeight/2,{zoom:.95,duration:250});else void flow.fitView({nodes:[{id}],minZoom:.9,maxZoom:1,padding:.6,duration:250})},120);
  return()=>clearTimeout(timer);
 },[selected,graph,view,collapsed,items]);
 const nodes=useMemo(()=>graph?.nodes.map(node=>{const active=related.all.has(node.id)||[...related.all].some(id=>flowRepresentative(id,items,collapsed)===node.id),matched=!matches||matches.some(id=>flowRepresentative(id,items,collapsed)===node.id);return {...node,zIndex:2,selected:node.id===selected,className:`${node.id===selected?'qf-selected ':''}${selected&&active?'qf-related-node ':''}${!matched?'qf-search-muted ':''}${selected&&!active?'qf-unrelated-node':''}`,draggable:false,connectable:false,focusable:false}})||[],[graph,selected,matches,related,items,collapsed]);
 useEffect(()=>{if(!inspected)return;inspectionPanel.current?.focus({preventScroll:true});const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();setInspected(null);inspectionOpener.current?.focus({preventScroll:true})}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[inspected]);
 const edges=useMemo(()=>graph?.edges.map(edge=>{
  const route=edge.data as FlowRouteData|undefined;
  const active=!!selected&&!!route?.rules?.some(rule=>related.all.has(rule.source)&&related.all.has(rule.target));
  return {...edge,zIndex:1,focusable:false,data:route?{...route,showLabel:route.aggregated||active,onInspect:()=>{inspectionOpener.current=document.activeElement as HTMLElement|null;setInspected(route)}}:undefined,className:`${edge.className||''}${active?' qf-active-edge':''}`};
 })||[],[graph,selected,related]);
 const actions=useMemo(()=>({onSelect,onToggle,onPreview:setPreview,onOpenSection:view==='flowchart'?onOpenSection:undefined,t}),[onSelect,onToggle,onOpenSection,view,t]);
 return <ActionsContext.Provider value={actions}><div className="qf-diagram-surface" ref={surface}>
  {error?<div className="qf-canvas-status" role="alert"><p>{t('Unable to arrange this diagram. You can still use Outline.','تعذر ترتيب المخطط. يمكنك استخدام القائمة الهرمية.')}</p><small>{error}</small><button className="soft" onClick={()=>setAttempt(value=>value+1)}>{t('Retry','إعادة المحاولة')}</button></div>:<ReactFlow<DiagramNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} ariaLabelConfig={{'controls.fitView.ariaLabel':t('Fit overview','ملاءمة النظرة العامة')}} onInit={value=>{instance.current=value}} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} deleteKeyCode={null} minZoom={.01} maxZoom={1.8} onlyRenderVisibleElements zIndexMode="manual" elevateNodesOnSelect={false} elevateEdgesOnSelect={false} panOnScroll zoomOnScroll={false} zoomOnPinch panOnDrag preventScrolling zoomOnDoubleClick={false} aria-label={t('Interactive question flow','تدفق الأسئلة التفاعلي')} onPaneClick={()=>setPreview(null)}>
   <Background color="var(--line)" gap={22} size={1}/><Controls showInteractive={false} fitViewOptions={{padding:.15,minZoom:.01,maxZoom:1}} aria-label={t('Diagram controls','أدوات المخطط')}/>
  </ReactFlow>}
  <span className="qf-zoom-readout" aria-label={t('Zoom','التكبير')}>{Math.round(zoom*100)}%</span>
  {inspected&&<aside ref={inspectionPanel} tabIndex={-1} className="qf-connection-details glass" role="dialog" aria-label={t('Connection details','تفاصيل الروابط')}><header><h3>{t('Connection details','تفاصيل الروابط')}</h3><button type="button" className="soft" onClick={()=>{setInspected(null);inspectionOpener.current?.focus({preventScroll:true})}} aria-label={t('Close connection details','إغلاق تفاصيل الروابط')}>×</button></header>{inspected.rules.map(rule=><section key={rule.id}><strong dir="auto">{items.get(rule.source)?.label||rule.source} → {items.get(rule.target)?.label||rule.target}</strong><p dir="auto">{rule.label||t('Needs review','تحتاج مراجعة')}</p><code dir="ltr">{rule.expression}</code></section>)}</aside>}
  {busy&&<p className="qf-canvas-status" role="status">{t('Arranging questions...','جار ترتيب الأسئلة...')}</p>}
  {preview&&<div className="qf-preview glass" role="tooltip"><QuestionPreview item={preview} t={t}/></div>}
  {!busy&&!data.questions.length&&<p className="qf-canvas-status">{t('No questions to display. Use Show all to restore hidden questions.','لا توجد أسئلة للعرض. استخدم إظهار الكل لاستعادة الأسئلة المخفية.')}</p>}
  <div className="qf-diagram-legend">{view==='flowchart'?t('→ Visibility condition','← شرط الظهور'):t('Branches = questionnaire structure','الفروع = بنية الاستبيان')}</div>
 </div></ActionsContext.Provider>;
}
export default function KoboQuestionFlowDiagram(props:Props){return <ReactFlowProvider><DiagramContent {...props}/></ReactFlowProvider>}
