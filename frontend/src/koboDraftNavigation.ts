let guard:((event:HashChangeEvent)=>boolean)|undefined;
export function registerKoboDraftNavigation(callback:(event:HashChangeEvent)=>boolean){
 const previous=guard;guard=callback;return()=>{if(guard===callback)guard=previous};
}
export function allowKoboDraftNavigation(event:HashChangeEvent){return guard?.(event)??true}
