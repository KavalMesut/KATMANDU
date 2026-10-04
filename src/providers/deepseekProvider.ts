import { createTranslator, getLanguage, localizePrompt } from '../i18n';
import { ProviderTransport, isRequestStopped, throwIfAborted } from './providerTransport';
import {
  ProblemInput,
  RawSolutionResponse,
  ExpansionRequest,
  RawExpansionResponse,
  DetectedQuestionItem
} from '../domain/types';
import { SolutionProvider } from './solutionProvider';
import { ExpansionProvider } from './expansionProvider';
import { AppConfig } from '../domain/config';
import { UsageTracker } from '../domain/usageReport';
import { safeJsonParse } from '../domain/jsonRepair';
import {
  detectMultipleQuestions,
  buildQuestionDetectionPrompt,
  parseDetectedQuestions,
  buildSubpartSolutionInstruction
} from '../domain/questionParser';
import { extractTextFromPdf } from '../domain/pdfExtractor';

/**
 * DeepSeek Sağlayıcısı (DeepSeek-R1 / DeepSeek-V3 Entegrasyonu):
 * OpenAI uyumlu Chat Completions API'sini kullanarak yüksek fiyat/performans
 * ve ileri düzey matematiksel akıl yürütme (Reasoning) yeteneği sunar.
 */
export class DeepSeekProvider implements SolutionProvider, ExpansionProvider {
  public readonly usageTracker = new UsageTracker();
  private translate: ReturnType<typeof createTranslator>;
  private transport: ProviderTransport;
  setRequestSignal(signal: AbortSignal) { this.transport.signal = signal; }
  setBudgetSpent(usd: number) { this.transport.initialCostUsd = usd; }
  public readonly providerName: string;
  private config: AppConfig;
  private retryBaseDelayMs: number;

  constructor(config: AppConfig, retryBaseDelayMs: number = 2000) {
    this.config = { ...config, language: config.language ?? getLanguage() };
    this.translate = createTranslator(this.config.language!);
    this.transport = new ProviderTransport(this.config, 'deepseek', this.usageTracker);
    this.providerName = config.deepseekModel?.startsWith('deepseek')
      ? config.deepseekModel
      : `deepseek-${config.deepseekModel || 'reasoner'}`;
    this.retryBaseDelayMs = retryBaseDelayMs;
  }

  /**
   * Çoklu Soru Tespiti:
   * Tek bir metin veya PDF belgesi içinde birden fazla bağımsız soru varsa tespit eder.
   */
  public async detectQuestions(problem: ProblemInput): Promise<DetectedQuestionItem[]> {
    this.validateApiKey();

    const pdfAttachments = problem.attachments?.filter((a) => a.type === 'pdf') || [];
    const imageAttachments = problem.attachments?.filter((a) => a.type === 'image') || [];

    // Görsel uyarısı: DeepSeek doğrudan görsel okuyamaz
    if (imageAttachments.length > 0 && !problem.text?.trim() && pdfAttachments.length === 0) {
      throw new Error(
        this.translate("DeepSeek modeli doğrudan görsel (PNG/JPG) analizini desteklememektedir. Lütfen soruyu metin/LaTeX olarak yazın veya PDF belgesi yükleyin (Görselden DeepSeek hibrit çözüm desteği yakında eklenecektir).")
      );
    }

    // PDF varsa metni çıkar
    let combinedText = (problem.text || '').trim();
    if (pdfAttachments.length > 0) {
      const extractedPdfs: string[] = [];
      for (const pdf of pdfAttachments) {
        const text = await extractTextFromPdf(pdf.data || pdf.dataUrl || '', this.transport.signal);
        if (text) {
          extractedPdfs.push(`--- PDF (${pdf.name}) ---\n${text}`);
        }
      }
      if (extractedPdfs.length > 0) {
        combinedText = combinedText
          ? `${combinedText}\n\n${extractedPdfs.join('\n\n')}`
          : extractedPdfs.join('\n\n');
      }
    }

    // Eklenti yoksa veya metinden doğrudan tespit yapılabiliyorsa
    const textDetected = detectMultipleQuestions(combinedText);
    if (textDetected.length > 1) {
      return textDetected.map((qText: string, idx: number) => ({
        questionNumber: idx + 1,
        title: this.translate("Soru {0}", [idx + 1]),
        instruction: qText,
        rawText: qText
      }));
    }

    try {
      const systemPrompt = buildQuestionDetectionPrompt(this.config.language);
      const userPrompt = `Lütfen bu metin/PDF içeriğinde yer alan bağımsız soruları tespit et:\n\n${combinedText}`;

      const rawJson = await this.callDeepSeek([
        { role: 'system', content: localizePrompt(systemPrompt, this.config.language) },
        { role: 'user', content: userPrompt }
      ]);

      const parsed = safeJsonParse<unknown>(rawJson, this.translate);
      return parseDetectedQuestions(parsed, combinedText, this.config.language);
    } catch (err) {
      throwIfAborted(this.transport.signal);
      if (isRequestStopped(err)) throw err;
      console.warn('DeepSeek çoklu soru tespiti uyarısı (fail-soft):', err);
      return [
        {
          questionNumber: 1,
          title: 'Problem 1',
          instruction: combinedText || this.translate("Problemi adım adım çöz.")
        }
      ];
    }
  }

