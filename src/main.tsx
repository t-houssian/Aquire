import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import App from './App';
import './styles.css';
import './game-layout.css';
import './recap-layout.css';
import './history.css';
import './board-polish.css';
import './mobile-game.css';
import './game-world.css';
import './acquire-table.css';
import './contrast.css';
// Browsers own the horizontal notch inset with viewport-fit=contain. The native
// app uses an edge-to-edge webview and therefore needs CSS safe-area padding.
if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset.viewportFit = 'cover';
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    'content', 'width=device-width, initial-scale=1.0, viewport-fit=cover',
  );
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
