import { containsConcept } from '../i18n/concepts';
import { getLanguage, createTranslator, translateDemoData, type Language } from '../i18n';
import { SolutionProvider } from './solutionProvider';
import { ExpansionProvider } from './expansionProvider';
import {
  ProblemInput,
  RawSolutionResponse,
  ExpansionRequest,
  RawExpansionResponse,
  DetectedQuestionItem
} from '../domain/types';
import { detectMultipleQuestions } from '../domain/questionParser';

/**
 * MockProvider:
 * Deterministik, çevrimdışı ve test edilebilir kanonik sağlayıcı.
 * Kullanıcı önceliklerine tam uyumlu:
 * 1. Her katmanda şekil zorlaması (tüm katmanlarda ilgili diyagram)
 * 2. Aksiyomlara (Newton 2. Yasası) kadar inen sınırsız derinleşme
 * 3. Serbest metin seçimiyle bağlamdan kopmadan soru yanıtlama
 */
export class MockProvider implements SolutionProvider, ExpansionProvider {
  public readonly providerName = 'mock-canonical-fixture';
  private readonly translate: ReturnType<typeof createTranslator>;
  constructor(private language: Language = getLanguage()) { this.translate = createTranslator(language); }

  public async detectQuestions(problem: ProblemInput): Promise<DetectedQuestionItem[]> {
    return translateDemoData(await this.detectDemoQuestions(problem), this.language);
  }
  public async solve(problem: ProblemInput): Promise<RawSolutionResponse> {
    return translateDemoData(await this.solveDemo(problem), this.language);
  }
  public async expand(request: ExpansionRequest): Promise<RawExpansionResponse> {
    return translateDemoData(await this.expandDemo(request), this.language);
  }


  private async detectDemoQuestions(problem: ProblemInput): Promise<DetectedQuestionItem[]> {
    const text = (problem.text || '').trim();
    const lowerText = text.toLowerCase();
    const attNames = (problem.attachments || [])
      .map((a) => (a.name || '').toLowerCase())
      .join(' ');

    // 1. Metin içindeki ayrımları kontrol et
    const textSplits = detectMultipleQuestions(text);
    if (textSplits.length > 1) {
      return textSplits.map((qText, idx) => ({
        questionNumber: idx + 1,
        title: createTranslator(this.language)("Soru {0}", [idx + 1]),
        instruction: qText,
        rawText: qText
      }));
    }

    // 2. Mock çoklu soru test senaryoları (tek görselde/dokümanda birden fazla soru simülasyonu)
    if (
      lowerText.includes('coklu') ||
      lowerText.includes('çoklu') ||
      lowerText.includes('birden fazla') ||
      lowerText.includes('multiple') ||
      lowerText.includes('test_split') ||
      attNames.includes('multiple') ||
      attNames.includes('coklu')
    ) {
      return [
        {
          questionNumber: 1,
          title: 'Soru 1: İdeal Basit Sarkaç',
          summary: 'Uzunluğu L olan basit sarkacın küçük genlikli salınım frekansı',
          instruction: 'Dokümandaki 1. soruyu (Basit Sarkaç) çöz.'
        },
        {
          questionNumber: 2,
          title: 'Soru 2: Yaylı Hareketli Kama',
          summary: 'Yay sabiti k olan eğik düzlem üzerindeki kütlenin osilasyonu',
          instruction: 'Dokümandaki 2. soruyu (Yaylı Kama 7.34) çöz.'
        }
      ];
    }

    // 3. Tek soru
    return [
      {
        questionNumber: 1,
        title: 'Problem 1',
        instruction: text || 'Problemi adım adım çöz.'
      }
    ];
  }

  private async solveDemo(problem: ProblemInput): Promise<RawSolutionResponse> {
    const text = (problem.text || '').toLowerCase();
    const attNames = (problem.attachments || []).map((a) => (a.name || '').toLowerCase()).join(' ');

    // Alternatif Çözüm Yolu İstekleri (2. Yol: Newton / d'Alembert Dinamiği)
    if (
      (containsConcept(text, 'çözüm yöntemi') || containsConcept(text, '2. yol') || containsConcept(text, 'ikinci yol')) &&
      (text.includes('newton') || text.includes("d'alembert") || containsConcept(text, 'vektörel'))
    ) {
      return MockProvider.getNewtonDynamicsSolutionFixture();
    }

    // Teorik Konu ve Kavram Atlası: Genelleştirilmiş Koordinatlar & Koordinat Sistemleri
    if (
      containsConcept(text, 'genelleştirilmiş koordinat') ||
      containsConcept(text, 'genellestirilmis koordinat') ||
      containsConcept(text, 'koordinat sistemleri') ||
      containsConcept(text, 'koordinat atlası') ||
      containsConcept(text, 'koordinat atlasi') ||
      (text.includes('polar') && (containsConcept(text, 'küresel') || containsConcept(text, 'kuresel') || containsConcept(text, 'silindirik')))
    ) {
      return MockProvider.getGeneralizedCoordinatesTheoryFixture();
    }

    // Problem 7.34: Yaylı Hareketli Kama ve Küçük Titreşim Frekansı
    if (
      text.includes('7.34') ||
      containsConcept(text, 'yay') ||
      text.includes('spring') ||
      attNames.includes('7.34') ||
      attNames.includes('spring') ||
      attNames.includes('1788635235536') ||
      (containsConcept(text, 'kama') && (containsConcept(text, 'salınım') || containsConcept(text, 'titreşim') || containsConcept(text, 'frekans')))
    ) {
      return MockProvider.getSpringWedgeOscillatorFixture();
    }

    if (text.includes('lagrange') || containsConcept(text, 'delik') || containsConcept(text, 'kısıt')) {
      return MockProvider.getLagrangeFixture();
    }

    if (
      containsConcept(text, 'eğik düzlem') ||
      containsConcept(text, 'egik duzlem') ||
      containsConcept(text, 'kama') ||
      containsConcept(text, 'hareketli') ||
      text.includes('wedge') ||
      text.includes('incline')
    ) {
      return MockProvider.getMovingWedgeFixture();
    }

    // Varsayılan kanonik fixture: Basit Sarkaç (HD-006, HD-022, DEMO_SCENARIOS.md)
    return MockProvider.getPendulumFixture();
  }

  private async expandDemo(request: ExpansionRequest): Promise<RawExpansionResponse> {
    // 1. Serbest Seçim ile Bağlamsal Soru (Requirement 3)
    if (request.contextualInquiry) {
      return this.handleContextualInquiry(request);
    }

    const targetEq =
      request.targetBlock && 'latex' in request.targetBlock
        ? request.targetBlock.latex
        : '';
    const depth = request.depth;
    const probText = request.problemText.toLowerCase();

    // Lagrange Problemi Genişletmesi
    if (probText.includes('lagrange') || containsConcept(probText, 'kısıt') || targetEq.includes('\\lambda') || targetEq.includes('\\ddot{r}')) {
      return this.handleLagrangeExpansion(request);
    }

    // Matematiksel / Geometrik Derinleşme: Hipotenüs ve Pisagor
    if (
      targetEq.includes('a^2 + b^2') ||
      targetEq.includes('c^2') ||
      containsConcept(targetEq.toLowerCase(), 'hipoten') ||
      request.ancestorPath.some((p) => containsConcept(p.toLowerCase(), 'hipoten') || containsConcept(p.toLowerCase(), 'pisagor'))
    ) {
      return MockProvider.getHypotenuseFixture();
    }

    // 2. Derinlik 3+ (AKSİYOM DÜZEYİ - Requirement 2): Newton'un 2. Yasası
    if (depth >= 3 || targetEq.includes('\\frac{d\\vec{p}}{dt}') || targetEq.includes('m\\vec{a}')) {
      return {
        title: 'Aksiyom: Newton’un 2. Hareket Yasası ve Doğrusal Momentum İlkesi',
        explanation:
          'Klasik mekaniğin kurucu doğa yasası: Bir cisme etki eden net dış kuvvet, cismin doğrusal momentumunun zamanla değişimine eşittir.',
        diagram: {
          width: 340,
          height: 180,
          caption: 'Şekil 4: Noktasal cisimde net dış kuvvet ve momentum vektörü değişimi.',
          elements: [
            { type: 'axis', origin: [40, 140], xLength: 260, yLength: 110, xLabel: 'x', yLabel: 'y' },
            { type: 'point', x: 120, y: 80, label: 'm' },
            { type: 'vector', from: [120, 80], to: [200, 50], label: '\\vec{F}_{net}', color: '#dc2626' },
            { type: 'vector', from: [120, 80], to: [180, 80], label: '\\vec{p} = m\\vec{v}', color: '#2563eb' },
            { type: 'line', from: [180, 80], to: [200, 50], style: 'dashed', label: 'd\\vec{p}', color: '#78716c' }
          ]
        },
        blocks: [
          {
            kind: 'prose',
            text: 'Newton’un ikinci hareket yasası, klasik mekaniğin ampirik temelidir ve bir **doğa yasası (aksiyom)** niteliğindedir. Matematiksel olarak daha ilksel bir ilkeden türetilemez; deney ve gözlemle doğrulanmış evrensel bir aksiyomdur:'
          },
          {
            kind: 'equation',
            latex: '\\vec{F}_{net} = \\frac{d\\vec{p}}{dt} = \\frac{d(m\\vec{v})}{dt}',
            explanation: 'Momentum formu (Aksiyom)'
          },
          {
            kind: 'prose',
            text: 'Sabit kütle ($dm/dt = 0$) kabulü altında bu aksiyom tanıdık ivme formuna indirgenir: $\\vec{F} = m\\vec{a}$. Sarkaç hareketindeki tüm teğetsel ivmeler ve kuvvet dengeleri doğrudan bu aksiyomun izdüşümleridir.'
          },
          {
            kind: 'equation',
            latex: '\\vec{F} = m\\vec{a} = m \\frac{d^2\\vec{r}}{dt^2}',
            explanation: 'Sabit kütleli cisim için ivme formu'
          }
        ],
        isAxiomatic: true, // Temel Doğa Yasası
        isTerminal: true,   // Daha alt türetim yoktur
        axiomType: 'physics'
      };
    }

    // 3. Derinlik 2: Geometrik İzdüşüm ve Düzlem Kutupsal Koordinatlar (Katman içi şekil zorlaması)
    if (depth === 2 || targetEq.includes('\\vec{e}_t') || targetEq.includes('\\vec{e}_\\theta')) {
      return {
        title: 'Geometrik İzdüşüm ve Düzlem Kutupsal Koordinatlar',
        explanation: 'Kutupsal birim vektörler ile kartezyen eksenler arasındaki trigonometrik izdüşüm bağıntıları.',
        diagram: {
          width: 320,
          height: 220,
          caption: 'Şekil 3: Kartezyen eksenler ve düzlem kutupsal birim vektörler (\\vec{e}_r, \\vec{e}_\\theta).',
          elements: [
            { type: 'axis', origin: [80, 160], xLength: 200, yLength: 120, xLabel: '\\hat{i}', yLabel: '\\hat{j}' },
            { type: 'vector', from: [80, 160], to: [170, 90], label: '\\vec{e}_r', color: '#16a34a' },
            { type: 'vector', from: [80, 160], to: [30, 95], label: '\\vec{e}_\\theta', color: '#9333ea' },
            { type: 'angle', center: [80, 160], radius: 35, startAngle: 0, endAngle: -38, label: '\\theta' },
            { type: 'line', from: [80, 160], to: [80, 210], style: 'dashed', label: '-g\\hat{j}' }
          ]
        },
        blocks: [
          {
            kind: 'prose',
            text: 'Düzlem kutupsal koordinatlarda radyal birim vektör $\\vec{e}_r$ ve ona dik teğetsel birim vektör $\\vec{e}_\\theta$ kartezyen birim vektörler cinsinden ifade edilir:'
          },
          {
            kind: 'equation',
            latex: '\\vec{e}_r = \\sin\\theta\\,\\hat{i} - \\cos\\theta\\,\\hat{j}',
            explanation: 'Radyal birim vektör'
          },
          {
            kind: 'equation',
            latex: '\\vec{e}_\\theta = \\cos\\theta\\,\\hat{i} + \\sin\\theta\\,\\hat{j}',
            explanation: 'Teğetsel birim vektör'
          },
          {
            kind: 'prose',
            text: 'Yerçekimi ivmesi vektörü düşey eksende $\\vec{g} = -g\\hat{j}$ olduğundan, teğetsel skaler çarpım doğrudan Newton’un hareket yasasına bağlanır:'
          },
          {
            kind: 'equation',
            latex: '\\vec{g} \\cdot \\vec{e}_\\theta = (-g\\hat{j}) \\cdot (\\cos\\theta\\hat{i} + \\sin\\theta\\hat{j}) = -g\\sin\\theta',
            explanation: 'Bileşen skaler çarpımı'
          },
          {
            kind: 'equation',
            latex: 'm \\vec{a} = m \\frac{d^2\\vec{r}}{dt^2} = \\sum \\vec{F}',
            explanation: 'Newton 2. Yasası (Aksiyom derinleşmesi için tıklayın)'
          }
        ],
        isAxiomatic: false,
        isTerminal: false // Tıklanarak Newton'un 2. Yasasına (Derinlik 3) inilebilir!
      };
    }

    // 4. Derinlik 1: Teğetsel Kuvvet ve İzdüşüm (Katman içi şekil zorlaması)
    return {
      title: 'Teğetsel Kuvvet ve Geometrik İzdüşüm',
      explanation: 'Ağırlık vektörünün yay eğrisi teğetine izdüşümü ve geri çağırıcı kuvvetin yönü incelenir.',
      diagram: {
        width: 320,
        height: 220,
        caption: 'Şekil 2: Serbest Cisim Diyagramı (FBD) — Yerçekimi kuvvetinin dik bileşenlere ayrılması.',
        elements: [
          { type: 'mass', id: 'bob', x: 160, y: 80, label: 'm', shape: 'circle', size: 14 },
          { type: 'vector', from: [160, 80], to: [160, 180], label: 'm\\vec{g}', color: '#2563eb' },
          { type: 'vector', from: [160, 80], to: [220, 140], label: 'mg\\cos\\theta', color: '#475569' },
          { type: 'vector', from: [160, 80], to: [100, 120], label: '-mg\\sin\\theta', color: '#dc2626' },
          { type: 'line', from: [160, 180], to: [100, 120], style: 'dashed', color: '#94a3b8' },
          { type: 'line', from: [160, 180], to: [220, 140], style: 'dashed', color: '#94a3b8' },
          { type: 'angle', center: [160, 80], radius: 40, startAngle: 90, endAngle: 45, label: '\\theta' }
        ]
      },
      blocks: [
        {
          kind: 'prose',
          text: 'Ağırlık kuvveti düşey doğrultuda aşağıya doğru etki eder: $\\vec{F}_g = m\\vec{g}$. Yörünge eğrisinin teğeti ise açısal koordinatın artış yönündedir.'
        },
        {
          kind: 'equation',
          latex: 'F_t = -|\\vec{F}_g| \\sin\\theta = -mg \\sin\\theta',
          explanation: 'Ağırlık kuvvetinin yay teğetine izdüşümü.'
        },
        {
          kind: 'prose',
          text: 'Eksi işareti, kuvvetin sarkacı daima $\\theta = 0$ denge konumuna doğru çekmesinden (geri çağırıcı karakter) kaynaklanır.'
        },
        {
          kind: 'equation',
          latex: '\\vec{e}_t \\cdot \\vec{g} = -g \\sin\\theta',
          explanation: 'Birim teğet vektör ile yerçekimi ivmesi vektörünün skaler çarpımı (Daha derine inmek için tıklayın).'
        }
      ],
      isAxiomatic: false,
      isTerminal: false
    };
  }

