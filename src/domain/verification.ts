import { translate } from '../i18n';
import { SolutionDocument } from './types';

/** The same disclosure is used by the reader, print view and LaTeX exporter. */
export function getVerificationNotice(document: SolutionDocument): string {
  const prefix = translate("Bağımsız kontrol: Kontrol edilmedi.");
  switch (document.verification?.assessmentSource) {
    case 'model':
      return translate("{0} Sağlama açıklamaları çözüm sağlayıcısına aittir; sistem tarafından bağımsız olarak doğrulanmamıştır.", [prefix]);
    case 'none':
      return translate("{0} Çözüm sağlayıcısı sağlama açıklaması sunmadı.", [prefix]);
    default:
      return translate("{0} Eski kayıttaki sağlama açıklamalarının kaynağı belirlenemiyor; bağımsız doğrulama olarak değerlendirilmemelidir.", [prefix]);
  }
}
