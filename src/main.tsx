import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource-variable/inter/index.css';
import 'leaflet/dist/leaflet.css';
import './styles/index.css';
import App from './app/App.tsx';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
