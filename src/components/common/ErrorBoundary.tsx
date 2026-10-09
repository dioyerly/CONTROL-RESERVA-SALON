import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto my-12 p-8 bg-white border border-[#E5DDD3] rounded-2xl shadow-sm text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-[#302C29] mb-2 font-serif-editorial">
            {this.props.fallbackTitle || 'Ha ocurrido un inconveniente al cargar la vista'}
          </h2>
          <p className="text-sm text-[#80766E] mb-6">
            {this.state.error?.message || 'Error inesperado. Puedes recargar o regresar a la pantalla principal.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 bg-[#302C29] text-white rounded-xl text-xs font-semibold hover:bg-black transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-4 h-4" />
              Recargar aplicación
            </button>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="px-5 py-2.5 bg-[#FAF7F2] border border-[#E5DDD3] text-[#302C29] rounded-xl text-xs font-semibold hover:bg-[#F0EAE2] transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Ir al inicio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
