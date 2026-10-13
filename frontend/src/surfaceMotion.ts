import {useEffect,useState} from 'react';

export const SURFACE_EXIT_MS=180;
export const prefersReducedMotion=()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useReducedMotion(){
  const [reduced,setReduced]=useState(prefersReducedMotion);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setReduced(media.matches);
    update();media.addEventListener('change',update);
    return()=>media.removeEventListener('change',update);
  },[]);
  return reduced;
}