  /**
   * Ana Problem Çözümü:
   * Lisans düzeyinde, tam matematiksel türetim ve doğruluk sağlamalı çözüm üretir.
   */
  public async solve(problem: ProblemInput): Promise<RawSolutionResponse> {
    this.validateApiKey();

    const imageAttachments = problem.attachments?.filter((a) => a.type === 'image') || [];
    const pdfAttachments = problem.attachments?.filter((a) => a.type === 'pdf') || [];

    // Görsel uyarısı
    if (imageAttachments.length > 0 && !problem.text?.trim() && pdfAttachments.length === 0) {
      throw new Error(
        this.translate("DeepSeek modeli doğrudan görsel (PNG/JPG) analizini desteklememektedir. Lütfen soruyu metin/LaTeX olarak yazın veya PDF belgesi yükleyin (Görselden DeepSeek hibrit çözüm desteği yakında eklenecektir).")
      );
    }

    // PDF içeriklerini metin olarak çıkar
    let pdfExtractedSection = '';
    if (pdfAttachments.length > 0) {
      const texts: string[] = [];
      for (const pdf of pdfAttachments) {
        const text = await extractTextFromPdf(pdf.data || pdf.dataUrl || '', this.transport.signal);
        if (text) {
          texts.push(`[PDF Dosyası: ${pdf.name}]\n${text}`);
        }
      }
      if (texts.length > 0) {
        pdfExtractedSection = `\n\n--- YÜKLENEN PDF BELGESİNDEN ÇIKARILAN METİN VE FORMÜLLER ---\n${texts.join('\n\n')}`;
      }
    }

    const systemPrompt = `Sen KATMANDU Bilimsel Çözüm, Teori ve Epistemik Derinleşme Motorusun. Üniversite lisans ve lisansüstü düzeyindeki fizik ve matematik problemlerini çözer; teorik konuları, kavram türetimlerini, karşılaştırmalı analitik ders notlarını ve geometri/fizik atlaslarını klasik ders kitabı ve akademik makale sadeliğinde eksiksiz üretirsin.

ÖNEMLİ (DÜŞÜNCE BÜTÇESİ VE VERİMLİLİK):
Düşünce (reasoning) aşamasını gereksiz yere uzatma, döngüye sokma; doğrudan analize odaklan. Nihai çıktı (content) için token alanını tüketmemek adına düşünmeyi kısa ve öz tut, ardından doğrudan geçerli JSON nesnesini üret.

GÖREVİN VE ÇIKTI FORMATIN:
Yalnızca geçerli bir JSON nesnesi üretmelisin. JSON yapısı şu şemaya tam uymalıdır:
{
  "problemTitle": "Çalışma / Problem / Konu Başlığı (Örn: Genelleştirilmiş Koordinatlar ve Koordinat Sistemleri Atlası veya İdeal Basit Sarkacın Hareketi)",
  "problemText": "Konunun veya sorunun EKSİKSİZ TAM METNİ, incelenen teorik kapsam veya verilen sayısal/sembolik değerler ($...$ formülleriyle)",
  "problemDiagram": {
    "width": 340,
    "height": 220,
    "caption": "Şekil: İncelenen fiziksel kurulum, koordinat sistemi veya geometri şeması",
    "elements": [
      { "type": "surface", "from": [50, 30], "to": [250, 30], "side": "top" },
      { "type": "point", "x": 150, "y": 30, "label": "O" },
      { "type": "line", "from": [150, 30], "to": [210, 140], "style": "rope", "label": "L" },
      { "type": "mass", "id": "m1", "x": 210, "y": 140, "label": "m", "shape": "circle", "size": 14 },
      { "type": "angle", "center": [150, 30], "radius": 35, "startAngle": 90, "endAngle": 61, "label": "\\theta" }
    ]
  },
  "strategy": "Genel çözüm stratejisi (1-2 cümle)",
  "assumptions": ["Varsayım 1", "Varsayım 2"],
  "sections": [
    {
      "title": "Bölüm Başlığı",
      "blocks": [
        { "kind": "prose", "text": "Metin açıklaması. SADECE tekil semboller ($m$, $\\theta$) veya çok kısa hatırlatmalar ($F=ma$) içerebilir. Kesir, kök veya türetim formüllerini metin içine gömme!" },
        { "kind": "equation", "latex": "saf LaTeX bağıntısı (tüm türetim adımları ve formüller burada bağımsız yer almalıdır)", "explanation": "isteğe bağlı kısa açıklama" },
        {
          "kind": "diagram",
          "spec": {
            "width": 340,
            "height": 220,
            "caption": "Diyagram açıklaması (Örn: Şekil 1: Sarkaç geometrisi)",
            "elements": [
              { "type": "surface", "from": [50, 30], "to": [250, 30], "side": "top" },
              { "type": "point", "x": 150, "y": 30, "label": "O" },
              { "type": "line", "from": [150, 30], "to": [210, 140], "style": "rope", "label": "L" },
              { "type": "mass", "id": "m1", "x": 210, "y": 140, "label": "m", "shape": "circle", "size": 14 },
              { "type": "vector", "from": [210, 140], "to": [210, 200], "label": "m\\vec{g}", "color": "#2563eb" },
              { "type": "angle", "center": [150, 30], "radius": 35, "startAngle": 90, "endAngle": 61, "label": "\\theta" },
              { "type": "axis", "origin": [40, 160], "xLength": 80, "yLength": 50, "xLabel": "x", "yLabel": "y" }
            ]
          }
        }
      ]
    }
  ],
  "verification": {
    "dimensionalAnalysis": "Boyut analizi açıklaması ve LaTeX birim eşitliği...",
    "limitingCases": [
      { "condition": "M \\to \\infty", "expected": "Beklenen limit davranışı", "analysis": "Limit analizi..." }
    ],
    "advancedChecks": [
      { "id": "check_cons", "title": "Enerji / Momentum Korunumu", "type": "conservation", "badge": "⚖️ Korunum Yasası", "description": "Açıklama...", "query": "Derinleşme sorgusu..." }
    ]
  }
}

KRİTİK KURALLAR:
1. DİYAGRAM VE GÖRSELLEŞTİRME (YÜKSEK ÖNCELİK / AKILLI KARAR):
   - Problemin geometrisi, fiziksel mekanizması, serbest cisim diyagramı (FBD), kuvvet vektörleri, elektrik devresi, fonksiyon grafiği veya koordinat eksenleri görselleştirmeye elveriyorsa, çözüme mutlaka problemi açıklayan bir "diagram" bloğu eklenmelidir. Şema eklemek en yüksek önceliktir.
   - Element türleri: surface, line, polygon, mass, vector, angle, point, axis, resistor, source, ground, capacitor, spring, pulley, curve (matematiksel fonksiyon eğrisi, parabol, trigonometrik/asimptotik dalga vb.; opsiyonel fillUnder: true veya "rgba(...)" ile eğri altı integral taralı alanı, opsiyonel fillBaselineY: number).
   - İSTİSNA (DİYAGRAM GEREKTİRMEYEN SOYUT SORULAR): Soru tamamen soyut bir matematik, kalkülüs/integral, soyut cebir, sayılar teorisi veya salt sembolik bir teorem/özdeşlik ise ve tüm değerlendirmeye rağmen bir şema çizmek gerçekten gereksiz ve yapay/işlevsiz kalacaksa, zoraki boş koordinat ekseni çizilmemeli ve "diagram" bloğu atlanmalıdır (çözümde diagram bloğu yer almayabilir).
2. SİSTEM KİMLİĞİ YOKTUR: Asla block_id veya denklem numarası üretme.
3. KESİN MATEMATİKSEL ATOMİKLİK VE METİN İÇİ FORMÜL YASAĞI: Metin ("prose") blokları içine ASLA kesirli (\\frac), kareköklü (\\sqrt), integralli (\\int) veya türevli formüller gömme.
   - Bütün türetimler bağımsız, ortalanmış "equation" blokları olarak verilmelidir.
4. LİSANS DÜZEYİNDE VE AKADEMİK STANDART:
   - FİZİK PROBLEMLERİNDE: Serbest cisim diyagramı (FBD), genelleştirilmiş koordinatlar, serbestlik dereceleri, Lagrangian veya Newton denklemleriyle adımlar net ve odaklı kurulmalıdır.
   - SAF MATEMATİK PROBLEMLERİNDE (Aksiyomatik & Titiz İspat Mimarisi):
     * Tanım & Hipotez: Değişkenlerin tanım kümesi ($x \\in \\mathbb{R}$ vb.), kısıtlar, başlangıç/sınır koşulları.
     * Teorem / Önerme Beyanı: Çözülecek veya ispatlanacak teorem açık ve bağımsız ifade edilmelidir.
     * Adım Adım Analitik İspat / Çözüm: Her adımın dayandığı kural (L'Hôpital, Kısmi İntegrasyon, Değişken Değişimi, Taylor Serisi, Matris Özdeğerleri vb.) belirtilerek atomik adımlarla ilerlenmelidir.
     * İspatın Tamamlanması: İspat veya nihai çözüm açık bir sonuç cümlesi ve klasik $\\blacksquare$ (Q.E.D.) sembolü ile taçlandırılmalıdır.
   - Sayfalarca rutin cebir ana metne yığılmamalı; ara adımlar derinleşme katmanına bırakılmalıdır.
5. JSON İÇİNDE LATEX KAÇIŞI (ESCAPE): JSON formatı gereği her ters eğik çizgiyi ÇİFT TERS EĞİK ÇİZGİ olarak yaz (Örn: \\theta, \\frac, \\lambda).
7. ÇÖZÜMÜN SAĞLAMASI VE DOĞRULUK KONTROLLERİ: Son bölüm mutlaka "Çözümün Sağlaması ve Doğruluk Kontrolleri" başlığını taşımalıdır. Fizik/mekanik problemlerinde Boyut Analizi (SI birimleri: [M], [L], [T]) ve Limit Durumları yer almalıdır. DİKKAT: Saf matematik problemlerinde (kalkülüs, integral, türev, diferansiyel denklem, cebir vb.) ASLA fiziksel boyut analizi yapılmamalı; bunun yerine analitik sağlama (ters işlem/türev kontrolü, köklerin yerine konması) ve özel değer / asimptotik sınır incelemeleri yapılmalıdır.
8. İSTEĞE BAĞLI ALTERNATİF ÇÖZÜM YOLU TAVSİYESİ (2. VE 3. YOL - ZORLAMA YOK):
   - Eğer problemin çözümüne kökten farklı ve bağımsız bir metodoloji sunan (Örn: Lagrange ile çözüldüyse Newton/d'Alembert Dinamiği; Newton ile çözüldüyse Lagrange/Hamilton; Kısmi İntegrasyon ile çözüldüyse Feynman Parametrik Türevi; Cebirsel çözüldüyse Geometrik Çözüm vb.) BARİZ BİR 2. YOL VARSA, bunu ilk çözümün ana metnine zorla yazıp token tüketmeyiniz.
   - Bunun yerine JSON kökünde "recommendedPaths" dizisi tanımlayınız (kullanıcı talep ettiğinde isteğe bağlı ayrı çözülecektir): [{"id": "path_2", "methodName": "...", "badge": "...", "description": "...", "query": "..."}].
   - Eğer bariz ve değer katan bağımsız bir 2. yol yoksa, "recommendedPaths" alanını boş bırakınız veya eklemeyiniz (asla yapay/zorlama 2. yol üretmeyiniz).
9. TEORİK KONU ANLATIMI VE KAVRAM İNCELEMESİ (EVRENSEL BİLİMSEL MOD):
   - Kullanıcı klasik bir sınav sorusu yerine teorik bir konu anlatımı, kavram türetimi veya koordinat sistemi incelemesi istediğinde (Örn: "Genelleştirilmiş koordinatları anlat, polar, silindirik ve küresel koordinatlara uygula"):
     * Yapay bir sınav sorusu formatı ("Soru: Genelleştirilmiş koordinatlar nedir?") UYDURMAYINIZ.
     * "problemTitle": Konunun akademik başlığı olmalıdır (Örn: "Genelleştirilmiş Koordinatlar ve Koordinat Sistemleri Atlası").
     * "problemText": İncelenen teorik çerçevenin tanımı, kapsamı ve hedeflenen analitik türetimlerin özeti olmalıdır.
     * "problemDiagram": Varsa ana koordinat sistemlerini (kartezyen vs. eğrisel/polar eksenler) veya geometrik yapıyı gösteren bir şema çizilmelidir.
     * "sections": Her bir koordinat sistemi veya teorik alt başlık müstakil bir bölüm olmalıdır (Örn: "1. Genelleştirilmiş Koordinatlar Teorisi ($q_j$)", "2. Düzlem Polar Koordinatlar ($r, \\theta$)", "3. Dairesel Silindirik Koordinatlar ($\\rho, \\phi, z$)", "4. Küresel Koordinatlar ($r, \\theta, \\phi$)").
     * Türetimler: Konum vektörü $\\vec{r}$, hız $\\vec{v}$, ivme $\\vec{a}$, metrik tensör / yay elemanı $ds^2$, hacim elemanı $dV$ gibi temel büyüklükler eksiksiz atomik "equation" bloklarıyla verilmelidir.
     * "verification": Son bölüm mutlaka ve istisnasız koordinat indirgemeleri ve sınır durum analizlerini içermelidir (Bölüm Başlığı: "Doğruluk ve Limit Durum İncelemeleri (Boyut Analizi & Koordinat İndirgemeleri)"). Küresel koordinatlardan polar koordinatlara indirgeme ($\\theta = \\pi/2, \\dot{\\theta} = 0 \\implies$ polar düzlem), silindirik koordinatlardan polar koordinatlara indirgeme ($z = \\text{sabit}, \\dot{z} = 0$) ve boyut kontrolleri eksiksiz gösterilmelidir.`;

    let userPrompt = problem.text.trim();
    if (pdfExtractedSection) {
      userPrompt = userPrompt
        ? `${userPrompt}\n${pdfExtractedSection}`
        : `Lütfen ekteki PDF belgesinden çıkarılan fizik/matematik problemini veya teorik konusunu inceleyip eksiksiz akademik raporunu üretiniz:${pdfExtractedSection}`;
    }

    if (!userPrompt) {
      userPrompt = 'Lütfen verilen fizik/matematik çalışmasını / teorik konusunu / problemini eksiksiz ve adım adım analiz ediniz.';
    }

    const rawJson = await this.callDeepSeek([
      { role: 'system', content: localizePrompt(systemPrompt, this.config.language) },
      { role: 'user', content: `${userPrompt}\n\n${buildSubpartSolutionInstruction(problem.text, this.config.language)}` }
    ]);

    return safeJsonParse<RawSolutionResponse>(rawJson, this.translate);
  }

