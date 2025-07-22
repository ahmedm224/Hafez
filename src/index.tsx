import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n';
import './App.css';
import App from './App';

// Set initial language and direction
document.documentElement.setAttribute('lang', 'ar');
document.documentElement.setAttribute('dir', 'rtl');

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
