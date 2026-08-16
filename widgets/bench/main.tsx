import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Bench } from './Bench.js';
import './bench.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
