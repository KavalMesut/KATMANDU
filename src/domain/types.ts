import type { SolutionExecutionReport } from './usageReport';

/**
 * KATMANDU v2 Çekirdek Alan Modeli
 * 
 * İlkeler:
 * - Model içeriği (metin, LaTeX, diyagram isteği) üretir.
 * - Sistem kimlikleri (block ID, denklem numarası, derinlik) üretir.
 * - Çözüm grafiği ve zenginleştirmeler (diagram) fail-soft çalışır.
 * - Her katmanda şekil zorlanır, aksiyomlara kadar inilir ve serbest seçimle soru sorulabilir.
 */

export interface ProblemAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  mimeType: string;
  data: string; // Base64 verisi (saf base64 veya data URL)
  dataUrl?: string; // data:...;base64,... biçiminde tam önizleme URL'i
  size?: number; // Bayt cinsinden boyut
}

export interface ProblemInput {
  id: string;
  text: string;
  title?: string;
  images?: string[];
  attachments?: ProblemAttachment[];
  createdAt: number;
}

export interface DetectedQuestionItem {
  questionNumber: number;
  title: string;
  summary?: string;
  instruction: string;
  rawText?: string;
}

export type BlockKind = 'prose' | 'equation' | 'diagram';

export interface ProseBlock {
  id: string;
  kind: 'prose';
  text: string;
}

export interface EquationBlock {
  id: string;
  kind: 'equation';
  latex: string;
  explanation?: string;
  displayNumber?: number; // Deterministik trusted denklem numarası: (1), (2), (3)...
  expandable?: boolean;   // Kullanıcı tıklayıp derinleşebilir mi (varsayılan: true)
}

// Zenginleştirilmiş, deklaratif fizik diyagramı öğeleri (Fail-soft SVG)
export type DiagramElement =
  | {
      type: 'mass';
      id: string;
      x: number;
      y: number;
      label: string;
      shape?: 'box' | 'circle';
      size?: number;
    }
  | {
      type: 'line';
      from: [number, number];
      to: [number, number];
      style?: 'solid' | 'dashed' | 'rope' | 'spring';
      label?: string;
      color?: string;
    }
  | {
      type: 'surface';
      from: [number, number];
      to: [number, number];
      side?: 'top' | 'bottom' | 'left' | 'right';
    }
  | {
      type: 'vector';
      from: [number, number];
      to: [number, number];
      label: string;
      color?: string;
    }
  | {
      type: 'angle';
      center: [number, number];
      radius: number;
      startAngle: number;
      endAngle: number;
      label: string;
    }
  | {
      type: 'point';
      x: number;
      y: number;
      label?: string;
    }
  | {
      type: 'axis';
      origin: [number, number];
      xLength: number;
      yLength: number;
      xLabel?: string;
      yLabel?: string;
    }
  | {
      type: 'polygon';
      points: Array<[number, number]>;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      label?: string;
    }
  | {
      type: 'resistor';
      from: [number, number];
      to: [number, number];
      label?: string;
      value?: string;
      color?: string;
    }
  | {
      type: 'source';
      center: [number, number];
      label?: string;
      kind?: 'dc' | 'ac';
      polarity?: 'vertical' | 'horizontal';
      color?: string;
    }
  | {
      type: 'ground';
      at: [number, number];
      label?: string;
    }
  | {
      type: 'capacitor';
      from: [number, number];
      to: [number, number];
      label?: string;
      color?: string;
    }
  | {
      type: 'spring';
      from: [number, number];
      to: [number, number];
      label?: string;
      coils?: number;
      color?: string;
    }
  | {
      type: 'pulley';
      center: [number, number];
      radius: number;
      label?: string;
      color?: string;
    }
  | {
      type: 'curve';
      points: Array<[number, number]>;
      label?: string;
      color?: string;
      strokeWidth?: number;
      style?: 'solid' | 'dashed' | 'dotted';
      fillUnder?: boolean | string;
      fillBaselineY?: number;
    };

export interface SimpleDiagramSpec {
  width: number;
  height: number;
  elements: DiagramElement[];
  caption?: string;
}

export interface DiagramBlock {
  id: string;
  kind: 'diagram';
  spec: SimpleDiagramSpec;
  status: 'rendered' | 'degraded' | 'failed';
}

export type SolutionBlock = ProseBlock | EquationBlock | DiagramBlock;

