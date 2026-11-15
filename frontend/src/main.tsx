import React from 'react';
import './desktopRendererDiagnostics';
import ReactDOM from 'react-dom/client';
import RootApp from './RootApp';
import './styles.css';
import './forestTheme.css';
import './tableSelection.css';
const startupTheme=new URLSearchParams(window.location.search).get('appTheme');
if(startupTheme&&startupTheme!=='vice-city')document.documentElement.dataset.theme=startupTheme;
try {
  for(const themeKey of ['app-theme','legal-platform-theme']){
    if(localStorage.getItem(themeKey)==='vice-city')localStorage.setItem(themeKey,'glass-light');
  }
}catch{/* Storage may be unavailable during startup. */}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RootApp /></React.StrictMode>);
