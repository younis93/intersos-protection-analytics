import {type ComponentProps} from "react";
import {deferredComponent} from './DeferredComponent';
import type StudioComponent from "./Studio";

const Studio = deferredComponent(()=>import('./Studio'),<div className="loading" role="status">Loading Studio…</div>);

export default function LazyStudio(props: ComponentProps<typeof StudioComponent>) {
  return <Studio {...props}/>;
}