  // --- Bağlamsal Soru İşleme (Requirement 3) ---
  private handleContextualInquiry(request: ExpansionRequest): RawExpansionResponse {
    const inquiry = request.contextualInquiry!;
    const selected = inquiry.selectedText.trim();
    const query = inquiry.userQuery || this.translate("Bu ifade nedir ve fiziksel anlamı nereden gelir?");

    const selLower = selected.toLowerCase();
    const queryLower = query.toLowerCase();

    // Hipotenüs / Pisagor / Dik Üçgen Geometrik ve Aksiyomatik Derinleşmesi
    // (Fiziksel bağlamdan kopup saf geometriye sıçrama)
    if (
      containsConcept(selLower, 'hipotenüs') ||
      containsConcept(selLower, 'hipotenus') ||
      containsConcept(selLower, 'pisagor') ||
      containsConcept(selLower, 'dik üçgen') ||
      containsConcept(queryLower, 'hipotenüs') ||
      containsConcept(queryLower, 'hipotenus') ||
      containsConcept(queryLower, 'pisagor')
    ) {
      return MockProvider.getHypotenuseFixture();
    }

    // 1. Sorunun Geneli Hakkında Detaylandırma Sorusu (Çözümün En Altındaki Giriş Kutusu)
    if (
      containsConcept(selected, 'Genel Problem') ||
      containsConcept(selected, 'Genel Çözüm') ||
      containsConcept(selected, 'Genel') ||
      containsConcept(queryLower, 'genel çerçeve') ||
      containsConcept(queryLower, 'mekanik enerji korunumu') ||
      containsConcept(queryLower, 'lagrange mekaniği yerine')
    ) {
      return {
        title: 'Genel Çözüm ve Modelleme Çerçevesi İncelemesi',
        explanation: 'Problemin genel metodolojisi, modelleme tercihleri ve alternatif analitik çözüm yolları.',
        diagram: {
          width: 320,
          height: 180,
          caption: 'Şekil: Mekanik sistem modelleme uzayı (Kuvvet/Newton Dengesi vs. Enerji/Lagrange Durumu).',
          elements: [
            { type: 'axis', origin: [60, 140], xLength: 220, yLength: 100, xLabel: 'q (Konum)', yLabel: 'E (Enerji)' },
            { type: 'line', from: [60, 140], to: [260, 40], style: 'solid', label: 'E = T + V = sabit', color: '#16a34a' },
            { type: 'point', x: 160, y: 90, label: '(q_0, \\dot{q}_0)' }
          ]
        },
        blocks: [
          {
            kind: 'prose',
            text: this.translate("**Kullanıcı Sorusu:** \"{0}\"\n\nBu problemde temel modelleme tercihi olarak analitik dinamik denklemleri kullanılmıştır. Sistemin serbestlik derecesi (DoF) 1 olup, tek bir genelleştirilmiş koordinat $\\theta$ ile sistemin durumu faz uzayında eksiksiz belirlenir.", [query])
          },
          {
            kind: 'prose',
            text: '**Alternatif Çözüm Yaklaşımı (Mekanik Enerji Korunumu):**\nSürtünmesiz ve korunumlu bir alanda toplam mekanik enerji $E = T + V$ zamana göre sabittir. Sistemin kinetik ve potansiyel enerjisi:'
          },
          {
            kind: 'equation',
            latex: 'E = \\frac{1}{2}m L^2 \\dot{\\theta}^2 + mgL(1 - \\cos\\theta) = \\text{sabit}',
            explanation: 'Mekanik Enerjinin Korunumu'
          },
          {
            kind: 'prose',
            text: 'Bu ifadenin zamana göre türevi alındığında ($\\frac{dE}{dt} = 0$):\n$$m L^2 \\dot{\\theta} \\ddot{\\theta} + mgL \\sin\\theta \\dot{\\theta} = 0 \\implies \\ddot{\\theta} + \\frac{g}{L}\\sin\\theta = 0$$\nNewton kuvvet dengesi ile enerji korunumu aynı diferansiyel denkleme ulaşır; bu durum analitik mekaniğin iç tutarlılığını kanıtlar.'
          }
        ],
        isAxiomatic: false,
        isTerminal: true
      };
    }

    // İleri Düzey Derinleştirme Sağlamaları:
    // 1. Korunum Yasası / Yatay Momentum / Noether Teoremi
    if (
      containsConcept(selLower, 'korunum') ||
      selLower.includes('momentum') ||
      selLower.includes('noether') ||
      containsConcept(queryLower, 'korunum') ||
      queryLower.includes('momentum') ||
      queryLower.includes('noether')
    ) {
      return MockProvider.getConservationExpansionFixture();
    }

    // 2. Newton & d'Alembert Eylemsizlik Kuvveti Yöntemi
    if (
      selLower.includes('newton') ||
      selLower.includes('alembert') ||
      containsConcept(selLower, 'eylemsizlik') ||
      containsConcept(selLower, 'alternatif') ||
      queryLower.includes('newton') ||
      queryLower.includes('alembert') ||
      containsConcept(queryLower, 'eylemsizlik') ||
      containsConcept(queryLower, 'alternatif')
    ) {
      return MockProvider.getAlternativeNewtonExpansionFixture();
    }

    // 3. Denge ve Kararlılık Analizi / Potansiyel Eğriliği / Salınım Frekansı
    if (
      containsConcept(selLower, 'denge') ||
      containsConcept(selLower, 'kararlılık') ||
      containsConcept(selLower, 'kararlilik') ||
      containsConcept(selLower, 'potansiyel') ||
      containsConcept(selLower, 'frekans') ||
      containsConcept(selLower, 'salınım') ||
      containsConcept(queryLower, 'denge') ||
      containsConcept(queryLower, 'kararlılık') ||
      containsConcept(queryLower, 'kararlilik') ||
      containsConcept(queryLower, 'potansiyel') ||
      containsConcept(queryLower, 'frekans') ||
      containsConcept(queryLower, 'salınım')
    ) {
      return MockProvider.getStabilityExpansionFixture();
    }

    // Taylor açılımı / Küçük açılar sorgusu
    if (selLower.includes('taylor') || containsConcept(selLower, 'küçük açı')) {
      return {
        title: `Bağlamsal Açıklama: Taylor Açılımı ve Doğrusallaştırma`,
        explanation: this.translate("\"{0}\" ifadesinin sistem bağlamındaki matematiksel ve fiziksel gerekçesi.", [selected]),
        diagram: {
          width: 320,
          height: 180,
          caption: 'Şekil: \\sin\\theta fonksiyonu ile lineer y = \\theta teğetinin sıfır civarındaki örtüşmesi.',
          elements: [
            { type: 'axis', origin: [60, 120], xLength: 220, yLength: 90, xLabel: '\\theta', yLabel: 'f(\\theta)' },
            { type: 'line', from: [60, 120], to: [200, 30], style: 'solid', label: 'y = \\theta', color: '#dc2626' },
            { type: 'point', x: 60, y: 120, label: '0' }
          ]
        },
        blocks: [
          {
            kind: 'prose',
            text: this.translate("Kullanıcı Sorusu: \"{0}\".\n\nTaylor serisi, pürüzsüz bir fonksiyonu belirli bir nokta civarında polinom serisi olarak açma yöntemidir. $\\theta = 0$ civarında $\\sin\\theta$ fonksiyonunun tam açılımı:", [query])
          },
          {
            kind: 'equation',
            latex: '\\sin\\theta = \\theta - \\frac{\\theta^3}{3!} + \\frac{\\theta^5}{5!} - \\mathcal{O}(\\theta^7)',
            explanation: 'Tam Taylor Serisi Açılımı'
          },
          {
            kind: 'prose',
            text: 'Küçük açılar rejiminde ($\\theta \\ll 1$ radyan veya yaklaşık $\\theta < 10^\\circ$), yüksek dereceli terimler ($\\theta^3/6 \\approx 0$) ihmal edilebilir mertebeye düşer. Bu sayede lineer olmayan diferansiyel denklem, analitik olarak tam çözülebilen lineer harmonik osilatör denklemine dönüşür.'
          }
        ],
        isAxiomatic: false,
        isTerminal: true
      };
    }

    // 2. Tekil Matematiksel Sembol / Parametre Analizi
    const cleanedSymbol = selected.replace(/[{}$]/g, '').trim();
    const fullContext = `${request.problemText} ${request.parentSectionTitle} ${query} ${selected}`.toLowerCase();

    // R_L (Yük Direnci) ve Devre Şematiği Özel Analizi
    if (
      cleanedSymbol === 'R_L' ||
      cleanedSymbol === 'R_{L}' ||
      cleanedSymbol === 'R_{load}' ||
      cleanedSymbol === 'R_load' ||
      containsConcept(selLower, 'yük direnci') ||
      containsConcept(queryLower, 'yük direnci') ||
      queryLower.includes('r_l')
    ) {
      return {
        title: 'Sembol Analizi: $R_L$ (Yük Direnci)',
        explanation: 'Yük Direnci ($R_L$) — Devre modeli, gerilim bölücü analizi ve maksimum güç teoremi.',
        diagram: {
          width: 360,
          height: 200,
          caption: 'Şekil: Kaynak gerilimi V_s, iç direnç R_s ve yük direnci R_L seri devresi.',
          elements: [
            { type: 'source', center: [60, 100], label: 'V_s', kind: 'dc', color: '#2563eb' },
            { type: 'line', from: [60, 80], to: [60, 40] },
            { type: 'line', from: [60, 120], to: [60, 160] },
            { type: 'line', from: [60, 40], to: [120, 40] },
            { type: 'resistor', from: [120, 40], to: [200, 40], label: 'R_s', color: '#475569' },
            { type: 'line', from: [200, 40], to: [280, 40] },
            { type: 'line', from: [280, 40], to: [280, 70] },
            { type: 'resistor', from: [280, 70], to: [280, 130], label: 'R_L', color: '#b45309' },
            { type: 'line', from: [280, 130], to: [280, 160] },
            { type: 'line', from: [280, 160], to: [60, 160] },
            { type: 'ground', at: [170, 160], label: 'GND' },
            { type: 'vector', from: [90, 25], to: [150, 25], label: 'I', color: '#16a34a' }
          ]
        },
        blocks: [
          {
            kind: 'prose',
            text: `**Sembol:** $R_L$ (veya $R_{\\text{load}}$)\n\n**Temsil Ettiği Nicelik:** Yük Direnci (Load Resistance)\n\n**SI Birimi:** Ohm ($\\Omega$)\n\nYük direnci, bir elektrik devresinde enerjinin harcandığı veya dönüştürüldüğü (ışık, mekanik iş, ısı) alıcı devreyi temsil eder. Seri bir devrede kaynak iç direnci $R_s$ ve kaynak gerilimi $V_s$ olduğunda devre akımı:`
          },
          {
            kind: 'equation',
            latex: 'I = \\frac{V_s}{R_s + R_L}',
            explanation: 'Ohm Yasası / KVL Döngü Akımı'
          },
          {
            kind: 'prose',
            text: 'Yük direnci üzerinde harcanan anlık elektriksel güç $P_L$:'
          },
          {
            kind: 'equation',
            latex: 'P_L = I^2 R_L = \\frac{V_s^2 R_L}{(R_s + R_L)^2}',
            explanation: 'Yükte Harcanan Güç İfadesi'
          },
          {
            kind: 'prose',
            text: '**Maksimum Güç Aktarım Teoremi (Jacobi Yasası):**\nYük direncinden maksimum güç çekebilmek için gücün $R_L$ değişkenine göre türevi sıfırlanır:\n$$\\frac{dP_L}{dR_L} = V_s^2 \\frac{(R_s + R_L)^2 - 2R_L(R_s + R_L)}{(R_s + R_L)^4} = 0 \\implies R_s - R_L = 0 \\implies R_L = R_s$$\nDolayısıyla maksimum güç ancak yük direnci kaynak iç direncine eşit olduğunda (empedans uyumu) aktarılır. Bu durumda yük üzerine aktarılan tepe güç $P_{\\max} = \\frac{V_s^2}{4R_s}$ olur.'
          }
        ],
        isAxiomatic: false,
        isTerminal: true
      };
    }

    // L Sembolü Bağlamsal Ayrıştırma (İp Uzunluğu / Bobin İndüktansı / Lagrangian)
    if (cleanedSymbol === 'L') {
      if (
        containsConcept(fullContext, 'bobin') ||
        containsConcept(fullContext, 'indüktans') ||
        containsConcept(fullContext, 'devre') ||
        fullContext.includes('henry') ||
        fullContext.includes('rlc')
      ) {
        return {
          title: 'Sembol Analizi: $L$ (Bobin İndüktansı)',
          explanation: 'Bobin Öz İndüktansı ($L$) — Elektromanyetik indükleme ve enerji depolama.',
          diagram: {
            width: 320,
            height: 160,
            caption: 'Şekil: Manyetik alan depolayan L öz indüktans bobini.',
            elements: [
              { type: 'source', center: [60, 80], label: 'V(t)', kind: 'ac', color: '#2563eb' },
              { type: 'line', from: [60, 60], to: [60, 30] },
              { type: 'line', from: [60, 30], to: [120, 30] },
              { type: 'resistor', from: [120, 30], to: [200, 30], label: 'L', color: '#7c3aed' },
              { type: 'line', from: [200, 30], to: [260, 30] },
              { type: 'line', from: [260, 30], to: [260, 130] },
              { type: 'line', from: [260, 130], to: [60, 130] },
              { type: 'line', from: [60, 130], to: [60, 100] }
            ]
          },
          blocks: [
            {
              kind: 'prose',
              text: '**Sembol:** $L$\n\n**Temsil Ettiği Nicelik:** Bobin Öz İndüktansı (Self-Inductance)\n\n**SI Birimi:** Henry (H = Wb/A)\n\nBu devrede $L$, içinden akım geçen iletkenin oluşturduğu manyetik akının akıma oranını temsil eder. Faraday indüksiyon yasası uyarınca bobindeki gerilim:'
            },
            {
              kind: 'equation',
              latex: 'V_L = L \\frac{dI}{dt}',
              explanation: 'Bobin Gerilim Bağıntısı'
            }
          ],
          isAxiomatic: false,
          isTerminal: true
        };
      } else if (
        fullContext.includes('lagrangian') ||
        fullContext.includes('lagrange') ||
        containsConcept(fullContext, 'analitik mekanik') ||
        containsConcept(fullContext, 'eylem') ||
        fullContext.includes('t - v') ||
        fullContext.includes('t-v')
      ) {
        return {
          title: 'Sembol Analizi: $L$ (Lagrangian Fonksiyonu)',
          explanation: 'Lagrangian Fonksiyonu ($L = T - V$) — Dinamik sistemin kurucu durum fonksiyonu.',
          diagram: {
            width: 320,
            height: 160,
            caption: 'Şekil: Genelleştirilmiş koordinat faz uzayında sistem hareketi.',
            elements: [
              { type: 'axis', origin: [50, 120], xLength: 220, yLength: 90, xLabel: 'q', yLabel: '\\dot{q}' },
              { type: 'line', from: [50, 120], to: [220, 40], style: 'solid', label: 'L(q, \\dot{q}, t)', color: '#16a34a' }
            ]
          },
          blocks: [
            {
              kind: 'prose',
              text: '**Sembol:** $L$ (veya $\\mathcal{L}$)\n\n**Temsil Ettiği Nicelik:** Lagrangian Durum Fonksiyonu\n\n**SI Birimi:** Joule (J)\n\nAnalitik mekanikte Lagrangian, bir fiziksel sistemin toplam kinetik enerjisi ($T$) ile toplam potansiyel enerjisinin ($V$) cebirsel farkı olarak tanımlanır:'
            },
            {
              kind: 'equation',
              latex: 'L(q, \\dot{q}, t) = T(q, \\dot{q}) - V(q)',
              explanation: 'Lagrangian Fonksiyonu Tanımı'
            }
          ],
          isAxiomatic: false,
          isTerminal: true
        };
      } else {
        // Çözümün ve Sarkacın Varsayılanı: İp Uzunluğu!
        return {
          title: 'Sembol Analizi: $L$ (İp Uzunluğu)',
          explanation: 'İp Uzunluğu ($L$) — Sistemin geometrik yarıçapı ve salınım periyodunu belirleyen temel ölçek.',
          diagram: {
            width: 320,
            height: 180,
            caption: 'Şekil: Sarkaç geometrisi — Tavana asılı L boyundaki ip ve m kütleli cisim.',
            elements: [
              { type: 'surface', from: [60, 25], to: [260, 25], side: 'top' },
              { type: 'point', x: 160, y: 25, label: 'O' },
              { type: 'line', from: [160, 25], to: [230, 125], style: 'rope', label: 'L' },
              { type: 'mass', id: 'bob', x: 230, y: 125, label: 'm', shape: 'circle', size: 14 },
              { type: 'angle', center: [160, 25], radius: 45, startAngle: 90, endAngle: 55, label: '\\theta' },
              { type: 'line', from: [160, 25], to: [160, 150], style: 'dashed', color: '#94a3b8' }
            ]
          },
          blocks: [
            {
              kind: 'prose',
              text: '**Sembol:** $L$\n\n**Temsil Ettiği Nicelik:** İp Uzunluğu (Sarkacın Salınım Kolu Boyu)\n\n**SI Birimi:** Metre (m)\n\nBu problemde $L$, sabit bir tavana asılı olan kütlesiz ve esnemez ipin uzunluğunu temsil eder. Sarkacın izlediği dairesel yayın eğrilik yarıçapını doğrudan sabitler ($r = L$). Kütlenin katettiği yay uzunluğu $s$ ile açısal sapma $\\theta$ arasındaki geometrik bağıntı:'
            },
            {
              kind: 'equation',
              latex: 's = L \\theta',
              explanation: 'Yay Uzunluğu ve Açısal Konum Bağıntısı'
            },
            {
              kind: 'prose',
              text: 'Küçük açılar rejiminde sistemin doğal açısal frekansı $\\omega_0$ ve salınım periyodu $T$ doğrudan ip boyu $L$ tarafından belirlenir:'
            },
            {
              kind: 'equation',
              latex: '\\omega_0 = \\sqrt{\\frac{g}{L}}, \\quad T = 2\\pi\\sqrt{\\frac{L}{g}}',
              explanation: 'Basit Sarkaç Doğal Frekans ve Salınım Periyodu'
            }
          ],
          isAxiomatic: false,
          isTerminal: true
        };
      }
    }

    // R Sembolü Bağlamsal Ayrıştırma (Direnç vs Yarıçap)
    if (cleanedSymbol === 'R') {
      if (
        containsConcept(fullContext, 'direnç') ||
        fullContext.includes('ohm') ||
        containsConcept(fullContext, 'devre') ||
        containsConcept(fullContext, 'akım') ||
        containsConcept(fullContext, 'gerilim') ||
        fullContext.includes('volt')
      ) {
        return {
          title: 'Sembol Analizi: $R$ (Elektriksel Direnç)',
          explanation: 'Elektriksel Direnç ($R$) — Akıma karşı gösterilen zorluk ve Ohm yasası.',
          diagram: {
            width: 300,
            height: 140,
            caption: 'Şekil: Elektrik devresinde R direnç elemanı.',
            elements: [
              { type: 'line', from: [40, 70], to: [100, 70] },
              { type: 'resistor', from: [100, 70], to: [200, 70], label: 'R', color: '#b45309' },
              { type: 'line', from: [200, 70], to: [260, 70] },
              { type: 'vector', from: [80, 50], to: [140, 50], label: 'I', color: '#16a34a' }
            ]
          },
          blocks: [
            {
              kind: 'prose',
              text: '**Sembol:** $R$\n\n**Temsil Ettiği Nicelik:** Elektriksel Direnç (Resistance)\n\n**SI Birimi:** Ohm ($\\Omega$)\n\nElektrik yüklerinin iletken içerisinden akarken elektrik akımına karşı gösterdiği zorluğun nicel ölçüsüdür:'
            },
            {
              kind: 'equation',
              latex: 'V = I R \\implies R = \\frac{V}{I}',
              explanation: 'Ohm Yasası'
            }
          ],
          isAxiomatic: false,
          isTerminal: true
        };
      } else {
        // Geometrik Yarıçap
        return {
          title: 'Sembol Analizi: $R$ (Yörünge Yarıçapı)',
          explanation: 'Yörünge Yarıçapı ($R$) — Dairesel hareket yörüngesinin merkezden uzaklığı.',
          diagram: {
            width: 300,
            height: 160,
            caption: 'Şekil: R yarıçaplı dairesel yörünge.',
            elements: [
              { type: 'point', x: 150, y: 80, label: 'O' },
              { type: 'line', from: [150, 80], to: [230, 80], style: 'solid', label: 'R', color: '#2563eb' },
              { type: 'mass', id: 'pt', x: 230, y: 80, label: 'm', shape: 'circle', size: 10 }
            ]
          },
          blocks: [
            {
              kind: 'prose',
              text: '**Sembol:** $R$\n\n**Temsil Ettiği Nicelik:** Yörünge Yarıçapı\n\n**SI Birimi:** Metre (m)\n\nBu problemde $R$, kütlenin hareket ettiği dairesel eğrinin merkezine olan sabit radyal uzaklığı ifade eder:'
            },
            {
              kind: 'equation',
              latex: 'R = \\frac{D}{2}',
              explanation: 'Dairesel Yarıçap Bağıntısı'
            }
          ],
          isAxiomatic: false,
          isTerminal: true
        };
      }
    }

    // T Sembolü Bağlamsal Ayrıştırma (Salınım Periyodu vs İp Gerilmesi vs Sıcaklık)
    if (cleanedSymbol === 'T') {
      if (containsConcept(fullContext, 'gerilme') || containsConcept(fullContext, 'ip gerilmesi') || containsConcept(fullContext, 'kuvvet')) {
        return {
          title: 'Sembol Analizi: $T$ (İp Gerilme Kuvveti)',
          explanation: 'İp Gerilme Kuvveti ($T$) — Kütleyi yörüngede tutan radyal çekme kuvveti.',
          diagram: {
            width: 300,
            height: 160,
            caption: 'Şekil: İp doğrultusunda etkiyen T gerilme vektörü.',
            elements: [
              { type: 'line', from: [150, 20], to: [150, 100], style: 'rope' },
              { type: 'mass', id: 'b', x: 150, y: 100, label: 'm', shape: 'circle', size: 12 },
              { type: 'vector', from: [150, 100], to: [150, 40], label: '\\vec{T}', color: '#16a34a' }
            ]
          },
          blocks: [
            {
              kind: 'prose',
              text: '**Sembol:** $T$\n\n**Temsil Ettiği Nicelik:** İp Gerilme Kuvveti (Tension Force)\n\n**SI Birimi:** Newton (N)\n\nBu problemde $T$, tavana bağlı ipin cisme uyguladığı temas kuvvetidir. Radyal doğrultudaki kuvvet dengesi:'
            },
            {
              kind: 'equation',
              latex: 'T - mg\\cos\\theta = m\\frac{v^2}{L} \\implies T = m\\left(g\\cos\\theta + L\\dot{\\theta}^2\\right)',
              explanation: 'İp Gerilmesi Dinamik Bağıntısı'
            }
          ],
          isAxiomatic: false,
          isTerminal: true
        };
      } else if (containsConcept(fullContext, 'sıcaklık') || fullContext.includes('kelvin') || containsConcept(fullContext, 'termo')) {
        return {
          title: 'Sembol Analizi: $T$ (Mutlak Sıcaklık)',
          explanation: 'Termodinamik Mutlak Sıcaklık ($T$) — Ortalama moleküler kinetik enerji.',
          diagram: {
            width: 300,
            height: 140,
            caption: 'Şekil: Gaz moleküllerinin kinetik hız dağılımı.',
            elements: [
              { type: 'axis', origin: [50, 110], xLength: 200, yLength: 80, xLabel: 'v', yLabel: 'f(v)' }
            ]
          },
          blocks: [
            {
              kind: 'prose',
              text: '**Sembol:** $T$\n\n**Temsil Ettiği Nicelik:** Mutlak Sıcaklık\n\n**SI Birimi:** Kelvin (K)\n\nTermodinamikte sıcaklık, mikroskobik ölçekte moleküllerin ortalama öteleme kinetik enerjisini temsil eder:'
            },
            {
              kind: 'equation',
              latex: 'P V = n R T',
              explanation: 'İdeal Gaz Durum Denklemi'
            }
          ],
          isAxiomatic: false,
          isTerminal: true
        };
      } else {
        // Varsayılan / Sarkaç: Salınım Periyodu!
        return {
          title: 'Sembol Analizi: $T$ (Salınım Periyodu)',
          explanation: 'Salınım Periyodu ($T$) — Sistemin tek bir tam periyodik salınımı tamamlama süresi.',
          diagram: {
            width: 320,
            height: 160,
            caption: 'Şekil: Zamana bağlı açısal salınım eğrisi ve T periyodu.',
            elements: [
              { type: 'axis', origin: [50, 80], xLength: 220, yLength: 60, xLabel: 't', yLabel: '\\theta(t)' },
              { type: 'line', from: [50, 50], to: [120, 110], style: 'dashed', color: '#94a3b8' },
              { type: 'line', from: [120, 110], to: [190, 50], style: 'dashed', color: '#94a3b8' },
              { type: 'vector', from: [50, 40], to: [190, 40], label: 'T', color: '#2563eb' }
            ]
          },
          blocks: [
            {
              kind: 'prose',
              text: '**Sembol:** $T$\n\n**Temsil Ettiği Nicelik:** Salınım Periyodu (Oscillation Period)\n\n**SI Birimi:** Saniye (s)\n\nBu problemde $T$, harmonik hareket yapan sarkacın bir tam döngüsünü tamamlaması için geçen süredir:'
            },
            {
              kind: 'equation',
              latex: 'T = 2\\pi \\sqrt{\\frac{L}{g}}',
              explanation: 'Basit Sarkaç Salınım Periyodu'
            }
          ],
          isAxiomatic: false,
          isTerminal: true
        };
      }
    }

    // Diğer tekil semboller için kesin, tekil sözlük eşleşmesi
    const symbolMeaningMap: Record<string, { title: string; meaning: string; unit: string; formula: string; explanation: string }> = {
      'r': {
        title: 'Sembol Analizi: $r$ (Radyal Mesafe)',
        meaning: 'Radyal mesafe veya konum büyüklüğü',
        unit: 'Metre (m)',
        formula: 'r = |\\vec{r}| = \\sqrt{x^2 + y^2}',
        explanation: 'Kutupsal koordinatlarda başlangıç noktasına olan skaler uzaklığı temsil eder.'
      },
      '\\lambda': {
        title: 'Sembol Analizi: $\\lambda$ (Lagrange Kısıt Çarpanı)',
        meaning: 'Lagrange Kısıt Çarpanı',
        unit: 'Newton (N)',
        formula: '\\nabla L + \\lambda \\nabla g = 0',
        explanation: 'Analitik mekanikte kısıt kuvvetini temsil eden Lagrange çarpanıdır.'
      },
      'lambda': {
        title: 'Sembol Analizi: $\\lambda$ (Lagrange Kısıt Çarpanı)',
        meaning: 'Lagrange Kısıt Çarpanı',
        unit: 'Newton (N)',
        formula: '\\nabla L + \\lambda \\nabla g = 0',
        explanation: 'Analitik mekanikte kısıt kuvvetini temsil eden Lagrange çarpanıdır.'
      },
      '\\theta': {
        title: 'Sembol Analizi: $\\theta$ (Açısal Sapma)',
        meaning: 'Açısal sapma konumu (θ)',
        unit: 'Radyan (rad)',
        formula: 's = L \\theta',
        explanation: 'Düşey eksen ile yapılan açısal sapmadır. Sistemin tek serbestlik derecesini (DoF) belirler.'
      },
      'theta': {
        title: 'Sembol Analizi: $\\theta$ (Açısal Sapma)',
        meaning: 'Açısal sapma konumu (θ)',
        unit: 'Radyan (rad)',
        formula: 's = L \\theta',
        explanation: 'Düşey eksen ile yapılan açısal sapmadır.'
      },
      'm': {
        title: 'Sembol Analizi: $m$ (Kütle)',
        meaning: 'Kütle (eylemsizlik ölçüsü)',
        unit: 'Kilogram (kg)',
        formula: '\\vec{F} = m \\vec{a} \\implies m = \\frac{|\\vec{F}|}{|\\vec{a}|}',
        explanation: 'Cismin ivmelenmeye karşı gösterdiği direncin (eylemsizliğin) nicel ölçüsüdür.'
      },
      'g': {
        title: 'Sembol Analizi: $g$ (Yerçekimi İvmesi)',
        meaning: 'Yerel yerçekimi ivmesi',
        unit: 'm/s²',
        formula: 'g = \\frac{G M_\\oplus}{R_\\oplus^2} \\approx 9.81\\,\\text{m/s}^2',
        explanation: 'Dünya yüzeyi yakınında serbest düşen cisimlerin kazandığı yerçekimi ivmesidir.'
      },
      '\\omega': {
        title: 'Sembol Analizi: $\\omega$ (Doğal Açısal Frekans)',
        meaning: 'Sistemin doğal salınım açısal frekansı (ω)',
        unit: 'rad/s',
        formula: '\\omega = \\sqrt{\\frac{g}{L}}',
        explanation: 'Harmonik salınım yapan sistemin birim zamandaki açısal faz ilerleme hızıdır.'
      },
      'omega': {
        title: 'Sembol Analizi: $\\omega$ (Doğal Açısal Frekans)',
        meaning: 'Sistemin doğal salınım açısal frekansı (ω)',
        unit: 'rad/s',
        formula: '\\omega = \\sqrt{\\frac{g}{L}}',
        explanation: 'Sistemin doğal açısal frekansıdır.'
      },
      'k': {
        title: 'Sembol Analizi: $k$ (Yay Sabiti)',
        meaning: 'Hooke yay sertlik katsayısı',
        unit: 'N/m',
        formula: 'F = -k x',
        explanation: 'Yayın birim uzama başına uyguladığı geri çağırıcı kuvvetin ölçüsüdür.'
      }
    };

    if (symbolMeaningMap[cleanedSymbol] || symbolMeaningMap[cleanedSymbol.replace(/^\\/, '')]) {
      const symData = symbolMeaningMap[cleanedSymbol] || symbolMeaningMap[cleanedSymbol.replace(/^\\/, '')];
      return {
        title: symData.title,
        explanation: this.translate("{0} — Boyut ve fiziksel bağlam analizi.", [this.translate(symData.meaning)]),
        diagram: {
          width: 300,
          height: 160,
          caption: this.translate("Şekil: ${0}$ parametresinin sisteme etki vektörü ve geometrisi.", [cleanedSymbol]),
          elements: [
            { type: 'axis', origin: [50, 110], xLength: 200, yLength: 80, xLabel: 'x', yLabel: 'y' },
            { type: 'vector', from: [50, 110], to: [160, 40], label: `${cleanedSymbol}`, color: '#2563eb' }
          ]
        },
        blocks: [
          {
            kind: 'prose',
            text: this.translate("**Sembol:** ${0}$\n\n**Temsil Ettiği Nicelik:** {1}\n\n**SI Birimi / Boyut:** ${2}$\n\n{3}", [cleanedSymbol, this.translate(symData.meaning), this.translate(symData.unit), this.translate(symData.explanation)])
          },
          {
            kind: 'equation',
            latex: symData.formula,
            explanation: 'Yönetici Bağıntı'
          },
          {
            kind: 'prose',
            text: this.translate("Bu problem çerçevesinde (${0}...$), bu parametre sistemin dinamik davranışını doğrudan belirleyen temel ölçek değişkenidir.", [request.problemText.slice(0, 50)])
          }
        ],
        isAxiomatic: false,
        isTerminal: true
      };
    }

    // Taylor açılımı / Küçük açılar sorgusu
    if (selLower.includes('taylor') || containsConcept(selLower, 'küçük açı')) {
      return {
        title: `Bağlamsal Açıklama: Taylor Açılımı ve Doğrusallaştırma`,
        explanation: this.translate("\"{0}\" ifadesinin sistem bağlamındaki matematiksel ve fiziksel gerekçesi.", [selected]),
        diagram: {
          width: 320,
          height: 180,
          caption: 'Şekil: \\sin\\theta fonksiyonu ile lineer y = \\theta teğetinin sıfır civarındaki örtüşmesi.',
          elements: [
            { type: 'axis', origin: [60, 120], xLength: 220, yLength: 90, xLabel: '\\theta', yLabel: 'f(\\theta)' },
            { type: 'line', from: [60, 120], to: [200, 30], style: 'solid', label: 'y = \\theta', color: '#dc2626' },
            { type: 'point', x: 60, y: 120, label: '0' }
          ]
        },
        blocks: [
          {
            kind: 'prose',
            text: this.translate("Kullanıcı Sorusu: \"{0}\".\n\nTaylor serisi, pürüzsüz bir fonksiyonu belirli bir nokta civarında polinom serisi olarak açma yöntemidir. $\\theta = 0$ civarında $\\sin\\theta$ fonksiyonunun tam açılımı:", [query])
          },
          {
            kind: 'equation',
            latex: '\\sin\\theta = \\theta - \\frac{\\theta^3}{3!} + \\frac{\\theta^5}{5!} - \\mathcal{O}(\\theta^7)',
            explanation: 'Tam Taylor Serisi Açılımı'
          },
          {
            kind: 'prose',
            text: 'Küçük açılar rejiminde ($\\theta \\ll 1$ radyan veya yaklaşık $\\theta < 10^\\circ$), yüksek dereceli terimler ($\\theta^3/6 \\approx 0$) ihmal edilebilir mertebeye düşer. Bu sayede lineer olmayan diferansiyel denklem, analitik olarak tam çözülebilen lineer harmonik osilatör denklemine dönüşür.'
          }
        ],
        isAxiomatic: false,
        isTerminal: true
      };
    }

    // Genel fallback bağlamsal açıklama
    return {
      title: this.translate("Bağlamsal Açıklama: \"{0}\"", [selected]),
      explanation: `Mevcut problem ve çözüm adımları ışığında seçili terimin ayrıntılı analizi.`,
      blocks: [
        {
          kind: 'prose',
          text: this.translate("**Soru:** {0}\n\n**İncelenen İfade:** \"{1}\"\n\nBu ifade, {2} bölümünde sistemin sınır koşullarını ve fiziksel kısıtlarını tanımlamak için kullanılmıştır. Mevcut probleme ({3}...) uygulandığında bağımsız koordinatların seçimini doğrular.", [query, selected, request.parentSectionTitle, request.problemText.slice(0, 70)])
        },
        {
          kind: 'equation',
          latex: '\\lim_{\\Delta t \\to 0} \\frac{\\Delta q}{\\Delta t} = \\dot{q}',
          explanation: 'Genelleştirilmiş koordinat türevi'
        }
      ],
      isAxiomatic: false,
      isTerminal: true
    };
  }

