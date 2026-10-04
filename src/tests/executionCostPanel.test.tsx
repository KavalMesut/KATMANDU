import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExecutionReportPanel } from '../components/ExecutionReportPanel';
import type { SolutionExecutionReport } from '../domain/usageReport';

const usage = { inputTokens: 100, outputTokens: 50, totalTokens: 150, reportedCalls: 1, unreportedCalls: 0 };

describe('çözüm ücret paneli', () => {
  it('sağlayıcı bildirimi ve katalog tahminini ayırır', () => {
    const report: SolutionExecutionReport = {
      durationMs: 2000, totalUsage: { ...usage },
      runs: [
        { role: 'router', providerName: 'OpenRouter', modelName: 'router', usage, cost: { usd: 0.001, source: 'provider' } },
        { role: 'solution', providerName: 'OpenRouter', modelName: 'solver', usage, cost: { usd: 0.002, source: 'catalog' } }
      ]
    };
    const html = renderToStaticMarkup(<ExecutionReportPanel report={report} />);
    expect(html).toContain('$0.001000 (sağlayıcı bildirimi)');
    expect(html).toContain('$0.002000 (tahmini)');
    expect(html).toContain('$0.003000 (en az bir tahmin içerir)');
  });

  it('bir çağrının ücreti bilinmiyorsa tam toplam göstermez', () => {
    const report: SolutionExecutionReport = {
      durationMs: 2000, totalUsage: { ...usage },
      runs: [
        { role: 'router', providerName: 'OpenAI', modelName: 'router', usage },
        { role: 'solution', providerName: 'OpenRouter', modelName: 'solver', usage, cost: { usd: 0.002, source: 'provider' } }
      ]
    };
    const html = renderToStaticMarkup(<ExecutionReportPanel report={report} />);
    expect(html).toContain('Toplam ücret: bilinmiyor · bilinen kısım $0.002000');
  });
});
