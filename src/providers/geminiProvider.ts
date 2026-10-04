import { createTranslator, getLanguage, localizePrompt } from '../i18n';
import { ProviderTransport, isRequestStopped, throwIfAborted } from './providerTransport';
import { SolutionProvider } from './solutionProvider';
import { ExpansionProvider } from './expansionProvider';
import {
  ProblemInput,
  RawSolutionResponse,
  ExpansionRequest,
  RawExpansionResponse,
  DetectedQuestionItem
} from '../domain/types';
import { AppConfig } from '../domain/config';
import { UsageTracker } from '../domain/usageReport';
import { safeJsonParse } from '../domain/jsonRepair';
import {
  buildQuestionDetectionPrompt,
  parseDetectedQuestions,
  detectMultipleQuestions,
  buildSubpartSolutionInstruction
} from '../domain/questionParser';

/**
 * GeminiProvider:
 * Google Gemini 2.5 Flash API entegrasyonu (Ücretsiz Katman).
 *
 * Yetenekler:
 * - Google AI Studio ücretsiz API anahtarı ile doğrudan tarayıcıdan çalışır.
 * - Gemini 2.5 Flash hibrit akıl yürütme (thinkingConfig.thinkingBudget) desteği.
 * - JSON Modu (responseMimeType: "application/json") ile kusursuz şema üretimi.
 * - 1M token bağlam penceresi ve günlük 1.500 istek ücretsiz kotası.
 */
export class GeminiProvider implements SolutionProvider, ExpansionProvider {
  public readonly usageTracker = new UsageTracker();
  private translate: ReturnType<typeof createTranslator>;
  private transport: ProviderTransport;
  setRequestSignal(signal: AbortSignal) { this.transport.signal = signal; }
  setBudgetSpent(usd: number) { this.transport.initialCostUsd = usd; }
  public readonly providerName = 'google-gemini-flash';

  constructor(private config: AppConfig, public retryBaseDelayMs: number = 1500) {
    this.config = { ...config, language: config.language ?? getLanguage() };
    this.translate = createTranslator(this.config.language!);
    this.transport = new ProviderTransport(this.config, 'gemini', this.usageTracker);
  }

  /**
   * Görsel, PDF veya metindeki bağımsız soruları analiz edip ayrıştırır.
   */
  public async detectQuestions(problem: ProblemInput): Promise<DetectedQuestionItem[]> {
    if (!this.config.geminiApiKey?.trim()) {
      return [
        {
          questionNumber: 1,
          title: 'Problem 1',
          instruction: problem.text || this.translate("Problemi adım adım çöz.")
        }
      ];
    }

    const hasAttachments = Boolean(problem.attachments && problem.attachments.length > 0);

    // Eklenti yoksa, öncelikle metin ayrıştırma kurallarını uygula
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
      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

      if (problem.attachments && problem.attachments.length > 0) {
        for (const att of problem.attachments) {
          const rawBase64 = att.data.includes(';base64,')
            ? att.data.split(';base64,')[1]
            : att.data;
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: rawBase64
            }
          });
        }
      }

      let userMsg =
        'Lütfen bu belgede/görselde yer alan bağımsız soruları tespit et. Kaç farklı soru olduğunu JSON şemasında listele.';
      if (problem.text && problem.text.trim()) {
        userMsg += `\n\nKullanıcı notu/açıklaması:\n${problem.text.trim()}`;
      }
      parts.push({ text: userMsg });

      const rawJson = await this.callGemini(systemPrompt, parts);
      const parsed = safeJsonParse<unknown>(rawJson, this.translate);
      return parseDetectedQuestions(parsed, problem.text, this.config.language);
    } catch (err) {
      throwIfAborted(this.transport.signal);
      if (isRequestStopped(err)) throw err;
      console.warn('Gemini çoklu soru tespiti uyarısı (fail-soft):', err);
      return [
        {
          questionNumber: 1,
          title: 'Problem 1',
          instruction: problem.text || this.translate("Problemi adım adım çöz.")
        }
      ];
    }
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
      { "condition": "M \\to \\infty (veya \\theta \\to \\pi/2)", "expected": "Beklenen davranış", "analysis": "Matematiksel kanıt..." }
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
     * b) Limit Durumlar: Problemin parametrelerine göre en az 2-3 kritik sınır durumu (örneğin kütlelerden birinin sonsuza/sıfıra gitmesi, açının 0/90 derece olması, yerçekiminin sıfır olması) incelenmelidir.
   - SAF MATEMATİK PROBLEMLERİNDE (Kalkülüs, İntegral, Diferansiyel Denklemler, Cebir, Geometri, Olasılık vb. birimsiz soyut matematik):
     * DİKKAT: SAF MATEMATİKTE ASLA BOYUT ANALİZİ YAPILMAZ! [M], [L], [T] gibi fiziksel boyutlar uydurmayın veya "boyut analizi" başlığı koymayın!
     * Bölüm Başlığı: "Çözümün Sağlaması ve Doğruluk Kontrolleri (Analitik Sağlama & Özel Değerler)"
     * a) Analitik Sağlama (Ters İşlem ve Doğrulama): İntegrallerde anti-türevin türevi alınarak integrand ile özdeşliği ($F'(x) = f(x)$), diferansiyel denklemlerde çözüm ve türevlerinin denklemde yerine konup sağlandığı, cebirsel denklemlerde köklerin yerine konduğu gösterilmelidir.
     * b) Özel Değerler ve Sınır Koşulları: Değişkenin veya parametrenin $x=0, 1$ veya $x \\to \\infty$ gibi özel/kritik değerlerindeki davranışları test edilmelidir.
