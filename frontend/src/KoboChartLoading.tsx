import {Component,type ReactNode,type CSSProperties} from 'react';

export function KoboChartSkeleton({height=330}:{height?:CSSProperties['height']}){
 return <div className="kobo-chart-skeleton" style={{height}} role="status" aria-label="Loading chart"><div aria-hidden="true" className="kobo-skeleton-bars">{[62,85,48,72,38].map((width,i)=><i key={i} style={{width:`${width}%`}}/>)}</div></div>;
}

export function KoboChartFailure({onRetry}:{onRetry:()=>void}){
 return <div className="kobo-chart-failure" role="alert"><p>This chart could not be loaded.</p><button type="button" className="soft" onClick={onRetry}>Retry chart</button></div>;
}

/** Catch chart render and module errors without taking down the project page. */
export class KoboChartBoundary extends Component<{children:ReactNode;onFailure?:()=>void},{error:Error|null;attempt:number}>{
 state:{error:Error|null;attempt:number}={error:null,attempt:0};
 static getDerivedStateFromError(error:Error){return {error}}
 componentDidCatch(){this.props.onFailure?.()}
 render(){
  if(this.state.error)return <KoboChartFailure onRetry={()=>{
   if(/dynamically imported module|module script|preload CSS|Loading chunk/i.test(String(this.state.error))){window.location.reload();return}
   this.setState(({attempt})=>({error:null,attempt:attempt+1}));
  }}/>;
  return <div key={this.state.attempt} className="kobo-chart-boundary">{this.props.children}</div>;
 }
}
