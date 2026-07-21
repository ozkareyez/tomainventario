import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';
import { ImportExcelPage } from '@/pages/ImportExcelPage';
import { CapturePage } from '@/pages/CapturePage';
import { initDatabase } from '@/db/database';

function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDatabase().then(() => setDbReady(true)).catch(console.error);
  }, []);

  if (!dbReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Inicializando base de datos...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/import" element={<ImportExcelPage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/" element={<Navigate to="/import" replace />} />
        </Routes>
        <Toaster />
      </div>
    </BrowserRouter>
  );
}

import { useState, useEffect } from 'react';

export default App;