9. İSTEĞE BAĞLI ALTERNATİF ÇÖZÜM YOLU TAVSİYESİ (2. VE 3. YOL - ZORLAMA YOK):
   - Eğer problemin çözümüne kökten farklı ve bağımsız bir metodoloji sunan (Örn: Lagrange ile çözüldüyse Newton/d'Alembert Dinamiği; Newton ile çözüldüyse Lagrange/Hamilton; Kısmi İntegrasyon ile çözüldüyse Feynman Parametrik Türevi; Cebirsel çözüldüyse Geometrik Çözüm vb.) BARİZ BİR 2. YOL VARSA, bunu ilk çözümün ana metnine zorla yazıp token tüketmeyiniz.
   - Bunun yerine JSON kökünde "recommendedPaths" dizisi tanımlayınız.
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

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    // Multimodal dosya ekleri (JPG, PNG, PDF vb.)
    if (problem.attachments && problem.attachments.length > 0) {
      for (const att of problem.attachments) {
        const rawBase64 = att.data.includes(';base64,')
          ? att.data.split(';base64,')[1]
          : att.data;
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: rawBase64
          }
        });
      }
    }

    const hasAttachments = parts.length > 0;
    const hasPdf = problem.attachments?.some((a) => a.type === 'pdf');
    const hasImage = problem.attachments?.some((a) => a.type === 'image');

    let promptText = problem.text.trim();
    if (!promptText && hasAttachments) {
      if (hasPdf) {
        promptText =
          'Lütfen ekteki PDF dokümanında yer alan fizik/matematik problemini veya teorik konusunu inceleyiniz, diyagramları ve formülleri çözümleyip eksiksiz akademik raporunu üretiniz.';
      } else if (hasImage) {
        promptText =
          'Lütfen ekteki görselde yer alan fizik/matematik problemini veya teorik konusunu analiz edip eksiksiz akademik raporunu üretiniz.';
      } else {
        promptText = 'Lütfen ekteki dosyada yer alan çalışmayı / problemi analiz edip eksiksiz raporunu üretiniz.';
      }
    } else if (promptText && hasAttachments) {
      promptText = `Lütfen ekteki dosya(lar)ı ve şu açıklamayı dikkate alarak fizik/matematik çalışmasını / problemini çöz:\n\n${promptText}`;
    } else {
      promptText = `Lütfen şu fizik/matematik çalışmasını / konusunu / problemini analiz et ve eksiksiz akademik raporunu üret:\n\n${promptText}`;
    }

    parts.push({ text: `${promptText}\n\n${buildSubpartSolutionInstruction(problem.text, this.config.language)}` });

    const rawJson = await this.callGemini(systemPrompt, parts);
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
1. EVRENSEL ANALİTİK TÜRETİM: Tıklanan denklem ana metinde sıkıştırılmış veya doğrudan verilmiş olabilir. Görevin, o problemin ait olduğu bilimsel alana (Klasik Mekanik, Elektromanyetizma, Termodinamik, Kuantum Fiziği, Akışkanlar veya Matematiksel Analiz) göre ilgili kurucu denklemi belirlemek; ara matematiksel adımları (kısmi türevler, vektörel açılımlar, integral veya sınır koşulları) adım adım göstererek o denklemin nereden ve nasıl doğduğunu kanıtlamaktır.
2. DİSİPLİNLERARASI GEÇİŞ VE SAF MATEMATİĞE SIÇRAMA (BAĞLAM SERBESTLİĞİ): Eğer kullanıcı fiziksel bir çözümün içinden geometrik veya saf matematiksel bir kavramı/terimi (Örn: 'hipotenüs', 'dik üçgen', 'Pisagor teoremi', 'trigonometrik bağıntılar', 'Taylor serisi', 'skaler çarpım tanımı', 'türev/integral tanımı') seçmişse, tıklamışsa veya bunu sorgulamışsa; ARTIK FİZİKSEL PROBLEMİN (sarkaç, kütle vb.) BAĞLAMINDA SIKIŞIP KALMA! Bu noktada fiziksel bağlamdan kopup saf matematiğe/geometriye inmek tamamen serbesttir ve beklenendir.
   - Terimin formel matematiksel tanımını yap (Örn: Hipotenüs: Öklid dik üçgeninde 90° dik açının karşısındaki en uzun kenar).
   - İlgili kurucu teoremi ver (Örn: a² + b² = c²).
   - Adım adım analitik/geometrik bir İSPAT sun (Örn: alan yöntemi veya benzerlik yöntemi).
   - "axiomType": "mathematics" olarak belirle.
