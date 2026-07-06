import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Import MapLibre's CSS first so our own rules win on any class collisions.
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
