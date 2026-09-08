import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-dist-min";

// Share the same Plotly build with exports instead of bundling two copies.
export default createPlotlyComponent(Plotly);
