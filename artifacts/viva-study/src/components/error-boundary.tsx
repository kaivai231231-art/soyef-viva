import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);
  try { return new Error(JSON.stringify(value)); } catch { return new Error(String(value)); }
}

function sanitizeDiagnostic(text: string): string {
  return text
    .replace(/(AIza|AQ\.)[A-Za-z0-9._-]+/g, '$1[REDACTED]')
    .replace(/gsk_[A-Za-z0-9_-]+/g, 'gsk_[REDACTED]')
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, 'sk-or-v1-[REDACTED]')
    .replace(/sk-proj-[A-Za-z0-9_-]+/g, 'sk-proj-[REDACTED]');
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const message = sanitizeDiagnostic(error.message || String(error));
  const copy = async () => {
    try { await navigator.clipboard?.writeText(message); } catch { /* clipboard is optional */ }
  };
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-2xl w-full">
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-red-600">Viva Study runtime error</div>
          <h1 className="text-xl font-semibold text-gray-900 mt-2">সাইটে একটি error হয়েছে</h1>
          <p className="mt-2 text-sm text-gray-600">নিচের diagnostic-এ error-এর আসল message দেখানো হচ্ছে। এটি support/debugging-এর জন্য কপি করা যাবে।</p>
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-100 p-4 text-left text-xs text-gray-800">{message}</pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white">Error কপি করুন</button>
            <button type="button" onClick={resetError} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-800">আবার চেষ্টা করুন</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState { return { error: toError(error) }; }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', toError(error), info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error !== null && prevProps.resetKey !== this.props.resetKey) this.resetError();
  }

  resetError = (): void => { this.setState({ error: null }); };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
