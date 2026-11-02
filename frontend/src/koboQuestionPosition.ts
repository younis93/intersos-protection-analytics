let cleanup:(()=>void)|undefined;
export function preserveQuestionPosition(node:HTMLElement|null,change:()=>void){
 cleanup?.();if(!node){change();return}
 let surface=node.parentElement;
 while(surface&&!(surface.scrollHeight>surface.clientHeight&&/auto|scroll/.test(getComputedStyle(surface).overflowY)))surface=surface.parentElement;
 const scroller=surface||document.scrollingElement as HTMLElement,top=node.getBoundingClientRect().top;
 let frame=0,stopped=false;
 const align=()=>{if(stopped||!node.isConnected)return;const delta=node.getBoundingClientRect().top-top;if(Math.abs(delta)>.5)scroller.scrollTop+=delta};
 const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(align)});
 const stop=()=>{stopped=true;observer.disconnect();cancelAnimationFrame(frame);clearTimeout(timer);window.removeEventListener('wheel',stop);window.removeEventListener('touchmove',stop);window.removeEventListener('keydown',key);if(cleanup===stop)cleanup=undefined};
 const key=(event:KeyboardEvent)=>{if(['PageDown','PageUp','Home','End','ArrowDown','ArrowUp',' '].includes(event.key)&&!(event.target instanceof HTMLInputElement))stop()};
 const timer=setTimeout(stop,1500);cleanup=stop;
 observer.observe(node.closest('.kobo-results')||node);window.addEventListener('wheel',stop,{passive:true});window.addEventListener('touchmove',stop,{passive:true});window.addEventListener('keydown',key);
 change();frame=requestAnimationFrame(align);
}
