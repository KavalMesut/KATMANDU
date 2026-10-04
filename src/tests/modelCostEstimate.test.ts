import { describe, it, expect } from 'vitest';
import { getModelCostEstimate } from '../components/SettingsModal';

describe('getModelCostEstimate (Dinamik Model Maliyet ve Token Bütçesi)', () => {
  it('ücretsiz (:free) modellerde her seviyede 0.00$ ve ücretsiz rozeti döndürmelidir', () => {
    const est = getModelCostEstimate('google/gemma-4-31b-it:free');
    expect(est.low).toContain('0.00$');
    expect(est.medium).toContain('0.00$');
    expect(est.high).toContain('0.00$');
    expect(est.badge).toContain('Ücretsiz');
    expect(est.note).toContain('ücretsizdir');
  });

  it('ekonomik modellerde (deepseek, flash, mini) 1 sentin altında maliyet göstermelidir', () => {
    const estR1 = getModelCostEstimate('deepseek/deepseek-r1');
    expect(estR1.low).toBe('< 0.002$');
    expect(estR1.medium).toBe('~0.004$');
    expect(estR1.high).toBe('~0.008$');
    expect(estR1.badge).toContain('Ekonomik');

    const estFlash = getModelCostEstimate('google/gemini-2.5-flash');
    expect(estFlash.low).toBe('< 0.002$');

    const estDeepSeekFlash = getModelCostEstimate('deepseek/deepseek-v4.1-flash');
    expect(estDeepSeekFlash.low).toBe('< 0.002$');
    expect(estDeepSeekFlash.badge).toContain('Ekonomik');
  });

  it('Claude Sonnet gibi amiral gemisi modellerde gerçekçi ~0.03$ - 0.12$ aralığı göstermelidir', () => {
    const estSonnet = getModelCostEstimate('anthropic/claude-sonnet-4.6');
    expect(estSonnet.low).toBe('~0.03$');
    expect(estSonnet.medium).toBe('~0.06$');
    expect(estSonnet.high).toContain('0.12$');
    expect(estSonnet.badge).toContain('Zirve Akıl Yürütme');
  });

  it('Opus gibi ağır modellerde yüksek maliyet uyarısı yapmalıdır', () => {
    const estOpus = getModelCostEstimate('anthropic/claude-opus-4.5');
    expect(estOpus.low).toContain('0.10$');
    expect(estOpus.high).toContain('0.50$');
    expect(estOpus.badge).toContain('Ağır Sıklet');
  });

  it('bilinmeyen modellerde token bütçesi tabanlı açıklama yapmalıdır', () => {
    const estCustom = getModelCostEstimate('custom-provider/special-model');
    expect(estCustom.low).toContain('Token');
    expect(estCustom.high).toContain('Token');
  });
});
