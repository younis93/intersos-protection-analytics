export interface ProcessingCardBounds {width:number;height:number}
export const processingCardHandoffEvent='workspace-processing-handoff';
export function processingCardDuration(){return 900;}
let pending:ProcessingCardBounds|null=null;
let desktopRead=false;

export function queueProcessingCardHandoff(bounds:ProcessingCardBounds){
  pending={width:bounds.width,height:bounds.height};
  window.dispatchEvent(new Event(processingCardHandoffEvent));
}

export function takeProcessingCardHandoff():ProcessingCardBounds|null{
  if(pending){const bounds=pending;pending=null;return bounds;}
  if(desktopRead)return null;
  desktopRead=true;
  const params=new URLSearchParams(window.location.search);
  const epoch=Number(params.get('startupEpoch'));
  const width=Number(params.get('startupCardWidth')),height=Number(params.get('startupCardHeight'));
  if(!Number.isFinite(epoch)||epoch<=0||Date.now()-epoch>30000)return null;
  return Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0?{width,height}:null;
}

export function animateProcessingCardSize(card:HTMLElement,bounds:ProcessingCardBounds){
  const previousAnimation=card.style.animation,previousOverflow=card.style.overflow;
  card.style.animation='none';
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!card.animate)return()=>{card.style.animation=previousAnimation;};
  card.style.overflow='visible';
  const surface=card.querySelector<HTMLElement>('.legal-processing-card-surface')||card;
  const target=surface.getBoundingClientRect();
  const body=card.querySelector<HTMLElement>('.legal-processing-card-content');
  const previousBodyStyle=body?.getAttribute('style');
  if(body)body.style.display='flow-root';
  const start={width:Math.min(bounds.width,window.innerWidth-32),height:Math.min(bounds.height,window.innerHeight-32)};
  const duration=processingCardDuration();
  const motion=surface.animate([
    {width:`${start.width}px`,height:`${start.height}px`},
    {width:`${target.width}px`,height:`${target.height}px`},
  ],{duration,easing:'cubic-bezier(.45,0,.2,1)'});
  const content=Array.from(body?[body]:card.children).filter(child=>child!==surface).map(child=>(child as HTMLElement).animate([{opacity:0},{opacity:1}],{duration:540,delay:180,easing:'cubic-bezier(.45,0,.2,1)',fill:'backwards'}));
  // The browser splash disappears in this render. Retain only its content for
  // the short crossfade, sharing the processing card's animated surface.
  const preparation=document.querySelector<HTMLElement>('.app-startup-loading-card');
  const outgoing=preparation?.cloneNode(true) as HTMLElement|undefined;
  if(outgoing){
    outgoing.classList.add('legal-processing-outgoing');
    outgoing.setAttribute('aria-hidden','true');outgoing.inert=true;
    outgoing.style.width=`${start.width}px`;outgoing.style.height=`${start.height}px`;
    card.append(outgoing);
    content.push(outgoing.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-out',fill:'forwards'}));
  }
  let disposed=false;
  const restore=()=>{if(disposed)return;disposed=true;window.removeEventListener('resize',settle);outgoing?.remove();card.style.overflow=previousOverflow;if(body){if(previousBodyStyle===null)body.removeAttribute('style');else body.setAttribute('style',previousBodyStyle!);}};
  const settle=()=>{motion.cancel();content.forEach(animation=>animation.cancel());restore();};
  window.addEventListener('resize',settle);
  void motion.finished.then(restore,restore);
  return()=>{settle();card.style.animation=previousAnimation;};
}
