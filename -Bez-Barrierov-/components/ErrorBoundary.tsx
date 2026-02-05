import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 border-l-4 border-red-500">
                <h2 className="text-xl font-bold text-red-600 mb-2">Критическая ошибка</h2>
                <p className="text-gray-600 mb-4">Произошла непредвиденная ошибка в компоненте карт. Пожалуйста, попробуйте обновить страницу.</p>
                <div className="bg-red-50 p-3 rounded text-sm text-red-800 mb-4 overflow-auto max-h-60 border border-red-100">
                    <strong>Ошибка:</strong> {this.state.error?.message}
                    <details className="mt-2">
                        <summary className="cursor-pointer font-semibold underline">Показать технические детали</summary>
                        <pre className="mt-2 text-xs whitespace-pre-wrap text-gray-600">
                            {this.state.error?.stack}
                        </pre>
                    </details>
                </div>
                <button 
                    onClick={() => window.location.reload()}
                    className="w-full bg-careem-primary text-white py-2 px-4 rounded hover:bg-careem-dark transition flex items-center justify-center gap-2"
                >
                    <i className="fas fa-sync-alt"></i> Обновить страницу
                </button>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