3. DİYAGRAM VE GÖRSELLEŞTİRME (YÜKSEK ÖNCELİK / AKILLI KARAR): Bu alt katmanda incelenen ifadenin serbest cisim diyagramı (FBD), vektör izdüşümü, alan çizgileri veya GEOMETRİK / MATEMATİKSEL DİYAGRAMI (Örn: polygon ile dik üçgen, dik açı karesi, kenar etiketleri, açılar veya curve ile fonksiyon grafiği ve fillUnder integral taralı alanı) mümkünse mutlaka bir "diagram" şeması üret (yüksek önceliklidir). Ancak incelenen adım tamamen soyut bir cebirsel sadeleştirme, trigonometrik manipülasyon veya sembolik özdeşlik ise ve görsel çizim somut bir pedagojik değer katmıyorsa "diagram" alanı boş bırakılabilir veya atlanabilir. Element türleri: line, polygon, mass, vector, angle, point, surface, axis, curve.
4. AKSİYOM VE KURUCU YASALAR:
   - Eğer ulaşılan ilke bilimin kurucu bir doğa yasasıysa (Newton Yasaları, Maxwell Denklemleri, Hamilton Eylem İlkesi, Termodinamik Kanunları, Schrödinger Denklemi, Enerjinin Korunumu): "isAxiomatic": true, "axiomType": "physics", "isTerminal": true yap.
   - Eğer ulaşılan ilke formel matematiğin veya geometrinin kurucu bir aksiyomu/postulatıysa (Öklid Geometrisi 5. Postulatı / Düzlem Metriği, Peano Aksiyomları, Analiz Aksiyomları): "isAxiomatic": true, "axiomType": "mathematics", "isTerminal": true yap. Asla matematiksel kavramlara fizik yasası (Newton vb.) zorlama!
   - KRİTİK KURAL (TEOREM vs. AKSİYOM): Teoremler (Örn: Pisagor Teoremi, Hipotenüs Bağıntısı, Taylor Teoremi, Stokes Teoremi, Noether Teoremi) AKSİYOM DEĞİLDİR! Teoremler aksiyomlardan türetilen ve ispatlanan önermelerdir. Bir teorem açıklandığında kesinlikle "isAxiomatic": false, "isTerminal": false yapılmalıdır. Yalnızca daha öteye indirgenemeyen saf aksiyomlara/postulatlara ulaşıldığında aksiyom işaretlenmelidir.
