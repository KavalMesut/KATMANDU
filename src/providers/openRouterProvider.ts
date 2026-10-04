import { createTranslator, getLanguage, localizePrompt } from '../i18n';
import { ProviderTransport, isRequestStopped, throwIfAborted } from './providerTransport';
import { SolutionProvider } from './solutionProvider';
import { ExpansionProvider } from './expansionProvider';
import {
  ProblemInput,
  ProblemAttachment,
  RawSolutionResponse,
  ExpansionRequest,
  RawExpansionResponse,
  DetectedQuestionItem
} from '../domain/types';
import { AppConfig } from '../domain/config';
import { readCachedModels } from '../domain/modelCatalog';
import { UsageTracker } from '../domain/usageReport';
import { safeJsonParse } from '../domain/jsonRepair';
import {
  buildQuestionDetectionPrompt,
  parseDetectedQuestions,
  detectMultipleQuestions,
  buildSubpartSolutionInstruction
} from '../domain/questionParser';
import {
  extractTextFromPdf,
  renderPdfPagesToImages,
  isPdfAttachment
} from '../domain/pdfExtractor';

class OpenRouterRequestError extends Error {}

/**
 * OpenRouterProvider:
 * OpenRouter üzerinden Claude 3.7 Sonnet, DeepSeek R1, GPT-4o, Gemini 2.5 Pro gibi
 * 200'den fazla yapay zeka modelini tek bir API anahtarı ve cüzdanla çalıştıran canlı sağlayıcı.
 *
 * İlkeler:
 * - OpenRouter /v1/chat/completions endpoint'ini çağırır.
 * - Model kimliği: config.openrouterModel (varsayılan: anthropic/claude-3.7-sonnet)
 * - OpenRouter zorunlu başlıkları: HTTP-Referer ve X-Title
 * - Çok modlu (multimodal) görsel ve PDF desteği
 * - Düşünce/akıl yürütme etiketleri (<think>...</think>) ayıklama ve JSON onarım dayanıklılığı
 */
export class OpenRouterProvider implements SolutionProvider, ExpansionProvider {
  public readonly usageTracker = new UsageTracker();
  private translate: ReturnType<typeof createTranslator>;
  private transport: ProviderTransport;
  setRequestSignal(signal: AbortSignal) { this.transport.signal = signal; }
  setBudgetSpent(usd: number) { this.transport.initialCostUsd = usd; }
  public readonly providerName: string;
  public appliedReasoningEffort?: string;

  constructor(private config: AppConfig, public retryBaseDelayMs: number = 1500) {
    this.config = { ...config, language: config.language ?? getLanguage() };
    this.translate = createTranslator(this.config.language!);

    this.transport = new ProviderTransport(this.config, 'openrouter', this.usageTracker);
    const modelName = config.openrouterModel || 'anthropic/claude-sonnet-4.6';
    this.providerName = `openrouter-${modelName.replace('/', '-')}`;
  }

  /**
   * Görsel veya metindeki bağımsız soruları analiz edip ayrıştırır.
   */
  public async detectQuestions(problem: ProblemInput): Promise<DetectedQuestionItem[]> {
    if (!this.config.openrouterApiKey?.trim()) {
      return [
        {
          questionNumber: 1,
          title: 'Problem 1',
          instruction: problem.text || this.translate("Problemi adım adım çöz.")
        }
      ];
    }

    const hasAttachments = Boolean(problem.attachments && problem.attachments.length > 0);

    // Eklenti yoksa, öncelikle yerel metin ayrıştırma kurallarını uygula
    if (!hasAttachments) {
      const textDetected = detectMultipleQuestions(problem.text);
      if (textDetected.length > 1) {
        return textDetected.map((qText, idx) => ({
          questionNumber: idx + 1,
          title: this.translate("Soru {0}", [idx + 1]),
          instruction: qText,
          rawText: qText
        }));
      }
    }

    try {
      const systemPrompt = buildQuestionDetectionPrompt(this.config.language);

      let userPrompt =
        'Lütfen bu belgede/görselde yer alan bağımsız soruları tespit et. Kaç farklı soru olduğunu JSON şemasında listele.';
      if (problem.text && problem.text.trim()) {
        userPrompt += `\n\nKullanıcı notu/açıklaması:\n${problem.text.trim()}`;
      }

      const userContent = await this.prepareContent(userPrompt, problem.attachments);

      const rawJson = await this.callOpenRouter(
        [
          { role: 'system', content: localizePrompt(systemPrompt, this.config.language) },
          { role: 'user', content: userContent }
        ],
        { maxTokens: 400, reasoningEffort: 'low' }
      );

      const parsed = parseDetectedQuestions(safeJsonParse<unknown>(rawJson, this.translate), '', this.config.language);
      if (parsed && parsed.length > 0) {
        return parsed;
      }
    } catch (err) {
      throwIfAborted(this.transport.signal);
      if (isRequestStopped(err)) throw err;
      if (problem.attachments?.some(isPdfAttachment)) throw err;
      console.warn('[OpenRouterProvider] Soru tespitinde hata:', err);
    }

    // Yedek: Soru ayrıştırılamazsa tek soru olarak devam et
    return [
      {
        questionNumber: 1,
        title: 'Problem 1',
        instruction: problem.text || this.translate("Problemi adım adım çöz.")
      }
    ];
  }

