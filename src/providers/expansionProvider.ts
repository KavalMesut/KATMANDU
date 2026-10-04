import { ExpansionRequest, RawExpansionResponse } from '../domain/types';

/**
 * ExpansionProvider Arayüzü (HD-010 ve HD-024 uyumlu):
 * Belirli bir denklemi veya iddiayı kullanıcı talebiyle derinleştiren sağlayıcı soyutlaması.
 */
export interface ExpansionProvider {
  readonly providerName: string;
  expand(request: ExpansionRequest): Promise<RawExpansionResponse>;
}