  // --- Lagrange Problemi Genişletmesi (Demo 002) ---
  private handleLagrangeExpansion(request: ExpansionRequest): RawExpansionResponse {
    const targetEq =
      request.targetBlock && 'latex' in request.targetBlock
        ? request.targetBlock.latex
        : '';
    const depth = request.depth;

    // Eğer Euler-Lagrange denklemine tıklandıysa -> Aksiyom: Hamilton Varyasyonel Eylem İlkesi
    if (depth >= 2 || targetEq.includes('\\frac{d}{dt}') || targetEq.includes('\\partial \\mathcal{L}')) {
      return {
        title: 'Aksiyom: Hamilton En Küçük Eylem İlkesi (Principle of Least Action)',
        explanation: 'Klasik alan teorisinin ve analitik mekaniğin kurucu aksiyomu: Gerçek fiziksel yörünge, eylem integralini durağan kılan yörüngedir.',
        diagram: {
          width: 340,
          height: 180,
          caption: 'Şekil: Varyasyonel hesapta gerçek yörünge q(t) ile komşu varyasyonel yollar q(t) + \\delta q(t).',
          elements: [
            { type: 'axis', origin: [40, 140], xLength: 260, yLength: 100, xLabel: 't', yLabel: 'q(t)' },
            { type: 'point', x: 70, y: 110, label: 't_1' },
            { type: 'point', x: 250, y: 40, label: 't_2' },
            { type: 'line', from: [70, 110], to: [250, 40], style: 'solid', label: 'q_{gerçek}(t)', color: '#16a34a' },
            { type: 'line', from: [70, 110], to: [160, 60], style: 'dashed', color: '#94a3b8' },
            { type: 'line', from: [160, 60], to: [250, 40], style: 'dashed', label: 'q + \\delta q', color: '#94a3b8' }
          ]
        },
        blocks: [
          {
            kind: 'prose',
            text: 'Euler-Lagrange denklemleri bağımsız bir kabul değil; analitik fiziğin kurucu **varyasyonel aksiyomundan** (Hamilton En Küçük Eylem İlkesi) matematiksel olarak doğar. Gerçek hareket, eylem integralinin varyasyonunu sıfırlar:'
          },
          {
            kind: 'equation',
            latex: '\\delta S = \\delta \\int_{t_1}^{t_2} \\mathcal{L}(q, \\dot{q}, t)\\, dt = 0',
            explanation: 'Hamilton Eylem İlkesi (Aksiyom)'
          },
          {
            kind: 'prose',
            text: 'Sabit sınır koşulları $\\delta q(t_1) = \\delta q(t_2) = 0$ altında kısmi integrasyon uygulandığında, keyfi varyasyonlar için integralin sıfır olması parantez içinin sıfır olmasını gerektirir:'
          },
          {
            kind: 'equation',
            latex: '\\frac{d}{dt}\\left(\\frac{\\partial \\mathcal{L}}{\\partial \\dot{q}_i}\\right) - \\frac{\\partial \\mathcal{L}}{\\partial q_i} = 0',
            explanation: 'Varyasyonel ilkeden türetilen Euler-Lagrange bağıntısı'
          }
        ],
        isAxiomatic: true,
        isTerminal: true,
        axiomType: 'physics'
      };
    }

    // Derinlik 1: Hareket Denkleminin (m_1 (\ddot{r} - r\dot{\theta}^2) + \lambda = 0) Euler-Lagrange ile Adım Adım Türetimi
    return {
      title: 'Euler-Lagrange Türetimi: Radyal Koordinat ($r$) ve Lagrange Çarpanı',
      explanation: 'Genişletilmiş Lagrangian fonksiyonundan Euler-Lagrange diferansiyel denklemi uygulanarak r genelleştirilmiş koordinatına ait hareket denklemi adım adım türetilir.',
      diagram: {
        width: 340,
        height: 220,
        caption: 'Şekil: Masadaki m_1 kütlesi, r radyal mesafesi, teğetsel hız r\\dot{\\theta} ve delikten sarkan ip kısıtı.',
        elements: [
          { type: 'surface', from: [30, 140], to: [310, 140], side: 'top' },
          { type: 'point', x: 170, y: 140, label: 'Delik (O)' },
          { type: 'line', from: [170, 140], to: [90, 80], style: 'rope', label: 'r', color: '#1c1917' },
          { type: 'mass', id: 'm1', x: 90, y: 80, label: 'm_1', shape: 'box', size: 14 },
          { type: 'vector', from: [90, 80], to: [50, 40], label: 'r\\dot{\\theta}', color: '#16a34a' },
          { type: 'vector', from: [90, 80], to: [130, 110], label: '\\vec{T} (\\lambda)', color: '#dc2626' },
          { type: 'line', from: [170, 140], to: [170, 200], style: 'rope', label: 'z' },
          { type: 'mass', id: 'm2', x: 170, y: 200, label: 'm_2', shape: 'circle', size: 12 }
        ]
      },
      blocks: [
        {
          kind: 'prose',
          text: 'Sistemin holonomik kısıt terimini ($\\lambda(L - r - z)$) içeren genişletilmiş Lagrangian fonksiyonu şöyledir:'
        },
        {
          kind: 'equation',
          latex: '\\mathcal{L} = \\frac{1}{2}m_1 (\\dot{r}^2 + r^2\\dot{\\theta}^2) + \\frac{1}{2}m_2 \\dot{z}^2 + m_2 gz + \\lambda(L - r - z)',
          explanation: 'Genişletilmiş Lagrangian fonksiyonu'
        },
        {
          kind: 'prose',
          text: '$r$ genelleştirilmiş koordinatına ait Euler-Lagrange hareket denklemi yazılır:'
        },
        {
          kind: 'equation',
          latex: '\\frac{d}{dt}\\left(\\frac{\\partial \\mathcal{L}}{\\partial \\dot{r}}\\right) - \\frac{\\partial \\mathcal{L}}{\\partial r} = 0',
          explanation: 'Euler-Lagrange Denklemi (Kurucu aksiyom için tıklayın)'
        },
        {
          kind: 'prose',
          text: '**1. Adım:** $\\mathcal{L}$ fonksiyonunun genelleştirilmiş hız $\\dot{r}$\'ye göre kısmi türevi alınır (kanonik momentum $p_r$):'
        },
        {
          kind: 'equation',
          latex: '\\frac{\\partial \\mathcal{L}}{\\partial \\dot{r}} = m_1 \\dot{r}',
          explanation: 'Radyal kanonik momentum'
        },
        {
          kind: 'prose',
          text: '**2. Adım:** Bu momentum ifadesinin zamana göre tam türevi hesaplanır:'
        },
        {
          kind: 'equation',
          latex: '\\frac{d}{dt}\\left(\\frac{\\partial \\mathcal{L}}{\\partial \\dot{r}}\\right) = m_1 \\ddot{r}',
          explanation: 'Momentumun zamanla değişimi'
        },
        {
          kind: 'prose',
          text: '**3. Adım:** $\\mathcal{L}$ fonksiyonunun genelleştirilmiş konum $r$\'ye göre kısmi türevi alınır. Burada kinetik enerjiden santrifüj kuvveti katkısı, kısıt teriminden ise $-\\lambda$ çarpanı gelir:'
        },
        {
          kind: 'equation',
          latex: '\\frac{\\partial \\mathcal{L}}{\\partial r} = m_1 r \\dot{\\theta}^2 - \\lambda',
          explanation: 'Genelleştirilmiş radyal kuvvet'
        },
        {
          kind: 'prose',
          text: '**4. Adım:** Elde edilen tüm ara türevler Euler-Lagrange denkleminde yerine konularak son cebirsel düzenleme yapılır:'
        },
        {
          kind: 'equation',
          latex: 'm_1 \\ddot{r} - (m_1 r \\dot{\\theta}^2 - \\lambda) = 0 \\implies m_1 (\\ddot{r} - r\\dot{\\theta}^2) + \\lambda = 0',
          explanation: 'Tıklanan hareket denkleminin tam analitik türetimi'
        }
      ],
      isAxiomatic: false,
      isTerminal: false
    };
  }