export interface SolutionSection {
  id: string;
  title: string;
  blocks: SolutionBlock[];
}

// İleri Düzey Derinleştirme Sağlama Seçenekleri (Tıklanabilir Başlıklar/Rozetler)
export interface AdvancedVerificationOption {
  id: string;
  title: string;
  type: 'conservation' | 'alternative_method' | 'stability' | 'symmetry' | 'other';
  badge: string; // Örn: "⚖️ Korunum Yasası", "🔄 Alternatif Yol", "📉 Denge & Kararlılık"
  description: string; // Kısa açıklama
  query: string; // Tıklandığında derinleşme motoruna iletilecek bağlamsal sorgu
}

// Fiziksel Çözüm Doğruluk Sağlaması (Boyut Analizi & Limit Durumlar)
export interface LimitingCase {
  condition: string; // Örn: "M \to \infty (Kamanın kütlesi sonsuza giderken)"
  expected: string;  // Örn: "Sabit eğik düzlem ivmesi a = g \sin\alpha elde edilmeli"
  analysis: string;  // Matematiksel ve fiziksel çıkarım
}

export type VerificationSource = 'model_claim' | 'unverified';

export interface SolutionVerification {
  source?: VerificationSource; // Doğrulamanın kaynağı: Model iddiası mı yoksa kontrol edilmemiş mi
  statusMessage?: string; // Kullanıcıya gösterilecek doğruluk/kontrol durumu
  // Set by the application, never trusted from model JSON. Missing on legacy records.
  assessmentSource?: 'model' | 'none' | 'legacy';
  independentCheck?: { status: 'not_checked' };
  dimensionalAnalysis?: string; // Boyut ve SI birim tutarlılığı analizi (fizik problemleri için; saf matematikte tanımsız olabilir)
  limitingCases: LimitingCase[]; // Kritik sınır durumları veya özel değer incelemesi
  advancedChecks?: AdvancedVerificationOption[]; // İsteğe bağlı tıklanabilir ileri düzey derinleştirme sağlamaları
}

export interface SolutionMetadata {
  language?: 'en' | 'tr';
  providerName: string; // Örn: "Google Gemini", "OpenAI", "KATMANDU Deterministik Motor"
  modelName: string; // Örn: "gemini-3.6-flash", "gpt-5.6-terra", "o3-mini"
  reasoningEffort?: string; // Örn: "low", "medium", "high"
  solvedAt: number; // Timestamp ms
}

// İsteğe bağlı bağımsız 2. ve 3. çözüm yolu önerisi
export interface RecommendedPath {
  id: string;
  methodName: string; // Örn: "Newton / d'Alembert Dinamiği" veya "Feynman Parametrik Türevi"
  badge?: string; // Örn: "⚡ 2. Yol", "📐 Geometrik Çözüm"
  description: string; // Metodun kısa özeti
  query: string; // Bu yol istendiğinde modele iletilecek çözüm sorgusu
  solved?: boolean; // Çözüldü ve ana belgeye eklendi mi
}

export interface SolutionDocument {
  id: string;
  problemId: string;
  problemTitle: string;
  problemText: string;
  problemDiagram?: SimpleDiagramSpec;
  attachments?: ProblemAttachment[];
  strategy: string;
  assumptions: string[];
  sections: SolutionSection[];
  totalEquations: number;
  verification?: SolutionVerification;
  recommendedPaths?: RecommendedPath[];
  metadata?: SolutionMetadata;
  executionReport?: SolutionExecutionReport;
}

// LLM'den gelen ham yanıt yapısı (Sistem kimlikleri içermez)
export type RawBlock =
  | {
      kind: 'prose';
      text: string;
    }
  | {
      kind: 'equation';
      latex: string;
      explanation?: string;
    }
  | {
      kind: 'diagram';
      spec: SimpleDiagramSpec;
    };

export interface RawSolutionResponse {
  problemTitle: string;
  problemText?: string; // Görsel veya PDF'ten transkribe edilen tam soru metni
  problemDiagram?: SimpleDiagramSpec; // Sorunun orijinal kurulum/geometri şeması
  strategy: string;
  assumptions?: string[];
  sections: Array<{
    title: string;
    blocks: RawBlock[];
  }>;
  verification?: SolutionVerification;
  recommendedPaths?: RecommendedPath[]; // İsteğe bağlı bağımsız 2. ve 3. yol tavsiyeleri
}