5. SİSTEM KİMLİĞİ YOKTUR: ID veya numara üretme.
6. JSON İÇİNDE LATEX KAÇIŞI (ESCAPE): JSON formatı gereği her ters eğik çizgiyi ÇİFT TERS EĞİK ÇİZGİ olarak yaz (Örn: \\theta, \\frac, \\lambda, \\vec, \\alpha, \\partial).
7. DİL KURALI (ZORUNLU VE İSTİSNASIZ TÜRKÇE): Soru, görsel veya üst katmanlar İngilizce olsa dahi, bu katmandaki TÜM başlıklar, özetler, türetim adımları, ispatlar ve kavram açıklamaları KESİNLİKLE VE İSTİSNASIZ TÜRKÇE OLMALIDIR.
8. TEKİL SEMBOL VE PARAMETRE ANALİZİNDE KESİNLİK KURALI: Eğer kullanıcı tek bir harf veya sembolü ($L$, $R$, $T$, \\lambda vb.) sorgulamışsa, ASLA 'ip uzunluğu / indüktans ya da Lagrangian' gibi çoktan seçmeli, kararsız veya bölü işaretli (/) seçenekler sunma! Çözümde o sembol HANGİ FİZİKSEL ANLAMLA TANIMLANMIŞSA SADECE VE SADECE ONU ANLAT (Örn: Sarkaç probleminde $L$ yalnızca 'İp Uzunluğu'dur; devre probleminde $L$ yalnızca 'Bobin İndüktansı'dır; analitik mekanikte $\\mathcal{L}$ yalnızca 'Lagrangian'dır; devrede $R$ yalnızca 'Elektriksel Direnç'tir). Çözümdeki rolünü, SI birimini ve yönetici bağıntısını ver.
9. KESİN MATEMATİKSEL ATOMİKLİK VE METİN İÇİ FORMÜL YASAĞI: Derinleşme katmanındaki "prose" metinleri içine kesirli (\\frac), kareköklü (\\sqrt), integralli veya türetimsel formülleri ASLA gömme. Bunların her biri ayrı bir "equation" bloğu olarak bağımsız verilmelidir.
10. MEVCUT ÇÖZÜMLE TAM BAĞLAM VE DEĞİŞKEN TUTARLILIĞI: İncelenen denklem veya kavram, mevcut çözümün bir parçasıdır (kullanıcı ilk çözümü başka bir modelle almış ve modeli şimdi değiştirmiş olsa dahi). Çözümde belirlenen değişken isimleri ($m, L, \theta$ vb.), koordinat yönleri ve varsayımlarla KESİNTİSİZ UYUM içinde kalınmalıdır.`;

    const solutionContextText = request.solutionContext
      ? `\n--- MEVCUT ÇÖZÜM VE BAĞLAM (Önceki Çözümün Adımları & Değişkenleri) ---\n${request.solutionContext}\n--------------------------------------------------------------------\n`
      : '';

    let userPrompt = '';
    if (inquiry) {
      userPrompt = `Kullanıcı belgede şu ifadeyi seçti/sorguladı: "${inquiry.selectedText}"\nKullanıcının özel sorusu: "${inquiry.userQuery || 'Bu ifade nedir ve nereden gelir?'}"\nBulunulan Bölüm: "${request.parentSectionTitle}"\nÖzgün Problem: "${request.problemText}"${solutionContextText}\nGeçerli Derinlik: ${request.depth}\n\nÖNEMLİ KURAL: Eğer seçilen terim matematiksel veya geometrik bir kavramsa (Örn: hipotenüs, Pisagor, dik üçgen, trigonometri, Taylor serisi, türev tanımı vb.), fiziksel bağlamda kalmak zorunda değilsin; bağlamdan koparak saf matematiğe ve geometriye sıçra: Tanımını yap, ilgili teoremi ver, adım adım geometrik/cebirsel ispatını sun, dik üçgen veya ilgili geometrik şemayı ekle ve aksiyomatik zeminini (Öklid postulatları) belirt ("axiomType": "mathematics").`;
    } else {
      userPrompt = `İncelenen Denklem: ${targetEq}\nBulunulan Bölüm: "${request.parentSectionTitle}"\nÖzgün Problem: "${request.problemText}"${solutionContextText}\nGeçerli Derinlik: ${request.depth}\n\nLütfen bu denklemin nereden çıktığını açıklayın. Çözümdeki değişken adlandırmaları ve koordinatlarla tam uyumlu kalın. Eğer denklem veya kavram matematiksel/geometrik bir bağıntıysa fiziksel bağlamdan kopup saf matematiksel türetim/ispat verin ve "axiomType": "mathematics" yapın. Eğer fiziksel bir yasa ise ilgili teorik çerçeveden (Lagrangian/Euler-Lagrange, Newton, Maxwell vb.) türetin. İlgili şemayı mutlaka ekleyin.`;
    }

    const rawJson = await this.callGemini(systemPrompt, userPrompt);
    return safeJsonParse<RawExpansionResponse>(rawJson, this.translate);
  }

  /**
   * Gemini API Bağlantısını Sına
   */
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      this.validateApiKey();

      let model = (this.config.geminiModel || 'gemini-3.6-flash').replace(/^models\//, '');

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Respond with valid json: {"status": "ok", "message": "connected"}' }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      };

      const response = await this.transport.fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.geminiApiKey.trim() },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errDetail = (errorData as { error?: { message?: string } })?.error?.message || response.statusText;
        if (response.status === 400 && errDetail.includes('API_KEY_INVALID')) {
          return {
            success: false,
            message: this.translate("Geçersiz Gemini API Anahtarı. Lütfen Google AI Studio anahtarınızı kontrol edin.")
          };
        }
        if (response.status === 429) {
          return {
            success: false,
            message: this.translate("Gemini istek sınırına ulaşıldı (HTTP 429 Rate Limit). Lütfen biraz bekleyin.")
          };
        }
        if (
          response.status === 503 ||
          errDetail.toLowerCase().includes('high demand') ||
          errDetail.toLowerCase().includes('overloaded')
        ) {
          return {
            success: false,
            message:
              this.translate("Google Gemini modeli şu anda aşırı talep yoğunluğu (High Demand) yaşıyor. API anahtarınız geçerli fakat model geçici olarak meşgul. Lütfen 1 dakika sonra tekrar deneyin veya Ayarlar’dan başka bir Gemini modeli seçin.")
          };
        }
        return { success: false, message: this.translate("Bağlantı başarısız ({0}): {1}", [response.status, errDetail]) };
      }

      return {
        success: true,
        message: this.translate("Google Gemini ({0}) bağlantısı başarılı! Ücretsiz katman kullanıma hazır.", [model])
      };
    } catch (err: unknown) {
      throwIfAborted(this.transport.signal);
      if (isRequestStopped(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: this.translate("Ağ hatası: {0}", [msg]) };
    }
  }

  /**
   * Gemini API REST Çağrısı (Otomatik Yeniden Deneme / Exponential Backoff ile)
   */
  private async callGemini(
    systemPrompt: string,
    userPrompt: string | Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
  ): Promise<string> {
    let model = (this.config.geminiModel || 'gemini-3.6-flash').replace(/^models\//, '');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const generationConfig: Record<string, unknown> = {
      responseMimeType: 'application/json'
    };

    // Gemini 3.x modelleri için thinkingLevel ("low" | "medium" | "high")
    if (model.startsWith('gemini-3')) {
      generationConfig.thinkingConfig = {
        thinkingLevel: this.config.geminiThinkingLevel || 'medium'
      };
    } else if (model.includes('2.5') && !model.includes('image')) {
      generationConfig.thinkingConfig = {
        thinkingBudget: this.config.geminiThinkingBudget ?? 2048
      };
    }

    const parts = typeof userPrompt === 'string' ? [{ text: userPrompt }] : userPrompt;

    const payload = {
      contents: [
        {
          role: 'user',
          parts
        }
      ],
      systemInstruction: {
        parts: [{ text: localizePrompt(systemPrompt, this.config.language) }]
      },
      generationConfig
    };

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.transport.fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.config.geminiApiKey.trim()
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errDetail =
            (errorData as { error?: { message?: string } })?.error?.message ||
            `HTTP ${response.status}: ${response.statusText}`;

          const isHighDemand =
            response.status === 503 ||
            errDetail.toLowerCase().includes('high demand') ||
            errDetail.toLowerCase().includes('overloaded');

          const isRateLimit =
            response.status === 429 ||
            errDetail.toLowerCase().includes('resource_exhausted') ||
            errDetail.toLowerCase().includes('quota');

          const isTransient =
            isHighDemand ||
            isRateLimit ||
            response.status === 500 ||
            response.status === 502 ||
            response.status === 504;

          // Non-transient hatalar (örn. geçersiz anahtar) anında fırlatılır, denenmez
          if (response.status === 400 && errDetail.includes('API_KEY_INVALID')) {
            throw new Error(
              this.translate("Geçersiz Gemini API Anahtarı. Lütfen Ayarlar penceresinden Google AI Studio anahtarınızı güncelleyin.")
            );
          }

          if (isTransient && attempt < maxRetries) {
            const delay = this.retryBaseDelayMs > 0 ? this.retryBaseDelayMs * Math.pow(2, attempt) + Math.random() * 500 : 0;
            console.warn(
              `[GeminiProvider] Geçici sunucu yoğunluğu/sınırı (${response.status}: ${errDetail}). ${Math.round(delay)}ms sonra otomatik yeniden deneniyor (Deneme ${attempt + 1}/${maxRetries})...`
            );
            if (delay > 0) {
              await this.transport.delay(delay);
            }
            continue;
          }

          if (isHighDemand) {
            throw new Error(
              this.translate("Google Gemini modeli şu anda aşırı talep yoğunluğu yaşıyor (High Demand). Sistem isteği {0} kez otomatik yeniden denedi ancak sunucu geçici olarak yanıt veremedi. Lütfen 1 dakika sonra tekrar deneyin veya Ayarlar penceresinden farklı bir Gemini modeline (örn: Flash-Lite) geçin.", [maxRetries])
            );
          }

          if (isRateLimit) {
            throw new Error(
              this.translate("Google Gemini istek kotasına ulaşıldı (Rate Limit). Sistem isteği {0} kez otomatik yeniden denedi. Lütfen 1 dakika bekleyip tekrar deneyin.", [maxRetries])
            );
          }

          throw new Error(this.translate("Gemini API Hatası: {0}", [errDetail]));
        }

        const data = await response.json();
        this.usageTracker.record(data);
        const candidate = data?.candidates?.[0];
        const textContent = candidate?.content?.parts?.[0]?.text;

        if (!textContent || typeof textContent !== 'string') {
          throw new Error(this.translate("Gemini API geçerli bir metin içeriği döndürmedi."));
        }

        // Olası markdown codeblock (```json ... ```) temizliği
        let cleanJson = textContent.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        }

        return cleanJson;
      } catch (err: unknown) {
      throwIfAborted(this.transport.signal);
      if (isRequestStopped(err)) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));

        // Zaten kullanıcı dostu Türkçe hata fırlatıldıysa tekrar deneme, hemen fırlat
        if (
          lastError.message.includes(this.translate('Geçersiz Gemini API')) ||
          lastError.message.includes(this.translate('aşırı talep yoğunluğu')) ||
          lastError.message.includes(this.translate('istek kotasına ulaşıldı'))
        ) {
          throw lastError;
        }

        // Ağ / fetch bağlantı kopması vb. geçici hatalarda yeniden dene
        if (attempt < maxRetries) {
          const delay = this.retryBaseDelayMs > 0 ? this.retryBaseDelayMs * Math.pow(2, attempt) + Math.random() * 500 : 0;
          console.warn(
            `[GeminiProvider] Ağ veya bağlantı hatası oluştu: ${lastError.message}. ${Math.round(delay)}ms sonra otomatik yeniden deneniyor (Deneme ${attempt + 1}/${maxRetries})...`
          );
          if (delay > 0) {
            await this.transport.delay(delay);
          }
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error(this.translate("Gemini API ile iletişim kurulamadı."));
  }

  private validateApiKey(): void {
    if (!this.config.geminiApiKey || !this.config.geminiApiKey.trim()) {
      throw new Error(
        this.translate("Google Gemini API Anahtarı bulunamadı. Lütfen sağ üstteki Ayarlar simgesine tıklayarak ücretsiz Gemini API anahtarınızı girin.")
      );
    }
  }
}
