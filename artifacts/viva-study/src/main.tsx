import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import './index.css';

function sanitize(text: string): string {
  return text
    .replace(/(AIza|AQ\.)[A-Za-z0-9._-]+/g, '$1[REDACTED]')
    .replace(/gsk_[A-Za-z0-9_-]+/g, 'gsk_[REDACTED]')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, 'sk-or-v1-[REDACTED]')
    .replace(/sk-proj-[A-Za-z0-9_-]+/g, 'sk-proj-[REDACTED]');
}

function RuntimeErrorMonitor() {
  const [error, setError] = useState<string>('');
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      setError(sanitize(event.error?.stack || event.message || 'Unknown window error'));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.stack || event.reason.message : String(event.reason);
      setError(sanitize(`Unhandled promise rejection:\n${reason}`));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  if (!error) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-[9999] max-w-3xl mx-auto rounded-xl border border-red-300 bg-white p-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm text-red-700">Live runtime diagnostic</strong>
        <button type="button" className="text-xs underline" onClick={() => setError('')}>বন্ধ</button>
      </div>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-100 p-3 text-[11px] text-gray-800">{error}</pre>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
    <RuntimeErrorMonitor />
  </ErrorBoundary>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is progressive enhancement; the core app remains usable.
    });
  });
}
