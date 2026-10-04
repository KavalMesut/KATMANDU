/**
 * KATMANDU v2 — PDF ve Dosya İndirme Yardımcıları (PDF & File Exporter)
 * 
 * Tarayıcı tabanlı A4 baskı ve dosya indirme akışlarını yönetir.
 */

/**
 * Verilen metin içeriğini belirtilen dosya adı ve MIME türüyle tarayıcıda indirir.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8'
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Tarayıcının yerel A4 PDF yazdırma penceresini tetikler.
 * Koyu mod aktifse dahi, baskı/PDF çıktısının bembeyaz akademik kağıt formatında
 * (ve şekillerin siyah arka plan yerine saf beyaz zeminle) üretilmesini sağlar;
 * yazdırma penceresi kapandığında kullanıcının koyu temasını anında geri yükler.
 */
export function triggerBrowserPrint(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const html = document.documentElement;
  const wasDark = html.classList.contains('dark');

  // Koyu temayı geçici olarak kaldırarak tarayıcının tüm elementleri açık modda render etmesini sağla
  if (wasDark) {
    html.classList.remove('dark');
  }

  let restored = false;
  const restoreTheme = () => {
    if (restored) return;
    restored = true;
    if (wasDark) {
      html.classList.add('dark');
    }
    window.removeEventListener('afterprint', restoreTheme);
  };

  window.addEventListener('afterprint', restoreTheme);

  setTimeout(() => {
    try {
      window.print();
    } finally {
      setTimeout(restoreTheme, 1000);
    }
  }, 60);
}
