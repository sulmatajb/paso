import { useEffect, useState, useRef } from 'react';
import { useI18n } from '../i18n';
export function UpdateNotice() {
  const { t } = useI18n(),
    [waiting, setWaiting] = useState<ServiceWorker | null>(null),
    requested = useRef(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let disposed = false;
    const changed = () => {
      if (requested.current) location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        if (disposed) return;
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (worker)
            worker.addEventListener('statechange', () => {
              if (!disposed && worker.state === 'installed' && navigator.serviceWorker.controller)
                setWaiting(worker);
            });
        });
        void reg.update().catch(() => {});
      })
      .catch(() => {});
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
    };
  }, []);
  return waiting ? (
    <div className="update-notice" role="status">
      <span>{t.update}</span>
      <button
        className="secondary-button"
        onClick={() => {
          requested.current = true;
          waiting.postMessage({ type: 'SKIP_WAITING' });
        }}
      >
        {t.updateNow}
      </button>
    </div>
  ) : null;
}
