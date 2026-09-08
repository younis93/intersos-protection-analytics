import {lazy, Suspense} from "react";
import type {PlotParams} from "react-plotly.js";

const Plot = lazy(() => import("./PlotRenderer"));

export default function LazyPlot(props: PlotParams) {
  return <Suspense fallback={<div className="loading" role="status">Loading chart…</div>}><Plot {...props}/></Suspense>;
}
