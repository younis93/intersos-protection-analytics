import {deferredComponent} from './DeferredComponent';
import {ChartLoading} from './ChartPrimitives';
import type {PlotParams} from "react-plotly.js";

const Plot = deferredComponent<PlotParams>(() => import("./PlotRenderer"),<ChartLoading/>);

export default function LazyPlot(props: PlotParams) {
  return <Plot {...props}/>;
}
