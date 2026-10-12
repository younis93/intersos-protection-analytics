import Plotly from 'plotly.js-cartesian-dist-min';

// react-plotly's delayed resize callback can outlive a graph during a theme
// remount. Ignore that stale callback while preserving errors for live graphs.
const resize=Plotly.Plots.resize;
Plotly.Plots.resize=(graph:HTMLElement|string|null)=>{
  if(!graph||(typeof graph!=='string'&&!graph.isConnected))return Promise.resolve();
  return resize.call(Plotly.Plots,graph);
};

// Rendering and exports share this single deferred engine instance.
export default Plotly;