// Serbest metin veya dikdörtgen seçimle bağlamsal soru sorma isteği
export interface ContextualInquiry {
  selectedText: string;
  userQuery?: string;
  surroundingContext?: string;
}

// Expansion (Derinleşme) veri yapıları
export interface ExpansionRequest {
  problemText: string;
  solutionContext?: string; // Mevcut ana çözümün adımları, formülleri, değişkenleri ve bağlamı (farklı model seçildiğinde tam bağlam koruması sağlar)
  parentSectionTitle: string;
  targetBlock?: EquationBlock | ProseBlock;
  contextualInquiry?: ContextualInquiry;
  depth: number;
  ancestorPath: string[]; // ["Ana Çözüm", "Teğetsel Kuvvet", ...]
}

export interface RawExpansionResponse {
  title: string;
  explanation: string;
  blocks: RawBlock[];
  diagram?: SimpleDiagramSpec; // Mümkünse yüksek öncelikli; soyut/anlamsız kaldığı durumlarda opsiyonel diyagram
  isAxiomatic?: boolean;        // Aksiyoma veya ampirik temel yasaya ulaşıldı mı
  isTerminal?: boolean;         // Derinleşmenin sonu mu
  axiomType?: 'physics' | 'mathematics'; // Aksiyom türü: Kurucu doğa yasası (fizik) vs. Formel/Öklid aksiyomu (matematik)
}

export interface ExpansionLayer {
  parentLayerId?: string;
  cacheKey?: string;
  requestContext?: { selectedText: string; userQuery?: string };
  id: string;
  parentId?: string;            // Üst katmanın veya kökün kimliği ('root', 'layer_...')
  depth: number;
  targetBlockId?: string;
  targetDisplayNumber?: number;
  contextualQuery?: string;
  title: string;
  blocks: SolutionBlock[];
  isAxiomatic: boolean;
  isTerminal: boolean;
  axiomType?: 'physics' | 'mathematics';
}

// Gezinme yolu durumu (Sağ panel için)
export interface NavigationPathItem {
  layerId: string;
  depth: number;
  label: string;
  targetBlockId?: string;
  targetDisplayNumber?: number;
  isAxiomatic?: boolean;
  axiomType?: 'physics' | 'mathematics';
}

// Türetim ve Dallanma Ağacı Düğümü (Derivation Tree Node)
export interface DerivationTreeNode {
  id: string;
  parentId: string | null;
  label: string;
  depth: number;
  targetDisplayNumber?: number;
  targetBlockId?: string;
  contextualQuery?: string;
  isAxiomatic?: boolean;
  axiomType?: 'physics' | 'mathematics';
  nodeType?: 'primary_solution' | 'alternative_solution' | 'drilldown';
  pathMethodName?: string;
  layer?: ExpansionLayer;
  children: DerivationTreeNode[];
  parallelPaths?: DerivationTreeNode[];
}

// Çözüm Geçmişi ve Bilimsel Kütüphane Öğesi (Library / History Item)
export interface LibraryItem {
  id: string; // Tekil kimlik
  title: string; // Problem başlığı
  problemText: string; // Problem metni
  discipline: 'fizik' | 'matematik' | string; // Bilim dalı (fizik, matematik vb.)
  category: string; // Alt dal / konu (örn: "Klasik Mekanik / Lagrange")
  tags: string[]; // Konu anahtar kelimeleri
  createdAt: number; // Zaman damgası (Date.now())
  document: SolutionDocument; // Ana çözüm dokümanı
  layers: ExpansionLayer[]; // Türetim ağacındaki tüm katmanlar
  metadata?: SolutionMetadata; // AI model künyesi
  rating?: number; // Kullanıcı puanı (1-10)
  updatedAt?: number;
  schemaVersion?: number;
}

// Çoklu Problem ve Sekme Modeli (Problem Tab)
export interface ProblemTab {
  id: string; // Tekil sekme kimliği
  tabTitle: string; // Sekme başlığı (örn: "Soru 1")
  problem: ProblemInput;
  document: SolutionDocument | null;
  expansionCache: Record<string, ExpansionLayer>;
  tree: DerivationTreeNode;
  openLayerIds: string[];
  focusedNodeId: string;
  selectedEquation: EquationBlock | null;
  isLoading: boolean;
  errorMessage: string | null;
  activeLibraryItemId: string | null;
  expandingBlockId?: string | null;
  solvingPathId?: string | null;
}
