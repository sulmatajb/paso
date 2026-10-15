'use client';
import { useEffect, useState } from 'react';
import App from '../src/App';
export default function ClientApp() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? (
    <App />
  ) : (
    <div className="loading-screen">
      <strong>Paso</strong>
      <p>Getting your next step ready…</p>
    </div>
  );
}
