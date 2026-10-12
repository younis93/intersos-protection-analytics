import {Component, useEffect, useState, type ComponentType, type ReactNode} from 'react';

class ModuleBoundary extends Component<{children:ReactNode;onRetry:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true}}
  render(){
    if(this.state.failed)return <div className="error glass" role="alert">This page could not be loaded. <button className="soft" onClick={this.props.onRetry}>Retry loading page</button></div>;
    return this.props.children;
  }
}

/** Share modules between visits without delaying a ready page behind a Suspense fallback. */
export function deferredComponent<P extends object>(load:()=>Promise<{default:ComponentType<P>}>,fallback:ReactNode){
  let resolved:{default:ComponentType<P>}|undefined;
  let pending:Promise<{default:ComponentType<P>}>|undefined;
  const request=()=>pending??=(load().then(module=>{resolved=module;return module}).catch(error=>{pending=undefined;throw error}));
  function Deferred(props:P){
    const [attempt,setAttempt]=useState(0);
    const [loaded,setLoaded]=useState(()=>resolved);
    const [failure,setFailure]=useState<unknown>(null);
    useEffect(()=>{
      let active=true;
      request().then(module=>{if(active)setLoaded(module)}).catch(error=>{if(active)setFailure(error)});
      return()=>{active=false};
    },[attempt]);
    // Browsers can retain a rejected native import for the lifetime of the document.
    const reloadRequired=/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(String(failure));
    const retry=()=>{if(reloadRequired){window.location.reload();return}setFailure(null);setAttempt(value=>value+1)};
    const Ready=(loaded||resolved)?.default;
    return <ModuleBoundary key={attempt} onRetry={retry}>{failure?<div className="error glass" role="alert">This page could not be loaded. <button className="soft" onClick={retry}>{reloadRequired?'Reload page':'Retry loading page'}</button></div>:Ready?<Ready {...props}/>:fallback}</ModuleBoundary>;
  };
  return Object.assign(Deferred,{preload:()=>request().then(()=>undefined,()=>undefined)});
}