  // --- Kanonik Fixture'lar ---

  public static getPendulumFixture(): RawSolutionResponse {
    return {
      problemTitle: 'İdeal Basit Sarkaç: Hareketi ve Salınım Periyodu',
      problemText:
        'Tavana asılı $L$ uzunluğundaki kütlesiz ve esnemez bir ipin ucuna $m$ kütleli noktasal bir parçacık bağlanmıştır. Sistem düşey doğrultudan küçük bir $\\theta$ açısı kadar saptırılıp serbest bırakıldığında, yerçekimi ivmesi $g$ altında sarkacın hareket denklemini türetiniz ve salınım periyodunu ($T$) bulunuz.',
      problemDiagram: {
        width: 320,
        height: 200,
        caption: 'Şekil: Problem kurulumu — L boyundaki ip, m kütlesi ve θ sapma açısı.',
        elements: [
          { type: 'surface', from: [70, 25], to: [250, 25], side: 'top' },
          { type: 'point', x: 160, y: 25, label: 'O' },
          { type: 'line', from: [160, 25], to: [160, 160], style: 'dashed', color: '#94a3b8' },
          { type: 'line', from: [160, 25], to: [230, 130], style: 'rope', label: 'L' },
          { type: 'mass', id: 'bob', x: 230, y: 130, label: 'm', shape: 'circle', size: 14 },
          { type: 'angle', center: [160, 25], radius: 45, startAngle: 90, endAngle: 56, label: '\\theta' }
        ]
      },
      strategy:
        'Sarkaç kütlesi üzerine etki eden kuvvetler yay teğeti boyunca yazılır; Newton mekaniği ile açısal ivme elde edilerek küçük genlik yaklaşımında harmonik salınım frekansı ve periyodu türetilir.',
      assumptions: [
        'İp kütlesiz ve esnemezdir (sabit uzunluk $L$).',
        'Kütle $m$ noktasal kabul edilir.',
        'Hava sürtünmesi ve mafsal kayıpları ihmal edilmiştir.',
        'Yerçekimi ivmesi $g$ düzgün ve sabittir.',
        'Açısal genlik küçük kabul edilir ($\\theta \\ll 1\\text{ rad}$).'
      ],
      sections: [
        {
          title: 'Sarkaç Geometrisi ve Koordinat Sistemi',
          blocks: [
            {
              kind: 'diagram',
              spec: {
                width: 320,
                height: 240,
                caption: 'Şekil 1: Basit sarkaç koordinatları ve teğetsel kuvvet bileşenleri.',
                elements: [
                  { type: 'surface', from: [80, 30], to: [240, 30], side: 'top' },
                  { type: 'point', x: 160, y: 30, label: 'O (Tavan)' },
                  { type: 'line', from: [160, 30], to: [160, 200], style: 'dashed', label: 'Düşey eksen' },
                  { type: 'line', from: [160, 30], to: [230, 160], style: 'rope', label: 'L' },
                  { type: 'angle', center: [160, 30], radius: 45, startAngle: 90, endAngle: 62, label: '\\theta' },
                  { type: 'mass', id: 'bob', x: 230, y: 160, label: 'm', shape: 'circle', size: 14 },
                  { type: 'vector', from: [230, 160], to: [230, 210], label: 'm\\vec{g}', color: '#2563eb' },
                  { type: 'vector', from: [230, 160], to: [195, 178], label: '\\vec{F}_t', color: '#dc2626' }
                ]
              }
            },
            {
              kind: 'prose',
              text: 'Sarkaç, düşey eksenle $\\theta(t)$ açısı yapacak şekilde salınmaktadır. Kütlenin izlediği dairesel yay uzunluğu $s(t) = L\\theta(t)$ bağıntısıyla belirlenir.'
            }
          ]
        },
        {
          title: 'Dinamik Denge ve Hareket Denklemi',
          blocks: [
            {
              kind: 'prose',
              text: 'İp boyunca etki eden gerilme kuvveti merkeze yöneliktir ve dairesel kısıtı sağlar. Hareketi yönlendiren net teğetsel kuvvet, yerçekiminin yay teğetine düşen bileşenidir:'
            },
            {
              kind: 'equation',
              latex: 'F_t = -m g \\sin\\theta',
              explanation: 'Teğetsel geri çağırıcı kuvvet.'
            },
            {
              kind: 'prose',
              text: 'Newton’un ikinci hareket yasası teğetsel yönde yazıldığında yay ivmesi $\\ddot{s} = L\\ddot{\\theta}$ kullanılır:'
            },
            {
              kind: 'equation',
              latex: 'm L \\ddot{\\theta} = -m g \\sin\\theta',
              explanation: 'Teğetsel ivme ve kuvvet eşitliği.'
            },
            {
              kind: 'equation',
              latex: '\\ddot{\\theta} + \\frac{g}{L} \\sin\\theta = 0',
              explanation: 'Basit sarkacın tam (lineer olmayan) hareket denklemi.'
            }
          ]
        },
        {
          title: 'Küçük Açı Yaklaşımı ve Salınım Periyodu',
          blocks: [
            {
              kind: 'prose',
              text: 'Açının küçük olduğu rejimde ($\\theta \\ll 1$) Taylor serisi birinci mertebede $\\sin\\theta \\approx \\theta$ yaklaşımı verir. Denklem lineer harmonik salınıcı formuna kavuşur:'
            },
            {
              kind: 'equation',
              latex: '\\ddot{\\theta} + \\omega_0^2 \\theta = 0, \\quad \\omega_0 = \\sqrt{\\frac{g}{L}}',
              explanation: 'Doğal açısal frekans.'
            },
            {
              kind: 'prose',
              text: 'Bu lineer ikinci derece diferansiyel denklemin periyodik çözümü $T = 2\\pi / \\omega_0$ periyodunu verir:'
            },
            {
              kind: 'equation',
              latex: 'T = 2\\pi \\sqrt{\\frac{L}{g}}',
              explanation: 'Küçük açılar rejiminde basit sarkaç salınım periyodu.'
            }
          ]
        },
        {
          title: 'Çözümün Sağlaması ve Doğruluk Kontrolleri (Boyut Analizi & Limit Durumlar)',
          blocks: [
            {
              kind: 'prose',
              text: '**1. Boyut Analizi (Dimensional Analysis):**\n\nTüretilen periyot bağıntısı $T = 2\\pi \\sqrt{\\frac{L}{g}}$ için sol taraf zaman boyutu $[T]$ (saniye), sağ taraf ise $2\\pi \\sqrt{\\frac{[L]}{[L T^{-2}]}} = \\sqrt{[T^2]} = [T]$ (saniye) boyutundadır. $2\\pi$ katsayısı boyutsuzdur. Denklem boyut açısından kusursuz tutarlıdır.'
            },
            {
              kind: 'prose',
              text: '**2.1 Limit Durumu: Yerçekiminin Sıfıra Gitmesi ($g \\to 0$):**\n- **Beklenen Davranış:** $T \\to \\infty$\n- **Fiziksel Kanıt:** Yerçekimi olmadığında kütleyi düşey dengeye çeken hiçbir teğetsel geri çağırıcı kuvvet doğmaz; sarkaç salınamaz ve periyot sonsuza ıraksar.'
            },
            {
              kind: 'prose',
              text: '**2.2 Limit Durumu: İp Uzunluğunun Sıfıra Gitmesi ($L \\to 0$):**\n- **Beklenen Davranış:** $T \\to 0$\n- **Fiziksel Kanıt:** İp kısaldıkça eylemsizlik momenti sıfıra yaklaşır ve sonsuz yüksek frekansla salınır ($T = 2\\pi\\sqrt{0/g} = 0$).'
            },
            {
              kind: 'prose',
              text: '**2.3 Limit Durumu: Küçük Genlik Yaklaşımı ($\\theta \\to 0$):**\n- **Beklenen Davranış:** $\\ddot{\\theta} + \\frac{g}{L}\\theta = 0$\n- **Matematiksel Kanıt:** $\\lim_{\\theta \\to 0} \\frac{\\sin\\theta}{\\theta} = 1$ olduğundan nonlineer denklem tam lineer basit harmonik harekete indirgenir.'
            }
          ]
        }
      ],
      verification: {
        dimensionalAnalysis:
          'Türetilen periyot bağıntısı $T = 2\\pi \\sqrt{\\frac{L}{g}}$ için sol taraf zaman boyutu $[T]$ (saniye), sağ taraf $2\\pi \\sqrt{\\frac{[L]}{[L T^{-2}]}} = \\sqrt{[T^2]} = [T]$ (saniye) boyutundadır. $2\\pi$ katsayısı boyutsuzdur. Boyut eşitliği tam olarak sağlanmaktadır.',
        limitingCases: [
          {
            condition: 'g \\to 0',
            expected: 'T \\to \\infty',
            analysis:
              'Yerçekimi ivmesi sıfıra gittiğinde geri çağırıcı teğetsel kuvvet ortadan kalkar; kütle denge konumuna geri dönemez, salınım durur ve periyot sonsuza ıraksar.'
          },
          {
            condition: 'L \\to 0',
            expected: 'T \\to 0',
            analysis:
              'İp uzunluğu sıfıra yaklaştıkça eylemsizlik momenti sıfırlanır ve salınım frekansı sonsuza gider ($T \\to 0$).'
          },
          {
            condition: '\\theta \\to 0',
            expected: '\\sin\\theta \\approx \\theta \\implies \\ddot{\\theta} + \\frac{g}{L}\\theta = 0',
            analysis:
              'Küçük genlik limitinde Taylor açılımının ilk mertebesi lineer harmonik salınıcı hareket denklemini eksiksiz verir.'
          }
        ]
      }
    };
  }

  public static getLagrangeFixture(): RawSolutionResponse {
    return {
      problemTitle: 'Kısıtlı İki Kütleli Mekanik Sistem (Lagrange Çarpanı)',
      strategy:
        'Sürtünmesiz yatay masada dairesel hareket yapan $m_1$ kütlesi ile delikten sarkan $m_2$ kütlesi arasındaki kısıt holonomik olarak ifade edilir ve Lagrange çarpanı yöntemiyle ip gerilmesi çözülür.',
      assumptions: [
        'Masa pürüzsüz ve sürtünmesizdir.',
        'İp kütlesiz, esnemez ve delikten sürtünmesiz kaymaktadır (uzunluk $L$).',
        'Kütleler noktasaldır.'
      ],
      sections: [
        {
          title: 'Kinetik ve Potansiyel Enerji',
          blocks: [
            {
              kind: 'prose',
              text: 'Kutup koordinatlarında masadaki $m_1$ kütlesi ve düşey eksendeki $m_2$ kütlesinin kinetik enerjisi:'
            },
            {
              kind: 'equation',
              latex: 'T = \\frac{1}{2} m_1 (\\dot{r}^2 + r^2 \\dot{\\theta}^2) + \\frac{1}{2} m_2 \\dot{z}^2',
              explanation: 'Sistemin toplam kinetik enerjisi.'
            },
            {
              kind: 'prose',
              text: 'Masa seviyesi sıfır potansiyel referansı seçilerek $m_2$ kütlesinin aşağı yönlü potansiyeli:'
            },
            {
              kind: 'equation',
              latex: 'V = -m_2 g z',
              explanation: 'Sistemin potansiyel enerjisi (aşağı yön z pozitif).'
            }
          ]
        },
        {
          title: 'Kısıt Denklemi ve Genişletilmiş Lagrangian',
          blocks: [
            {
              kind: 'prose',
              text: 'İpin sabit boyda olması geometrik kısıtı oluşturur:'
            },
            {
              kind: 'equation',
              latex: 'f(r, z) = r + z - L = 0',
              explanation: 'Holonomik ip boyu kısıtı.'
            },
            {
              kind: 'equation',
              latex: '\\mathcal{L} = T - V + \\lambda (r + z - L)',
              explanation: 'Lagrange çarpanı $\\lambda$ içeren genişletilmiş fonksiyon.'
            }
          ]
        },
        {
          title: 'Euler-Lagrange Denklemleri ve İp Gerilmesi',
          blocks: [
            {
              kind: 'equation',
              latex: 'm_1 \\ddot{r} - m_1 r \\dot{\\theta}^2 = \\lambda',
              explanation: 'r koordinatı için hareket denklemi.'
            },
            {
              kind: 'equation',
              latex: 'm_2 \\ddot{z} - m_2 g = \\lambda',
              explanation: 'z koordinatı için hareket denklemi.'
            },
            {
              kind: 'prose',
              text: '$\\lambda$ doğrudan ipteki gerilme kuvvetine karşılık gelir: $T_{\\text{ip}} = -\\lambda$.'
            }
          ]
        },
        {
          title: 'Çözümün Sağlaması ve Doğruluk Kontrolleri (Boyut Analizi & Limit Durumlar)',
          blocks: [
            {
              kind: 'prose',
              text: '**1. Boyut Analizi (Dimensional Analysis):**\n\nLagrange çarpanı $\\lambda$ doğrudan kısıt kuvvetini temsil eder. $\\mathcal{L}$ fonksiyonunda $[\\lambda \\cdot r] = [M L^2 T^{-2}]$ olduğundan $[\\lambda] = [M L T^{-2}]$ (Newton) boyutundadır. İp gerilmesi bir kuvvet boyutuyla tam uyumludur.'
            },
            {
              kind: 'prose',
              text: '**2.1 Limit Durumu: Dönmenin Sıfır Olması ($\\dot{\\theta} = 0$):**\n- **Beklenen Davranış:** Sistem standart Atwood aletine indirgenmeli ve $\\ddot{r} = \\frac{m_2}{m_1 + m_2}g$ olmalıdır.\n- **Matematiksel Kanıt:** $\\dot{\\theta} = 0$ koyulduğunda $m_1 \\ddot{r} = \\lambda$ ve $\\ddot{z} = -\\ddot{r}$ bağıntısından $-m_2 \\ddot{r} - m_2 g = \\lambda$ elde edilir. Taraf tarafa çıkarıldığında $(m_1 + m_2)\\ddot{r} = m_2 g$ bulunur. Bu, masadaki sürtünmesiz Atwood aletinin tam çözümüdür.'
            },
            {
              kind: 'prose',
              text: '**2.2 Limit Durumu: Sarkan Kütlenin Sıfıra Gitmesi ($m_2 \\to 0$):**\n- **Beklenen Davranış:** İp gerilmesi sıfır ($T_{\\text{ip}} = 0$) ve masadaki kütle serbest eylemsiz olmalıdır.\n- **Matematiksel Kanıt:** $m_2 = 0 \\implies \\lambda = 0$. Böylece $m_1 \\ddot{r} = m_1 r \\dot{\\theta}^2$ serbest dairesel savrulma verir.'
            }
          ]
        }
      ],
      verification: {
        dimensionalAnalysis:
          'Lagrange çarpanı $\\lambda$ doğrudan ip gerilmesine karşılık gelir: $[\\lambda] = [M L T^{-2}]$ (Newton). Kinetik ve potansiyel enerjiler $[M L^2 T^{-2}]$ (Joule) boyutundadır. Boyut eşitliği tamdır.',
        limitingCases: [
          {
            condition: '\\dot{\\theta} = 0',
            expected: '\\ddot{r} = \\frac{m_2}{m_1 + m_2}g, \\quad T_{\\text{ip}} = \\frac{m_1 m_2}{m_1 + m_2}g',
            analysis:
              'Açısal hız sıfır olduğunda sistem klasik Atwood aletine indirgenir; her iki kütle aynı ivmeyle tek boyutta ivmelenir.'
          },
          {
            condition: 'm_2 \\to 0',
            expected: 'T_{\\text{ip}} = 0, \\quad \\ddot{r} = r\\dot{\\theta}^2',
            analysis:
              'Sarkan kütle sıfır olduğunda ip gerilmesi oluşmaz; masadaki kütle serbest savrulma yapar.'
          }
        ]
      }
    };
  }

