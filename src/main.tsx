import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import { ChemStudio } from './components/chem/ChemStudio';
import './styles/tokens.css';

// Chem Studio (Ketcher) does not tolerate React StrictMode double-mount.
// Keep StrictMode for the figure editor only.
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route
        path="/"
        element={
          <StrictMode>
            <App />
          </StrictMode>
        }
      />
      <Route path="/chem" element={<ChemStudio />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>,
);
