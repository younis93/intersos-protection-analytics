// Log only the event type. Error messages and response values stay in the view.
const report=(kind:'error'|'unhandledrejection')=>{
 const bridge=(window as unknown as {pywebview?:{api?:{record_renderer_event?:(kind:string)=>Promise<boolean>}}}).pywebview?.api;
 void bridge?.record_renderer_event?.(kind).catch(()=>{});
};
window.addEventListener('error',()=>report('error'));
window.addEventListener('unhandledrejection',()=>report('unhandledrejection'));