  public static getMovingWedgeFixture(): RawSolutionResponse {
    return {
      problemTitle: 'Hareketli Eğik Düzlem Üzerinde Kayan Blok Dinamiği',
      problemText:
        'Sürtünmesiz yatay bir zemin üzerinde serbestçe kayabilen $M$ kütleli ve $\\alpha$ eğim açılı bir kama (eğik düzlem) üzerine $m$ kütleli küçük bir blok konmuştur. Blok ile eğik düzlem yüzeyi arasındaki sürtünme de ihmal edilmektedir. Sistem serbest bırakıldığında kamanın yatay ivmesini ($A_x$) ve bloğun eğik düzleme göre bağıl ivmesini ($a_{\\text{rel}}$) türetiniz. Çözümün doğruluğunu boyut analizi ve limit durumlar ($M \\to \\infty$, $\\alpha \\to 0$, $\\alpha \\to 90^\\circ$, $m \\to 0$) ile kanıtlayınız.',
      problemDiagram: {
        width: 360,
        height: 220,
        caption: 'Şekil: Sürtünmesiz yatay zeminde serbest hareketli kama (M) ve kayan blok (m).',
        elements: [
          { type: 'surface', from: [30, 180], to: [330, 180], side: 'bottom' },
          {
            type: 'polygon',
            points: [
              [60, 180],
              [280, 180],
              [280, 70]
            ],
            fill: 'rgba(217, 119, 6, 0.08)',
            stroke: '#d97706',
            strokeWidth: 2
          },
          { type: 'point', x: 190, y: 140, label: 'M' },
          {
            type: 'polygon',
            points: [
              [140, 140],
              [170, 125],
              [185, 155],
              [155, 170]
            ],
            fill: 'rgba(37, 99, 235, 0.15)',
            stroke: '#2563eb',
            strokeWidth: 2
          },
          { type: 'point', x: 162, y: 147, label: 'm' },
          {
            type: 'angle',
            center: [60, 180],
            radius: 40,
            startAngle: -26.5,
            endAngle: 0,
            label: '\\alpha'
          },
          { type: 'axis', origin: [40, 60], xLength: 60, yLength: 40, xLabel: 'X', yLabel: 'Y' }
        ]
      },
      strategy:
        'Kama ve bloktan oluşan iki serbestlik dereceli sistem ele alınır. Yatay doğrultuda dış kuvvet sıfır olduğundan sistemin yatay doğrusal momentumu korunur (veya kamanın ivmeli referans sisteminde d\'Alembert eylemsizlik kuvveti kullanılır). Kamanın ivmesi $A_x$ ile bloğun bağıl ivmesi $a_{\\text{rel}}$ dinamik denklemlerden analitik olarak çözülür.',
      assumptions: [
        'Zemin ile kama ($M$) arasındaki sürtünme katsayısı sıfırdır ($\\mu_1 = 0$).',
        'Kama ile blok ($m$) arasındaki sürtünme katsayısı sıfırdır ($\\mu_2 = 0$).',
        'Blok noktasal kabul edilir ve kama yüzeyi boyunca kayma süresince temas kesilmez ($N > 0$).',
        'Yerçekimi ivmesi $g$ düzgün, sabit ve düşey aşağı yöndedir.'
      ],
      sections: [
        {
          title: 'Kinematik Bağıntılar ve Koordinat Sistemleri',
          blocks: [
            {
              kind: 'prose',
              text: 'Kamanın yatay doğrultudaki ivmesi sağa doğru $A_x$ olsun. Bloğun eğik düzleme göre eğik yüzey boyunca aşağı doğru bağıl ivmesi $a_{\\text{rel}}$ olarak tanımlansın. Laboratuvar (eylemsiz) koordinat sisteminde bloğun ivme bileşenleri:'
            },
            {
              kind: 'equation',
              latex: 'a_{bx} = A_x - a_{\\text{rel}} \\cos\\alpha',
              explanation: 'Bloğun yatay ivme bileşeni'
            },
            {
              kind: 'equation',
              latex: 'a_{by} = -a_{\\text{rel}} \\sin\\alpha',
              explanation: 'Bloğun düşey ivme bileşeni'
            }
          ]
        },
        {
          title: 'Hareket Denklemleri ve İvmelerin Türetimi',
          blocks: [
            {
              kind: 'prose',
              text: 'Kama üzerine etki eden yatay kuvvet, bloğun uyguladığı normal tepki kuvvetinin yatay bileşenidir: $N \\sin\\alpha = M A_x$. Bloğun eğik düzleme dik ve paralel hareket denklemleri çözüldüğünde normal tepki kuvveti ve kamanın ivmesi elde edilir:'
            },
            {
              kind: 'equation',
              latex: 'A_x = \\frac{m g \\sin\\alpha \\cos\\alpha}{M + m \\sin^2\\alpha}',
              explanation: 'Kamanın yatay ivmesi'
            },
            {
              kind: 'prose',
              text: 'Kamanın ivmesi bağıl hareket denklemine yerleştirildiğinde bloğun eğik düzleme göre kayma ivmesi tam analitik formuna ulaşır:'
            },
            {
              kind: 'equation',
              latex: 'a_{\\text{rel}} = \\frac{(M + m) g \\sin\\alpha}{M + m \\sin^2\\alpha}',
              explanation: 'Bloğun eğik düzleme göre bağıl ivmesi'
            }
          ]
        },
        {
          title: 'Çözümün Sağlaması ve Doğruluk Kontrolleri (Boyut Analizi & Limit Durumlar)',
          blocks: [
            {
              kind: 'prose',
              text: '**1. Boyut Analizi (Dimensional Analysis):**\n\nTüretilen ivme bağıntılarında pay ve paydanın boyutları incelenir:\n\n- Pay: $[(M + m) g \\sin\\alpha] = [M] \\cdot [L T^{-2}] = [M L T^{-2}]$ (Kuvvet boyutu)\n- Payda: $[M + m \\sin^2\\alpha] = [M]$ (Kütle boyutu)\n- Oran: $\\frac{[M L T^{-2}]}{[M]} = [L T^{-2}]$ (İvme boyutu $\\text{m/s}^2$)\n\nTrigonometrik fonksiyonlar $\\sin\\alpha$ ve $\\cos\\alpha$ boyutsuz saf oranlardır. Hem kamanın ivmesi $A_x$ hem de bloğun bağıl ivmesi $a_{\\text{rel}}$ kusursuz biçimde ivme boyutu $[L T^{-2}]$ verir.'
            },
            {
              kind: 'prose',
              text: '**2.1 Limit Durumu: Kamanın Kütlesinin Sonsuza Gitmesi ($M \\to \\infty$):**\n- **Beklenen Davranış:** Sabit, hareketsiz normal eğik düzlem ivmesi $a_{\\text{rel}} = g \\sin\\alpha$ ve $A_x = 0$ çıkmalıdır.\n- **Matematiksel Kanıt:**\n$$\\lim_{M \\to \\infty} A_x = \\lim_{M \\to \\infty} \\frac{m g \\sin\\alpha \\cos\\alpha}{M + m \\sin^2\\alpha} = 0$$\n$$\\lim_{M \\to \\infty} a_{\\text{rel}} = \\lim_{M \\to \\infty} \\frac{M(1 + m/M)g \\sin\\alpha}{M(1 + (m/M)\\sin^2\\alpha)} = \\frac{(1 + 0)g \\sin\\alpha}{1 + 0} = g \\sin\\alpha$$\nKama kütlesi sonsuz olduğunda kama hareketsiz kalır ve blok standart sabit eğik düzlemde kayar! Bu sonuç temel klasik mekanik ders kitabı formülüyle tam örtüşmektedir.'
            },
            {
              kind: 'prose',
              text: '**2.2 Limit Durumu: Eğim Açısının Sıfıra Gitmesi ($\\alpha \\to 0$):**\n- **Beklenen Davranış:** Yatay zemin, kayma ivmesi ve kama ivmesi sıfır olmalıdır ($a_{\\text{rel}} = 0$, $A_x = 0$).\n- **Matematiksel Kanıt:**\n$$\\lim_{\\alpha \\to 0} \\sin\\alpha = 0 \\implies A_x = 0 \\quad \\text{ve} \\quad a_{\\text{rel}} = 0$$\nEğim olmadığında yerçekiminin yüzeye paralel bileşeni sıfırdır, sistem hareketsiz dengede kalır.'
            },
            {
              kind: 'prose',
              text: '**2.3 Limit Durumu: Eğim Açısının $90^\\circ$ Olması ($\\alpha \\to 90^\\circ$):**\n- **Beklenen Davranış:** Kama yüzeyi düşey duvara dönüşür, blok düşey serbest düşme yapmalıdır ($a_{\\text{rel}} = g$, $A_x = 0$).\n- **Matematiksel Kanıt:** $\\sin 90^\\circ = 1$ ve $\\cos 90^\\circ = 0$ değerleri formüle konulduğunda:\n$$A_x = \\frac{m g (1)(0)}{M + m} = 0$$\n$$a_{\\text{rel}} = \\frac{(M + m) g (1)}{M + m(1)^2} = \\frac{(M + m)g}{M + m} = g$$\nNormal kuvvet sıfırlanır, kama hiç itilmez ve blok yerçekimiyle serbest düşer ($a = g$).'
            },
            {
              kind: 'prose',
              text: '**2.4 Limit Durumu: Bloğun Kütlesinin Sıfıra Gitmesi ($m \\to 0$):**\n- **Beklenen Davranış:** Kütlesiz parçacık kamayı itecek kuvvet üretemez ($A_x = 0$), kendi ivmesi yine $g\\sin\\alpha$ olur.\n- **Matematiksel Kanıt:** $m = 0$ yazıldığında $A_x = 0$ ve $a_{\\text{rel}} = \\frac{M g \\sin\\alpha}{M} = g \\sin\\alpha$ bulunur.'
            }
          ]
        }
      ],
      verification: {
        dimensionalAnalysis:
          'Türetilen ivme ifadelerinin sol tarafı ivme $[L T^{-2}]$, sağ tarafı ise $\\frac{[M] \\cdot [L T^{-2}]}{[M]} = [L T^{-2}]$ (m/s²) boyutundadır. Trigonometrik fonksiyonlar boyutsuzdur. Boyut eşitliği tam olarak doğrulanmıştır.',
        limitingCases: [
          {
            condition: 'M \\to \\infty',
            expected: 'Sabit eğik düzlem ivmesi a_{\\text{rel}} = g \\sin\\alpha, \\quad A_x = 0',
            analysis:
              'Kamanın kütlesi bloğa kıyasla sonsuza giderken (veya kama zemine sabitlendiğinde), pay ve paydadaki M terimleri baskınlaşır: \\lim_{M \\to \\infty} a_{\\text{rel}} = g \\sin\\alpha ve \\lim_{M \\to \\infty} A_x = 0. Sistem tam olarak standart sabit eğik düzlem denklemine indirgenir.'
          },
          {
            condition: '\\alpha \\to 0',
            expected: 'a_{\\text{rel}} = 0, \\quad A_x = 0',
            analysis:
              'Eğim açısı sıfıra gittiğinde yüzey yataylaşır; \\sin(0)=0 olduğundan hiçbir ivme oluşmaz, sistem statik dengede kalır.'
          },
          {
            condition: '\\alpha \\to 90^\\circ',
            expected: 'a_{\\text{rel}} = g, \\quad A_x = 0',
            analysis:
              'Kama yüzeyi düşey duvara dönüştüğünde \\sin(90^\\circ)=1 ve \\cos(90^\\circ)=0 olur. Normal kuvvet sıfırlanır, kama yatayda itilmez (A_x = 0) ve blok yerçekimiyle serbest düşme yapar (a_{\\text{rel}} = g).'
          },
          {
            condition: 'm \\to 0',
            expected: 'a_{\\text{rel}} = g \\sin\\alpha, \\quad A_x = 0',
            analysis:
              'Bloğun kütlesi ihmal edilecek kadar küçük olduğunda kamaya yatay tepki kuvveti uygulayamaz; kama sabit kalır ve blok serbestçe g \\sin\\alpha ivmesiyle kayar.'
          }
        ],
        advancedChecks: [
          {
            id: 'adv_check_conservation',
            title: 'Yatay Momentum Korunumu & Noether Teoremi',
            type: 'conservation',
            badge: '⚖️ Korunum Yasası',
            description:
              'Sisteme yatayda hiçbir dış kuvvet etki etmediğinden (sum F_x = 0) toplam yatay momentumun korunduğunun analitik kanıtı.',
            query:
              'Hareketli kama sisteminde x yönünde net dış kuvvet olmamasından doğan yatay momentum korunumunu (P_x = sabit) analitik olarak ispatlayınız.'
          },
          {
            id: 'adv_check_alternative',
            title: 'Newton & d\'Alembert Eylemsizlik Kuvveti Yöntemi',
            type: 'alternative_method',
            badge: '🔄 Alternatif Çözüm',
            description:
              'Kamanın ivmeli referans sisteminde d\'Alembert hayali eylemsizlik kuvveti (-m*A_x) kullanılarak bağımsız türetim.',
            query:
              'Kamanın ivmeli referans sisteminde d\'Alembert eylemsizlik kuvveti (-m*A_x) kullanarak bloğun hareket denklemini Lagrange formalisminden bağımsız olarak türetiniz.'
          },
          {
            id: 'adv_check_energy',
            title: 'Mekanik Enerji Korunumu ve İş-Enerji Teoremi',
            type: 'stability',
            badge: '⚡ Enerji Sağlaması',
            description:
              'Sürtünmesiz sistemde potansiyel enerjideki kaybın kinetik enerji kazancına tam eşitliğinin denetimi.',
            query:
              'Sistemin toplam mekanik enerjisini zamana göre türeterek (dE/dt = 0) hareket denklemlerinin enerji korunumuyla tutarlılığını gösteriniz.'
          }
        ]
      }
    };
  }

  /**
   * Hipotenüs ve Pisagor Teoremi Kanonik Fikstürü:
   * Fiziksel bağlamdan saf Öklid geometrisine ve matematiğe epistemik sıçrama.
   * Şekil zorlaması (dik üçgen), tanım, cebirsel alan ispatı ve Öklid 5. postulat aksiyom zeminini içerir.
   */
  public static getHypotenuseFixture(): RawExpansionResponse {
    return {
      title: 'Geometrik Teorem ve İspat: Hipotenüs ve Pisagor Teoremi',
      explanation:
        'Fiziksel sistem bağlamından saf Öklid geometrisine geçiş: Dik üçgen tanımı, hipotenüs bağıntısı ve Pisagor teoreminin alan korunumlu analitik ispatı (Öklid geometrisi türetimi).',
      diagram: {
        width: 340,
        height: 220,
        caption: 'Şekil: Öklid düzleminde ABC dik üçgeni; dik kenarlar (a, b), hipotenüs (c) ve 90° dik açı.',
        elements: [
          // Dik üçgen kapalı alanı (polygon)
          {
            type: 'polygon',
            points: [
              [60, 180],
              [240, 180],
              [240, 60]
            ],
            fill: 'rgba(37, 99, 235, 0.08)',
            stroke: '#2563eb',
            strokeWidth: 2
          },
          // Köşe noktaları
          { type: 'point', x: 60, y: 180, label: 'A' },
          { type: 'point', x: 240, y: 180, label: 'C (90°)' },
          { type: 'point', x: 240, y: 60, label: 'B' },
          // Kenar etiketleri
          {
            type: 'line',
            from: [60, 180],
            to: [240, 180],
            label: 'b (komşu dik kenar)',
            color: '#475569'
          },
          {
            type: 'line',
            from: [240, 180],
            to: [240, 60],
            label: 'a (karşı dik kenar)',
            color: '#475569'
          },
          {
            type: 'line',
            from: [60, 180],
            to: [240, 60],
            label: 'c (hipotenüs)',
            color: '#2563eb',
            style: 'solid'
          },
          // Dik açı sembolü (C köşesinde küçük kare)
          {
            type: 'line',
            from: [225, 180],
            to: [225, 165],
            color: '#0f172a'
          },
          {
            type: 'line',
            from: [225, 165],
            to: [240, 165],
            color: '#0f172a'
          },
          { type: 'point', x: 232, y: 172 },
          // A köşesindeki açı θ
          {
            type: 'angle',
            center: [60, 180],
            radius: 35,
            startAngle: -33.7,
            endAngle: 0,
            label: '\\theta'
          }
        ]
      },
      blocks: [
        {
          kind: 'prose',
          text: '### 1. Hipotenüsün Saf Matematiksel Tanımı\n\nÖklid düzlem geometrisinde bir dik üçgenin iç açıları toplamı $180^\\circ$ olup açılardan biri tam olarak $90^\\circ$ (dik açı) ölçüsündedir.\n\n**Hipotenüs (Hypotenuse):** $90^\\circ$\'lik dik açının tam karşısında yer alan, üçgenin **en uzun kenarıdır**. Grekçe *hypoteinousa* ("altına uzanan / karşısına gerilen") kökünden gelir. Dik kenarlar ($a$ ve $b$) arasındaki açı dik olduğundan, hipotenüsün uzunluğu ($c$) doğrudan Pisagor bağıntısıyla belirlenir:'
        },
        {
          kind: 'equation',
          latex: 'c = \\sqrt{a^2 + b^2} \\quad \\iff \\quad a^2 + b^2 = c^2',
          explanation: 'Pisagor Bağıntısı ve Hipotenüs Uzunluğu'
        },
        {
          kind: 'prose',
          text: '### 2. Pisagor Teoreminin Analitik ve Geometrik İspatı (Alan Korunumu)\n\nFiziksel bağlamdan bağımsız olarak, teoremin en zarif ispatı cebirsel alan korunumuyla yapılır.\n\nBir kenar uzunluğu $(a + b)$ olan büyük bir kare ele alalım. Bu karenin köşelerine hipotenüsleri içeride kalacak biçimde 4 adet eş dik üçgen ($ABC$) yerleştirildiğinde, ortada kenar uzunluğu $c$ olan eğik bir iç kare oluşur:\n\n1. **Büyük Karenin Toplam Alanı:**\n$$Alan_{toplam} = (a + b)^2 = a^2 + 2ab + b^2$$\n\n2. **Parçaların Alanları Toplamı:**\nBüyük kare, 4 adet dik üçgen ve 1 adet ortadaki $c \\times c$ kareden meydana gelir:\n$$Alan_{parçalar} = 4 \\cdot \\left(\\frac{1}{2} a b\\right) + c^2 = 2ab + c^2$$'
        },
        {
          kind: 'equation',
          latex: '(a + b)^2 = 4 \\left(\\frac{1}{2}ab\\right) + c^2',
          explanation: 'Bütünün alanı ile parçaların alanları eşitliği (Öklid Alan Aksiyomu)'
        },
        {
          kind: 'prose',
          text: 'Sol taraftaki tam kare açılımı ile sağ taraftaki parçaları eşitleyip karşılıklı $2ab$ terimlerini sadeleştirdiğimizde:'
        },
        {
          kind: 'equation',
          latex: 'a^2 + 2ab + b^2 = 2ab + c^2 \\implies a^2 + b^2 = c^2',
          explanation: 'Pisagor Teoremi İspatı (Q.E.D.)'
        },
        {
          kind: 'prose',
          text: '### 3. Geometrik Teorem Statüsü: Öklid Geometrisi ve İspatlanabilirlik\n\nPisagor bağıntısı ve hipotenüs kavramı, kendi başına ispatsız kabul edilen bir aksiyom değil; Öklid düzlem geometrisinin aksiyomlarından (özellikle 5. Paralellik Postulatı ve alan toplamsallığı aksiyomundan) ispatlanan kurucu bir **teoremdir** (Pythagorean Theorem).\n\nEğri bir uzayda (örneğin küre yüzeyi veya genel görelilik uzay-zamanında) üçgenin iç açıları toplamı $180^\\circ$ olamaz ve Pisagor teoremi geçerliliğini yitirir ($ds^2 = g_{\\mu\\nu} dx^\\mu dx^\\nu$). Dolayısıyla hipotenüs ve $a^2+b^2=c^2$ bağıntısı nihai bir aksiyom olmayıp, Öklid aksiyomları üzerine inşa edilmiş temel bir geometrik teoremdir.'
        }
      ],
      isAxiomatic: false,
      isTerminal: false
    };
  }

