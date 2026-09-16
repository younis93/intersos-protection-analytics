import React from 'react';
import ReactDOM from 'react-dom/client';
import RootApp from './RootApp';
import './styles.css';
const startupTheme=new URLSearchParams(window.location.search).get('appTheme');
if(startupTheme)document.documentElement.dataset.theme=startupTheme;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RootApp /></React.StrictMode>);
