import { translate } from '../i18n';
import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary:
 * React bileşen ağacında oluşabilecek herhangi bir render hatasını yakalar.
 * Sayfanın beyaz ekrana düşmesini kesin olarak engeller, anlaşılır bir hata kutusu gösterir.
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(translate("KATMANDU ErrorBoundary yakaladı:"), error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f7f6f2] flex items-center justify-center p-6 text-stone-900 font-serif">
          <div className="max-w-lg w-full bg-white rounded border border-red-200 shadow-md p-6">
            <div className="flex items-center gap-2.5 text-red-700 pb-3 border-b border-red-100 mb-4">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-sans font-bold">
                {translate("Arayüz Görüntüleme Hatası Engellendi")}</h2>
            </div>

            <p className="text-sm text-stone-700 leading-relaxed mb-4">
              {translate("Modelden veya veri derleyicisinden gelen beklenmedik bir biçim nedeniyle arayüz render hatası oluştu. Sistem çökmekten kurtarıldı.")}</p>

            {this.state.error && (
              <div className="p-3 bg-stone-50 border border-stone-200 rounded font-mono text-xs text-red-800 break-all mb-4 max-h-40 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white rounded font-sans text-xs font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{translate("Sayfayı Yenile")}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