  /**
   * Problem 7.34: Yaylı Hareketli Kama ve Küçük Titreşim Frekansı Kanonik Çözümü
   * (a) Lagrangian, (b) Hareket Denklemleri, (c) Küçük Salınım Frekansı
   * Boyut analizi, Limit durumlar ve İleri Düzey Derinleştirme Sağlamaları
   */
  public static getSpringWedgeOscillatorFixture(): RawSolutionResponse {
    return {
      problemTitle: 'Hareketli Eğik Düzlemde Yaylı Kütle Dinamiği ve Küçük Salınım Frekansı (Problem 7.34)',
      problemText:
        'Sürtünmesiz yatay bir yüzey üzerinde serbestçe kayabilen $M$ kütleli bir kama (eğik düzlem) bulunmaktadır. Doğal boyu $l$ ve yay sabiti $k$ olan bir yay ile kamaya tepesinden bağlanan $m$ kütleli bir blok, kamanın $\\alpha$ eğim açılı sürtünmesiz yüzeyi boyunca kaymaktadır.\n\n(a) Kamanın yatay konumu için $x$, bloğun kama üzerindeki tepeden aşağıya mesafesi için $s$ genelleştirilmiş koordinatlarını kullanarak sistemin Lagrangian fonksiyonunu kurunuz.\n(b) Sistemin Lagrange hareket denklemlerini elde ediniz.\n(c) Bloğun kararlı denge konumu etrafındaki küçük genlikli salınımlarının frekansını türetiniz.\n\nÇözümün doğruluğunu boyut analizi, limit durumlar ($M \\to \\infty$, $\\alpha \\to 0$, $\\alpha \\to 90^\\circ$) ve ileri düzey derinleştirme sağlamalarıyla test ediniz.',
      problemDiagram: {
        width: 380,
        height: 240,
        caption: 'Şekil 7.34: Sürtünmesiz yatay zeminde M kütleli kama ve eğik yüzeyde k yayına bağlı m kütlesi.',
        elements: [
          { type: 'surface', from: [30, 200], to: [350, 200], side: 'bottom' },
          {
            type: 'polygon',
            points: [
              [60, 200],
              [300, 200],
              [300, 70]
            ],
            fill: 'rgba(217, 119, 6, 0.08)',
            stroke: '#d97706',
            strokeWidth: 2
          },
          { type: 'point', x: 200, y: 160, label: 'M' },
          { type: 'angle', center: [60, 200], startAngle: 0, endAngle: 28, radius: 45, label: '\\alpha' },
          { type: 'line', from: [300, 70], to: [205, 122], style: 'dashed', label: 'k, l', color: '#16a34a' },
          {
            type: 'polygon',
            points: [
              [190, 115],
              [220, 100],
              [235, 130],
              [205, 145]
            ],
            fill: 'rgba(37, 99, 235, 0.15)',
            stroke: '#2563eb',
            strokeWidth: 2
          },
          { type: 'point', x: 212, y: 122, label: 'm' },
          { type: 'vector', from: [60, 215], to: [120, 215], label: 'x', color: '#b45309' },
          { type: 'vector', from: [300, 55], to: [220, 98], label: 's', color: '#2563eb' }
        ]
      },
      strategy:
        'Genelleştirilmiş koordinatlar olarak kamanın yatay konumu $x$ ve bloğun eğik düzlem boyunca tepeye olan mesafesi $s$ seçilecektir. Sistemin toplam kinetik enerjisi $T = T_M + T_m$ ve potansiyel enerjisi $V = V_{\\text{yay}} + V_{\\text{yerçekimi}}$ hesaplanarak Lagrangian $L = T - V$ oluşturulacaktır. $x$ koordinatının döngüsel (cyclic) olmasından kaynaklanan yatay momentum korunumundan ve Euler-Lagrange denklemlerinden yararlanılarak hareket denklemleri çözülecek; denge konumu $s_0$ bulunup küçük sapmalar için harmonik salınım frekansı $\\omega$ analitik olarak türetilecektir.',
      assumptions: [
        'Yatay zemin ve kamanın eğik yüzeyi tamamen sürtünmesizdir.',
        'Yay ideal olup Hooke Yasası\'na tam uyar ve kütlesi ihmal edilebilir.',
        'Hareket esnasında blok kama yüzeyinden ayrılmaz ve kama devrilmez.',
        'Yerçekimi ivmesi $g$ sabittir.'
      ],
      sections: [
        {
          title: 'Kinematik Bağıntılar ve Lagrangian Fonksiyonunun Kurulması',
          blocks: [
            {
              kind: 'prose',
              text: 'Kamanın konumu tek serbestlik dereceli olup yatay eksendedir: $X_M = x, Y_M = 0$. Kamanın hızı $\\dot{x}$ olup kinetik enerjisi:'
            },
            {
              kind: 'equation',
              latex: 'T_M = \\frac{1}{2} M \\dot{x}^2',
              explanation: 'Kamanın Kinetik Enerjisi'
            },
            {
              kind: 'prose',
              text: 'Bloğun laboratuvar referans sistemindeki kartezyen koordinatları kamanın tepe noktası $(x, h)$ referans alındığında:'
            },
            {
              kind: 'equation',
              latex: 'x_m = x + s\\cos\\alpha, \\quad y_m = h - s\\sin\\alpha',
              explanation: 'Bloğun Konum Vektörü Bileşenleri'
            },
            {
              kind: 'prose',
              text: 'Zamana göre türev alınarak bloğun hız bileşenleri bulunur:'
            },
            {
              kind: 'equation',
              latex: '\\dot{x}_m = \\dot{x} + \\dot{s}\\cos\\alpha, \\quad \\dot{y}_m = -\\dot{s}\\sin\\alpha',
              explanation: 'Bloğun Hız Bileşenleri'
            },
            {
              kind: 'prose',
              text: 'Bloğun hızının karesi $v_m^2 = \\dot{x}_m^2 + \\dot{y}_m^2$ hesaplandığında:'
            },
            {
              kind: 'equation',
              latex: 'v_m^2 = (\\dot{x} + \\dot{s}\\cos\\alpha)^2 + (-\\dot{s}\\sin\\alpha)^2 = \\dot{x}^2 + \\dot{s}^2 + 2\\dot{x}\\dot{s}\\cos\\alpha',
              explanation: 'Hızın Karesi ve Kuplaj Terimi'
            },
            {
              kind: 'prose',
              text: 'Buradan sistemin toplam kinetik enerjisi elde edilir:'
            },
            {
              kind: 'equation',
              latex: 'T = T_M + T_m = \\frac{1}{2}(M + m)\\dot{x}^2 + \\frac{1}{2}m\\dot{s}^2 + m\\dot{x}\\dot{s}\\cos\\alpha',
              explanation: 'Toplam Kinetik Enerji'
            },
            {
              kind: 'prose',
              text: 'Sistemin potansiyel enerjisi, yayın elastik enerjisi ile bloğun yerçekimi potansiyelinin toplamıdır ($y = 0$ zemin seviyesi referans):'
            },
            {
              kind: 'equation',
              latex: 'V(s) = \\frac{1}{2}k(s - l)^2 - mgs\\sin\\alpha',
              explanation: 'Sistemin Toplam Potansiyel Enerjisi'
            },
            {
              kind: 'prose',
              text: 'Böylece (a) şıkkında istenen Lagrangian fonksiyonu $L = T - V$ olarak kurulur:'
            },
            {
              kind: 'equation',
              latex: 'L = \\frac{1}{2}(M + m)\\dot{x}^2 + \\frac{1}{2}m\\dot{s}^2 + m\\dot{x}\\dot{s}\\cos\\alpha - \\frac{1}{2}k(s - l)^2 + mgs\\sin\\alpha',
              explanation: 'Sistemin Tam Lagrangian Fonksiyonu'
            }
          ]
        },
        {
          title: 'Lagrange Hareket Denklemlerinin Elde Edilmesi',
          blocks: [
            {
              kind: 'prose',
              text: 'İlk olarak kamanın yatay koordinatı $x$ için Euler-Lagrange denklemini yazalım. $L$ ifadesinde $x$ açıkça yer almadığı için ($\\frac{\\partial L}{\\partial x} = 0$), $x$ döngüsel (cyclic / ignorable) bir koordinattır:'
            },
            {
              kind: 'equation',
              latex: '\\frac{d}{dt}\\left(\\frac{\\partial L}{\\partial \\dot{x}}\\right) - \\frac{\\partial L}{\\partial x} = 0 \\implies \\frac{d}{dt} p_x = 0',
              explanation: 'x Koordinatına İlişkin Euler-Lagrange Bağıntısı'
            },
            {
              kind: 'prose',
              text: 'Genelleştirilmiş momentum $p_x = \\frac{\\partial L}{\\partial \\dot{x}}$ türetilip zamana göre türevi alındığında sistemin 1. hareket denklemi elde edilir:'
            },
            {
              kind: 'equation',
              latex: '(M + m)\\ddot{x} + m\\ddot{s}\\cos\\alpha = 0',
              explanation: 'Kamanın Yatay Hareket Denklemi (Yatay Momentum Korunumu)'
            },
            {
              kind: 'prose',
              text: 'Şimdi bloğun eğik düzlem boyunca konumu $s$ için Euler-Lagrange denklemini uygulayalım:'
            },
            {
              kind: 'equation',
              latex: '\\frac{\\partial L}{\\partial \\dot{s}} = m\\dot{s} + m\\dot{x}\\cos\\alpha, \\quad \\frac{\\partial L}{\\partial s} = -k(s - l) + mg\\sin\\alpha',
              explanation: 's Koordinatının Kısmi Türevleri'
            },
            {
              kind: 'prose',
              text: 'Euler-Lagrange bağıntısı $\\frac{d}{dt}\\left(\\frac{\\partial L}{\\partial \\dot{s}}\\right) - \\frac{\\partial L}{\\partial s} = 0$ yerine koyulduğunda 2. hareket denklemi bulunur:'
            },
            {
              kind: 'equation',
              latex: 'm\\ddot{s} + m\\ddot{x}\\cos\\alpha + k(s - l) - mg\\sin\\alpha = 0',
              explanation: 'Bloğun Eğik Düzlem Boyunca Hareket Denklemi'
            }
          ]
        },
        {
          title: 'Denge Konumu ve Küçük Salınımların Frekansı',
          blocks: [
            {
              kind: 'prose',
              text: 'Denge durumunda sistem ivmesizdir ($\\ddot{x} = 0, \\ddot{s} = 0$). Bloğun eğik düzlem üzerindeki denge konumu $s_0$ şu eşitliği sağlar:'
            },
            {
              kind: 'equation',
              latex: 'k(s_0 - l) = mg\\sin\\alpha \\implies s_0 = l + \\frac{mg\\sin\\alpha}{k}',
              explanation: 'Bloğun Statik Denge Konumu'
            },
            {
              kind: 'prose',
              text: 'Denge konumu etrafındaki küçük yerdeğiştirmeyi $\\eta(t) = s(t) - s_0$ olarak tanımlayalım. Buradan $\\ddot{\\eta} = \\ddot{s}$ ve $k(s - l) - mg\\sin\\alpha = k\\eta$ olur. Birinci hareket denkleminden $\\ddot{x}$ çekilirse:'
            },
            {
              kind: 'equation',
              latex: '\\ddot{x} = -\\frac{m\\cos\\alpha}{M + m}\\ddot{\\eta}',
              explanation: 'Kamanın İvmesinin Bloğun İvmesi Cinsinden İfadesi'
            },
            {
              kind: 'prose',
              text: 'Bu bağıntı ikinci hareket denkleminde yerine yazıldığında:'
            },
            {
              kind: 'equation',
              latex: 'm\\ddot{\\eta} + m\\left(-\\frac{m\\cos\\alpha}{M + m}\\ddot{\\eta}\\right)\\cos\\alpha + k\\eta = 0',
              explanation: 'Kuplajın Yok Edilmesi'
            },
            {
              kind: 'prose',
              text: 'İvme parantezine alınıp cebirsel sadeleştirme yapıldığında:'
            },
            {
              kind: 'equation',
              latex: 'm\\left(1 - \\frac{m\\cos^2\\alpha}{M + m}\\right)\\ddot{\\eta} + k\\eta = 0 \\implies m\\left(\\frac{M + m\\sin^2\\alpha}{M + m}\\right)\\ddot{\\eta} + k\\eta = 0',
              explanation: 'Etkin Salınım Diferansiyel Denklemi'
            },
            {
              kind: 'prose',
              text: 'Sistemin etkin kütlesi $m_{\\text{eff}} = m\\frac{M + m\\sin^2\\alpha}{M + m}$ olup, denklem $\\ddot{\\eta} + \\omega^2 \\eta = 0$ standart basit harmonik osilatör formundadır. Buradan küçük genlikli salınımların açısal frekansı (c şıkkı) elde edilir:'
            },
            {
              kind: 'equation',
              latex: '\\omega = \\sqrt{\\frac{k}{m_{\\text{eff}}}} = \\sqrt{\\frac{k(M + m)}{m(M + m\\sin^2\\alpha)}}',
              explanation: 'Küçük Salınımların Açısal Frekansı'
            }
          ]
        },
        {
          title: 'Çözümün Sağlaması ve Doğruluk Kontrolleri (Boyut Analizi & Limit Durumlar)',
          blocks: [
            {
              kind: 'prose',
              text: '**1. Boyut Analizi (Dimensional Analysis):**\n\nFrekans ifadesi $\\omega = \\sqrt{\\frac{k(M+m)}{m(M+m\\sin^2\\alpha)}}$ incelendiğinde:\n- Yay sabiti: $[k] = \\text{N/m} = [M T^{-2}]$\n- Kütle terimleri: $[M+m] / [m(M+m\\sin^2\\alpha)] = [M]/[M^2] = [M^{-1}]$\n- Trigonometrik terim $\\sin^2\\alpha$ boyutsuzdur $[1]$.\nDolayısıyla:\n$$[\\omega] = \\sqrt{[M T^{-2}] \\cdot [M^{-1}]} = \\sqrt{[T^{-2}]} = [T^{-1}] = \\text{s}^{-1}$$\nElde edilen boyut $\\text{rad/s}$ olup açısal frekans boyutuyla kusursuz uyumludur.'
            },
            {
              kind: 'prose',
              text: '**2.1 Limit Durumu: Kamanın Kütlesinin Sonsuza Gitmesi ($M \\to \\infty$):**\n- **Beklenen Davranış:** Kama zemine sabitlenmiş olacağından sistem standart sabit eğik düzlem yay-kütle osilatörüne indirgenmeli ve $\\omega = \\sqrt{k/m}$ çıkmalıdır.\n- **Matematiksel Kanıt:**\n$$\\lim_{M \\to \\infty} \\omega = \\lim_{M \\to \\infty} \\sqrt{\\frac{k(1 + m/M)}{m(1 + \\frac{m}{M}\\sin^2\\alpha)}} = \\sqrt{\\frac{k}{m}}$$\nSonuç bilinen standart fizik yasasıyla tam olarak örtüşmektedir.'
            },
            {
              kind: 'prose',
              text: '**2.2 Limit Durumu: Eğim Açısının Sıfıra Gitmesi ($\\alpha \\to 0$):**\n- **Beklenen Davranış:** Eğik düzlem yataylaşır, sistem sürtünmesiz yatay zeminde bir yayla birbirine bağlı iki serbest kütleye dönüşür. Frekans iki cisim indirgenmiş kütlesi $\\mu = \\frac{mM}{M+m}$ ile $\\omega = \\sqrt{k/\\mu}$ olmalıdır.\n- **Matematiksel Kanıt:**\n$$\\lim_{\\alpha \\to 0} \\sin\\alpha = 0 \\implies \\omega = \\sqrt{\\frac{k(M+m)}{m M}} = \\sqrt{\\frac{k}{\\mu}}$$\nİki cisim indirgenmiş kütle harmonik salınımı analitik olarak kanıtlanmıştır.'
            },
            {
              kind: 'prose',
              text: '**2.3 Limit Durumu: Eğim Açısının $90^\\circ$ Olması ($\\alpha \\to 90^\\circ$):**\n- **Beklenen Davranış:** Hareket tamamen düşey doğrultuda olur. Kamanın yatay itilmesi için hiçbir yatay kuvvet bileşeni oluşmaz ($A_x = 0$), kama hareket etmez ve blok düşey yayda serbest salınım yapar ($\\omega = \\sqrt{k/m}$).\n- **Matematiksel Kanıt:** $\\sin 90^\\circ = 1$ konulduğunda:\n$$\\omega = \\sqrt{\\frac{k(M+m)}{m(M+m)}} = \\sqrt{\\frac{k}{m}}$$'
            }
          ]
        }
      ],
      verification: {
        dimensionalAnalysis:
          'Frekans boyutu $[\\omega] = \\sqrt{[k]/[m]} = \\sqrt{[M T^{-2}]/[M]} = [T^{-1}]$ (rad/s) olup boyut analiziyle tam olarak doğrulanmıştır.',
        limitingCases: [
          {
            condition: 'M \\to \\infty',
            expected: '\\omega = \\sqrt{\\frac{k}{m}}',
            analysis:
              'Kama sabitlendiğinde sistem sabit eğik düzlemdeki tek serbestlik dereceli kütle-yay osilatörüne indirgenir.'
          },
          {
            condition: '\\alpha \\to 0',
            expected: '\\omega = \\sqrt{\\frac{k(M+m)}{m M}} = \\sqrt{\\frac{k}{\\mu}}',
            analysis:
              'Yatay düzlemde yayla bağlı iki serbest kütle sisteminde iki cisim indirgenmiş kütlesi mu = (mM)/(M+m) frekansı tam olarak elde edilir.'
          },
          {
            condition: '\\alpha \\to 90^\\circ',
            expected: '\\omega = \\sqrt{\\frac{k}{m}}',
            analysis:
              'Düşey harekette kamaya yatay kuvvet aktarılmaz, kama durur ve blok serbest düşey kütle-yay salınımı yapar.'
          }
        ],
        advancedChecks: [
          {
            id: 'adv_check_conservation',
            title: 'Yatay Momentum Korunumu & Noether Teoremi',
            type: 'conservation',
            badge: '⚖️ Korunum Yasası',
            description:
              'Sistemde x koordinatının döngüsel (cyclic) olmasından ve öteleme simetrisinden doğan yatay momentum korunumu (Px = sabit).',
            query:
              'Bu yaylı hareketli kama sisteminde x koordinatının döngüsel (cyclic) olmasından doğan yatay momentum korunumunu (P_x = sabit) analitik olarak ispatlayınız ve hareket denklemiyle ilişkisini gösteriniz.'
          },
          {
            id: 'adv_check_alternative',
            title: 'Newton & d\'Alembert Eylemsizlik Kuvveti Yöntemi',
            type: 'alternative_method',
            badge: '🔄 Alternatif Çözüm',
            description:
              'Kamanın ivmeli referans sisteminde d\'Alembert hayali eylemsizlik kuvveti (-m*x_ddot) kullanılarak bloğun hareket denkleminin bağımsız türetimi.',
            query:
              'Kamanın ivmeli referans sisteminde d\'Alembert eylemsizlik kuvveti (-m*x_ddot) kullanarak bloğun hareket denklemini Lagrange formalisminden bağımsız olarak türetiniz.'
          },
          {
            id: 'adv_check_stability',
            title: 'Potansiyel Eğriliği ve Kararlılık Analizi',
            type: 'stability',
            badge: '📉 Denge & Kararlılık',
            description:
              'Sistemin etkin potansiyeli V(s) için dV/ds = 0 denge konumu, d²V/ds² > 0 kararlılık kanıtı ve küçük salınım frekansı türetimi.',
            query:
              'Sistemin potansiyel enerjisi ve etkin potansiyel fonksiyonunu inceleyerek kararlı denge konumunu (s_0), potansiyel kuyusunun eğriliğini (V\'\' > 0) ve küçük genlikli salınım frekansını türetiniz.'
          }
        ]
      }
    };
  }

