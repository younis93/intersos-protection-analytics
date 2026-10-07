import {useCallback, useState, type SetStateAction} from "react";

/** Reset pagination before effects run so a new query never fetches the old page. */
export function useQueryPage(queryKey: string) {
  const [state,setState]=useState({queryKey,page:1});
  if(state.queryKey!==queryKey)setState({queryKey,page:1});
  const page=state.queryKey===queryKey?state.page:1;
  const setPage=useCallback((next:SetStateAction<number>)=>setState(current=>({
    queryKey,page:typeof next==="function"?next(current.queryKey===queryKey?current.page:1):next,
  })),[queryKey]);
  return [page,setPage] as const;
}
