type Bounds={width:number;height:number};
type Transition={from:Bounds;started:number;finished:boolean};
const DURATION=940;
export const processingCardMotionEvent='processing-card-motion';
let transition:Transition|undefined;
let desktopRead=false;

export function beginProcessingCardMotion(from:Bounds){
 transition={from,started:performance.now(),finished:false};
 window.dispatchEvent(new Event(processingCardMotionEvent));
}

export function finishProcessingCardMotion(){if(transition)transition.finished=true}

function readDesktopBounds(){
 if(desktopRead)return;
 desktopRead=true;
 const params=new URLSearchParams(window.location.search);
 const epoch=Number(params.get('startupEpoch'));
 const width=Number(params.get('startupCardWidth')),height=Number(params.get('startupCardHeight'));
 if(epoch>0&&Date.now()-epoch>=0&&Date.now()-epoch<120000&&Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0){
  transition={from:{width,height},started:performance.now(),finished:false};
 }
}

/** Resume one shared timeline when the deferred workspace replaces its fallback. */
export function animateProcessingCard(card:HTMLElement){
 if(!transition)readDesktopBounds();
 const current=transition;
 if(!current||current.finished)return()=>{};
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!card.animate){current.finished=true;return()=>{}}
 const elapsed=Math.max(0,performance.now()-current.started);
 if(elapsed>=DURATION){current.finished=true;return()=>{}}
 const surface=card.querySelector<HTMLElement>('.legal-processing-card-surface');
 if(!surface)return()=>{};
 const target=surface.getBoundingClientRect();
 const padding=window.innerWidth<=600?32:44;
 const from={width:Math.min(current.from.width,window.innerWidth-padding),height:Math.min(current.from.height,window.innerHeight-padding)};
 const overflow=card.style.overflow;
 card.style.overflow='visible';
 const motion=surface.animate([
  {width:`${from.width}px`,height:`${from.height}px`,borderRadius:'28px'},
  {width:`${target.width}px`,height:`${target.height}px`,borderRadius:getComputedStyle(card).borderRadius},
 // Start and finish at rest, avoiding the previous curve's abrupt initial
 // velocity while keeping a continuous, gently decelerating middle section.
 ],{duration:DURATION,easing:'cubic-bezier(.4,0,.2,1)'});
 motion.currentTime=elapsed;
 let disposed=false;
 const restore=()=>{if(disposed)return;disposed=true;card.style.overflow=overflow;window.removeEventListener('resize',resize)};
 const resize=()=>{current.finished=true;motion.cancel();restore()};
 window.addEventListener('resize',resize);
 void motion.finished.then(()=>{current.finished=true;restore()},restore);
 // Cleanup on a module swap cancels only this element's animation. The next
 // processing card resumes at the elapsed time instead of starting again.
 return()=>{motion.cancel();restore()};
}
