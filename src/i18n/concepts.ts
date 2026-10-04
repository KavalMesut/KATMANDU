/** Match scientific concepts in either supported language without rewriting content. */
const aliases: Record<string, readonly string[]> = {
  "ip": ["string", "rope"],
  "sallan": ["swing"],
  "kol": ["lever arm"],
  "mil": ["shaft"],
  "dairesel": ["circular"],
  "silindir": ["cylinder"],
  "gaz sabiti": ["gas constant"],
  "dalga": ["wave"],
  "optik": ["optic"],
  "foton": ["photon"],
  "holonomik": ["holonomic"],
  "optimizasyon": ["optimization"],
  "uzama": ["extension", "elongation"],
  "radyan/m": ["radian/m"],
  "zaman sabiti": ["time constant"],
  "zemin": ["ground", "floor"],
  "kayma": ["sliding"],
  "iki cisim": ["two bodies", "two-body"],
  "paskal": ["pascal"],
  "kaynak": ["source"],
  "hacim": ["volume"],
  "potansiyel enerji": ["potential energy"],
  "enerji": ["energy"],

  "sağlama": [
    "verification",
    "check"
  ],
  "doğruluk": [
    "correctness",
    "verification"
  ],
  "doğrulama": [
    "verification",
    "validation"
  ],
  "boyut analizi": [
    "dimensional analysis"
  ],
  "limit durum": [
    "limiting case",
    "limit case"
  ],
  "analitik sağlama": [
    "analytical verification"
  ],
  "koordinat indirgeme": [
    "coordinate reduction"
  ],
  "sınır durum": [
    "boundary case",
    "limiting case"
  ],
  "özel değer": [
    "special value"
  ],
  "beklenen": [
    "expected"
  ],
  "birim": [
    "unit"
  ],
  "genelleştirilmiş koordinat": [
    "generalized coordinate"
  ],
  "genellestirilmis koordinat": [
    "generalized coordinate"
  ],
  "koordinat sistemleri": [
    "coordinate systems"
  ],
  "koordinat atlası": [
    "coordinate atlas"
  ],
  "koordinat atlasi": [
    "coordinate atlas"
  ],
  "polar koordinat": [
    "polar coordinate"
  ],
  "küresel koordinat": [
    "spherical coordinate"
  ],
  "kuresel koordinat": [
    "spherical coordinate"
  ],
  "silindirik koordinat": [
    "cylindrical coordinate"
  ],
  "konu anlatımı": [
    "topic overview",
    "lecture"
  ],
  "konu anlatimi": [
    "topic overview"
  ],
  "teorik çerçeve": [
    "theoretical framework"
  ],
  "teorik cerceve": [
    "theoretical framework"
  ],
  "kavram incelemesi": [
    "concept study",
    "concept overview"
  ],
  "türetim atlası": [
    "derivation atlas"
  ],
  "turetim atlasi": [
    "derivation atlas"
  ],
  "ders notu": [
    "lecture note"
  ],
  "teori atlası": [
    "theory atlas"
  ],
  "teori atlasi": [
    "theory atlas"
  ],
  "hipotenüs": [
    "hypotenuse"
  ],
  "hipotenus": [
    "hypotenuse"
  ],
  "hipoten": [
    "hypoten"
  ],
  "pisagor": [
    "pythagor"
  ],
  "dik üçgen": [
    "right triangle"
  ],
  "matematik": [
    "mathematics"
  ],
  "geometri": [
    "geometry"
  ],
  "öklid": [
    "euclid"
  ],
  "öklid 5": [
    "euclid 5"
  ],
  "teorem": [
    "theorem"
  ],
  "aksiyom": [
    "axiom"
  ],
  "postulat": [
    "postulate"
  ],
  "cebir": [
    "algebra"
  ],
  "termodinamik": [
    "thermodynamic"
  ],
  "genel problem": [
    "General Problem"
  ],
  "genel çözüm": [
    "General Solution"
  ],
  "genel": [
    "General"
  ],
  "genel çerçeve": [
    "general framework"
  ],
  "mekanik enerji korunumu": [
    "conservation of mechanical energy"
  ],
  "lagrange mekaniği yerine": [
    "instead of Lagrange"
  ],
  "çözüm yöntemi": [
    "solution method"
  ],
  "2. yol": [
    "second method",
    "method 2"
  ],
  "ikinci yol": [
    "second method"
  ],
  "vektörel": [
    "vector"
  ],
  "korunum": [
    "conservation"
  ],
  "eylemsizlik": [
    "inertia"
  ],
  "alternatif": [
    "alternative"
  ],
  "denge": [
    "equilibrium"
  ],
  "kararlılık": [
    "stability"
  ],
  "kararlilik": [
    "stability"
  ],
  "potansiyel": [
    "potential"
  ],
  "frekans": [
    "frequency"
  ],
  "salınım": [
    "oscillation"
  ],
  "küçük açı": [
    "small angle"
  ],
  "yük direnci": [
    "load resistance"
  ],
  "bobin": [
    "coil"
  ],
  "indüktans": [
    "inductance"
  ],
  "devre": [
    "circuit"
  ],
  "analitik mekanik": [
    "analytical mechanics"
  ],
  "eylem": [
    "action"
  ],
  "direnç": [
    "resistance",
    "resistor"
  ],
  "akım": [
    "current"
  ],
  "gerilim": [
    "voltage"
  ],
  "gerilme": [
    "tension"
  ],
  "ip gerilmesi": [
    "string tension"
  ],
  "kuvvet": [
    "force"
  ],
  "sıcaklık": [
    "temperature"
  ],
  "termo": [
    "thermo"
  ],
  "eğik düzlem": [
    "inclined plane"
  ],
  "egik duzlem": [
    "inclined plane"
  ],
  "kama": [
    "wedge"
  ],
  "hareketli": [
    "moving"
  ],
  "delik": [
    "hole"
  ],
  "kısıt": [
    "constraint"
  ],
  "küresel": [
    "spherical"
  ],
  "kuresel": [
    "spherical"
  ],
  "silindirik": [
    "cylindrical"
  ],
  "titreşim": [
    "vibration"
  ],
  "sarkaç": [
    "pendulum"
  ],
  "asılı": [
    "suspended"
  ],
  "çubuk": [
    "rod"
  ],
  "kiriş": [
    "beam"
  ],
  "açısal momentum": [
    "angular momentum"
  ],
  "dönme": [
    "rotation"
  ],
  "yarıçap": [
    "radius"
  ],
  "çember": [
    "circle"
  ],
  "küre": [
    "sphere"
  ],
  "yörünge": [
    "orbit"
  ],
  "bağlı ip": [
    "attached string"
  ],
  "ısı": [
    "heat"
  ],
  "ışık": [
    "light"
  ],
  "kırılma": [
    "refraction"
  ],
  "kütle": [
    "mass"
  ],
  "yoğunluk": [
    "density"
  ],
  "doğrusal kütle": [
    "linear mass"
  ],
  "lagrange çarpanı": [
    "lagrange multiplier"
  ],
  "sıkışma": [
    "compression"
  ],
  "dalga sayısı": [
    "wave number",
    "wavenumber"
  ],
  "açısal ivme": [
    "angular acceleration"
  ],
  "sürtünme": [
    "friction"
  ],
  "indirgenmiş": [
    "reduced"
  ],
  "geçirgenlik": [
    "permeability"
  ],
  "çarpışma": [
    "collision"
  ],
  "hız": [
    "velocity",
    "speed"
  ],
  "basınç": [
    "pressure"
  ],
  "akışkan": [
    "fluid"
  ],
  "özkütle": [
    "density"
  ],
  "yay": [
    "spring"
  ],
  "türev": [
    "derivative"
  ],
  "diferansiyel": [
    "differential"
  ],
  "matris": [
    "matrix",
    "matrices"
  ],
  "özdeğer": [
    "eigenvalue"
  ],
  "özvektör": [
    "eigenvector"
  ],
  "vektör uzayı": [
    "vector space"
  ],
  "vektör": [
    "vector"
  ],
  "üçgen": [
    "triangle"
  ],
  "açı": [
    "angle"
  ],
  "teğet": [
    "tangent"
  ],
  "grup": [
    "group"
  ],
  "halka": [
    "ring"
  ],
  "cisim": [
    "body",
    "field"
  ],
  "izomorfizm": [
    "isomorphism"
  ],
  "modüler": [
    "modular"
  ],
  "olasılık": [
    "probability"
  ],
  "varyans": [
    "variance"
  ],
  "dağılım": [
    "distribution"
  ],
  "beklenen değer": [
    "expected value"
  ],
  "rastgele": [
    "random"
  ],
  "serbestlik derecesi": [
    "degrees of freedom",
    "degree of freedom"
  ],
  "periyot": [
    "period"
  ],
  "basit harmonik": [
    "simple harmonic"
  ],
  "tork": [
    "torque"
  ],
  "manyetik": [
    "magnetic"
  ],
  "elektrik": [
    "electric"
  ],
  "yük": [
    "charge"
  ],
  "indüksiyon": [
    "induction"
  ],
  "entropi": [
    "entropy"
  ],
  "gaz": [
    "gas"
  ],
  "serbest cisim": [
    "free body"
  ],
  "açısal": [
    "angular"
  ]
};

export function containsConcept(text: string, concept: string): boolean {
  const normalized = text.toLowerCase();
  const key = concept.toLowerCase();
  return [key, ...(aliases[key] ?? [])].some(term => normalized.includes(term));
}