  /**
   * Çok modlu girdi (Metin, Görsel ve PDF ekleri) içeriğini hazırlar.
   */
  private async prepareContent(
    basePrompt: string,
    attachments?: ProblemAttachment[]
  ): Promise<string | Array<{ type: string; text?: string; image_url?: { url: string } }>> {
    if (!attachments || attachments.length === 0) {
      return basePrompt;
    }

    const pdfAttachments = attachments.filter((att) => isPdfAttachment(att));
    const imageAttachments = attachments.filter(
      (att) => !isPdfAttachment(att) && (att.type === 'image' || att.mimeType?.startsWith('image/'))
    );

    const extractedPdfTexts: string[] = [];
    const pdfImages: string[] = [];

    for (const pdfAtt of pdfAttachments) {
      const rawData = pdfAtt.dataUrl || pdfAtt.data;
      const pdfText = await extractTextFromPdf(rawData, this.transport.signal);
      const isExtractedTextValid =
        pdfText &&
        !pdfText.includes(this.translate('okunabilir metin bulunamadı')) &&
        !pdfText.includes(this.translate('içeriği çıkarılamadı')) &&
        pdfText.trim().length > 15;

      const pageImages = await renderPdfPagesToImages(rawData, undefined, this.transport.signal);

      if (!isExtractedTextValid && pageImages.length === 0) {
        throw new Error(
          this.translate("PDF belgesi (\"{0}\") okunamadı veya içeriği çıkarılamadı. Lütfen PDF içeriğini görsel (PNG/JPEG) olarak yükleyin veya metni kopyalayıp yapıştırın.", [pdfAtt.name || 'belge.pdf'])
        );
      }

      if (isExtractedTextValid) {
        extractedPdfTexts.push(`[PDF Ek Belgesi Metin İçeriği (${pdfAtt.name || 'Belge'}):\n${pdfText}\n]`);
      }

      if (pageImages.length > 0) {
        pdfImages.push(...pageImages);
      }
    }

    let fullPromptText = basePrompt;
    if (extractedPdfTexts.length > 0) {
      fullPromptText += `\n\n${extractedPdfTexts.join('\n\n')}`;
    }

    const allImages: string[] = [
      ...imageAttachments.map(
        (att) =>
          att.dataUrl ||
          (att.data.startsWith('data:') ? att.data : `data:${att.mimeType};base64,${att.data}`)
      ),
      ...pdfImages
    ];

    if (allImages.length === 0) {
      return fullPromptText;
    }

    const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: fullPromptText }
    ];

    for (const imgUrl of allImages) {
      parts.push({
        type: 'image_url',
        image_url: { url: imgUrl }
      });
    }

    return parts;
  }

  public async solve(problem: ProblemInput): Promise<RawSolutionResponse> {
    this.validateApiKey();

    const systemPrompt = `Sen KATMANDU Bilimsel Çözüm, Teori ve Epistemik Derinleşme Motorusun. Üniversite lisans ve lisansüstü düzeyindeki fizik ve matematik problemlerini çözer; teorik konuları, kavram türetimlerini, karşılaştırmalı analitik ders notlarını ve geometri/fizik atlaslarını klasik ders kitabı ve akademik makale sadeliğinde eksiksiz üretirsin.

GÖREVİN VE ÇIKTI FORMATIN:
Yalnızca geçerli bir JSON nesnesi üretmelisin. JSON yapısı şu şemaya tam uymalıdır:
{
  "problemTitle": "Çalışma / Problem / Konu Başlığı (Örn: Genelleştirilmiş Koordinatlar ve Koordinat Sistemleri Atlası veya İdeal Basit Sarkacın Hareketi)",
  "problemText": "Görsel, PDF veya metinden çıkarılan konunun / sorunun EKSİKSİZ TAM METNİ, incelenen teorik kapsam veya verilen sayısal/sembolik değerler ($...$ formülleriyle)",
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
      { "condition": "M \\to \\infty", "expected": "Sabit eğik düzlem ivmesi a = g \\sin\\alpha", "analysis": "M sonsuza giderken kamanın ivmesi sıfıra gider ve..." }
    ]
  }
}

KRİTİK KURALLAR:
1. DİYAGRAM VE GÖRSELLEŞTİRME (YÜKSEK ÖNCELİK / AKILLI KARAR):
   - Problemin geometrisi, fiziksel mekanizması, serbest cisim diyagramı (FBD), kuvvet vektörleri, elektrik devresi, fonksiyon grafiği veya koordinat eksenleri görselleştirmeye elveriyorsa, çözüme mutlaka problemi açıklayan bir "diagram" bloğu eklenmelidir. Şema eklemek en yüksek önceliktir.
   - Element türleri: surface, line, polygon, mass, vector, angle, point, axis, resistor, source, ground, capacitor, spring, pulley, curve (matematiksel fonksiyon eğrisi, parabol, trigonometrik/asimptotik dalga vb.; opsiyonel fillUnder: true veya "rgba(...)" ile eğri altı integral taralı alanı, opsiyonel fillBaselineY: number).
   - İSTİSNA (DİYAGRAM GEREKTİRMEYEN SOYUT SORULAR): Soru tamamen soyut bir matematik, kalkülüs/integral, soyut cebir, sayılar teorisi veya salt sembolik bir teorem/özdeşlik ise ve tüm değerlendirmeye rağmen bir şema çizmek gerçekten gereksiz ve yapay/işlevsiz kalacaksa, zoraki boş koordinat ekseni çizilmemeli ve "diagram" bloğu atlanmalıdır (çözümde diagram bloğu yer almayabilir).
2. SİSTEM KİMLİĞİ YOKTUR: Asla block_id veya denklem numarası (1, 2) üretme. Bunları uygulama kendisi atar.
3. KESİN MATEMATİKSEL ATOMİKLİK VE METİN İÇİ FORMÜL YASAĞI: Metin ("prose") blokları içine ASLA kesirli (\\frac), kareköklü (\\sqrt), integralli (\\int), türevli (\\dot veya d/dt) veya bileşik formüller gömme (Örn: metin içine "\\frac{1}{2\\pi}\\sqrt{...}" YAZMA!).
   - "prose" bloklarında sadece tekil semboller ($m$, $L$, $\theta$) veya en temel hatırlatmalar ($F=ma$, $E=mc^2$) yer alabilir.
   - Bütün ara ve nihai formüller, türetimler ve matematiksel eşitlikler İSTİSNASIZ bağımsız, ortalanmış ve numaralandırılacak olan "equation" blokları olarak verilmelidir.
   - Her denklemi ayrı bir "equation" bloğuna koy; asla birden fazla bağıntıyı tek bir blokta birleştirme.
4. LİSANS DÜZEYİNDE VE AKADEMİK STANDART:
   - FİZİK PROBLEMLERİNDE: Serbest cisim diyagramı (FBD), genelleştirilmiş koordinatlar, serbestlik dereceleri, Lagrangian veya Newton denklemleriyle adımlar net ve odaklı kurulmalıdır.
   - SAF MATEMATİK PROBLEMLERİNDE (Aksiyomatik & Titiz İspat Mimarisi):
     * Tanım & Hipotez: Değişkenlerin tanım kümesi ($x \\in \\mathbb{R}$ vb.), kısıtlar, başlangıç/sınır koşulları.
     * Teorem / Önerme Beyanı: Çözülecek veya ispatlanacak teorem açık ve bağımsız ifade edilmelidir.
     * Adım Adım Analitik İspat / Çözüm: Her adımın dayandığı kural (L'Hôpital, Kısmi İntegrasyon, Değişken Değişimi, Taylor Serisi, Matris Özdeğerleri vb.) belirtilerek atomik adımlarla ilerlenmelidir.
     * İspatın Tamamlanması: İspat veya nihai çözüm açık bir sonuç cümlesi ve klasik $\\blacksquare$ (Q.E.D.) sembolü ile taçlandırılmalıdır.
   - Sayfalarca rutin cebirle metin şişirilmemeli; ara işlemler kullanıcının denkleme tıklayarak açacağı derinleşme katmanına bırakılacaktır.
5. JSON İÇİNDE LATEX KAÇIŞI (ESCAPE): JSON formatı gereği her ters eğik çizgiyi ÇİFT TERS EĞİK ÇİZGİ olarak yaz (Örn: \\theta, \\frac, \\lambda, \\vec, \\alpha, \\partial).
6. DİL KURALI (ZORUNLU VE İSTİSNASIZ TÜRKÇE): Soru hangi dilde girilirse girilsin (örneğin İngilizce bir metin, İngilizce bir ders kitabı fotoğrafı veya İngilizce bir PDF makale/sınav olsa dahi), ÇÖZÜMÜN TAMAMI (problemTitle, problemText, strategy, assumptions, tüm bölüm başlıkları, metin açıklamaları ve kavramlar) HER ZAMAN VE İSTİSNASIZ TÜRKÇE OLARAK ÜRETİLMELİDİR.
7. GÖRSEL/PDF'TEN SORU TRANSKRİPSİYONU VE ŞEKLİ (ZORUNLU): Soru bir görsel veya PDF dokümanı olarak yüklenmişse; "problemText" alanına sorunun tam metnini, verilenleri ve ne istendiğini eksiksiz Türkçe olarak transkribe et (asla boş bırakma!). "problemDiagram" alanına ise sorudaki orijinal fiziksel düzenek/geometri şemasını vektörel olarak çiz. Çözüm raporunda hem sorunun tam metni hem de temiz şekli eksiksiz yer almalıdır.
8. ÇÖZÜMÜN DOĞRULUK SAĞLAMASI VE DENETİMİ (ZORUNLU - BOYUT ANALİZİ / ANALİTİK SAĞLAMA, LİMİT DURUMLAR & İLERİ DÜZEY DERİNLEŞTİRMELER): Her çözümün SON BÖLÜMÜ mutlaka ve istisnasız bir doğrulama bölümü içermelidir.
   - FİZİK / MÜHENDİSLİK PROBLEMLERİNDE:
     * Bölüm Başlığı: "Çözümün Sağlaması ve Doğruluk Kontrolleri (Boyut Analizi & Limit Durumlar)"
     * "blocks" dizisi içine hem "**1. Boyut Analizi (Dimensional Analysis):**" hem de "**2.1 Limit Durumu ($M \\to \\infty$):**", "**2.2 Limit Durumu ($\\alpha \\to 0$):**" gibi alt başlıkları, tam matematiksel türetim adımlarını ve fiziksel açıklamalarını "prose" ve "equation" blokları olarak EKSİKSİZ VE DETAYLI YAZIN.
     * a) Boyut Analizi: Türetilen nihai formülün sol ve sağ tarafının temel SI boyutları ([M], [L], [T], [I] vb.) tek tek analiz edilmeli ve boyut tutarlılığı gösterilmelidir.
     * b) Limit Durumlar: Problemin parametrelerine göre en az 2-3 kritik sınır durumu incelenmelidir.
   - SAF MATEMATİK PROBLEMLERİNDE (Kalkülüs, İntegral, Diferansiyel Denklemler, Cebir, Geometri, Olasılık vb. birimsiz soyut matematik):
     * DİKKAT: SAF MATEMATİKTE ASLA BOYUT ANALİZİ YAPILMAZ! [M], [L], [T] gibi fiziksel boyutlar uydurmayın veya "boyut analizi" başlığı koymayın!
     * Bölüm Başlığı: "Çözümün Sağlaması ve Doğruluk Kontrolleri (Analitik Sağlama & Özel Değerler)"
     * a) Analitik Sağlama (Ters İşlem ve Doğrulama): İntegrallerde anti-türevin türevi alınarak integrand ile özdeşliği ($F'(x) = f(x)$), diferansiyel denklemlerde çözüm ve türevlerinin denklemde yerine konup sağlandığı gösterilmelidir.
     * b) Özel Değerler ve Sınır Koşulları: Değişkenin veya parametrenin $x=0, 1$ veya $x \\to \\infty$ gibi özel/kritik değerlerindeki davranışları test edilmelidir.
     * İleri Düzey Derinleştirme Sağlamaları (advancedChecks): Raporda sadeliği korumak için ana gövdeye özet olarak bırakılan ve kullanıcının tıklayarak derinleşebileceği 2-3 adet alternatif doğrulama yöntemi tanımla.
9. İSTEĞE BAĞLI ALTERNATİF ÇÖZÜM YOLU TAVSİYESİ (2. VE 3. YOL - ZORLAMA YOK):
   - Eğer problemin çözümüne kökten farklı ve bağımsız bir metodoloji sunan (Örn: Lagrange ile çözüldüyse Newton/d'Alembert Dinamiği; Newton ile çözüldüyse Lagrange/Hamilton; Kısmi İntegrasyon ile çözüldüyse Feynman Parametrik Türevi; Cebirsel çözüldüyse Geometrik Çözüm vb.) BARİZ BİR 2. YOL VARSA, bunu ilk çözümün ana metnine zorla yazıp token tüketmeyiniz.
   - Bunun yerine JSON kökünde "recommendedPaths" dizisi tanımlayınız (kullanıcı talep ettiğinde isteğe bağlı ayrı çözülecektir):
   "recommendedPaths": [
     {
       "id": "path_2",
       "methodName": "Newton / d'Alembert Dinamiği",
       "badge": "⚡ 2. Yol (Vektörel)",
       "description": "Serbest cisim diyagramı ve eylemsizlik kuvvetleriyle bağımsız vektörel türetim.",
       "query": "Bu problemi Newton / d'Alembert serbest cisim diyagramı ve vektörel dinamik denklemleri kullanarak baştan çözünüz."
     }
   ]
   - Eğer bariz ve değer katan bağımsız bir 2. yol yoksa, "recommendedPaths" alanını boş bırakınız veya eklemeyiniz (asla yapay/zorlama 2. yol üretmeyiniz).
10. TEORİK KONU ANLATIMI VE KAVRAM İNCELEMESİ (EVRENSEL BİLİMSEL MOD):
   - Kullanıcı klasik bir sınav sorusu yerine teorik bir konu anlatımı, kavram türetimi veya koordinat sistemi incelemesi istediğinde (Örn: "Genelleştirilmiş koordinatları anlat, polar, silindirik ve küresel koordinatlara uygula"):
     * Yapay bir sınav sorusu formatı ("Soru: Genelleştirilmiş koordinatlar nedir?") UYDURMAYINIZ.
     * "problemTitle": Konunun akademik başlığı olmalıdır (Örn: "Genelleştirilmiş Koordinatlar ve Koordinat Sistemleri Atlası").
     * "problemText": İncelenen teorik çerçevenin tanımı, kapsamı ve hedeflenen analitik türetimlerin özeti olmalıdır.
     * "problemDiagram": Varsa ana koordinat sistemlerini (kartezyen vs. eğrisel/polar eksenler) veya geometrik yapıyı gösteren bir şema çizilmelidir.
     * "sections": Her bir koordinat sistemi veya teorik alt başlık müstakil bir bölüm olmalıdır (Örn: "1. Genelleştirilmiş Koordinatlar Teorisi ($q_j$)", "2. Düzlem Polar Koordinatlar ($r, \\theta$)", "3. Dairesel Silindirik Koordinatlar ($\\rho, \\phi, z$)", "4. Küresel Koordinatlar ($r, \\theta, \\phi$)").
     * Türetimler: Konum vektörü $\\vec{r}$, hız $\\vec{v}$, ivme $\\vec{a}$, metrik tensör / yay elemanı $ds^2$, hacim elemanı $dV$ gibi temel büyüklükler eksiksiz atomik "equation" bloklarıyla verilmelidir.
     * "verification": Son bölüm mutlaka ve istisnasız koordinat indirgemeleri ve sınır durum analizlerini içermelidir (Bölüm Başlığı: "Doğruluk ve Limit Durum İncelemeleri (Boyut Analizi & Koordinat İndirgemeleri)"). Küresel koordinatlardan polar koordinatlara indirgeme ($\\theta = \\pi/2, \\dot{\\theta} = 0 \\implies$ polar düzlem), silindirik koordinatlardan polar koordinatlara indirgeme ($z = \\text{sabit}, \\dot{z} = 0$) ve boyut kontrolleri eksiksiz gösterilmelidir.

   Ayrıca JSON kökünde "verification" alanını doldur:
   "verification": {
     "dimensionalAnalysis": "Fizik/teori için boyut analizi metni (saf soyut matematik ise null veya boş bırakınız)",
     "limitingCases": [
       { "condition": "M \\to \\infty (veya \\theta \\to \\pi/2)", "expected": "Beklenen davranış", "analysis": "Matematiksel kanıt..." }
     ],
     "advancedChecks": [
       { "id": "check_1", "title": "Doğrulama Başlığı", "type": "alternative_method", "badge": "🔄 Analitik Sağlama", "description": "Açıklama...", "query": "Derinleşme sorgusu..." }
     ]
   }`;

    const hasAttachments = Boolean(problem.attachments && problem.attachments.length > 0);
    const hasPdf = problem.attachments?.some((a) => isPdfAttachment(a));

    let promptText = problem.text.trim();
    if (!promptText && hasAttachments) {
      promptText = hasPdf
        ? 'Lütfen ekteki PDF dokümanında yer alan fizik/matematik problemini veya teorik konusunu inceleyiniz ve eksiksiz akademik raporunu üretiniz.'
        : 'Lütfen ekteki görselde yer alan fizik/matematik problemini veya teorik konusunu analiz edip eksiksiz akademik raporunu üretiniz.';
    } else if (promptText && hasAttachments) {
      promptText = `Lütfen ekteki dosyayı ve şu açıklamayı dikkate alarak fizik/matematik çalışmasını / problemini analiz et:\n\n${promptText}`;
    } else {
      promptText = `Lütfen şu fizik/matematik çalışmasını / konusunu / problemini analiz et ve eksiksiz akademik raporunu üret:\n\n${promptText}`;
    }

    const userContent = await this.prepareContent(`${promptText}\n\n${buildSubpartSolutionInstruction(problem.text, this.config.language)}`, problem.attachments);

    const rawJson = await this.callOpenRouter([
      { role: 'system', content: localizePrompt(systemPrompt, this.config.language) },
      { role: 'user', content: userContent }
    ]);

    return safeJsonParse<RawSolutionResponse>(rawJson, this.translate);
  }

  public async expand(request: ExpansionRequest): Promise<RawExpansionResponse> {
    this.validateApiKey();

    const targetEq =
      request.targetBlock && 'latex' in request.targetBlock
        ? request.targetBlock.latex
        : '';
    const inquiry = request.contextualInquiry;

    const systemPrompt = `Sen KATMANDU Bilimsel Derinleşme Motorusun. Kullanıcının tıkladığı bir denklemin veya seçtiği bir terimin temel türetimini, geometrik gerekçesini ve altında yatan fiziksel veya matematiksel ilkeleri adım adım açıklarsın.

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
    "caption": "Bu katmana özel FBD, vektör izdüşümü veya dik üçgen geometrisi şeması",
    "elements": [ ... ]
  },
  "blocks": [
    { "kind": "prose", "text": "Açıklama metni. SADECE tekil semboller ($x$, $\\theta$) veya çok kısa hatırlatmalar ($F=ma$) içerebilir; kesirli ve köklü formülleri metin içine gömme!" },
    { "kind": "equation", "latex": "alt denklem, teorem veya türetim adımı (tüm bağıntılar ve türetim adımları burada bağımsız yer almalıdır)", "explanation": "kısa açıklama" }
  ]
}

KRİTİK KURALLAR:
1. EVRENSEL ANALİTİK TÜRETİM: Tıklanan denklem ana metinde sıkıştırılmış veya doğrudan verilmiş olabilir. Görevin, o problemin ait olduğu bilimsel alana göre ilgili kurucu denklemi belirlemek; ara matematiksel adımları adım adım göstererek o denklemin nereden ve nasıl doğduğunu kanıtlamaktır.
2. DİSİPLİNLERARASI GEÇİŞ VE SAF MATEMATİĞE SIÇRAMA (BAĞLAM SERBESTLİĞİ): Eğer kullanıcı fiziksel bir çözümün içinden geometrik veya saf matematiksel bir kavramı/terimi (Örn: 'hipotenüs', 'dik üçgen', 'Pisagor teoremi', 'trigonometrik bağıntılar', 'Taylor serisi') seçmişse veya sorgulamışsa; fiziksel bağlamdan kopup saf matematiğe in: Formel tanımını yap, teoremi ver, analitik ispatını sun ve "axiomType": "mathematics" yap.
3. DİYAGRAM VE GÖRSELLEŞTİRME (YÜKSEK ÖNCELİK / AKILLI KARAR): Bu alt katmanda incelenen ifadenin FBD, vektör izdüşümü, dik üçgen/geometrik şeması (polygon) veya GEOMETRİK / MATEMATİKSEL DİYAGRAMI (Örn: curve ile fonksiyon grafiği ve fillUnder integral taralı alanı, koordinat gösterimi) mümkünse mutlaka bir "diagram" şeması üret (yüksek önceliklidir). Ancak incelenen adım tamamen soyut bir cebirsel sadeleştirme veya sembolik özdeşlik ise ve görsel çizim somut bir pedagojik değer katmıyorsa "diagram" alanı boş/null bırakılabilir veya atlanabilir. Element türleri: line, polygon, mass, vector, angle, point, surface, axis, curve.
4. AKSİYOM VE KURUCU YASALAR:
   - Bilimin kurucu doğa yasası ise (Newton, Maxwell, Hamilton, Enerji Korunumu): "isAxiomatic": true, "axiomType": "physics", "isTerminal": true yap.
   - Formel matematiğin aksiyomu/postulatı ise: "isAxiomatic": true, "axiomType": "mathematics", "isTerminal": true yap.
   - Teoremler (Pisagor, Taylor vb.) aksiyom DEĞİLDİR; ispatlanan önermelerdir ("isAxiomatic": false).
5. SİSTEM KİMLİĞİ YOKTUR: ID veya numara üretme.
6. JSON İÇİNDE LATEX KAÇIŞI (ESCAPE): Ters eğik çizgileri çift ters eğik çizgi olarak yaz (\\theta, \\frac vb.).
7. DİL KURALI (ZORUNLU TÜRKÇE): Başlıklar, özetler ve açıklamalar istisnasız Türkçe olmalıdır.
8. KESİN MATEMATİKSEL ATOMİKLİK: Metin içine kesirli veya köklü formülleri asla gömme; bağımsız equation blokları kullan.
9. MEVCUT ÇÖZÜMLE TAM BAĞLAM VE DEĞİŞKEN TUTARLILIĞI: İncelenen denklem veya kavram, mevcut çözümün bir parçasıdır (kullanıcı modeli değiştirmiş olsa bile). Çözümde tanımlanan değişken isimleri, parametreler ($m, L, \theta$ vb.), eksen kabulleri ve fiziksel mantıkla KESİNTİSİZ UYUM içinde kalınmalıdır.`;

    const solutionContextText = request.solutionContext
      ? `\n--- MEVCUT ÇÖZÜM VE BAĞLAM (Önceki Çözümün Adımları & Değişkenleri) ---\n${request.solutionContext}\n--------------------------------------------------------------------\n`
      : '';

    let userPrompt = '';
    if (inquiry) {
      userPrompt = `Kullanıcı belgede şu ifadeyi seçti/sorguladı: "${inquiry.selectedText}"\nKullanıcının özel sorusu: "${inquiry.userQuery || 'Bu ifade nedir ve nereden gelir?'}"\nBulunulan Bölüm: "${request.parentSectionTitle}"\nÖzgün Problem: "${request.problemText}"${solutionContextText}\nGeçerli Derinlik: ${request.depth}\n\nÖNEMLİ KURAL: Eğer seçilen terim matematiksel veya geometrik bir kavramsa (Örn: hipotenüs, Pisagor, dik üçgen, trigonometri, Taylor serisi vb.), fiziksel bağlamda kalmak zorunda değilsin; bağlamdan koparak saf matematiğe ve geometriye sıçra: Tanımını yap, ilgili teoremi ver, adım adım geometrik/cebirsel ispatını sun ve aksiyomatik zeminini belirt ("axiomType": "mathematics").`;
    } else {
      userPrompt = `İncelenen Denklem: ${targetEq}\nBulunulan Bölüm: "${request.parentSectionTitle}"\nÖzgün Problem: "${request.problemText}"${solutionContextText}\nGeçerli Derinlik: ${request.depth}\n\nLütfen bu denklemin nereden çıktığını açıklayın. Çözümdeki değişken adlandırmaları ve koordinatlarla tam uyumlu kalın. Eğer denklem veya kavram matematiksel/geometrik bir bağıntıysa fiziksel bağlamdan kopup saf matematiksel türetim/ispat verin ve "axiomType": "mathematics" yapın. İlgili şemayı mutlaka ekleyin.`;
    }

    const rawJson = await this.callOpenRouter([
      { role: 'system', content: localizePrompt(systemPrompt, this.config.language) },
      { role: 'user', content: userPrompt }
    ]);

    return safeJsonParse<RawExpansionResponse>(rawJson, this.translate);
  }

  private async callOpenRouter(
    messages: Array<{ role: string; content: string | unknown[] }>,
    options?: { maxTokens?: number; reasoningEffort?: 'low' | 'medium' | 'high' }
  ): Promise<string> {
    const url = `${this.config.openrouterBaseUrl.replace(/\/+$/, '')}/chat/completions`;

    const effort = options?.reasoningEffort ?? this.config.openrouterReasoningEffort ?? 'low';

    const model = this.config.openrouterModel || 'anthropic/claude-sonnet-4.6';
    const supported = readCachedModels(this.config, 'openrouter')
      .find((entry) => entry.id === model)?.supportedParameters;
    const bodyPayload: Record<string, unknown> = { model, messages, usage: { include: true } };
    // The model catalog is a union of endpoint capabilities. Start with advertised
    // options, then retry without them if no endpoint is available for this account.
    if (supported?.includes('response_format')) {
      bodyPayload.response_format = { type: 'json_object' };
    }
    if (supported?.includes('reasoning')) {
      bodyPayload.reasoning = { effort };
    }

    if (options?.maxTokens) {
      bodyPayload.max_tokens = options.maxTokens;
    }

    const maxRetries = 3;
    let lastError: Error | null = null;
    let retriedWithoutOptionalParameters = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.transport.fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.openrouterApiKey.trim()}`,
            'HTTP-Referer': 'https://katmandu.ai',
            'X-Title': 'KATMANDU - Academic Derivation Engine'
          },
          body: JSON.stringify(bodyPayload)
        });

        if (!response.ok) {
          let errorDetail = '';
          try {
            const errorJson = await response.json();
            errorDetail = errorJson?.error?.message || JSON.stringify(errorJson);
          } catch {
            errorDetail = await response.text();
          }

          if (response.status === 401) {
            throw new Error(
              this.translate("Geçersiz OpenRouter API Anahtarı. Lütfen Ayarlar panelinden OpenRouter anahtarınızı kontrol edin.")
            );
          }

          if (response.status === 402) {
            throw new Error(
              this.translate("OpenRouter bakiye yetersiz (Payment Required). Lütfen openrouter.ai hesabınıza kredi yükleyin.")
            );
          }

          if (response.status === 404 && /no endpoints found|filter by parameters/i.test(errorDetail)) {
            if (!retriedWithoutOptionalParameters && ('response_format' in bodyPayload || 'reasoning' in bodyPayload || 'max_tokens' in bodyPayload || 'usage' in bodyPayload)) {
              delete bodyPayload.response_format;
              delete bodyPayload.reasoning;
              delete bodyPayload.max_tokens;
              delete bodyPayload.usage;
              retriedWithoutOptionalParameters = true;
              attempt--;
              continue;
            }
            throw new OpenRouterRequestError(
              this.translate("OpenRouter, {0} modeli için hesabınızda kullanılabilir bir uç nokta bulamadı. Ayarlar’dan başka bir model seçin veya bu model için gerekli BYOK sağlayıcı anahtarını OpenRouter hesabınıza ekleyin. Ayrıntı: {1}", [model, errorDetail])
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
              `[OpenRouterProvider] Geçici sunucu yoğunluğu/sınırı (${response.status}: ${errorDetail}). ${Math.round(
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
              this.translate("OpenRouter hız veya kota sınırı (Rate limit). Sistem isteği {0} kez otomatik yeniden denedi. Lütfen biraz bekleyin veya kotanızı kontrol edin.", [maxRetries])
            );
          }

          if (response.status === 503 || errorDetail.toLowerCase().includes('overloaded')) {
            throw new Error(
              this.translate("OpenRouter modeli aşırı yoğunluk yaşıyor. Sistem isteği {0} kez otomatik yeniden denedi ancak yanıt alınamadı. Lütfen biraz bekleyin veya farklı bir model seçin.", [maxRetries])
            );
          }

          throw new OpenRouterRequestError(this.translate("OpenRouter API Hatası ({0}): {1}", [response.status, errorDetail]));
        }

        const data = await response.json();
        this.appliedReasoningEffort = 'reasoning' in bodyPayload ? effort : undefined;
        this.usageTracker.record(data);
        const content = data?.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error(this.translate("OpenRouter API geçerli bir içerik döndürmedi."));
        }

        let cleanContent = content.trim();

        // Akıl yürütme (reasoning/thinking) etiketlerini temizle
        cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // Markdown JSON bloklarını temizle
        if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        }

        return cleanContent;
      } catch (err: unknown) {
      throwIfAborted(this.transport.signal);
      if (isRequestStopped(err)) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));

        if (lastError instanceof OpenRouterRequestError) throw lastError;

        // Zaten kullanıcı dostu hata fırlatıldıysa tekrar deneme
        if (
          lastError.message.includes(this.translate('Geçersiz OpenRouter API')) ||
          lastError.message.includes('OpenRouter bakiye yetersiz') ||
          lastError.message.includes(this.translate('OpenRouter hız veya kota sınırı')) ||
          lastError.message.includes(this.translate('OpenRouter modeli aşırı yoğunluk'))
        ) {
          throw lastError;
        }

        // Ağ hatasında yeniden dene
        if (attempt < maxRetries) {
          const delay =
            this.retryBaseDelayMs > 0
              ? this.retryBaseDelayMs * Math.pow(2, attempt) + Math.random() * 500
              : 0;
          console.warn(
            `[OpenRouterProvider] Ağ bağlantı hatası: ${lastError.message}. ${Math.round(
              delay
            )}ms sonra otomatik yeniden deneniyor (Deneme ${attempt + 1}/${maxRetries})...`
          );
          if (delay > 0) {
            await this.transport.delay(delay);
          }
          continue;
        }

        throw new Error(this.translate("OpenRouter API ağına bağlanılamadı: {0}", [lastError.message]));
      }
    }

    throw lastError || new Error(this.translate("OpenRouter API ile iletişim kurulamadı."));
  }

  private validateApiKey(): void {
    if (!this.config.openrouterApiKey || !this.config.openrouterApiKey.trim()) {
      throw new Error(
        this.translate("OpenRouter API anahtarı tanımlanmamış. Lütfen sağ üstteki Ayarlar simgesine tıklayarak anahtarınızı girin veya .env dosyasına VITE_OPENROUTER_API_KEY ekleyin.")
      );
    }
  }
}