  /**
   * İleri Düzey Sağlama 1: Yatay Momentum Korunumu ve Noether Teoremi Genişletmesi
   */
  public static getConservationExpansionFixture(): RawExpansionResponse {
    return {
      title: 'Yatay Momentum Korunumu ve Noether Teoremi İspatı',
      explanation:
        'Sistemde x koordinatının döngüsel (cyclic / ignorable) olmasından ve uzamsal öteleme simetrisinden doğan yatay momentum korunumu analitik ispatı.',
      diagram: {
        width: 360,
        height: 200,
        caption: 'Şekil: Yatay doğrultuda etki eden dış kuvvet sıfırdır; iç normal kuvvetler yatayda birbirini dengeler.',
        elements: [
          { type: 'surface', from: [30, 160], to: [330, 160], side: 'bottom' },
          {
            type: 'polygon',
            points: [
              [60, 160],
              [260, 160],
              [260, 60]
            ],
            fill: 'rgba(217, 119, 6, 0.08)',
            stroke: '#d97706',
            strokeWidth: 2
          },
          { type: 'point', x: 170, y: 130, label: 'M' },
          {
            type: 'polygon',
            points: [
              [140, 120],
              [170, 105],
              [185, 135],
              [155, 150]
            ],
            fill: 'rgba(37, 99, 235, 0.15)',
            stroke: '#2563eb',
            strokeWidth: 2
          },
          { type: 'point', x: 162, y: 127, label: 'm' },
          { type: 'vector', from: [162, 127], to: [120, 105], label: 'N_x', color: '#dc2626' },
          { type: 'vector', from: [200, 110], to: [242, 132], label: '-N_x', color: '#dc2626' },
          { type: 'vector', from: [60, 180], to: [140, 180], label: 'P_x = sabit', color: '#16a34a' }
        ]
      },
      blocks: [
        {
          kind: 'prose',
          text: '### 1. Döngüsel Koordinat ve Kanonik Momentum\n\nSistemin Lagrangian fonksiyonunda kamanın yatay konumu olan $x$ koordinatı açıkça yer almamaktadır ($\\frac{\\partial L}{\\partial x} = 0$). Bu durum, $x$ koordinatının **döngüsel (cyclic / ignorable)** bir koordinat olduğunu gösterir.\n\nEuler-Lagrange denklemine göre:'
        },
        {
          kind: 'equation',
          latex: '\\frac{d}{dt}\\left(\\frac{\\partial L}{\\partial \\dot{x}}\\right) - \\frac{\\partial L}{\\partial x} = 0 \\implies \\frac{d}{dt}\\left(\\frac{\\partial L}{\\partial \\dot{x}}\\right) = 0',
          explanation: 'Döngüsel Koordinat Teoremi'
        },
        {
          kind: 'prose',
          text: 'Böylece $x$ koordinatına eşlenik genelleştirilmiş momentum $p_x$ zamanla kesinlikle sabittir:'
        },
        {
          kind: 'equation',
          latex: 'p_x = \\frac{\\partial L}{\\partial \\dot{x}} = (M + m)\\dot{x} + m\\dot{s}\\cos\\alpha = \\text{sabit}',
          explanation: 'Toplam Yatay Momentumun Korunumu'
        },
        {
          kind: 'prose',
          text: 'Bu ifadenin zamana göre türevi alındığında sistemin birinci Lagrange hareket denklemi doğrudan yeniden elde edilir:'
        },
        {
          kind: 'equation',
          latex: '\\frac{d p_x}{dt} = (M + m)\\ddot{x} + m\\ddot{s}\\cos\\alpha = 0',
          explanation: 'Birinci Hareket Denklemi ile Özdeşlik'
        },
        {
          kind: 'prose',
          text: '### 2. Noether Teoremi ve Uzamsal Öteleme Simetrisi\n\n**Noether Teoremi** uyarınca, bir sistemin eyleminin sürekli bir uzamsal dönüşüm altındaki simetrisi, korunan bir fiziksel akıya (büyüklüğe) karşılık gelir.\n\nSistem bütünüyle yatay eksen boyunca sonsuz küçük bir $\\delta x = \\epsilon$ kadar ötelendiğinde:\n$$\\delta L = \\frac{\\partial L}{\\partial x} \\delta x + \\frac{\\partial L}{\\partial \\dot{x}} \\delta \\dot{x} = 0 + 0 = 0$$\nLagrangian öteleme altında değişmez (invariant) kaldığı için, sistemin toplam yatay momentumu $P_x$ evrensel bir doğa yasası olarak korunur.'
        }
      ],
      isAxiomatic: true,
      axiomType: 'physics',
      isTerminal: false
    };
  }

  /**
   * İleri Düzey Sağlama 2: d'Alembert Eylemsizlik Kuvveti ile Bağımsız Newtoncu Türetim
   */
  public static getAlternativeNewtonExpansionFixture(): RawExpansionResponse {
    return {
      title: 'd\'Alembert Eylemsizlik Kuvveti ile Newtoncu Bağımsız Türetim',
      explanation:
        'Kamanın ivmeli (eylemsiz olmayan) referans çerçevesinde d\'Alembert hayali eylemsizlik kuvveti yöntemiyle bloğun hareket denkleminin Lagrange formalisminden bağımsız olarak türetilmesi.',
      diagram: {
        width: 360,
        height: 220,
        caption: 'Şekil: Kamanın ivmeli referans sisteminde bloğa etki eden gerçek kuvvetler ve hayali eylemsizlik kuvveti.',
        elements: [
          { type: 'surface', from: [30, 180], to: [330, 180], side: 'bottom' },
          {
            type: 'polygon',
            points: [
              [60, 180],
              [280, 180],
              [280, 70]
            ],
            fill: 'rgba(217, 119, 6, 0.08)',
            stroke: '#d97706',
            strokeWidth: 2
          },
          {
            type: 'polygon',
            points: [
              [140, 140],
              [170, 125],
              [185, 155],
              [155, 170]
            ],
            fill: 'rgba(37, 99, 235, 0.15)',
            stroke: '#2563eb',
            strokeWidth: 2
          },
          { type: 'point', x: 162, y: 147, label: 'm' },
          // Kuvvet vektörleri
          { type: 'vector', from: [162, 147], to: [162, 205], label: 'm\\vec{g}', color: '#dc2626' },
          { type: 'vector', from: [162, 147], to: [125, 120], label: '\\vec{N}', color: '#2563eb' },
          { type: 'vector', from: [162, 147], to: [200, 128], label: '\\vec{F}_{\\text{yay}}', color: '#16a34a' },
          { type: 'vector', from: [162, 147], to: [110, 147], label: '-m\\ddot{x}\\hat{i}', color: '#b45309' }
        ]
      },
      blocks: [
        {
          kind: 'prose',
          text: '### 1. Eylemsiz Olmayan Referans Çerçevesi ve d\'Alembert Prensibi\n\nKama yatay doğrultuda $\\vec{A} = \\ddot{x}\\hat{i}$ ivmesiyle hızlanmaktadır. Kamaya bağlı eylemsiz olmayan bir gözlemciye göre, $m$ kütleli bloğa etki eden gerçek kuvvetlerin yanı sıra kamanın ivmesine zıt yönde bir **hayali eylemsizlik (fictitious) kuvveti** etkir:'
        },
        {
          kind: 'equation',
          latex: '\\vec{F}_{\\text{eylemsizlik}} = -m\\vec{A} = -m\\ddot{x}\\,\\hat{i}',
          explanation: 'd\'Alembert Eylemsizlik Kuvveti'
        },
        {
          kind: 'prose',
          text: '### 2. Eğik Düzlem Boyunca Kuvvetler Dengesi\n\nBloğa etki eden kuvvetlerin eğik düzleme paralel (aşağı yönlü pozitif) bileşenleri toplanır:\n- Yerçekimi bileşeni: $+mg\\sin\\alpha$\n- Yayın geri çağırıcı kuvveti (uzamaya zıt): $-k(s - l)$\n- Eylemsizlik kuvvetinin eğik düzlem boyunca izdüşümü (yatay kuvvetin $\\alpha$ açısıyla izdüşümü yukarı doğrudur): $-m\\ddot{x}\\cos\\alpha$'
        },
        {
          kind: 'equation',
          latex: '\\sum F_{\\parallel} = mg\\sin\\alpha - k(s - l) - m\\ddot{x}\\cos\\alpha = m\\ddot{s}',
          explanation: 'Kamaya Göre Newton 2. Yasası'
        },
        {
          kind: 'prose',
          text: 'Tüm terimler sol tarafta toplandığında:'
        },
        {
          kind: 'equation',
          latex: 'm\\ddot{s} + m\\ddot{x}\\cos\\alpha + k(s - l) - mg\\sin\\alpha = 0',
          explanation: 'Lagrange 2. Hareket Denklemi ile Kusursuz Özdeşlik'
        },
        {
          kind: 'prose',
          text: 'Bu sonuç, analitik Euler-Lagrange formalizmiyle türettiğimiz ikinci hareket denklemiyle harfi harfine aynıdır. Böylece çözüm iki bütünüyle bağımsız dinamik paradigmayla doğrulanmıştır.'
        }
      ],
      isAxiomatic: true,
      axiomType: 'physics',
      isTerminal: false
    };
  }

  /**
   * İleri Düzey Sağlama 3: Potansiyel Eğriliği ve Kararlılık Analizi Genişletmesi
   */
  public static getStabilityExpansionFixture(): RawExpansionResponse {
    return {
      title: 'Potansiyel Enerji Eğriliği ve Kararlılık Analizi',
      explanation:
        'Sistemin etkin potansiyel enerjisi V(s) fonksiyonunun birinci ve ikinci türevlerinin analizi, yerel minimum kararlılık ispatı (V\'\' > 0) ve küçük pertürbasyon salınım frekansı türetimi.',
      diagram: {
        width: 360,
        height: 200,
        caption: 'Şekil: Potansiyel enerji kuyusu V(s) ve kararlı denge noktası s_0 (V\'\'(s_0) = k > 0).',
        elements: [
          { type: 'axis', origin: [60, 160], xLength: 260, yLength: 120, xLabel: 's', yLabel: 'V(s)' },
          {
            type: 'line',
            from: [90, 60],
            to: [170, 140],
            style: 'solid',
            label: 'V(s)',
            color: '#2563eb'
          },
          {
            type: 'line',
            from: [170, 140],
            to: [270, 50],
            style: 'solid',
            label: '',
            color: '#2563eb'
          },
          { type: 'point', x: 170, y: 140, label: 's_0 (Min)' },
          { type: 'line', from: [170, 140], to: [170, 160], style: 'dashed', label: 's_0', color: '#78716c' }
        ]
      },
      blocks: [
        {
          kind: 'prose',
          text: '### 1. Etkin Potansiyel Fonksiyonu\n\nSistemin potansiyel enerjisi yalnızca bloğun eğik düzlem boyunca konumu $s$ değişkenine bağlıdır:'
        },
        {
          kind: 'equation',
          latex: 'V(s) = \\frac{1}{2}k(s - l)^2 - mgs\\sin\\alpha',
          explanation: 'Sistemin Potansiyel Enerjisi'
        },
        {
          kind: 'prose',
          text: 'Denge konumu potansiyelin birinci türevinin sıfır olduğu kritik noktadır ($\\frac{dV}{ds} = 0$):'
        },
        {
          kind: 'equation',
          latex: '\\frac{dV}{ds} = k(s - l) - mg\\sin\\alpha = 0 \\implies s_0 = l + \\frac{mg\\sin\\alpha}{k}',
          explanation: 'Statik Denge Konumu'
        },
        {
          kind: 'prose',
          text: '### 2. İkinci Türev Testi ve Kararlılık (Lyapunov Kararlılığı)\n\nBu denge noktasının kararlı (stable), kararsız (unstable) veya nötr olduğunu belirlemek için ikinci türev alınır:'
        },
        {
          kind: 'equation',
          latex: '\\left.\\frac{d^2 V}{ds^2}\\right|_{s = s_0} = k > 0',
          explanation: 'Potansiyel Kuyusu Eğriliği (Kesinlikle Kararlı Denge)'
        },
        {
          kind: 'prose',
          text: '$k > 0$ olduğu için potansiyel eğrisi yukarı doğru konkavdır (yerel minimum). Bu durum sistemin bir **potansiyel kuyusunda** bulunduğunu ve her küçük sapmada geri çağırıcı bir kuvvet oluşacağını garanti eder.'
        },
        {
          kind: 'prose',
          text: '### 3. Taylor Açılımı ve Etkin Kütle ile Salınım Frekansı\n\n$s_0$ etrafında Taylor serisi açılımı yapılırsa:'
        },
        {
          kind: 'equation',
          latex: 'V(s) \\approx V(s_0) + \\frac{1}{2}k(s - s_0)^2 = V(s_0) + \\frac{1}{2}k\\eta^2',
          explanation: 'Denge Civarındaki Harmonik Potansiyel Yaklaşımı'
        },
        {
          kind: 'prose',
          text: 'Kamanın yatay serbestliği nedeniyle sistemin etkin kütlesi $m_{\\text{eff}} = m\\frac{M + m\\sin^2\\alpha}{M + m}$ olarak türetilmişti. Buradan küçük salınımların frekansı:'
        },
        {
          kind: 'equation',
          latex: '\\omega = \\sqrt{\\frac{V\'\'(s_0)}{m_{\\text{eff}}}} = \\sqrt{\\frac{k(M + m)}{m(M + m\\sin^2\\alpha)}}',
          explanation: 'Analitik Açısal Frekans'
        },
        {
          kind: 'prose',
          text: 'Görüldüğü üzere $k > 0$ ve $m_{\\text{eff}} > 0$ olduğundan frekans gerçeldir ($\\omega \\in \\mathbb{R}$). Sistem üstel ayrışma göstermez, periyodik kararlı titreşim icra eder.'
        }
      ],
      isAxiomatic: true,
      axiomType: 'physics',
      isTerminal: false
    };
  }

