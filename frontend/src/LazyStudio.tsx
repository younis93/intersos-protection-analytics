import {lazy, Suspense, type ComponentProps} from "react";
import type StudioComponent from "./Studio";

const Studio = lazy(() => import("./Studio"));

export default function LazyStudio(props: ComponentProps<typeof StudioComponent>) {
  return <Suspense fallback={<div className="loading" role="status">Loading Studio…</div>}><Studio {...props}/></Suspense>;
}