  /**
   * Yerinde (Inline) Derinleşme Katmanı:
   * Tıklanan bir formül veya kavramın aksiyomatik/teorematik ispatını üretir.
   */
  public async expand(request: ExpansionRequest): Promise<RawExpansionResponse> {
    this.validateApiKey();

    const targetEq =
      request.targetBlock && 'latex' in request.targetBlock
        ? request.targetBlock.latex
        : '';
    const inquiry =
      typeof request.contextualInquiry === 'string'
        ? (request.contextualInquiry as string)
        : request.contextualInquiry?.userQuery || request.contextualInquiry?.selectedText || '';

    const systemPrompt = `Sen KATMANDU Bilimsel Derinleşme Motorusun. Kullanıcının tıkladığı bir denklemin veya seçtiği bir terimin temel türetimini, geometrik gerekçesini ve altında yatan fiziksel veya matematiksel ilkeleri adım adım açıklarsın.

ÖNEMLİ (DÜŞÜNCE BÜTÇESİ VE VERİMLİLİK):
Düşünce sürecini (reasoning) gereksiz uzatmadan doğrudan ve öz tut. Çıktı token bütçesini tüketme ve doğrudan geçerli JSON nesnesini üret.

GÖREVİN VE ÇIKTI FORMATIN:
Yalnızca geçerli bir JSON nesnesi üretmelisin:
{
  "title": "Katman Başlığı (Örn: Teğetsel İzdüşüm ve Kutupsal Koordinatlar veya Hipotenüs ve Pisagor Teoremi)",
  "explanation": "Bu katmanda neyin incelendiğinin kısa özeti",
  "isAxiomatic": true veya false,
  "isTerminal": true veya false,
  "axiomType": "physics" veya "mathematics",
  "diagram": {
    "width": 340,
    "height": 200,
    "caption": "Bu katmana özel FBD, vektör izdüşümü veya dik üçgen geometrisi şeması (soyut/anlamsız kaldığı durumlarda null olabilir)",
    "elements": [ ... ]
  },
  "blocks": [
    { "kind": "prose", "text": "Metin açıklaması..." },
    { "kind": "equation", "latex": "saf LaTeX formülü", "explanation": "isteğe bağlı kısa açıklama" }
  ]
}

KRİTİK AKSİYOMATİK DERECELENDİRME VE İSPAT KURALLARI:
1. AKSİYOM TANIMI: Bir ilke yalnızca ve sadece doğrulanamaz/ispatlanamaz temel bir fiziksel varsayım (Newton Hareket Yasaları, Enerji Korunumu, Işık Hızı Sabitliği vb.) veya matematiksel temel aksiyom (Peano Aksiyomları, Öklid Aksiyomları vb.) ise isAxiomatic = true olmalıdır.
2. TEOREM VE ÖNERMELER İSPATLANABİLİRDİR: Pisagor Teoremi, Hipotenüs Bağıntısı, Taylor Serisi, Kinetik Enerji Teoremi, Gauss Teoremi gibi türetilebilir veya geometrik olarak kanıtlanabilir ilkeler ASLA aksiyomatik değildir (isAxiomatic = false, isTerminal = false).
3. SADECE TÜRKÇE: Açıklamalar ve başlıklar eksiksiz Türkçe olmalıdır.
4. METİN İÇİ FORMÜL YASAĞI: Formülleri metin içine değil, bağımsız "equation" bloklarına yaz.
5. MEVCUT ÇÖZÜMLE TAM UYUM: İncelenen denklem mevcut çözümün bir parçasıdır. Çözümdeki değişken adlandırmaları ($m, L, \theta$ vb.) ve koordinat sistemleriyle eksiksiz uyum içinde kalınmalıdır.
6. DİYAGRAM VE GÖRSELLEŞTİRME (YÜKSEK ÖNCELİK / AKILLI KARAR): İncelenen türetimin FBD, vektör, geometrik şeması veya matematiksel fonksiyon grafiği (curve ve fillUnder) mümkünse mutlaka diagram nesnesini üret (yüksek önceliklidir). Ancak tamamen soyut bir cebirsel işlem ise ve görsel katma değer üretmiyorsa diagram alanı null bırakılabilir veya atlanabilir.`;

    let userPrompt = `Aşağıdaki matematiksel/fiziksel ifade için derinleşme katmanı üret:\n`;
    if (targetEq) {
      userPrompt += `Hedef Denklem: $$${targetEq}$$\n`;
    }
    if (inquiry) {
      userPrompt += `Kullanıcının Özel Sorusu/İncelenen Kavram: ${inquiry}\n`;
    }
    userPrompt += `Üst Bölüm: ${request.parentSectionTitle}\nDerinlik Seviyesi: ${request.depth}\n`;
    if (request.ancestorPath && request.ancestorPath.length > 0) {
      userPrompt += `Türetim Hiyerarşisi: ${request.ancestorPath.join(' -> ')}\n`;
    }
    if (request.solutionContext) {
      userPrompt += `\n--- MEVCUT ÇÖZÜM VE BAĞLAM (Değişkenler ve Adımlar) ---\n${request.solutionContext}\n-------------------------------------------------------\n`;
    }
    userPrompt += `Genel Problem Metni:\n${request.problemText}`;

    const rawJson = await this.callDeepSeek([
      { role: 'system', content: localizePrompt(systemPrompt, this.config.language) },
      { role: 'user', content: userPrompt }
    ]);

    return safeJsonParse<RawExpansionResponse>(rawJson, this.translate);
  }