  /**
   * Bağımsız 2. Yol Çözümü: Newton / d'Alembert Dinamiği & Serbest Cisim Diyagramı (FBD)
   */
  public static getNewtonDynamicsSolutionFixture(): RawSolutionResponse {
    return {
      problemTitle: "Newton / d'Alembert Dinamiği ve Serbest Cisim Diyagramı ile Bağımsız Türetim (2. Yol)",
      problemText:
        "Yaylı hareketli kama ve blok sisteminin hareket denklemlerini Lagrange mekaniğinden bütünüyle bağımsız olarak, serbest cisim diyagramları, eylemsizlik kuvvetleri ve Newton 2. Yasası ile türetiniz.",
      strategy:
        "Kamanın ivmeli referans sisteminde d'Alembert hayali eylemsizlik kuvveti yöntemiyle bloğa etki eden kuvvetler dengelenir; kama için laboratuvar sisteminde yatay kuvvet dengesi yazılarak hareket denklemleri ve açısal frekans elde edilir.",
      assumptions: [
        'Zemin ve kama yüzeyi sürtünmesizdir.',
        'Kama yatay x ekseninde A = x_ddot ivmesiyle hızlanır.',
        'Blok kamaya göre eğik düzlem boyunca s yer değiştirmesi yapar.'
      ],
      sections: [
        {
          title: "Serbest Cisim Diyagramları ve d'Alembert İlkesi",
          blocks: [
            {
              kind: 'prose',
              text: 'Kamanın ivmeli referans sisteminde $m$ kütleli bloğa etki eden kuvvetler analiz edildiğinde; gerçek kuvvetlerin (ağırlık $m\\vec{g}$, normal kuvvet $\\vec{N}$, yay kuvveti $\\vec{F}_{\\text{yay}}$) yanı sıra kamanın ivmesine zıt yönde hayali bir eylemsizlik kuvveti $\\vec{F}_{\\text{eyl}} = -m\\ddot{x}\\hat{i}$ etkir.'
            },
            {
              kind: 'diagram',
              spec: {
                caption: 'Şekil: 2. Yol - Kamanın ivmeli referans sisteminde serbest cisim diyagramı ve eylemsizlik kuvveti.',
                width: 360,
                height: 200,
                elements: [
                  { type: 'surface', from: [30, 180], to: [330, 180], side: 'bottom' },
                  {
                    type: 'polygon',
                    points: [
                      [60, 180],
                      [280, 180],
                      [280, 70]
                    ],
                    fill: 'rgba(99, 102, 241, 0.08)',
                    stroke: '#4f46e5',
                    strokeWidth: 2
                  },
                  {
                    type: 'polygon',
                    points: [
                      [140, 140],
                      [170, 125],
                      [185, 155],
                      [155, 170]
                    ],
                    fill: 'rgba(37, 99, 235, 0.15)',
                    stroke: '#2563eb',
                    strokeWidth: 2
                  },
                  { type: 'point', x: 162, y: 147, label: 'm' },
                  { type: 'vector', from: [162, 147], to: [162, 205], label: 'm\\vec{g}', color: '#dc2626' },
                  { type: 'vector', from: [162, 147], to: [125, 120], label: '\\vec{N}', color: '#2563eb' },
                  { type: 'vector', from: [162, 147], to: [200, 128], label: '\\vec{F}_{\\text{yay}}', color: '#16a34a' },
                  { type: 'vector', from: [162, 147], to: [110, 147], label: '-m\\ddot{x}\\hat{i}', color: '#4f46e5' }
                ]
              }
            },
            {
              kind: 'prose',
              text: 'Eğik düzlem boyunca kuvvetlerin bileşeni Newton 2. Yasası gereği kütle ile bağıl ivmenin çarpımına eşittir:'
            },
            {
              kind: 'equation',
              latex: 'mg\\sin\\alpha - k(s - l) - m\\ddot{x}\\cos\\alpha = m\\ddot{s}',
              explanation: "Kamaya Göre Newton 2. Yasası (d'Alembert)"
            },
            {
              kind: 'prose',
              text: 'Terimler düzenlendiğinde birinci çözümde Euler-Lagrange denklemiyle elde edilen diferansiyel denklemle birebir örtüşen ifadeye ulaşılır:'
            },
            {
              kind: 'equation',
              latex: 'm\\ddot{s} + m\\ddot{x}\\cos\\alpha + k(s - l) - mg\\sin\\alpha = 0',
              explanation: 'Newton Yaklaşımı ile Hareket Denklemi'
            }
          ]
        },
        {
          title: 'Kama İçin Yatay Dinamik ve Frekansın Belirlenmesi',
          blocks: [
            {
              kind: 'prose',
              text: 'Zeminde sürtünme olmadığından, kama üzerine etki eden tek yatay kuvvet yüzey tepkisinin yatay bileşeni ile yayın kama üzerindeki yatay tepkisidir. Yatay momentum korunumundan elde edilen bağıntı yerine konulduğunda kamanın ivmesi:'
            },
            {
              kind: 'equation',
              latex: '\\ddot{x} = -\\frac{m\\cos\\alpha}{M + m}\\ddot{s}',
              explanation: 'İvmeler Arası Kinematik Bağıntı'
            },
            {
              kind: 'prose',
              text: 'Bu ivme bloğun hareket denkleminde yerine yazıldığında, sistemin etkin kütlesi ve salınım açısal frekansı Lagrange çözümü ile tam olarak aynı çıkar:'
            },
            {
              kind: 'equation',
              latex: '\\omega = \\sqrt{\\frac{k(M + m)}{m(M + m\\sin^2\\alpha)}}',
              explanation: '2. Yol ile Doğrulanan Açısal Frekans'
            }
          ]
        }
      ]
    };
  }

  /**
   * Kanonik Teorik Konu ve Kavram Atlası:
   * Genelleştirilmiş Koordinatlar Teorisi ve Eğrisel Koordinat Sistemleri (Polar, Silindirik, Küresel)
   */
  public static getGeneralizedCoordinatesTheoryFixture(): RawSolutionResponse {
    return {
      problemTitle: 'Genelleştirilmiş Koordinatlar ve Eğrisel Koordinat Sistemleri Atlası',
      problemText:
        'Klasik ve analitik mekanikte serbestlik derecesi $s$ olan bir sistemin konfigürasyon uzayını betimleyen genelleştirilmiş koordinatlar $q_j$ ($j=1, \\dots, s$) teorisinin temelleri; Kartezyen koordinatlardan eğrisel koordinatlara ($r, \\theta$ düzlem polar, $\\rho, \\phi, z$ dairesel silindirik, $r, \\theta, \\phi$ küresel koordinatlar) geçiş bağıntıları, birim baz vektörlerinin türevleri, hız (\\vec{v}), ivme (\\vec{a}) vektörleri, diferansiyel yay elemanı ($ds^2$) ve küresel koordinatların sınır durumlarında düzlem polar koordinatlara indirgenmesinin analitik incelemesi.',
      problemDiagram: {
        caption: 'Şekil 1: 3-Boyutlu uzayda Kartezyen eksenler ve Küresel koordinat parametreleri (r, \\theta, \\phi).',
        width: 360,
        height: 220,
        elements: [
          { type: 'axis', origin: [60, 170], xLength: 220, yLength: 130, xLabel: 'x', yLabel: 'z' },
          { type: 'line', from: [60, 170], to: [120, 205], label: 'y', color: '#57534e' },
          { type: 'point', x: 230, y: 70, label: 'P(r, \\theta, \\phi)' },
          { type: 'vector', from: [60, 170], to: [230, 70], label: '\\vec{r}', color: '#2563eb' },
          { type: 'line', from: [230, 70], to: [230, 170], style: 'dashed', color: '#78716c' },
          { type: 'line', from: [60, 170], to: [230, 170], style: 'dashed', label: '\\rho', color: '#78716c' },
          { type: 'angle', center: [60, 170], radius: 45, startAngle: 90, endAngle: 32, label: '\\theta' },
          { type: 'angle', center: [60, 170], radius: 40, startAngle: 0, endAngle: -25, label: '\\phi' }
        ]
      },
      strategy:
        'Genelleştirilmiş koordinatlar kümesi $q_j$ tanımlanarak kısıt denklemleri elimine edilir; ardından düzlem polar, silindirik ve küresel koordinatlarda konum vektörü diferansiyellenerek hız, ivme ve metrik tansör bağıntıları türetilir ve sınır koşulu \\theta \\to \\pi/2 ile polar sisteme indirgeme kontrolü yapılır.',
      assumptions: [
        'Uzay 3-boyutlu Öklidyen düz uzay kabul edilmiştir ($g_{ij} = \\delta_{ij}$ Kartezyen metrik).',
        'Dönüşüm denklemleri holonomik ve zamandan bağımsız (skleronomik) kabul edilmiştir: \\vec{r} = \\vec{r}(q_1, \\dots, q_s).'
      ],
      sections: [
        {
          title: 'Genelleştirilmiş Koordinatlar Teorisi ve Konfigürasyon Uzayı',
          blocks: [
            {
              kind: 'prose',
              text: 'Klasik mekanikte $N$ parçacıktan oluşan ve aralarında $k$ adet holonomik kısıt bağıntısı bulunan bir sistemin serbestlik derecesi $s = 3N - k$ adettir. Sistemin uzaydaki anlık geometrik durumunu tamamen ve bağımsız olarak belirleyen herhangi $s$ adet bağımsız büyüklüğe **genelleştirilmiş koordinatlar** denir ve $q_j$ ($j = 1, 2, \\dots, s$) ile gösterilir.'
            },
            {
              kind: 'prose',
              text: 'Her bir parçacığın Kartezyen konum vektörü genelleştirilmiş koordinatlar cinsinden ifade edilebilir:'
            },
            {
              kind: 'equation',
              latex: '\\vec{r}_i = \\vec{r}_i(q_1, q_2, \\dots, q_s, t)',
              explanation: 'Konfigürasyon dönüşüm fonksiyonu'
            },
            {
              kind: 'prose',
              text: 'Zincir kuralı uygulanarak parçacığın hız vektörü genelleştirilmiş hızlar $\\dot{q}_j$ cinsinden elde edilir:'
            },
            {
              kind: 'equation',
              latex: '\\vec{v}_i = \\frac{d\\vec{r}_i}{dt} = \\sum_{j=1}^s \\frac{\\partial \\vec{r}_i}{\\partial q_j} \\dot{q}_j + \\frac{\\partial \\vec{r}_i}{\\partial t}',
              explanation: 'Genelleştirilmiş hız açılımı'
            }
          ]
        },
        {
          title: 'Düzlem Polar Koordinatlar ($r, \\theta$)',
          blocks: [
            {
              kind: 'prose',
              text: '2-boyutlu düzlemde bir noktanın konumu orijine olan radyal uzaklık $r$ ve polar açı $\\theta$ ile tanımlanır:'
            },
            {
              kind: 'equation',
              latex: 'x = r \\cos\\theta, \\quad y = r \\sin\\theta',
              explanation: 'Kartezyen-Polar dönüşüm denklemleri'
            },
            {
              kind: 'prose',
              text: 'Konum vektörü radyal birim baz vektörü $\\hat{e}_r$ doğrultusundadır:'
            },
            {
              kind: 'equation',
              latex: '\\vec{r} = r \\hat{e}_r',
              explanation: 'Polar konum vektörü'
            },
            {
              kind: 'diagram',
              spec: {
                caption: 'Şekil 2: Düzlem polar koordinatlarda radyal (e_r) ve teğetsel (e_\\theta) baz vektörleri.',
                width: 320,
                height: 200,
                elements: [
                  { type: 'axis', origin: [50, 160], xLength: 220, yLength: 120, xLabel: 'x', yLabel: 'y' },
                  { type: 'point', x: 190, y: 70, label: 'P(r, \\theta)' },
                  { type: 'line', from: [50, 160], to: [190, 70], label: 'r', color: '#2563eb' },
                  { type: 'vector', from: [190, 70], to: [240, 38], label: '\\hat{e}_r', color: '#16a34a' },
                  { type: 'vector', from: [190, 70], to: [158, 20], label: '\\hat{e}_\\theta', color: '#dc2626' },
                  { type: 'angle', center: [50, 160], radius: 45, startAngle: 0, endAngle: 33, label: '\\theta' }
                ]
              }
            },
            {
              kind: 'prose',
              text: 'Polar birim vektörlerin zamana göre türevleri açısal hız $\\dot{\\theta}$ cinsinden hesaplanır:'
            },
            {
              kind: 'equation',
              latex: '\\dot{\\hat{e}}_r = \\dot{\\theta} \\hat{e}_\\theta, \\quad \\dot{\\hat{e}}_\\theta = -\\dot{\\theta} \\hat{e}_r',
              explanation: 'Baz vektör türevleri'
            },
            {
              kind: 'prose',
              text: 'Bu türevler kullanılarak hız ve ivme bağıntıları atomik olarak elde edilir:'
            },
            {
              kind: 'equation',
              latex: '\\vec{v} = \\dot{r} \\hat{e}_r + r \\dot{\\theta} \\hat{e}_\\theta',
              explanation: 'Düzlem polar hız vektörü'
            },
            {
              kind: 'equation',
              latex: '\\vec{a} = (\\ddot{r} - r\\dot{\\theta}^2)\\hat{e}_r + (r\\ddot{\\theta} + 2\\dot{r}\\dot{\\theta})\\hat{e}_\\theta',
              explanation: 'Düzlem polar ivme vektörü (Coriolis ve merkezkaç terimleri)'
            }
          ]
        },
        {
          title: 'Dairesel Silindirik Koordinatlar ($\\rho, \\phi, z$)',
          blocks: [
            {
              kind: 'prose',
              text: 'Dairesel silindirik koordinatlar, düzlem polar koordinatların dik $z$ ekseni boyunca ötelenmesiyle kurulur:'
            },
            {
              kind: 'equation',
              latex: 'x = \\rho \\cos\\phi, \\quad y = \\rho \\sin\\phi, \\quad z = z',
              explanation: 'Silindirik dönüşüm denklemleri'
            },
            {
              kind: 'prose',
              text: 'Silindirik hız ve ivme vektörleri eksenel doğrultudaki bileşen eklenerek tamamlanır:'
            },
            {
              kind: 'equation',
              latex: '\\vec{v} = \\dot{\\rho} \\hat{e}_\\rho + \\rho \\dot{\\phi} \\hat{e}_\\phi + \\dot{z} \\hat{e}_z',
              explanation: 'Silindirik hız vektörü'
            },
            {
              kind: 'equation',
              latex: '\\vec{a} = (\\ddot{\\rho} - \\rho\\dot{\\phi}^2)\\hat{e}_\\rho + (\\rho\\ddot{\\phi} + 2\\dot{\\rho}\\dot{\\phi})\\hat{e}_\\phi + \\ddot{z} \\hat{e}_z',
              explanation: 'Silindirik ivme vektörü'
            },
            {
              kind: 'equation',
              latex: 'ds^2 = d\\rho^2 + \\rho^2 d\\phi^2 + dz^2',
              explanation: 'Silindirik yay ve metrik elemanı'
            }
          ]
        },
        {
          title: 'Küresel Koordinatlar ($r, \\theta, \\phi$)',
          blocks: [
            {
              kind: 'prose',
              text: 'Küresel koordinatlarda $r$ orijine uzaklık, $\\theta$ zenit (kutup) açısı ($0 \\le \\theta \\le \\pi$) ve $\\phi$ azimut açısıdır ($0 \\le \\phi < 2\\pi$):'
            },
            {
              kind: 'equation',
              latex: 'x = r \\sin\\theta \\cos\\phi, \\quad y = r \\sin\\theta \\sin\\phi, \\quad z = r \\cos\\theta',
              explanation: 'Küresel koordinat dönüşüm bağıntıları'
            },
            {
              kind: 'prose',
              text: 'Ortogonal eğrisel baz vektörleri üzerinde konum vektörünün diferansiyeli hız vektörünü verir:'
            },
            {
              kind: 'equation',
              latex: '\\vec{v} = \\dot{r} \\hat{e}_r + r\\dot{\\theta} \\hat{e}_\\theta + r\\sin\\theta\\dot{\\phi} \\hat{e}_\\phi',
              explanation: 'Küresel hız vektörü'
            },
            {
              kind: 'prose',
              text: 'Diferansiyel yay uzunluğu karesi (metrik tensör formülü):'
            },
            {
              kind: 'equation',
              latex: 'ds^2 = dr^2 + r^2 d\\theta^2 + r^2 \\sin^2\\theta \\, d\\phi^2',
              explanation: 'Küresel yay elemanı ve metrik tensör'
            },
            {
              kind: 'prose',
              text: 'Diferansiyel hacim elemanı Jakobiyen determinantı ile belirlenir:'
            },
            {
              kind: 'equation',
              latex: 'dV = r^2 \\sin\\theta \\, dr \\, d\\theta \\, d\\phi',
              explanation: 'Küresel hacim elemanı'
            }
          ]
        },
        {
          title: 'Doğruluk ve Limit Durum İncelemeleri (Boyut Analizi & Koordinat İndirgemeleri)',
          blocks: [
            {
              kind: 'prose',
              text: '**1. Boyut Analizi (Dimensional Analysis):**'
            },
            {
              kind: 'prose',
              text: 'Türetilen tüm hız ve ivme terimlerinin temel SI boyutları kontrol edilir:'
            },
            {
              kind: 'equation',
              latex: '[\\vec{v}] = [L][T]^{-1}, \\quad [\\vec{a}] = [L][T]^{-2}',
              explanation: 'Hız ve ivme boyut eşitliği'
            },
            {
              kind: 'prose',
              text: 'Radyal ivmedeki $r\\dot{\\theta}^2$ terimi $[L]([T]^{-1})^2 = [L][T]^{-2}$ boyutuna sahiptir; Coriolis terimi $2\\dot{r}\\dot{\\theta}$ ise $[L][T]^{-1}[T]^{-1} = [L][T]^{-2}$ boyutunda olup ivme boyutuyla tam uyumludur.'
            },
            {
              kind: 'prose',
              text: '**2. Koordinat İndirgemeleri ve Sınır Durumları:**'
            },
            {
              kind: 'prose',
              text: '**2.1 Küresel Koordinatlardan Düzlem Polar Koordinatlara İndirgeme ($\\theta \\to \\pi/2$):**'
            },
            {
              kind: 'prose',
              text: 'Sistem ekvator düzleminde sınırlandırıldığında $\\theta = \\pi/2$ sabit kalır ($\\dot{\\theta} = 0$, $\\sin(\\pi/2) = 1$):'
            },
            {
              kind: 'equation',
              latex: '\\left. \\vec{v}_{\\text{küresel}} \\right|_{\\theta = \\pi/2, \\dot{\\theta} = 0} = \\dot{r}\\hat{e}_r + r\\dot{\\phi}\\hat{e}_\\phi',
              explanation: 'Ekvator düzleminde polar hıza indirgenme'
            },
            {
              kind: 'prose',
              text: 'Bu bağıntı, $\\phi \\leftrightarrow \\theta$ sembolik eşleşmesi altında Bölüm 2’de türetilen düzlem polar hız ifadesi ile birebir özdeştir.'
            },
            {
              kind: 'prose',
              text: '**2.2 Silindirik Koordinatlardan Düzlem Polar Koordinatlara İndirgeme ($z = \\text{sabit}$):**'
            },
            {
              kind: 'prose',
              text: 'Eksenel hareket durdurulduğunda $\\dot{z} = 0$ ve $\\ddot{z} = 0$ olur; silindirik hız ve ivme doğrudan 2-boyutlu polar biçime döner.'
            }
          ]
        }
      ],
      verification: {
        dimensionalAnalysis: 'Tüm hız bileşenlerinin boyutu [L][T]^{-1} ve ivme bileşenlerinin boyutu [L][T]^{-2} olarak doğrulanmıştır.',
        limitingCases: [
          {
            condition: '\\theta \\to \\frac{\\pi}{2}, \\quad \\dot{\\theta} = 0',
            expected: '\\vec{v} = \\dot{r}\\hat{e}_r + r\\dot{\\phi}\\hat{e}_\\phi \\quad \\text{(Düzlem Polar Hız)}',
            analysis: 'Küresel koordinatlarda ekvator düzlemine geçildiğinde \\sin\\theta = 1 ve kutup hızı sıfırlanarak sistem tam olarak 2-boyutlu polar koordinatlara indirgenir.'
          },
          {
            condition: 'z = c \\implies \\dot{z} = 0',
            expected: '\\vec{v} = \\dot{\\rho}\\hat{e}_\\rho + \\rho\\dot{\\phi}\\hat{e}_\\phi',
            analysis: 'Silindirik koordinatlarda z ekseni boyunca hareket dondurulduğunda radyal ve açısal bileşenler düzlem polar koordinatlarla özdeşleşir.'
          }
        ],
        advancedChecks: [
          {
            id: 'check_metric',
            title: 'Metrik Tensör ve Christoffel Sembolleri',
            type: 'alternative_method',
            badge: '📐 Riemann Geometrisi',
            description: 'Eğrisel koordinatlardaki ivme terimlerinin geodezik denklem ve Christoffel sembolleriyle diferansiyel geometri türetimi.',
            query: 'Küresel koordinatlardaki ivme bileşenlerini Christoffel sembolleri ve geodezik denklem kullanarak diferansiyel geometriyle türetiniz.'
          }
        ]
      }
    };
  }
}
