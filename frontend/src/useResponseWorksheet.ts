import {useEffect,useState} from 'react';
import {koboApi} from './koboApi';

export function useResponseWorksheet(file:File|null){
 const[retry,setRetry]=useState(0);
 const[state,setState]=useState<{file:File|null;names:string[];selected:string;loading:boolean;error:string}>({file:null,names:[],selected:'',loading:false,error:''});
 const excel=!!file&&/\.xlsx$/i.test(file.name);
 useEffect(()=>{
  if(!file||!excel){setState({file,names:[],selected:'',loading:false,error:''});return}
  const controller=new AbortController();
  setState({file,names:[],selected:'',loading:true,error:''});
  void koboApi.worksheets(file,controller.signal).then(result=>{
   if(controller.signal.aborted)return;
   if(!result.worksheets.length)throw new Error('This workbook contains no worksheets.');
   setState({file,names:result.worksheets,selected:result.worksheets[0],loading:false,error:''});
  }).catch(error=>{if(!controller.signal.aborted)setState({file,names:[],selected:'',loading:false,error:error instanceof Error?error.message:String(error)})});
  return()=>controller.abort();
 },[file,excel,retry]);
 const current=state.file===file;
 return {excel,names:current?state.names:[],selected:current?state.selected:'',loading:excel&&(!current||state.loading),error:current?state.error:'',ready:!excel||(current&&!state.loading&&!state.error&&!!state.selected),
  select:(selected:string)=>setState(value=>({...value,selected})),
  retry:()=>{setState(value=>({...value,loading:true,error:'',selected:'',names:[]}));setRetry(value=>value+1)}
 };
}
