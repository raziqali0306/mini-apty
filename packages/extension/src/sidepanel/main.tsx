import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from '../components/ErrorBoundary';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Side panel root element not found');

createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