  /**
   * DeepSeek OpenAI-uyumlu API Çağrısı ve Otomatik Yeniden Deneme (Exponential Backoff):
   */
  private async callDeepSeek(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    const baseUrl = (this.config.deepseekBaseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    const url = `${baseUrl}/chat/completions`;
    const model = this.config.deepseekModel || 'deepseek-reasoner';

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const bodyPayload: Record<string, unknown> = {
          model,
          messages,
          max_tokens: 8192
        };

        const response = await this.transport.fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.deepseekApiKey.trim()}`
          },
          body: JSON.stringify(bodyPayload)
        });

        if (!response.ok) {
          let errorDetail = `HTTP ${response.status}`;
          try {
            const errJson = await response.json();
            errorDetail = errJson.error?.message || errJson.message || JSON.stringify(errJson);
          } catch {
            const text = await response.text();
            if (text) errorDetail = text;
          }

          if (response.status === 401) {
            throw new Error(
              this.translate("Geçersiz DeepSeek API Anahtarı. Lütfen Ayarlar menüsünden API anahtarınızı kontrol ediniz.")
            );
          }

          const isRateLimit = response.status === 429;
          const isTransient =
            isRateLimit ||
            response.status === 500 ||
            response.status === 502 ||
            response.status === 503 ||
            response.status === 504 ||
            errorDetail.toLowerCase().includes('rate limit') ||
            errorDetail.toLowerCase().includes('server error') ||
            errorDetail.toLowerCase().includes('overloaded');

          if (isTransient && attempt < maxRetries) {
            const delay =
              this.retryBaseDelayMs > 0
                ? this.retryBaseDelayMs * Math.pow(2, attempt) + Math.random() * 500
                : 0;
            console.warn(
              `[DeepSeekProvider] Geçici sunucu yoğunluğu/sınırı (${response.status}: ${errorDetail}). ${Math.round(
                delay
              )}ms sonra otomatik yeniden deneniyor (Deneme ${attempt + 1}/${maxRetries})...`
            );
            if (delay > 0) {
              await this.transport.delay(delay);
            }
            continue;
          }

          if (isRateLimit) {
            throw new Error(
              this.translate("DeepSeek hız veya bakiye sınırı (Rate limit). Sistem isteği {0} kez otomatik yeniden denedi. Lütfen bakiyenizi veya kotanızı kontrol edin.", [maxRetries])
            );
          }

          if (response.status === 503 || errorDetail.toLowerCase().includes('overloaded')) {
            throw new Error(
              this.translate("DeepSeek sunucuları aşırı yoğunluk yaşıyor. Sistem isteği {0} kez otomatik yeniden denedi. Lütfen biraz bekleyin.", [maxRetries])
            );
          }

          throw new Error(this.translate("DeepSeek API Hatası ({0}): {1}", [response.status, errorDetail]));
        }

        const data = await response.json();
        this.usageTracker.record(data);
        const choice = data?.choices?.[0];
        const content = choice?.message?.content;
        const finishReason = choice?.finish_reason;

        if (!content || !content.trim()) {
          if (finishReason === 'length') {
            throw new Error(
              this.translate("DeepSeek-R1 modeli düşünme (reasoning) aşamasında token sınırını (8.192 token) tüketti ve nihai çözümü oluşturmaya token kalmadı. Lütfen soruyu daha yalın sorunuz veya Ayarlar menüsünden doğrudan ve saniyeler içinde yanıt üreten \"deepseek-chat (DeepSeek-V3)\" modelini seçiniz.")
            );
          }
          throw new Error(this.translate("DeepSeek API geçerli bir içerik döndürmedi."));
        }

        let cleanContent = content.trim();
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        }

        return cleanContent;
      } catch (err: unknown) {
      throwIfAborted(this.transport.signal);
      if (isRequestStopped(err)) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));

        if (
          lastError.message.includes(this.translate('token sınırını')) ||
          lastError.message.includes(this.translate('Geçersiz DeepSeek API')) ||
          lastError.message.includes(this.translate('DeepSeek hız veya bakiye')) ||
          lastError.message.includes(this.translate('doğrudan görsel'))
        ) {
          throw lastError;
        }

        if (attempt < maxRetries) {
          const delay =
            this.retryBaseDelayMs > 0
              ? this.retryBaseDelayMs * Math.pow(2, attempt) + Math.random() * 500
              : 0;
          console.warn(
            `[DeepSeekProvider] Ağ bağlantı hatası: ${lastError.message}. ${Math.round(
              delay
            )}ms sonra otomatik yeniden deneniyor (Deneme ${attempt + 1}/${maxRetries})...`
          );
          if (delay > 0) {
            await this.transport.delay(delay);
          }
          continue;
        }

        throw new Error(this.translate("DeepSeek API ağına bağlanılamadı: {0}", [lastError.message]));
      }
    }

    throw lastError || new Error(this.translate("DeepSeek API ile iletişim kurulamadı."));
  }

  private validateApiKey(): void {
    if (!this.config.deepseekApiKey || !this.config.deepseekApiKey.trim()) {
      throw new Error(
        this.translate("DeepSeek API anahtarı tanımlanmamış. Lütfen sağ üstteki Ayarlar simgesine tıklayarak anahtarınızı girin veya .env dosyasına VITE_DEEPSEEK_API_KEY ekleyin.")
      );
    }
  }
}
