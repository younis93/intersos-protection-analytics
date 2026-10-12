import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "./plotlyEngine";

// Share the same Plotly build with exports instead of bundling two copies.
export default createPlotlyComponent(Plotly);
