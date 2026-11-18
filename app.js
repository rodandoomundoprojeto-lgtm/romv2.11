/* Rodando o Mundo — app
   Implementa Bloco B (B1-B6), Bloco C (C1-C3), Bloco D (D1-D5), Bloco E (E1-E3) e Extra. */
(function () {
  'use strict';

  var CONT = {
    sul:     { n: 'América do Sul', short: 'América do Sul', box: [[-86, -56], [-33, 13]] },
    central: { n: 'América Central e Caribe', short: 'América Central', box: [[-93, 7], [-58, 28]] },
    norte:   { n: 'América do Norte', short: 'América do Norte', box: [[-168, 24], [-52, 72]] },
    europa:  { n: 'Europa', short: 'Europa', box: [[-25, 34], [60, 71]] },
    africa:  { n: 'África', short: 'África', box: [[-19, -36], [53, 38]] },
    asia:    { n: 'Ásia', short: 'Ásia', box: [[26, -11], [160, 72]] },
    oceania: { n: 'Oceania', short: 'Oceania', box: [[111, -48], [180, 16]] }
  };
  var ORDER = ['sul', 'central', 'norte', 'europa', 'africa', 'asia', 'oceania'];

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function isEasterIsland(c, islandName) {
    if (!c && !islandName) return false;
    var iName = islandName || (c && c.islandName) || (typeof state !== 'undefined' && state && state.islandName) || (c && c.n) || '';
    var nName = norm(iName);
    if (nName.indexOf('pascoa') > -1 || nName.indexOf('easter') > -1 || nName.indexOf('rapa nui') > -1) return true;
    if (c) {
      if (String(c.id || '') === '152-easter') return true;
      if ((c.a2 || '').toUpperCase() === 'CL') {
        if (nName.indexOf('pascoa') > -1 || nName.indexOf('easter') > -1) return true;
      }
    }
    return false;
  }

  function isEastOceania(country, islandName) {
    if (!country && !islandName) return false;
    var iName = islandName || (country && country.islandName) || (typeof state !== 'undefined' && state && state.islandName) || (country && country.n) || '';
    var nName = norm(iName);
    if (nName.indexOf('pascoa') > -1 || nName.indexOf('easter') > -1 || nName.indexOf('rapa nui') > -1) return true;
    if (nName.indexOf('hava') > -1 || nName.indexOf('hawai') > -1) return true;
    if (nName.indexOf('niue') > -1 || nName.indexOf('cook') > -1 || nName.indexOf('polin') > -1 || nName.indexOf('samoa') > -1 || nName.indexOf('tonga') > -1 || nName.indexOf('kiribati') > -1 || nName.indexOf('wallis') > -1 || nName.indexOf('pitcairn') > -1 || nName.indexOf('tokelau') > -1 || nName.indexOf('tuvalu') > -1) return true;
    if (!country) return false;
    var code = (country.a2 || '').toUpperCase();
    var id = String(country.id || '');
    if (id === '840-hawaii' || id === '152-easter') return true;
    if (['NU', 'CK', 'PF', 'WS', 'AS', 'TO', 'KI', 'WF', 'PN', 'TV', 'TK'].indexOf(code) > -1) return true;
    if (['570', '184', '258', '882', '016', '776', '296', '876', '612', '798', '772'].indexOf(id) > -1) return true;
    if (code === 'CL' && (country.c === 'oceania' || (typeof state !== 'undefined' && state && state.cont === 'oceania'))) return true;
    return false;
  }

  function isCaribIslandCountry(country, islandName) {
    if (!country && !islandName) return false;
    var iName = islandName || (country && country.islandName) || (typeof state !== 'undefined' && state && state.islandName) || (country && country.n) || '';
    var nName = norm(iName);
    if (nName.indexOf('martinica') > -1 || nName.indexOf('guadalupe') > -1 || nName.indexOf('bonaire') > -1 || nName.indexOf('saba') > -1 || nName.indexOf('eustaquio') > -1) return true;
    if (!country) return false;
    var code = (country.a2 || '').toUpperCase();
    if (['GD', 'VC', 'LC', 'DM', 'AG', 'KN', 'BB', 'TT', 'AW', 'CW', 'MF', 'SX', 'BL', 'AI', 'VG', 'VI', 'PR', 'TC', 'KY', 'MS'].indexOf(code) > -1) return true;
    return false;
  }

  var TOPICS = [
    { k: 'politica', l: 'Política' },
    { k: 'economia', l: 'Economia' },
    { k: 'tecnologia', l: 'Tecnologia' },
    { k: 'cultura', l: 'Cultura' },
    { k: 'mundo', l: 'Internacional' },
    { k: 'esportes', l: 'Esportes' },
    { k: 'saude', l: 'Saúde' }
  ];
  var TERMS = {
    pt: ['política', 'economia', 'tecnologia', 'cultura', 'internacional', 'esportes', 'saúde'],
    es: ['política', 'economía', 'tecnología', 'cultura', 'internacional', 'deportes', 'salud'],
    en: ['politics', 'business', 'technology', 'culture', 'world', 'sports', 'health'],
    fr: ['politique', 'économie', 'technologie', 'culture', 'international', 'sports', 'santé'],
    de: ['Politik', 'Wirtschaft', 'Technik', 'Kultur', 'Ausland', 'Sport', 'Gesundheit'],
    it: ['politica', 'economia', 'tecnologia', 'cultura', 'esteri', 'sport', 'salute'],
    nl: ['politiek', 'economie', 'technologie', 'cultuur', 'buitenland', 'sport', 'gezondheid'],
    pl: ['polityka', 'gospodarka', 'technologie', 'kultura', 'świat', 'sport', 'zdrowie'],
    sv: ['politik', 'ekonomi', 'teknik', 'kultur', 'utrikes', 'sport', 'hälsa'],
    no: ['politikk', 'økonomi', 'teknologi', 'kultur', 'utenriks', 'sport', 'helse'],
    da: ['politik', 'økonomi', 'teknologi', 'kultur', 'udland', 'sport', 'sundhed'],
    fi: ['politiikka', 'talous', 'teknologia', 'kulttuuri', 'ulkomaat', 'urheilu', 'terveys'],
    el: ['πολιτική', 'οικονομία', 'τεχνολογία', 'πολιτισμός', 'κόσμος', 'αθλητισμός', 'υγεία'],
    ru: ['политика', 'экономика', 'технологии', 'культура', 'мир', 'спорт', 'здоровье'],
    uk: ['політика', 'економіка', 'технології', 'культура', 'світ', 'спорт', 'здоров\'я'],
    hu: ['politika', 'gazdaság', 'technológia', 'kultúra', 'külföld', 'sport', 'egészség'],
    cs: ['politika', 'ekonomika', 'technologie', 'kultura', 'zahraničí', 'sport', 'zdraví'],
    ro: ['politică', 'economie', 'tehnologie', 'cultură', 'externe', 'sport', 'sănătate'],
    ar: ['سياسة', 'اقتصاد', 'تكنولوجيا', 'ثقافة', 'العالم', 'رياضة', 'صحة'],
    zh: ['政治', '经济', '科技', '文化', '国际', '体育', '健康'],
    ja: ['政治', '経済', 'テクノロジー', '文化', '国際', 'スポーツ', '健康'],
    ko: ['정치', '경제', '기술', '문화', '국제', '스포츠', '건강'],
    hi: ['राजनीति', 'अर्थव्यवस्था', 'प्रौद्योगिकी', 'संस्कृति', 'विश्व', 'खेल', 'स्वास्थ्य'],
    tr: ['siyaset', 'ekonomi', 'teknoloji', 'kültür', 'dünya', 'spor', 'sağlık'],
    bg: ['политика', 'икономика', 'технологии', 'култура', 'свят', 'спорт', 'здраве'],
    hr: ['politika', 'gospodarstvo', 'tehnologija', 'kultura', 'svijet', 'sport', 'zdravlje'],
    sr: ['политика', 'економија', 'технологија', 'култура', 'свет', 'спорт', 'здравље'],
    sk: ['politika', 'ekonomika', 'technológie', 'kultúra', 'svet', 'šport', 'zdravie'],
    sl: ['politika', 'gospodarstvo', 'tehnologija', 'kultura', 'svet', 'šport', 'zdravje'],
    bs: ['politika', 'ekonomija', 'tehnologija', 'kultura', 'svijet', 'sport', 'zdravlje'],
    cnr: ['politika', 'ekonomija', 'tehnologija', 'kultura', 'svijet', 'sport', 'zdravlje'],
    mk: ['политика', 'економија', 'технологија', 'култура', 'свет', 'спорт', 'здравје'],
    sq: ['politikë', 'ekonomi', 'teknologji', 'kulturë', 'botë', 'sport', 'shëndet'],
    et: ['poliitika', 'majandus', 'tehnoloogia', 'kultuur', 'maailm', 'sport', 'tervis'],
    lv: ['politika', 'ekonomika', 'tehnoloģijas', 'kultūra', 'pasaule', 'sports', 'veselība'],
    lt: ['politika', 'ekonomika', 'technologijos', 'kultūra', 'pasaulis', 'sportas', 'sveikata'],
    is: ['stjórnmál', 'viðskipti', 'tækni', 'menning', 'erlent', 'íþróttir', 'heilsa'],
    fo: ['politikkur', 'búskapur', 'tøkni', 'mentan', 'uttanlands', 'ítróttur', 'heilsa'],
    hy: ['քաղաքականություն', 'տնտեսություն', 'տեխնոլոգիա', 'մշակույթ', 'աշխարհ', 'սպորտ', 'առողջություն'],
    ka: ['პოლიტიკა', 'ეკონომიკა', 'ტექნოლოგია', 'კულტურა', 'მსოფლიო', 'სპორტი', 'ჯანმრთელობა'],
    az: ['siyasət', 'iqtisadiyyat', 'texnologiya', 'mədəniyyət', 'dünya', 'idman', 'sağlamlıq'],
    uz: ['siyosat', 'iqtisodiyot', 'texnologiya', 'madaniyat', 'jahon', 'sport', 'salomatlik'],
    fa: ['سیاست', 'اقتصاد', 'فناوری', 'فرهنگ', 'جهان', 'ورزش', 'سلامت'],
    so: ['siyaasadda', 'dhaqaalaha', 'tignoolajiyada', 'dhaqanka', 'caalamka', 'ciyaaraha', 'caafimaadka'],
    be: ['палітыка', 'эканоміка', 'тэхналогіі', 'культура', 'свет', 'спорт', 'здароўе'],
    bn: ['রাজনীতি', 'অর্থনীতি', 'প্রযুক্তি', 'সংস্কৃতি', 'বিশ্ব', 'খেলাধুলা', 'স্বাস্থ্য'],
    ca: ['política', 'economia', 'tecnologia', 'cultura', 'internacional', 'esports', 'salut'],
    he: ['פוליטיקה', 'כלכלה', 'טכנולוגיה', 'תרבות', 'עולם', 'ספורט', 'בריאות'],
    id: ['politik', 'ekonomi', 'teknologi', 'budaya', 'internasional', 'olahraga', 'kesehatan'],
    ms: ['politik', 'ekonomi', 'teknologi', 'budaya', 'antarabangsa', 'sukan', 'kesihatan'],
    th: ['การเมือง', 'เศรษฐกิจ', 'เทคโนโลยี', 'วัฒนธรรม', 'ต่างประเทศ', 'กีฬา', 'สุขภาพ'],
    vi: ['chính trị', 'kinh tế', 'công nghệ', 'văn hóa', 'thế giới', 'thể thao', 'sức khỏe'],
    tl: ['politika', 'ekonomiya', 'teknolohiya', 'kultura', 'mundo', 'palakasan', 'kalusugan'],
    sw: ['siasa', 'uchumi', 'teknolojia', 'utamaduni', 'kimataifa', 'michezo', 'afya'],
    am: ['ፖለቲካ', 'ኢኮኖሚ', 'ቴክኖሎጂ', 'ባህል', 'ዓለም', 'ስፖርት', 'ጤና'],
    ur: ['سیاست', 'معیشت', 'ٹیکنالوجی', 'ثقافت', 'دنیا', 'کھیل', 'صحت']
  };
  // Veículos cuja língua difere da principal do país
  var OUT_LANG = {
    'Kathimerini (EN)': 'en', 'Meduza (EN)': 'en', 'RT': 'en', 'Novaya Gazeta Europe': 'en',
    'Notes from Poland (EN)': 'en', 'Swissinfo': 'pt', 'Le Temps': 'fr', 'De Standaard': 'nl',
    'De Morgen': 'nl', 'Le Devoir': 'fr', 'Ukrainska Pravda': 'en', 'Kompas': 'en',
    'Republika': 'en', 'United Daily News': 'en', 'Sankei Shimbun': 'en', 'Cumhuriyet': 'en', 'BirGün': 'en'
  };

  var LANG_NAMES = {
    pt: 'Português', es: 'Espanhol', en: 'Inglês', fr: 'Francês', de: 'Alemão', it: 'Italiano',
    nl: 'Holandês', ru: 'Russo', ar: 'Árabe', zh: 'Mandarim', ja: 'Japonês', ko: 'Coreano',
    hi: 'Hindi', tr: 'Turco', pl: 'Polonês', sv: 'Sueco', no: 'Norueguês', da: 'Dinamarquês',
    fi: 'Finlandês', el: 'Grego', uk: 'Ucraniano', cs: 'Tcheco', hu: 'Húngaro', ro: 'Romeno',
    bg: 'Búlgaro', hr: 'Croata', sr: 'Sérvio', sk: 'Eslovaco', sl: 'Esloveno', bs: 'Bósnio',
    cnr: 'Montenegrino', mk: 'Macedônio', sq: 'Albanês', et: 'Estoniano', lv: 'Letão',
    lt: 'Lituano', is: 'Islandês', fo: 'Feroês', hy: 'Armênio', ka: 'Georgiano', az: 'Azeri',
    uz: 'Uzbeque', fa: 'Persa', so: 'Somali', be: 'Bielorrusso', bn: 'Bengali', ca: 'Catalão',
    he: 'Hebraico', id: 'Indonésio', ms: 'Malaio', th: 'Tailandês', vi: 'Vietnamita',
    tl: 'Filipino', sw: 'Suaíli', am: 'Amárico', ur: 'Urdu'
  };

  var COUNTRY_LANGS = {
    // América do Sul
    BR: 'Português', AR: 'Espanhol', CL: 'Espanhol', CO: 'Espanhol', UY: 'Espanhol',
    VE: 'Espanhol', EC: 'Espanhol', PY: 'Espanhol e Guarani', BO: 'Espanhol, Quíchua e Aimará',
    PE: 'Espanhol e Quíchua', GY: 'Inglês', SR: 'Holandês', GF: 'Francês',
    // América do Norte & Central
    US: 'Inglês', CA: 'Inglês e Francês', MX: 'Espanhol', CU: 'Espanhol', DO: 'Espanhol',
    PR: 'Espanhol e Inglês', PA: 'Espanhol', CR: 'Espanhol', NI: 'Espanhol', HN: 'Espanhol',
    SV: 'Espanhol', GT: 'Espanhol', BZ: 'Inglês', JM: 'Inglês', HT: 'Francês e Crioulo',
    BS: 'Inglês', TT: 'Inglês',
    // Europa
    PT: 'Português', ES: 'Espanhol, Catalão e Galego', FR: 'Francês', GB: 'Inglês',
    IE: 'Inglês e Irlandês', DE: 'Alemão', AT: 'Alemão', CH: 'Alemão, Francês e Italiano',
    IT: 'Italiano', BE: 'Holandês e Francês', NL: 'Holandês', LU: 'Luxemburguês, Francês e Alemão',
    SE: 'Sueco', NO: 'Norueguês', DK: 'Dinamarquês', FI: 'Finlandês e Sueco', IS: 'Islandês',
    PL: 'Polonês', CZ: 'Tcheco', SK: 'Eslovaco', HU: 'Húngaro', RO: 'Romeno', BG: 'Búlgaro',
    GR: 'Grego', CY: 'Grego e Turco', UA: 'Ucraniano', RU: 'Russo', BY: 'Bielorrusso e Russo',
    HR: 'Croata', RS: 'Sérvio', BA: 'Bósnio, Croata e Sérvio', ME: 'Montenegrino',
    MK: 'Macedônio', AL: 'Albanês', XK: 'Albanês e Sérvio', SI: 'Esloveno',
    EE: 'Estoniano', LV: 'Letão', LT: 'Lituano', MT: 'Maltês e Inglês', VA: 'Latim e Italiano',
    // Ásia
    CN: 'Mandarim', TW: 'Mandarim', HK: 'Cantonês e Inglês', JP: 'Japonês', KR: 'Coreano',
    KP: 'Coreano', IN: 'Hindi e Inglês', PK: 'Urdu e Inglês', BD: 'Bengali', ID: 'Indonésio',
    PH: 'Filipino e Inglês', VN: 'Vietnamita', TH: 'Tailandês', MY: 'Malaio',
    SG: 'Inglês, Mandarim e Malaio', IR: 'Persa', IQ: 'Árabe e Curdo', SA: 'Árabe',
    AE: 'Árabe', QA: 'Árabe', KW: 'Árabe', OM: 'Árabe', YE: 'Árabe', SY: 'Árabe',
    LB: 'Árabe e Francês', JO: 'Árabe', IL: 'Hebraico e Árabe', PS: 'Árabe', TR: 'Turco',
    KZ: 'Cazaque e Russo', UZ: 'Uzbeque', TM: 'Turcomeno', TJ: 'Tajique', KG: 'Quirguiz e Russo',
    AF: 'Pastó e Dari', NP: 'Nepalês', LK: 'Cingalês e Tâmil', MM: 'Birmanês', KH: 'Khmer',
    LA: 'Laosiano', MN: 'Mongol', GE: 'Georgiano', AM: 'Armênio', AZ: 'Azeri', TL: 'Português e Tétum',
    // África
    ZA: 'Inglês, Africâner e Zulu', EG: 'Árabe', NG: 'Inglês', KE: 'Suaíli e Inglês',
    ET: 'Amárico', MA: 'Árabe e Berbere', DZ: 'Árabe e Berbere', TN: 'Árabe', LY: 'Árabe',
    SD: 'Árabe e Inglês', SS: 'Inglês', AO: 'Português', MZ: 'Português',
    CV: 'Português e Crioulo', GW: 'Português', ST: 'Português', GH: 'Inglês',
    SN: 'Francês e Uolof', CI: 'Francês', CM: 'Francês e Inglês', CD: 'Francês e Lingala',
    CG: 'Francês', RW: 'Kinyarwanda, Francês e Inglês', TZ: 'Suaíli e Inglês',
    UG: 'Inglês e Suaíli', ZW: 'Inglês e Shona', ZM: 'Inglês', NA: 'Inglês e Africâner',
    BW: 'Inglês e Tswana', MG: 'Malgaxe e Francês', SO: 'Somali e Árabe',
    // Oceania
    AU: 'Inglês', NZ: 'Inglês e Maori', PG: 'Inglês, Tok Pisin e Hiri Motu',
    FJ: 'Inglês e Fijiano', SB: 'Inglês e Pijin', VU: 'Bislama, Francês e Inglês',
    WS: 'Samoano e Inglês', TO: 'Tonganês e Inglês', TV: 'Tuvaluano e Inglês',
    TK: 'Tokelauano e Inglês', CK: 'Maori das Ilhas Cook e Inglês', NU: 'Niueano e Inglês',
    PF: 'Francês e Taitiano', WF: 'Francês e Wallisiano', AS: 'Samoano e Inglês',
    KI: 'Quiribatiano e Inglês', PN: 'Pitcairnês e Inglês'
  };

  var BIAS = { E: 'Esquerda', I: 'Imparcial', D: 'Direita' };

  var DATA = window.RDM;
  var byId = {}, byA2 = {};
  var PT_BR = { 'Arménia': 'Armênia', 'Azerbeijão': 'Azerbaijão', 'Eslovénia': 'Eslovênia', 'Estónia': 'Estônia', 'Gronelândia': 'Groenlândia',
    'Holanda': 'Países Baixos', 'Ilha Formosa': 'Taiwan', 'Ilhas Caimão': 'Ilhas Cayman', 'Irão': 'Irã', 'Iémen': 'Iêmen', 'Letónia': 'Letônia',
    'Macedónia do Norte': 'Macedônia do Norte', 'Madagáscar': 'Madagascar', 'Mónaco': 'Mônaco', 'Nova Caledónia': 'Nova Caledônia', 'Perú': 'Peru',
    'Polónia': 'Polônia', 'Quénia': 'Quênia', 'Roménia': 'Romênia', 'Suazilândia': 'Essuatíni', 'Vietname': 'Vietnã', 'ilha da Curação': 'Curaçao',
    'Trinidade e Tobago': 'Trinidad e Tobago', 'São Vincente e Granadinas': 'São Vicente e Granadinas', 'Botswana': 'Botsuana', 'Zimbabwe': 'Zimbábue',
    'Malawi': 'Malaui', 'Djibouti': 'Djibuti', 'Ilhas Faroé': 'Ilhas Faroe', 'Chéquia': 'República Tcheca', 'Alândia': 'Ilhas Åland', 'Benin': 'Benim',
    'Bahrein': 'Barein', 'Singapura': 'Singapura', 'Cidade do Vaticano': 'Vaticano' };

  DATA.countries.forEach(function (c) {
    if (PT_BR[c.n]) c.n = PT_BR[c.n];
    if (c.id === '534') c.n = 'Sint Maarten';
    c.m = (c.a2 && DATA.media[c.a2]) || DATA.media[c.id] || null;
    byId[c.id] = c;
    if (c.a2) byA2[c.a2] = c;
  });

  if (byA2['CL']) {
    byId['152-easter'] = { id: '152-easter', a2: 'CL', n: 'Ilha de Páscoa (Chile)', c: 'oceania', islandName: 'Ilha de Páscoa (Chile)', islandFlag: 'cl', m: byA2['CL'].m, orig: byA2['CL'] };
  }
  if (byA2['EC']) {
    byId['218-galapagos'] = { id: '218-galapagos', a2: 'EC', n: 'Ilhas Galápagos (Equador)', c: 'sul', islandName: 'Ilhas Galápagos (Equador)', islandFlag: 'ec', m: byA2['EC'].m, orig: byA2['EC'] };
  }
  if (byA2['US']) {
    byId['840-hawaii'] = { id: '840-hawaii', a2: 'US', n: 'Havaí (Estados Unidos)', c: 'oceania', islandName: 'Havaí (Estados Unidos)', islandFlag: 'us', m: byA2['US'].m, orig: byA2['US'] };
  }
  if (byA2['FR']) {
    byId['250-guadeloupe'] = { id: '250-guadeloupe', a2: 'FR', n: 'Guadalupe (França)', c: 'central', islandName: 'Guadalupe (França)', islandFlag: 'gp', m: null, orig: byA2['FR'] };
    byId['250-martinique'] = { id: '250-martinique', a2: 'FR', n: 'Martinica (França)', c: 'central', islandName: 'Martinica (França)', islandFlag: 'mq', m: null, orig: byA2['FR'] };
    byId['250-mayotte'] = { id: '250-mayotte', a2: 'FR', n: 'Mayotte (França)', c: 'africa', islandName: 'Mayotte (França)', islandFlag: 'yt', m: null, orig: byA2['FR'] };
    byId['250-reunion'] = { id: '250-reunion', a2: 'FR', n: 'Reunião (França)', c: 'africa', islandName: 'Reunião (França)', islandFlag: 're', m: null, orig: byA2['FR'] };
  }
  if (byA2['NL']) {
    byId['528-bonaire'] = { id: '528-bonaire', a2: 'NL', n: 'Bonaire (Países Baixos)', c: 'central', islandName: 'Bonaire (Países Baixos)', islandFlag: 'bq', m: null, orig: byA2['NL'] };
    byId['528-st-eustatius'] = { id: '528-st-eustatius', a2: 'NL', n: 'Santo Eustáquio (Países Baixos)', c: 'central', islandName: 'Santo Eustáquio (Países Baixos)', islandFlag: 'bq', m: null, orig: byA2['NL'] };
    byId['528-saba'] = { id: '528-saba', a2: 'NL', n: 'Saba (Países Baixos)', c: 'central', islandName: 'Saba (Países Baixos)', islandFlag: 'bq', m: null, orig: byA2['NL'] };
  }

  // Países transcontinentais e territórios
  var ALSO = { RU: ['asia'], TR: ['europa'], FR: ['sul', 'central'], NL: ['central'], PG: ['asia'], ID: ['oceania'] };
  DATA.countries.forEach(function (c) { c.also = ALSO[c.a2] || []; });

  var CONT_SLUGS = {
    sul: 'Sul',
    central: 'Central',
    norte: 'Norte',
    europa: 'Europa',
    africa: 'Africa',
    asia: 'Asia',
    oceania: 'Oceania'
  };

  var state = {
    viewMode: 'map',
    cont: null,
    country: null,
    islandName: null,
    islandFlag: null,
    focusCaribe: false,
    focusEastOceania: false,
    panelCollapsed: false,
    bias: 'all',
    topic: null,
    originRoute: null,
    pinnedOutlet: null,
    notFound: false,
    hubRoute: null,
    entendaSlug: null,
    searchQuery: '',
    searchPeriod: '24h',
    searchLoading: false,
    searchData: null,
    searchError: ''
  };

  var EDITORIAL = window.ROM_EDITORIAL || {
    assuntos: [],
    explicacoes: {},
    linhasDoTempo: {},
    paginasTematicas: {},
    resumoDoDia: [],
    encontrarAssuntosPorTexto: function () { return []; },
    encontrarLinhaDoTempoPorTermo: function () { return null; },
    encontrarExplicacoesPorTermo: function () { return []; },
    encontrarHubsPorTermo: function () { return []; },
    vincularMateria: function (m) { return m; }
  };

  var DEFAULT_TITLE = 'Rodando o Mundo — notícias de todos os continentes';
  var DEFAULT_DESC = 'Explore o mapa-múndi por continente e país e acesse veículos de comunicação de direita, esquerda e imparciais, por tema: política, economia, tecnologia e mais.';

  // Domínio canônico oficial de produção (SEO Authority)
  var PRODUCTION_DOMAIN = 'https://www.rodandoomundo.com.br';

  function getCanonicalBaseUrl() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        var host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
          return window.location.origin;
        }
      }
    } catch (e) {}
    return PRODUCTION_DOMAIN;
  }

  function updateSeoMeta(title, desc, pathStr) {
    var finalTitle = title || DEFAULT_TITLE;
    var finalDesc = desc || DEFAULT_DESC;
    var cleanP = (pathStr || location.pathname || '/').replace(/\/+$/, '') || '/';
    var baseUrl = getCanonicalBaseUrl();
    var fullUrl = baseUrl + (cleanP === '/' ? '/' : cleanP);
    document.title = finalTitle;
    var metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', finalDesc);
    var canon = document.getElementById('canonical-link');
    if (canon) canon.setAttribute('href', fullUrl);
    var ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', finalTitle);
    var ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', finalDesc);
    var ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', fullUrl);
    var twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', finalTitle);
    var twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute('content', finalDesc);

    // Notificar Google Tag Manager / Analytics sobre navegação de rota SPA
    try {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push({
          event: 'virtual_pageview',
          page_path: cleanP,
          page_title: finalTitle,
          page_location: fullUrl
        });
      }
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'page_view', {
          page_title: finalTitle,
          page_location: fullUrl,
          page_path: cleanP
        });
      }
    } catch (e) {}
  }

  /* ---------- helpers ---------- */
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'style') e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // Rótulos de territórios e ilhas com soberania entre parênteses
  function countryDisplayName(c, cont) {
    if (!c) return '';
    if (state && state.country === c && state.islandName) return state.islandName;
    if (c.islandName) return c.islandName;
    if ((c.a2 === 'FR' || c.id === '250') && cont === 'sul') return 'Guiana Francesa (França)';
    if (c.a2 === 'IO' || c.id === '086') return 'Território Britânico do Oceano Índico (Reino Unido)';
    return c.n;
  }
  function getTerritoryNotice(c, cont) {
    if (!c) return null;
    var name = (state && state.country === c && state.islandName) || c.islandName || countryDisplayName(c, cont);
    var isIslandOrDep = false;
    if (state && state.islandName) isIslandOrDep = true;
    else if (c.islandName || c.orig) isIslandOrDep = true;
    else if (name.indexOf('(') > -1 && name.indexOf(')') > -1) isIslandOrDep = true;
    else if (/^(ilha|ilhas)\b/i.test(name)) isIslandOrDep = true;
    else {
      var depCodes = ['IO', 'PR', 'VI', 'GU', 'AS', 'MP', 'FK', 'KY', 'BM', 'VG', 'TC', 'MS', 'JE', 'GG', 'IM', 'GL', 'FO', 'AI', 'AW', 'CW', 'SX', 'PF', 'NC', 'WF', 'BL', 'MF', 'PM', 'YT', 'RE', 'GP', 'MQ', 'GF', 'SH', 'PN', 'CK', 'NU', 'TK'];
      if (c.a2 && depCodes.indexOf(c.a2.toUpperCase()) > -1) isIslandOrDep = true;
    }
    if (isIslandOrDep) {
      return 'Território insular/ultramarino: devido à ausência de imprensa local autônoma, alguns territórios podem exibir prioritariamente veículos de comunicação do seu país soberano.';
    }
    return null;
  }
  var FLAG_TRNC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='600' fill='%23e30a17'%3E%3Cpath d='m0 0h900v600H0z' fill='%23fff'/%3E%3Ccircle cx='300' cy='300' r='150'/%3E%3Ccircle cx='337.5' cy='300' r='120' fill='%23fff'/%3E%3Cpath d='M0 60h900v60H0zM0 480h900v60H0zM417.5 300l135.676275-44.083894-83.852549 115.413133v-142.658477l83.852549 115.413133z'/%3E%3C/svg%3E";

  function countryFlag(c, cls, cont) {
    if (!c) return '';
    var islandFlag = (state && state.country === c && state.islandFlag) || c.islandFlag || c.flagCode;
    if (islandFlag) return '<img class="flag ' + (cls || '') + '" src="https://flagcdn.com/w80/' + islandFlag + '.png" alt="" loading="lazy" width="36" height="24">';
    if (c.id === 'x-N. Cyprus' || (c.n && c.n.toLowerCase().indexOf('chipre do norte') > -1)) {
      return '<img class="flag ' + (cls || '') + '" src="' + FLAG_TRNC + '" alt="Chipre do Norte" loading="lazy" width="36" height="24">';
    }
    if (c.id === 'x-Somaliland' || (c.n && c.n.toLowerCase().indexOf('somalilândia') > -1)) {
      return '<img class="flag ' + (cls || '') + '" src="/somaliland.svg" alt="Somalilândia" loading="lazy" width="36" height="24">';
    }
    var a2 = (c.a2 === 'FR' || c.id === '250') && cont === 'sul' ? 'gf' : (c.a2 ? c.a2.toLowerCase() : '');
    if (!a2) return '<span class="flag-placeholder ' + (cls || '') + '"></span>';
    return '<img class="flag ' + (cls || '') + '" src="https://flagcdn.com/w80/' + a2 + '.png" alt="" loading="lazy" width="36" height="24">';
  }

  var OUTLET_FLAG_MAP = (function () {
    var m = {};
    if (DATA && DATA.media) {
      Object.keys(DATA.media).forEach(function (code) {
        var entry = DATA.media[code];
        if (!entry || !Array.isArray(entry.outlets)) return;
        var a2 = String(code).length === 2 ? String(code).toLowerCase() : '';
        if (!a2 && byId[code] && byId[code].a2) a2 = byId[code].a2.toLowerCase();
        if (!a2 && code === 'x-N. Cyprus') a2 = 'chipre-do-norte';
        if (!a2 && code === 'x-Somaliland') a2 = 'somaliland';
        if (!a2) return;
        entry.outlets.forEach(function (o) {
          if (o && o.u) {
            try {
              var h = new URL(o.u).hostname.replace(/^www\./, '').toLowerCase();
              if (h && !m[h]) m[h] = a2;
            } catch (e) {}
          }
          if (o && o.n) {
            var nLow = o.n.toLowerCase();
            if (!m[nLow]) m[nLow] = a2;
          }
        });
      });
    }
    var extras = {
      'associated press': 'us', 'reuters': 'gb', 'reuters world': 'gb', 'reuters technology': 'gb',
      'bbc': 'gb', 'bbc news': 'gb', 'bbc news world': 'gb', 'the guardian': 'gb', 'the guardian environment': 'gb',
      'le monde': 'fr', 'le monde internacional': 'fr', 'the new york times': 'us', 'the wall street journal': 'us',
      'cnn': 'us', 'cnn politics': 'us', 'the verge': 'us', 'the kyiv independent': 'ua',
      'folha de s.paulo': 'br', 'g1': 'br', 'g1 política': 'br', 'g1 economia': 'br', 'g1 tecnologia': 'br',
      'estadão': 'br', 'estadão economia': 'br', 'o globo': 'br', 'o globo política': 'br',
      'cartacapital': 'br', 'agência brasil': 'br', 'valor': 'br'
    };
    Object.keys(extras).forEach(function (k) { if (!m[k]) m[k] = extras[k]; });
    return m;
  })();

  function resolveOutletFlagCode(sourceName, fallbackCode, domainOrUrl) {
    var fb = String(fallbackCode || '').trim().toLowerCase();

    // 1. Prioridade para domínio específico, pois domínios não colidem (ex: elpais.com vs elpais.com.uy)
    if (domainOrUrl) {
      var d = host(domainOrUrl).toLowerCase();
      if (d === 'elpais.com' || d.endsWith('.elpais.com')) return 'es';
      if (d === 'elpais.com.uy' || d.endsWith('.elpais.com.uy')) return 'uy';
      if (d.includes('yeniduzen.com') || d.includes('kibrisgazetesi.com')) return 'chipre-do-norte';
      if (OUTLET_FLAG_MAP[d]) return OUTLET_FLAG_MAP[d];
      var cctldMatch = d.match(/\.([a-z]{2})$/);
      if (cctldMatch && cctldMatch[1] && cctldMatch[1] !== 'co' && cctldMatch[1] !== 'tv' && cctldMatch[1] !== 'me' && cctldMatch[1] !== 'io' && cctldMatch[1] !== 'so') {
        var tld = cctldMatch[1];
        if (byA2[tld.toUpperCase()]) return tld;
      }
    }

    // 2. Se um código de país (fallbackCode) foi passado no contexto (ex: Canárias/Espanha), prioriza ele para veículos locais
    if (fb && fb.length === 2 && byA2[fb.toUpperCase()]) {
      var rawCheck = String(sourceName || '').toLowerCase().trim();
      var isGlobalWire = /^(reuters|associated press|bbc|the guardian|the new york times|le monde|the wall street journal)/i.test(rawCheck);
      if (!isGlobalWire) {
        return fb;
      }
    }

    // 3. Verificação por nome do veículo
    if (sourceName) {
      var raw = String(sourceName).toLowerCase().trim();
      if (raw === 'el país' || raw === 'el pais') {
        if (fb === 'es' || (state.country && (state.country.a2 === 'ES' || state.cont === 'europa' || state.cont === 'africa'))) return 'es';
        if (fb === 'uy' || (state.country && state.country.a2 === 'UY')) return 'uy';
      }
      if (raw.includes('yenidüzen') || raw.includes('kıbrıs') || raw.includes('kibris')) return 'chipre-do-norte';
      if (OUTLET_FLAG_MAP[raw]) return OUTLET_FLAG_MAP[raw];
      var firstPart = raw.split(/\s+[—–\/|-]\s+/)[0].trim();
      if (OUTLET_FLAG_MAP[firstPart]) return OUTLET_FLAG_MAP[firstPart];
    }

    if (fb && fb.length === 2) return fb;
    if (fb === 'x-n. cyprus' || fb === 'chipre-do-norte') return 'chipre-do-norte';
    if (state.country) {
      if ((state.country.a2 === 'FR' || state.country.id === '250') && state.cont === 'sul') return 'gf';
      if (state.country.id === 'x-N. Cyprus') return 'chipre-do-norte';
      if (state.country.a2) return state.country.a2.toLowerCase();
    }
    return fb || 'br';
  }

  function outletFlagImg(sourceName, fallbackCode, domainOrUrl) {
    var code = resolveOutletFlagCode(sourceName, fallbackCode, domainOrUrl);
    if (!code) return '';
    if (code === 'chipre-do-norte' || code === 'x-n. cyprus') {
      return '<img class="outlet-country-flag" src="' + FLAG_TRNC + '" alt="Chipre do Norte" title="País do veículo: Chipre do Norte" loading="lazy" width="18" height="12">';
    }
    if (code === 'somaliland' || code === 'x-somaliland') {
      return '<img class="outlet-country-flag" src="/somaliland.svg" alt="Somalilândia" title="País do veículo: Somalilândia" loading="lazy" width="18" height="12">';
    }
    var cUpper = code.toUpperCase();
    var cObj = byA2[cUpper];
    var cLabel = code === 'gf' ? 'Guiana Francesa (França)' : (cObj ? cObj.n : cUpper);
    return '<img class="outlet-country-flag" src="https://flagcdn.com/w40/' + esc(code) + '.png" alt="' + esc(cLabel) + '" title="País do veículo: ' + esc(cLabel) + '" loading="lazy" width="18" height="12">';
  }
  function countryMedia(c, cont) {
    if (!c) return null;
    if ((c.a2 === 'FR' || c.id === '250') && cont === 'sul') return DATA.media['GF'] || c.m;
    return c.m;
  }
  function countryDominantLangs(c, cont) {
    if (!c) return '';
    var a2 = (c.a2 || '').toUpperCase();
    if ((a2 === 'FR' || c.id === '250') && cont === 'sul') return 'Francês';
    if (COUNTRY_LANGS[a2]) return COUNTRY_LANGS[a2];
    if (c.id && COUNTRY_LANGS[c.id]) return COUNTRY_LANGS[c.id];
    var m = countryMedia(c, cont);
    if (m && m.lang && LANG_NAMES[m.lang.toLowerCase()]) {
      return LANG_NAMES[m.lang.toLowerCase()];
    }
    return '';
  }

  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function siteScope(u) {
    try { var x = new URL(u); var p = x.pathname.replace(/\/$/, ''); return x.hostname.replace(/^www\./, '') + (p.length > 1 ? p : ''); } catch (e) { return u; }
  }
  function topicLink(o, lang, t, i) {
    if (o.s && o.s[t.k]) return { href: o.s[t.k], direct: true };
    var terms = TERMS[OUT_LANG[o.n] || lang] || TERMS.en;
    var term = (terms && terms[i]) ? terms[i] : ((TERMS.en && TERMS.en[i]) || (t ? (t.l || t.k) : ''));
    var q = 'site:' + siteScope(o.u) + ' ' + term;
    return { href: 'https://www.google.com/search?q=' + encodeURIComponent(q), direct: false };
  }
  function countsFor(c, cont) {
    var r = { E: 0, I: 0, D: 0 };
    var m = countryMedia(c, cont);
    if (m && m.outlets) m.outlets.forEach(function (o) { r[o.b]++; });
    return r;
  }
  function inCont(c, k) { return c.c === k || (c.also && c.also.indexOf(k) > -1); }
  function contCountries(k) {
    var list = DATA.countries.filter(function (c) {
      if (k === 'central' && (c.a2 === 'FR' || c.a2 === 'NL')) return false;
      return inCont(c, k);
    })
      .map(function (c) {
        if (k === 'sul' && c.a2 === 'FR') {
          return {
            id: c.id,
            a2: c.a2,
            n: 'Guiana Francesa (França)',
            c: 'sul',
            m: DATA.media['GF'] || c.m,
            orig: c
          };
        }
        return c;
      });
    if (k === 'oceania') {
      var us = byA2['US'];
      if (us) list.push({ id: '840-hawaii', a2: 'US', n: 'Havaí (Estados Unidos)', c: 'oceania', islandName: 'Havaí (Estados Unidos)', islandFlag: 'us', m: us.m, orig: us });
      var cl = byA2['CL'];
      if (cl) list.push({ id: '152-easter', a2: 'CL', n: 'Ilha de Páscoa (Chile)', c: 'oceania', islandName: 'Ilha de Páscoa (Chile)', islandFlag: 'cl', m: cl.m, orig: cl });
    } else if (k === 'sul') {
      var ec = byA2['EC'];
      if (ec) list.push({ id: '218-galapagos', a2: 'EC', n: 'Ilhas Galápagos (Equador)', c: 'sul', islandName: 'Ilhas Galápagos (Equador)', islandFlag: 'ec', m: ec.m, orig: ec });
    } else if (k === 'africa') {
      var es = byA2['ES'];
      if (es) list.push({ id: '724-canarias', a2: 'ES', n: 'Ilhas Canárias (Espanha)', c: 'africa', islandName: 'Ilhas Canárias (Espanha)', islandFlag: 'es', m: es.m, orig: es });
      var frA = byA2['FR'];
      if (frA) {
        list.push({ id: '250-mayotte', a2: 'FR', n: 'Mayotte (França)', c: 'africa', islandName: 'Mayotte (França)', islandFlag: 'yt', m: null, orig: frA });
        list.push({ id: '250-reunion', a2: 'FR', n: 'Reunião (França)', c: 'africa', islandName: 'Reunião (França)', islandFlag: 're', m: null, orig: frA });
      }
    } else if (k === 'central') {
      var frC = byA2['FR'];
      if (frC) {
        list.push({ id: '250-guadeloupe', a2: 'FR', n: 'Guadalupe (França)', c: 'central', islandName: 'Guadalupe (França)', islandFlag: 'gp', m: null, orig: frC });
        list.push({ id: '250-martinique', a2: 'FR', n: 'Martinica (França)', c: 'central', islandName: 'Martinica (França)', islandFlag: 'mq', m: null, orig: frC });
      }
      var nlC = byA2['NL'];
      if (nlC) {
        list.push({ id: '528-bonaire', a2: 'NL', n: 'Bonaire (Países Baixos)', c: 'central', islandName: 'Bonaire (Países Baixos)', islandFlag: 'bq', m: null, orig: nlC });
        list.push({ id: '528-st-eustatius', a2: 'NL', n: 'Santo Eustáquio (Países Baixos)', c: 'central', islandName: 'Santo Eustáquio (Países Baixos)', islandFlag: 'bq', m: null, orig: nlC });
        list.push({ id: '528-saba', a2: 'NL', n: 'Saba (Países Baixos)', c: 'central', islandName: 'Saba (Países Baixos)', islandFlag: 'bq', m: null, orig: nlC });
      }
    }
    return list.sort(function (a, b) { return a.n.localeCompare(b.n, 'pt'); });
  }

  var ICON_SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg>';
  var ICON_ARROW = '<svg class="icon-arrow-ext" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';
  function isVideoContent(url, item) {
    var u = String(url || '').toLowerCase();
    if (/youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|twitch\.tv|rumble\.com|odysee\.com/.test(u)) {
      return true;
    }
    if (item && typeof item === 'object') {
      var tipo = String(item.tipo || item.type || item.mediaType || item.formato || '').toLowerCase();
      if (tipo === 'video' || tipo === 'vídeo') return true;
      var src = String(item.source || item.fonte || item.fonte_nome || item.veiculo || '').toLowerCase();
      if (/youtube/.test(src)) return true;
    }
    return false;
  }

  function isGenericOutletUrl(rawUrl) {
    var u = String(rawUrl || '').trim();
    if (!u || u === '#' || u.charAt(0) === '/') return true;
    try {
      var parsed = new URL(u);
      var search = String(parsed.search || '').toLowerCase();
      if (/[?&](q|s|query|busca|search|id|p)=/.test(search)) return false;
      var segs = String(parsed.pathname || '').split('/').filter(Boolean);
      if (segs.length === 0) return true;
      var last = segs[segs.length - 1];
      var hasDigits = /\d/.test(parsed.pathname);
      if (!hasDigits && segs.length === 1 && last.length < 18 && (last.match(/-/g) || []).length < 2) {
        return true;
      }
      if (!hasDigits && segs.length === 2 && last.length < 18 && (last.match(/-/g) || []).length < 2) {
        return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  function extractSearchKeywords(text, maxWords) {
    var limit = maxWords || 5;
    var stop = {
      a: 1, o: 1, os: 1, as: 1, um: 1, uma: 1, uns: 1, umas: 1,
      de: 1, da: 1, do: 1, das: 1, dos: 1, em: 1, no: 1, na: 1, nos: 1, nas: 1,
      para: 1, por: 1, com: 1, sem: 1, sob: 1, sobre: 1, entre: 1, apos: 1,
      e: 1, ou: 1, que: 1, se: 1, ao: 1, aos: 1, pelo: 1, pela: 1,
      the: 1, an: 1, of: 1, in: 1, on: 1, at: 1, to: 1, for: 1, with: 1, from: 1,
      by: 1, and: 1, or: 1, as: 1, is: 1, are: 1, was: 1, were: 1, be: 1,
      could: 1, may: 1, might: 1, will: 1, would: 1, should: 1, new: 1, amid: 1,
      le: 1, la: 1, les: 1, un: 1, une: 1, des: 1, du: 1, sur: 1, dans: 1,
      el: 1, los: 1, las: 1, del: 1, con: 1, sin: 1, y: 1
    };
    var clean = String(text || '')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'«»“”‘’]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return '';
    var words = clean.split(' ').filter(Boolean);
    if (words.length <= limit) return words.join(' ');
    var picked = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var wn = norm(w);
      if (wn.length < 3 || stop[wn]) continue;
      picked.push(w);
      if (picked.length >= limit) break;
    }
    return picked.length ? picked.join(' ') : words.slice(0, limit).join(' ');
  }

  function buildRelatedArticleSearchUrl(title, outletName, rawUrl) {
    var dom = '';
    try {
      if (rawUrl && rawUrl !== '#') {
        dom = new URL(rawUrl).hostname.replace(/^www\./i, '');
      }
    } catch (e) {}
    var cleanTitle = extractSearchKeywords(title, 5);
    var cleanOutlet = String(outletName || '').replace(/\s+/g, ' ').trim();
    var terms = [];
    if (dom) terms.push('site:' + dom);
    else if (cleanOutlet) terms.push(cleanOutlet);
    if (cleanTitle) terms.push(cleanTitle);
    var q = terms.join(' ').trim() || cleanOutlet || 'notícias';
    return 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }

  function resolveRelatedArticleUrl(rawUrl, title, outletName) {
    var u = String(rawUrl || '').trim();
    if (!u || u === '#' || isGenericOutletUrl(u)) {
      return buildRelatedArticleSearchUrl(title, outletName, u);
    }
    return u;
  }

  function buildArticleLinkAttrs(rawUrl, title, outletName, searchTitle) {
    var u = String(rawUrl || '').trim();
    var effectiveTitle = String(searchTitle || title || '').trim();
    var resolved = resolveRelatedArticleUrl(u, effectiveTitle, outletName);
    if (!u || u === '#' || isGenericOutletUrl(u)) {
      var dom = '';
      try { if (u && u !== '#') dom = new URL(u).hostname.replace(/^www\./i, ''); } catch (e) {}
      var ptAttr = (title && effectiveTitle && title !== effectiveTitle)
        ? ' data-resolve-title-pt="' + esc(title) + '"'
        : '';
      return {
        href: resolved,
        isGeneric: true,
        attrs: ' data-resolve-article="1" data-resolve-outlet="' + esc(outletName || '') + '" data-resolve-domain="' + esc(dom) + '" data-resolve-title="' + esc(effectiveTitle) + '"' + ptAttr
      };
    }
    return { href: resolved, isGeneric: false, attrs: '' };
  }

  function inferSearchLangForCountry(a2) {
    var code = String(a2 || '').toUpperCase();
    if (code === 'BR' || code === 'PT' || code === 'AO' || code === 'MZ') return 'pt';
    if (code === 'FR' || code === 'BE') return 'fr';
    if (code === 'ES' || code === 'AR' || code === 'MX' || code === 'CO' || code === 'CL' || code === 'PE') return 'es';
    if (code === 'DE' || code === 'AT') return 'de';
    if (code === 'IT') return 'it';
    return 'en';
  }

  function resolverLinksGenericosNaView(containerEl, queryTerm, paisIso, extraOutlets) {
    if (!containerEl || location.protocol === 'file:') return;
    var links = containerEl.querySelectorAll('a[data-resolve-article="1"]');
    if (!links || !links.length) return;
    var q = String(queryTerm || '').trim();
    if (!q) return;

    var a2 = String(paisIso || 'BR').toUpperCase();
    var cObj = byA2[a2] || byA2['BR'];
    var outlets = [];
    var seenDom = {};

    function addOutletEntry(name, rawU, domHint, paisHint) {
      var dom = domHint || '';
      if (!dom && rawU) {
        try { dom = new URL(rawU).hostname.replace(/^www\./i, ''); } catch (e) {}
      }
      if (!dom || seenDom[dom]) return;
      seenDom[dom] = true;
      outlets.push({
        n: name || dom,
        u: rawU || ('https://' + dom + '/'),
        d: dom,
        b: 'I',
        pais: paisHint || a2
      });
    }

    if (Array.isArray(extraOutlets)) {
      extraOutlets.forEach(function (o) {
        if (o) addOutletEntry(o.n || o.veiculo, o.u || o.url, o.d, o.pais);
      });
    }
    links.forEach(function (a) {
      addOutletEntry(a.getAttribute('data-resolve-outlet'), '', a.getAttribute('data-resolve-domain'));
    });
    if (cObj && cObj.m && Array.isArray(cObj.m.outlets)) {
      cObj.m.outlets.slice(0, 12).forEach(function (o) {
        if (outlets.length < 22) addOutletEntry(o.n, o.u, o.d, a2);
      });
    }
    if (!outlets.length) return;

    fetch('/api/busca-assunto?_t=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: q,
        country: a2,
        countryName: cObj ? cObj.n : a2,
        lang: inferSearchLangForCountry(a2),
        periodo: '30d',
        outlets: outlets
      })
    })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (data) {
        var groups = (data && Array.isArray(data.grupos))
          ? data.grupos
          : ((data && Array.isArray(data.resultados)) ? data.resultados : []);
        if (!groups.length) return;

        links.forEach(function (a) {
          var targetDom = String(a.getAttribute('data-resolve-domain') || '').toLowerCase();
          var targetName = norm(a.getAttribute('data-resolve-outlet') || '');
          var targetTitle = norm(a.getAttribute('data-resolve-title') || '');
          var targetTitlePt = norm(a.getAttribute('data-resolve-title-pt') || '');
          var titleTokens = (targetTitle + ' ' + targetTitlePt)
            .split(/\s+/)
            .filter(function (w) { return w.length >= 4; });

          var matchedGroup = null;
          for (var gi = 0; gi < groups.length; gi++) {
            var g = groups[gi];
            var gDom = String(g.dominio || '').replace(/^www\./i, '').toLowerCase();
            if (!gDom && g.url) {
              try { gDom = new URL(g.url).hostname.replace(/^www\./i, '').toLowerCase(); } catch (e) {}
            }
            var gName = norm(g.veiculo || '');
            if ((targetDom && gDom && (gDom === targetDom || gDom.indexOf(targetDom) > -1 || targetDom.indexOf(gDom) > -1)) ||
                (targetName && gName && (gName === targetName || gName.indexOf(targetName) > -1 || targetName.indexOf(gName) > -1))) {
              matchedGroup = g;
              break;
            }
          }
          if (!matchedGroup) return;

          var arts = Array.isArray(matchedGroup.artigos) ? matchedGroup.artigos : (Array.isArray(matchedGroup.itens) ? matchedGroup.itens : []);
          var bestArt = null;
          var bestScore = 0;
          arts.forEach(function (art) {
            var artUrl = art && (art.url || art.link);
            if (!artUrl || isGenericOutletUrl(artUrl)) return;
            var artTit = norm(art.titulo || art.title || '');
            var sc = 0;
            titleTokens.forEach(function (tk) {
              if (artTit.indexOf(tk) > -1) sc += 2;
            });
            if (sc > bestScore) {
              bestScore = sc;
              bestArt = art;
            }
          });
          if (bestArt && (bestArt.url || bestArt.link)) {
            a.setAttribute('href', bestArt.url || bestArt.link);
            a.removeAttribute('data-resolve-article');
          }
        });
      })
      .catch(function () {});
  }
  var ICON_TRANSLATE = '<svg viewBox="0 0 24 24" aria-hidden="true" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';
  var ICON_STAR_ON = '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9L12 2.5z"/></svg>';
  var ICON_STAR_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9L12 2.5z"/></svg>';

  var FAV_STORAGE_KEY = 'rom_favorites_v1';
  var favState = { paises: [], veiculos: [], noticias: [] };

  function loadFavorites() {
    try {
      var raw = localStorage.getItem(FAV_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          favState.paises = Array.isArray(parsed.paises) ? parsed.paises : [];
          favState.veiculos = Array.isArray(parsed.veiculos) ? parsed.veiculos : [];
          favState.noticias = Array.isArray(parsed.noticias) ? parsed.noticias : [];
        }
      }
    } catch (e) {}
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(favState));
    } catch (e) {}
    syncFavoritesTopCounter();
  }

  function getCountryFavKey(c, cont) {
    if (!c) return '';
    var code = (cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id || '');
    return String(cont || c.c || 'sul') + ':' + String(code).toUpperCase();
  }

  function isCountryFavorited(c, cont) {
    var k = getCountryFavKey(c, cont);
    return !!k && favState.paises.some(function (p) { return p.key === k; });
  }

  function toggleCountryFavorite(c, cont) {
    if (!c) return false;
    var k = getCountryFavKey(c, cont);
    var idx = favState.paises.findIndex(function (p) { return p.key === k; });
    if (idx > -1) {
      favState.paises.splice(idx, 1);
      saveFavorites();
      return false;
    }
    var code = (cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id || '');
    var flagCode = code === 'GF' ? 'gf' : (c.id === 'x-N. Cyprus' ? 'chipre-do-norte' : (c.id === 'x-Somaliland' ? 'somaliland' : String(c.a2 || '').toLowerCase()));
    favState.paises.unshift({
      key: k,
      code: String(code).toUpperCase(),
      id: c.id,
      cont: cont || c.c || 'sul',
      name: countryDisplayName(c, cont),
      flagCode: flagCode
    });
    saveFavorites();
    return true;
  }

  function getOutletFavKey(outletName, outletUrl) {
    var d = host(outletUrl || '').toLowerCase();
    var n = String(outletName || '').trim().toLowerCase();
    return n + '|' + d;
  }

  function isOutletFavorited(outletName, outletUrl) {
    var k = getOutletFavKey(outletName, outletUrl);
    return !!k && favState.veiculos.some(function (v) { return v.key === k; });
  }

  function toggleOutletFavorite(o, cCode, cont, countryNameStr) {
    if (!o || !o.n) return false;
    var k = getOutletFavKey(o.n, o.u);
    var idx = favState.veiculos.findIndex(function (v) { return v.key === k; });
    if (idx > -1) {
      favState.veiculos.splice(idx, 1);
      saveFavorites();
      return false;
    }
    var flagCode = resolveOutletFlagCode(o.n, cCode, o.u);
    favState.veiculos.unshift({
      key: k,
      name: o.n,
      url: o.u,
      domain: host(o.u),
      bias: o.b || 'I',
      ind: !!(o.ind === 1 || o.ind === true),
      st: !!o.st,
      countryCode: String(cCode || flagCode || 'BR').toUpperCase(),
      cont: cont || state.cont || 'sul',
      countryName: countryNameStr || (state.country ? countryDisplayName(state.country, state.cont) : ''),
      flagCode: flagCode || 'br'
    });
    saveFavorites();
    return true;
  }

  var REG_OUTLETS_STORAGE_KEY = 'rom_registered_outlets';

  function saveLocalRegisteredOutlet(record) {
    if (!record || (!record.nome && !record.url)) return;
    try {
      var raw = localStorage.getItem(REG_OUTLETS_STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      list.unshift(record);
      if (list.length > 60) list = list.slice(0, 60);
      localStorage.setItem(REG_OUTLETS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function isOutletUserSuggested(o) {
    if (!o) return false;
    if (o.sug === 1 || o.sug === true || o.indicado === 1 || o.indicado === true || o.indicacao || o.colaborativo || o.cadastrado_por_usuario || (o.n && /trindade/i.test(o.n))) {
      return true;
    }
    try {
      var raw = localStorage.getItem(REG_OUTLETS_STORAGE_KEY);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) {
          var oHost = host(o.u || '').toLowerCase();
          var oName = String(o.n || '').trim().toLowerCase();
          for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item) continue;
            var itemHost = host(item.url || '').toLowerCase();
            var itemName = String(item.nome || '').trim().toLowerCase();
            if ((itemHost && oHost && (itemHost === oHost || oHost.indexOf(itemHost) !== -1 || itemHost.indexOf(oHost) !== -1)) ||
                (itemName && oName && (itemName === oName || oName.indexOf(itemName) !== -1 || itemName.indexOf(oName) !== -1))) {
              return true;
            }
          }
        }
      }
    } catch (e) {}
    return false;
  }

  function getOutletSuggestedTooltip(o) {
    var submitter = (o && (o.indicadoPor || o.sugPor || o.indicado_por || o.autor)) || '';
    if (submitter) {
      return 'Este veículo foi uma indicação cadastrada por ' + submitter + ' através da aba "Cadastrar veículo".';
    }
    try {
      var raw = localStorage.getItem(REG_OUTLETS_STORAGE_KEY);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list)) {
          var oHost = host(o.u || '').toLowerCase();
          var oName = String(o.n || '').trim().toLowerCase();
          for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item) continue;
            var itemHost = host(item.url || '').toLowerCase();
            var itemName = String(item.nome || '').trim().toLowerCase();
            if ((itemHost && oHost && (itemHost === oHost || oHost.indexOf(itemHost) !== -1 || itemHost.indexOf(oHost) !== -1)) ||
                (itemName && oName && (itemName === oName || oName.indexOf(itemName) !== -1 || itemName.indexOf(oName) !== -1))) {
              if (item.solicitante) {
                return 'Este veículo foi uma indicação cadastrada por ' + item.solicitante + ' através da aba "Cadastrar veículo".';
              }
              break;
            }
          }
        }
      }
    } catch (e) {}
    return 'Este veículo foi uma indicação cadastrada por um usuário através da aba "Cadastrar veículo".';
  }

  function getNewsFavKey(url, title) {
    var u = String(url || '').trim();
    var t = String(title || '').trim().toLowerCase();
    return u || t;
  }

  function isNewsFavorited(url, title) {
    var k = getNewsFavKey(url, title);
    return !!k && favState.noticias.some(function (n) { return n.key === k; });
  }

  // Heurística: a notícia está em idioma diferente do português (idioma da interface)?
  function isFavNewsForeign(n) {
    var t = String((n && n.title) || '');
    if (!t.trim()) return false;
    // Alfabetos não latinos (cirílico, árabe, CJK, grego, hebraico etc.)
    if (/[\u0370-\u03FF\u0400-\u052F\u0590-\u06FF\u0900-\u0DFF\u0E00-\u0EFF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(t)) return true;
    var low = ' ' + t.toLowerCase().replace(/[^a-zà-ÿ\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    var ptHits = (low.match(/ (de|do|da|dos|das|em|no|na|nos|nas|para|por|com|que|um|uma|os|as|se|ao|aos|é|não|mais|após|sobre|entre|como) /g) || []).length;
    var otherHits = (low.match(/ (the|of|and|to|in|is|for|on|with|at|by|el|la|los|las|del|y|en|por|une?|les|des|et|du|der|die|das|und|le|il|di|che|per|van|het|een|och|att) /g) || []).length;
    if (/[ãõ]|ç[ãa]o/.test(low) && otherHits < 2) return false;
    if (ptHits > otherHits) return false;
    if (otherHits > 0) return true;
    // Sem pistas no texto: usa o país (lusófonos = nativo)
    return ['BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'].indexOf(String((n && n.countryCode) || '').toUpperCase()) === -1;
  }

  function toggleNewsFavorite(item) {
    if (!item || (!item.url && !item.title)) return false;
    var k = getNewsFavKey(item.url, item.title);
    var idx = favState.noticias.findIndex(function (n) { return n.key === k; });
    if (idx > -1) {
      favState.noticias.splice(idx, 1);
      saveFavorites();
      return false;
    }
    favState.noticias.unshift({
      key: k,
      title: String(item.title || '').trim(),
      url: String(item.url || '').trim(),
      source: String(item.source || '').trim(),
      countryCode: String(item.countryCode || 'BR').toUpperCase(),
      publishedAt: String(item.publishedAt || '')
    });
    saveFavorites();
    return true;
  }

  function renderNewsFavBtn(item) {
    var favOn = isNewsFavorited(item.url, item.title);
    return '<button type="button" class="fav-star-btn fav-news-btn' + (favOn ? ' is-fav' : '') + '" data-fav-news="1"' +
      ' data-news-url="' + esc(item.url || '') + '"' +
      ' data-news-title="' + esc(item.title || '') + '"' +
      ' data-news-source="' + esc(item.source || '') + '"' +
      ' data-news-country="' + esc(item.countryCode || 'BR') + '"' +
      ' data-news-date="' + esc(item.publishedAt || '') + '"' +
      ' aria-pressed="' + favOn + '"' +
      ' title="' + (favOn ? 'Remover notícia dos favoritos' : 'Salvar notícia nos favoritos') + '"' +
      ' aria-label="' + (favOn ? 'Remover notícia dos favoritos' : 'Favoritar notícia') + '">' +
      (favOn ? ICON_STAR_ON : ICON_STAR_OFF) + '</button>';
  }

  function handleNewsFavClick(btn, e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!btn) return;
    var item = {
      url: btn.getAttribute('data-news-url') || '',
      title: btn.getAttribute('data-news-title') || '',
      source: btn.getAttribute('data-news-source') || '',
      countryCode: btn.getAttribute('data-news-country') || 'BR',
      publishedAt: btn.getAttribute('data-news-date') || ''
    };
    var nowFav = toggleNewsFavorite(item);
    var key = getNewsFavKey(item.url, item.title);
    document.querySelectorAll('button[data-fav-news]').forEach(function (otherBtn) {
      var otherUrl = otherBtn.getAttribute('data-news-url') || '';
      var otherTitle = otherBtn.getAttribute('data-news-title') || '';
      if (otherBtn === btn || (key && getNewsFavKey(otherUrl, otherTitle) === key)) {
        otherBtn.classList.toggle('is-fav', nowFav);
        otherBtn.setAttribute('aria-pressed', String(nowFav));
        otherBtn.innerHTML = nowFav ? ICON_STAR_ON : ICON_STAR_OFF;
        otherBtn.title = nowFav ? 'Remover notícia dos favoritos' : 'Salvar notícia nos favoritos';
        otherBtn.setAttribute('aria-label', nowFav ? 'Remover notícia dos favoritos' : 'Favoritar notícia');
      }
    });
    try { btn.blur(); } catch (err) {}
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button[data-fav-news]') : null;
    if (btn) {
      handleNewsFavClick(btn, e);
    }
  });

  function bindNewsFavButtons(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('button[data-fav-news]').forEach(function (btn) {
      if (btn._favNewsBound) return;
      btn._favNewsBound = true;
      btn.addEventListener('click', function (e) {
        handleNewsFavClick(btn, e);
      });
    });
  }

  function syncFavoritesTopCounter() {
    var pill = document.getElementById('fav-count-pill');
    var cPais = document.getElementById('fav-tab-count-paises');
    var cVeic = document.getElementById('fav-tab-count-veiculos');
    var cNot = document.getElementById('fav-tab-count-noticias');
    var total = favState.paises.length + favState.veiculos.length + favState.noticias.length;
    if (pill) {
      pill.textContent = String(total);
      pill.hidden = total === 0;
    }
    if (cPais) cPais.textContent = String(favState.paises.length);
    if (cVeic) cVeic.textContent = String(favState.veiculos.length);
    if (cNot) cNot.textContent = String(favState.noticias.length);
  }

  loadFavorites();

  var translationCache = {};

  function parseClients5Result(j) {
    if (Array.isArray(j)) {
      if (Array.isArray(j[0]) && typeof j[0][0] === 'string') {
        return j[0][0].trim();
      }
      if (typeof j[0] === 'string') {
        return j[0].trim();
      }
    }
    return '';
  }

  function translateSingleTextGoogle(text, targetLang, sourceLang) {
    var clean = String(text || '').trim();
    if (!clean) return Promise.resolve('');
    var lang = targetLang || 'pt';
    var src = sourceLang || 'auto';
    var cacheKey = lang + '::' + clean;
    if (translationCache[cacheKey]) return Promise.resolve(translationCache[cacheKey]);

    // 1. Google Chrome Dict API (clients5): CORS liberado (*), sem captcha gtx e ultrarrápido
    var urlGoogle = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=' +
      encodeURIComponent(src) + '&tl=' + encodeURIComponent(lang) + '&q=' + encodeURIComponent(clean);

    return fetch(urlGoogle)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var out = parseClients5Result(j);
        if (out) {
          translationCache[cacheKey] = out;
          return out;
        }
        throw new Error('Falha clients5');
      })
      .catch(function () {
        // 2. Fallback MyMemory Translation API (CORS liberado, estável em conexões móveis)
        var urlMm = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(clean) +
          '&langpair=' + encodeURIComponent(src === 'auto' ? 'autodetect' : src) + '|' + encodeURIComponent(lang);
        return fetch(urlMm)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (j && j.responseData && j.responseData.translatedText) {
              var tr = String(j.responseData.translatedText).trim();
              if (tr && tr !== clean) {
                translationCache[cacheKey] = tr;
                return tr;
              }
            }
            return clean;
          })
          .catch(function () {
            return clean;
          });
      });
  }

  function translateTextsMap(itemsMap, targetLang) {
    var lang = targetLang || 'pt';
    var keys = Object.keys(itemsMap || {});
    if (!keys.length) return Promise.resolve({});
    var result = {};
    var pending = {};
    keys.forEach(function (k) {
      var val = String(itemsMap[k] || '').trim();
      if (!val) {
        result[k] = '';
        return;
      }
      var ck = lang + '::' + val;
      if (translationCache[ck]) {
        result[k] = translationCache[ck];
      } else {
        pending[k] = val;
      }
    });

    var pendingKeys = Object.keys(pending);
    if (!pendingKeys.length) return Promise.resolve(result);

    // Passo 1: Tenta o endpoint backend /api/traduzir (POST)
    // Evita limites de URL GET e executa sem bloqueios de rede móvel/operadora
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 7000) : null;
    return fetch('/api/traduzir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: lang, itens: pending }),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (data && data.itens && typeof data.itens === 'object') {
          var serverItens = data.itens;
          var algumAlterado = false;
          pendingKeys.forEach(function (k) {
            var tr = serverItens[k];
            if (tr && typeof tr === 'string') {
              var trTrim = tr.trim();
              if (trTrim && trTrim !== pending[k]) {
                translationCache[lang + '::' + pending[k]] = trTrim;
                result[k] = trTrim;
                algumAlterado = true;
              }
            }
          });
          if (algumAlterado) return result;
        }
        throw new Error('Retorno sem tradução da api');
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        // Passo 2: Fallback no cliente via clients5 e MyMemory com concorrência controlada
        var BATCH = 4;
        var seq = Promise.resolve();
        for (var i = 0; i < pendingKeys.length; i += BATCH) {
          (function (sliceKeys) {
            seq = seq.then(function () {
              return Promise.all(sliceKeys.map(function (k) {
                return translateSingleTextGoogle(pending[k], lang).then(function (tr) {
                  result[k] = tr || pending[k];
                });
              }));
            });
          })(pendingKeys.slice(i, i + BATCH));
        }
        return seq.then(function () { return result; });
      });
  }

  function translateCardsList(cards, targetLang) {
    var payload = {};
    var cardMeta = [];
    cards.forEach(function (card, idx) {
      var titleLink = card.querySelector('.topic-news-title a');
      var descEl = card.querySelector('.topic-news-desc');
      var origTitle = titleLink ? (titleLink.getAttribute('data-orig-text') || titleLink.textContent || '').trim() : '';
      var origDesc = descEl ? (descEl.getAttribute('data-orig-text') || descEl.textContent || '').trim() : '';
      if (titleLink && !titleLink.getAttribute('data-orig-text')) {
        titleLink.setAttribute('data-orig-text', origTitle);
      }
      if (descEl && !descEl.getAttribute('data-orig-text')) {
        descEl.setAttribute('data-orig-text', origDesc);
      }
      var tk = 't_' + idx;
      var dk = 'd_' + idx;
      if (origTitle) payload[tk] = origTitle;
      if (origDesc) payload[dk] = origDesc;
      cardMeta.push({ card: card, titleLink: titleLink, descEl: descEl, tk: tk, dk: dk, origTitle: origTitle, origDesc: origDesc });
    });

    return translateTextsMap(payload, targetLang || 'pt').then(function (translated) {
      var anySuccess = false;
      cardMeta.forEach(function (m) {
        var trTitle = translated[m.tk];
        var trDesc = translated[m.dk];
        var mudou = false;
        if (m.titleLink && trTitle) {
          m.titleLink.textContent = trTitle;
          if (trTitle !== m.origTitle) mudou = true;
        }
        if (m.descEl && trDesc) {
          m.descEl.textContent = trDesc;
          if (trDesc !== m.origDesc) mudou = true;
        }
        if (mudou || (trTitle && m.origTitle)) {
          m.card.setAttribute('data-translated', 'true');
          m.card.classList.add('is-translated');
          var btn = m.card.querySelector('[data-translate-card]');
          if (btn) {
            btn.disabled = false;
            btn.setAttribute('aria-pressed', 'true');
            var sp = btn.querySelector('span');
            if (sp) sp.textContent = 'Ver original';
          }
          if (mudou) anySuccess = true;
        }
      });
      if (!anySuccess && cardMeta.length > 0) {
        throw new Error('Falha na tradução');
      }
      return anySuccess;
    });
  }

  function restoreCardOriginal(card) {
    var titleLink = card.querySelector('.topic-news-title a');
    var descEl = card.querySelector('.topic-news-desc');
    if (titleLink && titleLink.getAttribute('data-orig-text')) {
      titleLink.textContent = titleLink.getAttribute('data-orig-text');
    }
    if (descEl && descEl.getAttribute('data-orig-text')) {
      descEl.textContent = descEl.getAttribute('data-orig-text');
    }
    card.removeAttribute('data-translated');
    card.classList.remove('is-translated');
    var btn = card.querySelector('[data-translate-card]');
    if (btn) {
      btn.disabled = false;
      btn.setAttribute('aria-pressed', 'false');
      var sp = btn.querySelector('span');
      if (sp) sp.textContent = 'Traduzir';
    }
  }

  function syncTranslateAllButton(containerEl) {
    if (!containerEl) return;
    var allBtn = containerEl.querySelector('[data-translate-all]');
    if (!allBtn) return;
    var cards = Array.prototype.slice.call(containerEl.querySelectorAll('.topic-news-card'));
    if (!cards.length) return;
    var allTranslated = cards.every(function (c) { return c.getAttribute('data-translated') === 'true'; });
    allBtn.disabled = false;
    allBtn.setAttribute('aria-pressed', String(allTranslated));
    var sp = allBtn.querySelector('span');
    if (sp) sp.textContent = allTranslated ? 'Ver original de todas' : 'Traduzir todas';
  }

  function bindCardTranslations(containerEl) {
    if (!containerEl) return;
    containerEl.querySelectorAll('[data-translate-card]').forEach(function (btn) {
      if (btn._trBound) return;
      btn._trBound = true;
      btn.addEventListener('click', function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        var card = btn.closest('.topic-news-card');
        if (!card) return;
        if (card.getAttribute('data-translated') === 'true') {
          restoreCardOriginal(card);
          syncTranslateAllButton(containerEl);
          return;
        }
        btn.disabled = true;
        var sp = btn.querySelector('span');
        if (sp) sp.textContent = 'Traduzindo…';
        translateCardsList([card], 'pt')
          .then(function () {
            syncTranslateAllButton(containerEl);
          })
          .catch(function () {
            btn.disabled = false;
            if (sp) sp.textContent = 'Erro ao traduzir';
            setTimeout(function () {
              if (card.getAttribute('data-translated') !== 'true' && sp) {
                sp.textContent = 'Traduzir';
              }
            }, 2200);
          });
      });
    });

    var allBtn = containerEl.querySelector('[data-translate-all]');
    if (allBtn && !allBtn._trAllBound) {
      allBtn._trAllBound = true;
      allBtn.addEventListener('click', function (e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        var cards = Array.prototype.slice.call(containerEl.querySelectorAll('.topic-news-card'));
        if (!cards.length) return;
        var allTranslated = cards.every(function (c) { return c.getAttribute('data-translated') === 'true'; });
        if (allTranslated) {
          cards.forEach(restoreCardOriginal);
          syncTranslateAllButton(containerEl);
          return;
        }
        var untranslated = cards.filter(function (c) { return c.getAttribute('data-translated') !== 'true'; });
        allBtn.disabled = true;
        var sp = allBtn.querySelector('span');
        if (sp) sp.textContent = 'Traduzindo…';
        translateCardsList(untranslated, 'pt')
          .then(function () {
            syncTranslateAllButton(containerEl);
          })
          .catch(function () {
            allBtn.disabled = false;
            if (sp) sp.textContent = 'Erro ao traduzir';
            setTimeout(function () {
              syncTranslateAllButton(containerEl);
            }, 2200);
          });
      });
    }
  }

  var SUGGESTION_POOLS = {
    general: [
      'Geopolítica Global', 'Inflação e Juros', 'Eleições', 'Transição Energética', 'Inteligência Artificial',
      'Comércio Internacional', 'Defesa e Segurança', 'Mercado Financeiro', 'Saúde Pública', 'Mudanças Climáticas'
    ],
    byTopic: {
      politica: [
        'Eleições e Pesquisas', 'Governo e Coalizão', 'Parlamento e Votações', 'Suprema Corte',
        'Reformas Políticas', 'Oposição', 'Políticas Públicas', 'Transparência e Justiça', 'Diplomacia de Estado'
      ],
      economia: [
        'Taxa de Juros e Inflação', 'Crescimento do PIB', 'Câmbio e Moeda', 'Balança Comercial',
        'Mercado de Trabalho', 'Bolsa de Valores', 'Política Fiscal e Orçamento', 'Investimento Estrangeiro', 'Energia e Commodities'
      ],
      tecnologia: [
        'Inteligência Artificial', 'Semicondutores e Chips', 'Cibersegurança', 'Regulação das Big Techs',
        'Computação Quântica', 'Startups e Inovação', 'Redes 5G e Satélites', 'Proteção de Dados', 'Robótica e Automação'
      ],
      cultura: [
        'Cinema e Premiações', 'Música e Turnês', 'Literatura Contemporânea', 'Festivais Internacionais',
        'Artes Visuais e Museus', 'Produções em Streaming', 'Patrimônio Histórico', 'Teatro e Espetáculos', 'Gastronomia e Sociedade'
      ],
      mundo: [
        'Geopolítica e Alianças', 'Acordos Comerciais', 'Conflitos e Diplomacia', 'Sanções Internacionais',
        'Cúpulas Globais e ONU', 'Segurança de Fronteiras', 'Defesa e OTAN', 'Crise Migratória', 'Cooperação Internacional'
      ],
      esportes: [
        'Futebol e Ligas Nacionais', 'Copa do Mundo', 'Jogos Olímpicos', 'Fórmula 1',
        'Liga dos Campeões', 'Basquete e NBA', 'Tênis e Grand Slams', 'Mercado da Bola', 'Esportes Olímpicos'
      ],
      saude: [
        'Saúde Pública e Hospitais', 'Vacinas e Imunização', 'Pesquisa Biomédica', 'Saúde Mental',
        'Novos Medicamentos', 'Vigilância Epidemiológica', 'Longevidade e Nutrição', 'Biotecnologia', 'Diretrizes da OMS'
      ]
    },
    byCont: {
      africa: ['Comércio Livre Africano', 'Transição Energética', 'Infraestrutura e Portos', 'Mineração Estratégica', 'Segurança no Sahel', 'Crescimento Demográfico', 'Inovação Digital'],
      sul: ['Acordo Mercosul-UE', 'Transição Energética', 'Amazônia e Clima', 'Inflação e Juros', 'Integração Regional', 'Lítio e Minerais Críticos', 'Agronegócio e Exportações'],
      central: ['Canal do Panamá', 'Turismo no Caribe', 'Remessas e Economia', 'Segurança Regional', 'Resiliência Climática', 'Comércio Marítimo'],
      norte: ['Acordo USMCA', 'Juros do Federal Reserve', 'Fronteira e Imigração', 'Tarifas Comerciais', 'Big Techs e IA', 'Indústria Automotiva', 'Eleições e Congresso'],
      europa: ['União Europeia', 'Guerra na Ucrânia', 'Defesa e OTAN', 'Banco Central Europeu', 'Transição Verde', 'Política Migratória', 'Segurança Energética'],
      asia: ['Semicondutores e IA', 'Cadeias de Suprimentos', 'Mar do Sul da China', 'Crescimento Econômico', 'Comércio no Indo-Pacífico', 'Veículos Elétricos', 'Diplomacia Asiática'],
      oceania: ['Geopolítica do Pacífico', 'Mudanças Climáticas', 'Comércio com a Ásia', 'Energias Renováveis', 'Mineração e Recursos', 'Habitação e Custo de Vida']
    },
    byCountryTopic: {
      US: {
        politica: ['Casa Branca e Trump', 'Congresso e Senado dos EUA', 'Suprema Corte dos EUA', 'Imigração e Fronteira Sul', 'Partidos Democrata e Republicano', 'Departamento de Justiça'],
        economia: ['Federal Reserve e Juros', 'Inflação e Emprego nos EUA', 'Tarifas e Guerra Comercial', 'Wall Street e S&P 500', 'Dívida Pública e Orçamento', 'Dólar e Tesouro Americano'],
        tecnologia: ['Inteligência Artificial no Vale do Silício', 'Semicondutores e CHIPS Act', 'Regulação das Big Techs', 'OpenAI, Google e Meta', 'Exploração Espacial e NASA', 'Cibersegurança nos EUA'],
        cultura: ['Hollywood e Oscar', 'Indústria Musical e Grammy', 'Streaming e Séries nos EUA', 'Broadway e Artes', 'Literatura e Best-sellers', 'Museus e Cultura Pop'],
        mundo: ['Política Externa dos EUA', 'Relações EUA e China', 'EUA, OTAN e Ucrânia', 'Diplomacia no Oriente Médio', 'Sanções e Segurança Global', 'Acordos com América Latina'],
        esportes: ['NFL e Super Bowl', 'NBA e Basquete Americano', 'Copa do Mundo nos EUA', 'MLB e Beisebol', 'Fórmula 1 nos EUA', 'Atletismo e Olimpíadas'],
        saude: ['FDA e Novos Medicamentos', 'Sistema de Saúde e Medicare', 'Pesquisa Biomédica e NIH', 'Saúde Mental nos EUA', 'Biotecnologia e Vacinas', 'Custos Hospitalares']
      },
      BR: {
        politica: ['Governo Lula e Planalto', 'Congresso Nacional', 'Supremo Tribunal Federal', 'Eleições e Partidos', 'Câmara e Senado', 'Polícia Federal e Justiça'],
        economia: ['Taxa Selic e Banco Central', 'Inflação e IPCA', 'Arcabouço Fiscal e Orçamento', 'Reforma Tributária', 'Dólar e Ibovespa', 'Petrobras e Agronegócio'],
        tecnologia: ['Inteligência Artificial no Brasil', 'Pix e Finanças Digitais', 'Cibersegurança e LGPD', 'Startups Brasileiras', 'Conectividade e 5G', 'Ciência e Inovação'],
        cultura: ['Cinema Brasileiro', 'Música e Grandes Festivais', 'Literatura e Bienal do Livro', 'Carnaval e Patrimônio Cultural', 'Teatro e Exposições', 'Audiovisual e Streaming'],
        mundo: ['Diplomacia do Itamaraty', 'Brasil no BRICS e G20', 'Acordo Mercosul e União Europeia', 'Amazônia e Clima Global', 'Relações Brasil-EUA e China', 'Comércio Exterior'],
        esportes: ['Campeonato Brasileiro', 'Copa Libertadores', 'Seleção Brasileira', 'Fórmula 1 e Interlagos', 'Vôlei e Esporte Olímpico', 'Mercado da Bola'],
        saude: ['SUS e Saúde Pública', 'Campanhas de Vacinação', 'Anvisa e Medicamentos', 'Combate à Dengue', 'Saúde Mental no Brasil', 'Pesquisa na Fiocruz e Butantan']
      },
      PT: {
        politica: ['Governo de Portugal', 'Assembleia da República', 'Presidência da República', 'Políticas de Imigração', 'Autárquicas e Partidos', 'Justiça em Portugal'],
        economia: ['Orçamento do Estado', 'Crise da Habitação', 'Inflação e Salários', 'Fundos Europeus e PRR', 'Turismo e Exportações', 'Banca e Juros'],
        tecnologia: ['Web Summit Lisboa', 'Startups e Unicórnios', 'Transição Digital', 'Inteligência Artificial', 'Cibersegurança', 'Energias Renováveis'],
        cultura: ['Literatura Lusófona', 'Cinema Português', 'Fado e Festivais de Música', 'Museus e Patrimônio', 'Teatro e Artes', 'Gastronomia Portuguesa'],
        mundo: ['Portugal na União Europeia', 'Comunidade Lusófona (CPLP)', 'Aliança Atlântica e OTAN', 'Diplomacia Europeia', 'Acordos Internacionais'],
        esportes: ['Primeira Liga de Futebol', 'Seleção Portuguesa', 'Benfica, Porto e Sporting', 'Liga dos Campeões', 'Modalidades Olímpicas'],
        saude: ['Serviço Nacional de Saúde (SNS)', 'Urgências Hospitalares', 'Médicos de Família', 'Envelhecimento e Cuidados', 'Investigação Médica']
      },
      AR: {
        politica: ['Governo Javier Milei', 'Congresso da Argentina', 'Reformas de Estado', 'Suprema Corte Argentina', 'Governadores e Províncias'],
        economia: ['Inflação e Preços na Argentina', 'Dólar Blue e Câmbio', 'Acordo com o FMI', 'Superávit Fiscal', 'Exportações do Agro e Vaca Muerta'],
        tecnologia: ['Setor Tecnológico Argentino', 'Fintechs e Economia Digital', 'Inteligência Artificial', 'Satélites e Ciência'],
        cultura: ['Cinema Argentino', 'Feira do Livro de Buenos Aires', 'Música e Teatro', 'Turismo e Gastronomia'],
        mundo: ['Argentina no Mercosul', 'Relações com EUA e Brasil', 'Comércio Exterior Argentino', 'Geopolítica do Atlântico Sul'],
        esportes: ['Seleção Argentina de Futebol', 'Campeonato Argentino', 'Copa Libertadores', 'Tênis e Automobilismo'],
        saude: ['Sistema de Saúde Argentino', 'Preços de Medicamentos', 'Hospitais Públicos', 'Prevenção e Vacinas']
      },
      GB: {
        politica: ['Governo Keir Starmer', 'Parlamento Britânico', 'Partidos Trabalhista e Conservador', 'Imigração e Canal da Mancha', 'Escócia e Irlanda do Norte'],
        economia: ['Banco da Inglaterra e Juros', 'Inflação e Custo de Vida no Reino Unido', 'City de Londres e Finanças', 'Crescimento do PIB Britânico', 'Comércio Pós-Brexit'],
        tecnologia: ['Segurança em IA no Reino Unido', 'Fintechs e Inovação em Londres', 'Cibersegurança Britânica', 'Ciência em Oxford e Cambridge'],
        cultura: ['Cinema Britânico e BAFTA', 'Música e Glastonbury', 'Literatura e Booker Prize', 'Museus de Londres'],
        mundo: ['Reino Unido e União Europeia', 'Apoio Militar à Ucrânia', 'Aliança com os EUA', 'Commonwealth e Diplomacia'],
        esportes: ['Premier League', 'Seleção Inglesa', 'Fórmula 1 Britânica', 'Tênis em Wimbledon', 'Rugby e Críquete'],
        saude: ['Sistema Público NHS', 'Pesquisa Farmacêutica', 'Hospitais no Reino Unido', 'Saúde Mental e Bem-estar']
      },
      FR: {
        politica: ['Governo Macron', 'Assembleia Nacional Francesa', 'Reformas e Protestos', 'Eleições na França', 'Debate Migratório'],
        economia: ['Orçamento e Dívida da França', 'Inflação e Consumo', 'Indústria e Energia Nuclear', 'Bolsa de Paris (CAC 40)', 'Agricultura Francesa'],
        tecnologia: ['IA e Startups em Paris', 'Regulação Digital Europeia', 'Setor Aeroespacial', 'Transição Energética'],
        cultura: ['Festival de Cannes', 'Museu do Louvre e Artes', 'Literatura Francesa', 'Gastronomia e Moda em Paris'],
        mundo: ['Liderança na União Europeia', 'Diplomacia Francesa e OTAN', 'Relações com a África', 'Defesa Europeia'],
        esportes: ['Ligue 1 e Futebol Francês', 'Tour de France', 'Roland Garros', 'Seleção Francesa'],
        saude: ['Sistema de Saúde Francês', 'Pesquisa Médica', 'Políticas de Bem-estar', 'Indústria Farmacêutica']
      },
      DE: {
        politica: ['Governo Federal Alemão', 'Bundestag e Coalizões', 'Política Migratória Alemã', 'Eleições na Alemanha'],
        economia: ['Indústria Automotiva Alemã', 'Inflação e Energia na Alemanha', 'PIB e Exportações Alemãs', 'Banco Central Europeu em Frankfurt'],
        tecnologia: ['Engenharia e Indústria 4.0', 'Transição Energética (Energiewende)', 'IA e Pesquisa na Alemanha', 'Cibersegurança'],
        cultura: ['Festival de Berlim (Berlinale)', 'Feira do Livro de Frankfurt', 'Música e Museus Alemães', 'Arquitetura e Artes'],
        mundo: ['Alemanha na União Europeia', 'Defesa Alemã e OTAN', 'Apoio à Ucrânia', 'Relações Comerciais com a China'],
        esportes: ['Bundesliga', 'Seleção Alemã de Futebol', 'Esportes de Inverno', 'Automobilismo'],
        saude: ['Sistema de Saúde Alemão', 'Biotecnologia e Farmacêuticas', 'Hospitais e Demografia']
      },
      ES: {
        politica: ['Governo Pedro Sánchez', 'Congresso dos Deputados', 'Catalunha e Autonomias', 'Justiça e Partidos na Espanha'],
        economia: ['Crescimento Econômico Espanhol', 'Crise de Habitação e Aluguéis', 'Turismo Recorde e Emprego', 'Inflação e Energia'],
        tecnologia: ['Mobile World Congress Barcelona', 'Hubs Digitais em Madri', 'Energia Solar e Eólica', 'Inovação e Startups'],
        cultura: ['Cinema Espanhol e Prêmios Goya', 'Museu do Prado e Artes', 'Literatura em Espanhol', 'Gastronomia e Festivais'],
        mundo: ['Espanha na União Europeia', 'Relações com a América Latina', 'Mediterrâneo e Marrocos', 'OTAN e Defesa'],
        esportes: ['La Liga (Real Madrid e Barcelona)', 'Seleção Espanhola', 'Tênis e Carlos Alcaraz', 'Fórmula 1 e MotoGP'],
        saude: ['Sanidad Pública na Espanha', 'Longevidade e Nutrição Mediterrânea', 'Pesquisa Médica']
      },
      IT: {
        politica: ['Governo Giorgia Meloni', 'Parlamento Italiano', 'Políticas de Imigração no Mediterrâneo', 'Reformas Constitucionais'],
        economia: ['PIB e Indústria Italiana', 'Dívida Pública e Orçamento', 'Turismo e Exportações Made in Italy', 'Energia e Bancos'],
        tecnologia: ['Manufatura Avançada e Robótica', 'Transição Digital na Itália', 'Aeroespacial e Ciência'],
        cultura: ['Festival de Veneza', 'Patrimônio Histórico e Roma', 'Moda e Design em Milão', 'Gastronomia Italiana'],
        mundo: ['Itália no G7 e União Europeia', 'Geopolítica do Mediterrâneo', 'Relações com os EUA e África'],
        esportes: ['Serie A Italiana', 'Seleção Italiana', 'Ferrari e Fórmula 1', 'Ciclismo e Tênis'],
        saude: ['Serviço Nacional de Saúde Italiano', 'Demografia e Longevidade', 'Pesquisa Biomédica']
      },
      CN: {
        politica: ['Governo Xi Jinping', 'Partido Comunista da China', 'Diretrizes de Pequim', 'Segurança Nacional'],
        economia: ['Crescimento do PIB da China', 'Exportações e Manufatura', 'Setor Imobiliário Chinês', 'Estímulos Econômicos e Consumo'],
        tecnologia: ['Semicondutores e IA na China', 'Veículos Elétricos e Baterias', 'Programa Espacial Chinês', '5G e Supercomputadores'],
        cultura: ['Cinema e Cultura Chinesa', 'Patrimônio Milenar', 'Turismo Interno na China'],
        mundo: ['Relações China e Estados Unidos', 'Taiwan e Mar do Sul da China', 'Nova Rota da Seda e BRICS', 'Comércio com o Brasil e Europa'],
        esportes: ['Esporte Olímpico Chinês', 'Basquete e Futebol na China', 'Grandes Eventos Asiáticos'],
        saude: ['Saúde Pública na China', 'Biotecnologia e Hospitais', 'Envelhecimento Populacional']
      }
    },
    byCountry: {
      BR: [
        'Lula', 'Governo Federal', 'Congresso', 'STF', 'Inflação', 'Juros', 'Dólar', 'Petrobras',
        'Reforma Tributária', 'Bolsonaro', 'Eleições', 'Polícia Federal', 'Tarcísio', 'Fazenda',
        'Segurança', 'Educação', 'Saúde', 'Amazônia', 'Câmara dos Deputados', 'Senado'
      ],
      US: [
        'Trump', 'Casa Branca', 'Congresso', 'Tarifas', 'Federal Reserve', 'Imigração', 'Suprema Corte',
        'Wall Street', 'Inteligência Artificial', 'Inflação nos EUA', 'Política Externa', 'China e EUA'
      ],
      PT: [
        'Governo', 'Parlamento', 'Habitação', 'Economia', 'Saúde', 'Imigração', 'Orçamento',
        'União Europeia', 'Inflação', 'Salários', 'Eleições'
      ],
      AR: [
        'Milei', 'Inflação', 'Dólar', 'Economia', 'Congresso', 'FMI', 'Exportações', 'Salários', 'Reformas'
      ],
      FR: [
        'Macron', 'Governo', 'Parlamento', 'Orçamento', 'União Europeia', 'Economia', 'Imigração', 'Defesa', 'Eleições'
      ],
      DE: [
        'Governo Alemão', 'Bundestag', 'Indústria', 'Energia', 'União Europeia', 'Inflação', 'Defesa', 'Eleições'
      ],
      GB: [
        'Starmer', 'Governo', 'Economia', 'NHS', 'Inflação', 'Imigração', 'Juros', 'Orçamento', 'Eleições'
      ],
      IT: [
        'Meloni', 'Governo', 'Economia', 'União Europeia', 'Imigração', 'Turismo', 'Inflação'
      ],
      ES: [
        'Pedro Sánchez', 'Governo', 'Economia', 'Habitação', 'Turismo', 'União Europeia', 'Inflação'
      ],
      UY: [
        'Governo', 'Eleições', 'Economia', 'Mercosul', 'Inflação', 'Dólar', 'Educação'
      ],
      CL: [
        'Boric', 'Governo', 'Economia', 'Mineração', 'Cobre', 'Inflação', 'Constituição', 'Segurança'
      ],
      CO: [
        'Petro', 'Governo', 'Congresso', 'Economia', 'Paz', 'Petróleo', 'Inflação', 'Segurança'
      ],
      PE: [
        'Governo', 'Congresso', 'Economia', 'Mineração', 'Lima', 'Justiça', 'Eleições'
      ],
      VE: [
        'Maduro', 'Governo', 'Petróleo', 'Eleições', 'Economia', 'Oposição', 'Sanções'
      ],
      MX: [
        'Sheinbaum', 'Governo', 'Economia', 'Comércio', 'Estados Unidos', 'Fronteira', 'Inflação', 'Segurança'
      ],
      CA: [
        'Governo Canadense', 'Parlamento', 'Economia', 'Habitação', 'Imigração', 'Comércio'
      ],
      AO: [
        'Petróleo', 'Governo', 'Economia', 'Infraestrutura', 'Comércio', 'Diversificação', 'Luanda'
      ],
      MZ: [
        'Governo', 'Economia', 'Gás Natural', 'Infraestrutura', 'Comércio', 'Eleições', 'Maputo'
      ],
      CN: [
        'Xi Jinping', 'Economia', 'Comércio', 'Tecnologia', 'Crescimento', 'Exportações', 'Veículos Elétricos'
      ],
      JP: [
        'Iene', 'Economia', 'Tecnologia', 'Governo', 'Defesa', 'Inflação', 'Comércio'
      ],
      IN: [
        'Modi', 'Economia', 'Crescimento', 'Tecnologia', 'Infraestrutura', 'Comércio', 'Manufatura'
      ],
      RU: [
        'Putin', 'Kremlin', 'Guerra', 'Economia', 'Sanções', 'Petróleo', 'Ucrânia', 'Diplomacia'
      ],
      UA: [
        'Zelensky', 'Guerra', 'Defesa', 'Rússia', 'Ajuda Militar', 'União Europeia', 'Paz'
      ],
      IL: [
        'Netanyahu', 'Guerra', 'Governo', 'Gaza', 'Cessar-fogo', 'Segurança', 'Defesa'
      ],
      PL: [
        'Tusk', 'Governo', 'Defesa', 'Ucrânia', 'União Europeia', 'Economia', 'Segurança'
      ],
      NL: [
        'Governo', 'União Europeia', 'Economia', 'Habitação', 'Agricultura', 'Imigração'
      ],
      BE: [
        'Governo', 'União Europeia', 'Economia', 'Bruxelas', 'Orçamento'
      ],
      CH: [
        'Governo', 'Economia', 'Bancos', 'Inflação', 'Franco Suíço', 'Neutralidade'
      ],
      SE: [
        'Governo', 'OTAN', 'Defesa', 'Economia', 'Imigração', 'Segurança'
      ],
      NO: [
        'Governo', 'Petróleo', 'Energia', 'Fundo Soberano', 'Economia'
      ],
      TR: [
        'Erdogan', 'Governo', 'Economia', 'Inflação', 'Geopolítica', 'Diplomacia'
      ],
      SA: [
        'Petróleo', 'Economia', 'Visão 2030', 'Diplomacia', 'Energia', 'Oriente Médio'
      ],
      IR: [
        'Governo', 'Nuclear', 'Sanções', 'Oriente Médio', 'Diplomacia', 'Economia'
      ],
      KR: [
        'Presidente', 'Economia', 'Tecnologia', 'Semicondutores', 'Coreia do Norte', 'Comércio'
      ],
      TW: [
        'Presidente', 'Semicondutores', 'China', 'Tecnologia', 'Defesa', 'Comércio'
      ],
      ID: [
        'Prabowo', 'Governo', 'Economia', 'Crescimento', 'Infraestrutura', 'Comércio'
      ],
      AU: [
        'Governo', 'Parlamento', 'Economia', 'Habitação', 'Clima', 'Comércio', 'Mineração'
      ],
      NZ: [
        'Governo', 'Economia', 'Habitação', 'Comércio', 'Agricultura', 'Inflação'
      ]
    }
  };

  var suggestionSeedOffset = 0;
  var liveTrendingByCountry = {};

  function isValidNewsImageUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    var s = rawUrl.trim();
    if (!s || /^(null|undefined|none|false)$/i.test(s) || s.indexOf('data:') === 0) return '';
    var lower = s.toLowerCase();
    if (
      lower.indexOf('j6_cofbogxhri9im864nl_ligxvsqp2aupskei7z0cnnfdvgumwuy20nuhkreqyrpy4beeibuc') > -1 ||
      lower.indexOf('news.google.com/') > -1 ||
      lower.indexOf('/favicon') > -1 ||
      lower.indexOf('1x1.') > -1 ||
      lower.indexOf('pixel.') > -1 ||
      lower.indexOf('spacer.') > -1
    ) {
      return '';
    }
    if (s.indexOf('//') === 0) s = 'https:' + s;
    if (s.indexOf('http://') === 0) s = 'https://' + s.slice(7);
    return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
  }

  function getLiveCountryHeadlinesPool(cCode) {
    var a2 = String(cCode || '').toUpperCase();
    var titles = [];
    if (!a2) return titles;
    try {
      var cObj = byA2 && byA2[a2];
      var cMed = cObj ? countryMedia(cObj, cObj.c) : (DATA && DATA.media ? DATA.media[a2] : null);
      if (cMed && Array.isArray(cMed.outlets)) {
        cMed.outlets.forEach(function (o) {
          var dom = siteScope(o.u);
          var cached = outletRotatorCache[dom + '|' + (state.topic || 'all')] || outletRotatorCache[dom + '|all'];
          if (Array.isArray(cached)) {
            cached.forEach(function (art) {
              if (art && art.titulo) titles.push(art);
            });
          }
        });
      }
    } catch (e) {}
    return titles;
  }

  function termHasMatchInLoadedCountryNews(term, loadedArticles, hotItem) {
    var tNorm = norm(term);
    if (!tNorm || tNorm.length < 3) return false;
    var tokens = tNorm.split(/\s+/).filter(function (w) { return w.length >= 3 && !STOPWORDS_BUSCA[w]; });
    if (!tokens.length) return false;
    if (hotItem && hotItem.title) {
      var hNorm = norm(hotItem.title + ' ' + (hotItem.summary || ''));
      if (tokens.some(function (tk) { return hNorm.indexOf(tk) > -1; })) return true;
    }
    for (var i = 0; i < loadedArticles.length; i++) {
      var aNorm = norm(loadedArticles[i].titulo || '');
      if (tokens.some(function (tk) { return aNorm.indexOf(tk) > -1; })) return true;
    }
    return false;
  }

  function sincronizarPoolsComEditorial() {
    if (!window.ROM_EDITORIAL || !window.ROM_EDITORIAL.assuntos) return;
    try {
      var assMap = window.ROM_EDITORIAL.assuntos;
      Object.keys(assMap).forEach(function (k) {
        var as = assMap[k];
        if (as && as.pais && Array.isArray(as.palavrasChave)) {
          var cCode = String(as.pais).toUpperCase();
          if (!SUGGESTION_POOLS.byCountry[cCode]) SUGGESTION_POOLS.byCountry[cCode] = [];
          var pool = SUGGESTION_POOLS.byCountry[cCode];
          var seen = {};
          pool.forEach(function (t) { seen[norm(t)] = true; });
          as.palavrasChave.forEach(function (kw) {
            var n = norm(kw);
            if (kw.length >= 3 && !seen[n] && !STOPWORDS_BUSCA[n]) {
              seen[n] = true;
              var formatada = kw.charAt(0).toUpperCase() + kw.slice(1);
              pool.push(formatada);
            }
          });
        }
      });
    } catch (e) {}
  }

  function carregarTopicosDinamicosSalvos(cCode) {
    if (!cCode) return;
    try {
      var a2 = String(cCode).toUpperCase();
      var raw = localStorage.getItem('rdm_dinamicos_' + a2);
      if (raw) {
        var list = JSON.parse(raw);
        if (Array.isArray(list) && list.length) {
          incorporarTopicosEmAlta(a2, list, true);
        }
      }
    } catch (e) {}
  }

  function incorporarTopicosEmAlta(cCode, novosTopicos, semSalvar) {
    if (!cCode || !Array.isArray(novosTopicos) || !novosTopicos.length) return;
    var a2 = String(cCode).toUpperCase();
    if (!SUGGESTION_POOLS.byCountry[a2]) {
      SUGGESTION_POOLS.byCountry[a2] = [];
    }
    var pool = SUGGESTION_POOLS.byCountry[a2];
    var seen = {};
    pool.forEach(function (t) { seen[norm(t)] = true; });

    var adicionados = [];
    novosTopicos.forEach(function (topico) {
      var limpo = String(topico || '').trim();
      var k = norm(limpo);
      if (limpo && limpo.length >= 3 && !seen[k]) {
        seen[k] = true;
        adicionados.push(limpo);
        pool.unshift(limpo); // Tópicos do momento entram no topo
      }
    });

    if (adicionados.length > 0 && !semSalvar) {
      try {
        var paraSalvar = pool.slice(0, 15);
        localStorage.setItem('rdm_dinamicos_' + a2, JSON.stringify(paraSalvar));
      } catch (e) {}
    }
  }

  function buscarTopicosEmAltaAoVivo(cCode, lang, outlets) {
    if (!cCode) return;
    var a2 = String(cCode).toUpperCase();
    var chaveCache = 'rdm_trending_ts_' + a2;
    var agora = Date.now();
    var ultimoFetch = 0;
    try {
      ultimoFetch = Number(sessionStorage.getItem(chaveCache) || 0);
    } catch (e) {}

    // Evita chamadas repetidas na mesma sessão se foi consultado nos últimos 3 minutos
    if (agora - ultimoFetch < 3 * 60 * 1000) return;

    try {
      sessionStorage.setItem(chaveCache, String(agora));
    } catch (e) {}

    var url = '/api/busca-assunto?mode=trending&country=' + encodeURIComponent(a2) + '&lang=' + encodeURIComponent(lang || 'pt');
    if (Array.isArray(outlets) && outlets.length) {
      url += '&outlets=' + encodeURIComponent(JSON.stringify(outlets.slice(0, 8)));
    }

    var doFetch = function (endpoint) {
      return fetch(endpoint, { headers: { Accept: 'application/json' } });
    };

    doFetch(url)
      .then(function (r) {
        if (!r.ok && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          return doFetch('https://www.rodandoomundo.com.br' + url);
        }
        return r;
      })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.topicosEmAlta) && data.topicosEmAlta.length) {
          liveTrendingByCountry[a2] = data.topicosEmAlta.slice();
          incorporarTopicosEmAlta(a2, data.topicosEmAlta);
          refreshQuickSuggestionsUI();
        }
      })
      .catch(function () {});
  }

  function extrairTopicosEmAltaClient(grupos, termoAtual) {
    if (!Array.isArray(grupos) || !grupos.length) return [];
    var contagem = {};
    var formas = {};
    var tNorm = norm(String(termoAtual || ''));

    grupos.forEach(function (g) {
      (g.artigos || []).forEach(function (art) {
        var titLimpo = String(art.titulo || '').replace(/[-–—|].*$/, '').trim();
        var palavras = titLimpo.replace(/[^a-zA-ZÀ-ÿ0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean);
        for (var i = 0; i < palavras.length; i++) {
          var p = palavras[i];
          var n = norm(p);
          if (/^[A-ZÀ-Ý]/.test(p) && p.length >= 3 && !STOPWORDS_BUSCA[n] && n !== tNorm) {
            contagem[n] = (contagem[n] || 0) + 1;
            if (!formas[n]) formas[n] = p;

            if (i < palavras.length - 1) {
              var p2 = palavras[i + 1];
              var n2 = norm(p2);
              if (/^[A-ZÀ-Ý]/.test(p2) && p2.length >= 3 && !STOPWORDS_BUSCA[n2]) {
                var par = p + ' ' + p2;
                var parNorm = norm(par);
                contagem[parNorm] = (contagem[parNorm] || 0) + 2;
                if (!formas[parNorm]) formas[parNorm] = par;
              }
            }
          }
        }
      });
    });

    var chaves = Object.keys(contagem).filter(function (k) { return contagem[k] >= 2 && k.length >= 3; });
    chaves.sort(function (a, b) { return contagem[b] - contagem[a]; });
    return chaves.slice(0, 8).map(function (k) { return formas[k]; });
  }

  function getQuickSuggestions(country, cont, topic, count) {
    var targetCount = Math.min(count || 3, 8);
    var a2 = country && country.a2 ? String(country.a2).toUpperCase() : '';
    var loadedArticles = a2 ? getLiveCountryHeadlinesPool(a2) : [];
    var hotItem = (a2 && hotNewsByCountry && hotNewsByCountry[a2]) ? hotNewsByCountry[a2] : null;
    var hasLoadedBase = loadedArticles.length >= 3;

    var picked = [];
    var seen = {};

    function add(term, skipValidation) {
      if (!term) return;
      var clean = String(term).trim();
      var k = norm(clean);
      if (!k || k.length < 3 || seen[k]) return;
      if (!skipValidation && hasLoadedBase && !termHasMatchInLoadedCountryNews(clean, loadedArticles, hotItem)) {
        return;
      }
      seen[k] = true;
      picked.push(clean);
    }

    // 1. Tópicos ao vivo já validados pelo backend para este país
    if (a2 && Array.isArray(liveTrendingByCountry[a2]) && liveTrendingByCountry[a2].length) {
      liveTrendingByCountry[a2].forEach(function (lt) {
        if (picked.length < targetCount) add(lt, true);
      });
    }

    // 2. Termos extraídos diretamente das manchetes reais carregadas no painel do país
    if (picked.length < targetCount && loadedArticles.length) {
      var extracted = extrairTopicosEmAltaClient([{ artigos: loadedArticles }], state.searchQuery || '');
      extracted.forEach(function (et) {
        if (picked.length < targetCount) add(et, true);
      });
    }

    // 3. Termo central da notícia quente do país
    if (picked.length < targetCount && hotItem && hotItem.title) {
      var hotTerm = extrairTermoAssuntoBusca(hotItem.termoBusca || hotItem.title, '');
      if (hotTerm) add(hotTerm, true);
    }

    // 4. Pools estáticos apenas quando validados contra a base carregada (ou como termos curtos iniciais antes do fetch)
    var countryPool = (a2 && SUGGESTION_POOLS.byCountry[a2]) ? SUGGESTION_POOLS.byCountry[a2].slice() : [];
    var countryTopicPool = (a2 && topic && SUGGESTION_POOLS.byCountryTopic && SUGGESTION_POOLS.byCountryTopic[a2] && SUGGESTION_POOLS.byCountryTopic[a2][topic])
      ? SUGGESTION_POOLS.byCountryTopic[a2][topic].slice()
      : [];

    if (topic && picked.length < targetCount) {
      if (countryTopicPool.length > 0) {
        var offCT = suggestionSeedOffset % countryTopicPool.length;
        var rotatedCT = countryTopicPool.slice(offCT).concat(countryTopicPool.slice(0, offCT));
        rotatedCT.forEach(function (item) {
          if (picked.length < targetCount) add(item, !hasLoadedBase);
        });
      }
      if (picked.length < targetCount && SUGGESTION_POOLS.byTopic[topic]) {
        var tList = SUGGESTION_POOLS.byTopic[topic];
        var offTopic = suggestionSeedOffset % tList.length;
        var rotatedTopic = tList.slice(offTopic).concat(tList.slice(0, offTopic));
        rotatedTopic.forEach(function (tt) {
          if (picked.length < targetCount) add(tt, !hasLoadedBase);
        });
      }
    }

    if (picked.length < targetCount && countryPool.length > 0) {
      var off2 = (suggestionSeedOffset * 2) % countryPool.length;
      var rotatedCountry = countryPool.slice(off2).concat(countryPool.slice(0, off2));
      rotatedCountry.forEach(function (ct) {
        if (picked.length < targetCount) add(ct, !hasLoadedBase);
      });
    }

    if (picked.length < targetCount && cont && SUGGESTION_POOLS.byCont[cont]) {
      var cList = SUGGESTION_POOLS.byCont[cont];
      var offCont = suggestionSeedOffset % cList.length;
      var rotatedCont = cList.slice(offCont).concat(cList.slice(0, offCont));
      rotatedCont.forEach(function (ct) {
        if (picked.length < targetCount) add(ct, !hasLoadedBase);
      });
    }

    if (picked.length < targetCount) {
      SUGGESTION_POOLS.general.forEach(function (gt) {
        if (picked.length < targetCount) add(gt, !hasLoadedBase);
      });
    }

    suggestionSeedOffset++;
    return picked.slice(0, targetCount);
  }

  /* ---------- theme ---------- */
  var root = document.documentElement;
  var themeBtn = document.getElementById('tema');
  try {
    var savedTheme = localStorage.getItem('rom_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      root.setAttribute('data-theme', savedTheme);
    }
  } catch (e) {}
  function syncThemeLabel() {
    if (!themeBtn) return;
    var dark = root.getAttribute('data-theme') === 'dark';
    var labelEl = themeBtn.querySelector('.theme-label');
    if (labelEl) labelEl.textContent = dark ? 'Modo claro' : 'Modo escuro';
    var txt = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
    themeBtn.setAttribute('aria-label', txt);
    themeBtn.setAttribute('title', txt);
  }
  themeBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('rom_theme', next); } catch (e) {}
    syncThemeLabel();
    void root.offsetHeight;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.remove('theme-switching');
      });
    });
  });
  syncThemeLabel();

  if (window.matchMedia) {
    var darkMql = window.matchMedia('(prefers-color-scheme: dark)');
    var onSchemeChange = function (ev) {
      try {
        if (!localStorage.getItem('rom_theme')) {
          root.setAttribute('data-theme', ev.matches ? 'dark' : 'light');
          syncThemeLabel();
        }
      } catch (e) {}
    };
    if (darkMql.addEventListener) darkMql.addEventListener('change', onSchemeChange);
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      var activeTag = (document.activeElement && document.activeElement.tagName) || '';
      if (!/INPUT|TEXTAREA|SELECT/.test(activeTag)) {
        var searchInput = document.getElementById('busca');
        if (searchInput) {
          ev.preventDefault();
          searchInput.focus();
        }
      }
    }
  });

  /* ---------- continents nav (B2) ---------- */
  var nav = document.getElementById('continentes');
  if (nav) {
    ORDER.forEach(function (k) {
      var b = el('button', { type: 'button', 'data-c': k, 'aria-pressed': 'false', style: '--cc: var(--c-' + k + ')' }, '<i></i>' + CONT[k].short);
      b.addEventListener('click', function () { go(state.cont === k && !state.country ? null : k, null); });
      nav.appendChild(b);
    });
  }

  /* ---------- map elements ---------- */
  var mapEl = document.getElementById('mapa');
  if (mapEl) mapEl.setAttribute('data-cont', state.cont || '');
  var panel = document.getElementById('painel');
  var svg = d3.select('#mapa-svg');
  var tip = document.getElementById('tooltip');
  var hint = document.getElementById('dica');
  var backBtn = document.getElementById('voltar-mundo');
  var btnFocusCaribe = document.getElementById('btn-focus-caribe');
  var btnFocusOceania = document.getElementById('btn-focus-oceania');
  var panelFloatingClose = document.getElementById('panel-floating-close');
  var panelExpandPill = document.getElementById('panel-expand-pill');

  function isCaribeZoomed() {
    return state.cont === 'central' && (state.focusCaribe || (state.country && isCaribIslandCountry(state.country, state.islandName)));
  }

  function isEastOceaniaZoomed() {
    return state.cont === 'oceania' && (state.focusEastOceania || (state.country && isEastOceania(state.country, state.islandName)));
  }

  function updateFocusCaribeBtn() {
    var isZoomedIn = isCaribeZoomed();
    if (mapEl) {
      mapEl.classList.toggle('caribe-zoomed', !!isZoomedIn);
    }
    var legendEl = document.getElementById('map-legend');
    if (legendEl) {
      legendEl.classList.toggle('caribe-hidden', !!isZoomedIn);
    }
    if (!btnFocusCaribe) return;
    btnFocusCaribe.hidden = false;
    btnFocusCaribe.setAttribute('aria-pressed', String(!!isZoomedIn));
    var lblFull = btnFocusCaribe.querySelector('.btn-focus-caribe-label .lbl-full');
    var lblShort = btnFocusCaribe.querySelector('.btn-focus-caribe-label .lbl-short');
    var fullTxt = isZoomedIn ? 'América Central toda' : 'Aproximar Caribe';
    var shortTxt = isZoomedIn ? 'Central toda' : 'Caribe';
    if (lblFull && lblShort) {
      lblFull.textContent = fullTxt;
      lblShort.textContent = shortTxt;
    } else {
      var lbl = btnFocusCaribe.querySelector('.btn-focus-caribe-label');
      if (lbl) {
        lbl.textContent = fullTxt;
      } else {
        btnFocusCaribe.textContent = isZoomedIn ? 'Central toda' : 'Aproximar';
      }
    }
    btnFocusCaribe.title = isZoomedIn
      ? 'Afastar o mapa para ver toda a América Central'
      : 'Aproximar o mapa no aglomerado de ilhas do Caribe para facilitar a seleção no celular';
  }

  function updateFocusOceaniaBtn() {
    var isZoomedIn = isEastOceaniaZoomed();
    if (!btnFocusOceania) return;
    btnFocusOceania.hidden = false;
    btnFocusOceania.setAttribute('aria-pressed', String(!!isZoomedIn));
    btnFocusOceania.textContent = isZoomedIn ? 'Oceania toda' : 'Aproximar';
    btnFocusOceania.title = isZoomedIn
      ? 'Afastar o mapa para ver a Oceania principal (Austrália e Nova Zelândia)'
      : 'Aproximar o mapa nas ilhas da Polinésia / Pacífico (esquerda da Oceania)';
  }

  function closeMapLayersPopoverOnMobile() {
    if (window.innerWidth > 768) return;
    var popLayers = document.getElementById('map-layers-popover');
    var btnLayers = document.getElementById('btn-map-layers');
    if (popLayers) popLayers.hidden = true;
    if (btnLayers) btnLayers.setAttribute('aria-expanded', 'false');
  }

  function handleIslandClusterFocus(contId, stateKey, updateBtnFn) {
    var isMobile = window.innerWidth <= 768;
    closeMapLayersPopoverOnMobile();
    if (state.cont !== contId) {
      state[stateKey] = true;
      setZoomedState(true);
      go(contId, null, isMobile ? { keepPanelClosed: true } : undefined);
      return;
    }
    state[stateKey] = !state[stateKey];
    if (isMobile) {
      setPanelCollapsed(true);
    }
    setZoomedState(true);
    applyZoom(true);
    updateBtnFn();
  }

  if (btnFocusCaribe) {
    btnFocusCaribe.addEventListener('click', function () {
      handleIslandClusterFocus('central', 'focusCaribe', updateFocusCaribeBtn);
    });
  }

  if (btnFocusOceania) {
    btnFocusOceania.addEventListener('click', function () {
      handleIslandClusterFocus('oceania', 'focusEastOceania', updateFocusOceaniaBtn);
    });
  }

  function setPanelCollapsed(collapsed) {
    state.panelCollapsed = !!collapsed;
    if (panel) {
      var isWorldMode = !state.cont && !state.country;
      var shouldHidePanel = isWorldMode || state.panelCollapsed;
      panel.classList.toggle('collapsed', shouldHidePanel);
      panel.classList.toggle('open', !shouldHidePanel);
      panel.classList.remove('floating-panel');
      panel.setAttribute('aria-hidden', String(shouldHidePanel));
    }
    if (panelExpandPill) {
      if (state.panelCollapsed && state.cont) {
        var isMobileCountry = window.innerWidth <= 768 && !!state.country;
        if (isMobileCountry) {
          panelExpandPill.hidden = true;
        } else {
          var pillLabel = 'Expandir painel';
          if (state.country) {
            var pcName = countryDisplayName(state.country, state.cont);
            pillLabel = 'Ver ' + pcName;
          } else if (CONT[state.cont]) {
            pillLabel = 'Ver lista (' + CONT[state.cont].n + ')';
          }
          var pLblEl = panelExpandPill.querySelector('.panel-expand-label');
          if (pLblEl) pLblEl.textContent = pillLabel;
          panelExpandPill.hidden = false;
          panelExpandPill.setAttribute('aria-label', pillLabel);
        }
      } else {
        panelExpandPill.hidden = true;
      }
    }
    if (panelFloatingClose) {
      panelFloatingClose.hidden = !state.country || !!state.panelCollapsed;
    }
    if (typeof updateFloatingControlsVisibility === 'function') {
      updateFloatingControlsVisibility();
    }
    applySheetState();
    if (state.cont && window.innerWidth > 760) {
      applyZoom(true);
    }
  }

  /* ---------- Bottom sheet mobile (snap points: min / mid / full) ---------- */
  var SHEET_MQ = window.matchMedia('(max-width: 768px)');
  function isSheetMode() { return SHEET_MQ.matches; }

  function applySheetState() {
    if (!panel) return;
    if (!isSheetMode()) {
      panel.removeAttribute('data-snap');
      panel.removeAttribute('data-world');
      panel.style.removeProperty('transform');
      panel.classList.remove('is-dragging');
      document.body.classList.remove('has-sheet');
      return;
    }
    var isWorld = !state.cont && !state.country;
    var snap = state.sheetSnap || 'mid';
    if (state.panelCollapsed) snap = 'min';
    else if (snap === 'min') snap = 'mid';
    state.sheetSnap = snap;
    panel.setAttribute('data-snap', snap);
    panel.setAttribute('data-world', String(isWorld));
    panel.classList.toggle('collapsed', isWorld);
    panel.classList.toggle('open', !isWorld);
    panel.setAttribute('aria-hidden', String(isWorld));
    document.body.classList.toggle('has-sheet', !isWorld);
    var btn = panel.querySelector('#btn-collapse-panel');
    if (btn) {
      var minimized = snap === 'min';
      var lbl = btn.querySelector('span');
      if (lbl) lbl.textContent = minimized ? 'Expandir' : 'Recolher';
      var t = minimized ? 'Expandir painel' : 'Recolher painel para ver o mapa';
      btn.setAttribute('aria-label', t);
      btn.setAttribute('title', t);
      btn.setAttribute('aria-expanded', String(!minimized));
    }
  }

  function setSheetSnap(snap) {
    state.sheetSnap = snap;
    setPanelCollapsed(snap === 'min');
  }

  function measureCss(expr) {
    var p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;visibility:hidden;pointer-events:none;height:' + expr;
    document.body.appendChild(p);
    var h = p.offsetHeight;
    document.body.removeChild(p);
    return h;
  }

  var sheetDrag = null;
  if (panel) {
    panel.addEventListener('pointerdown', function (e) {
      if (!isSheetMode() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      var head = e.target.closest ? e.target.closest('.panel-sheet-head') : null;
      if (!head || e.target.closest('button, a, input, select, textarea')) return;
      var h = measureCss('var(--sheet-h)');
      var offs = {
        full: 0,
        mid: Math.max(0, h - measureCss('var(--sheet-mid)')),
        min: Math.max(0, h - measureCss('var(--sheet-min)'))
      };
      var cur = panel.getAttribute('data-snap') || 'mid';
      sheetDrag = {
        id: e.pointerId, y0: e.clientY, last: e.clientY, lastT: e.timeStamp, v: 0,
        moved: false, offs: offs, start: offs[cur], y: offs[cur],
        tap: !!e.target.closest('.sheet-grabber')
      };
      try { panel.setPointerCapture(e.pointerId); } catch (err) {}
    });
    panel.addEventListener('pointermove', function (e) {
      if (!sheetDrag || e.pointerId !== sheetDrag.id) return;
      var dy = e.clientY - sheetDrag.y0;
      if (!sheetDrag.moved && Math.abs(dy) < 6) return;
      if (!sheetDrag.moved) {
        sheetDrag.moved = true;
        panel.classList.add('is-dragging');
      }
      var dt = e.timeStamp - sheetDrag.lastT;
      if (dt > 0) sheetDrag.v = (e.clientY - sheetDrag.last) / dt;
      sheetDrag.last = e.clientY;
      sheetDrag.lastT = e.timeStamp;
      sheetDrag.y = Math.min(sheetDrag.offs.min, Math.max(0, sheetDrag.start + dy));
      panel.style.transform = 'translateY(' + sheetDrag.y + 'px)';
    });
    var endSheetDrag = function (e, cancelled) {
      if (!sheetDrag || e.pointerId !== sheetDrag.id) return;
      var d = sheetDrag;
      sheetDrag = null;
      try { panel.releasePointerCapture(e.pointerId); } catch (err) {}
      panel.classList.remove('is-dragging');
      panel.style.removeProperty('transform');
      if (!d.moved) {
        if (!cancelled && d.tap) setSheetSnap(panel.getAttribute('data-snap') === 'min' ? 'mid' : 'min');
        return;
      }
      var proj = d.y + d.v * 180, best = 'mid', bd = Infinity;
      ['full', 'mid', 'min'].forEach(function (k) {
        var dist = Math.abs(d.offs[k] - proj);
        if (dist < bd) { bd = dist; best = k; }
      });
      setSheetSnap(best);
    };
    panel.addEventListener('pointerup', function (e) { endSheetDrag(e, false); });
    panel.addEventListener('pointercancel', function (e) { endSheetDrag(e, true); });
  }
  if (SHEET_MQ.addEventListener) {
    SHEET_MQ.addEventListener('change', function () { setPanelCollapsed(state.panelCollapsed); });
  } else if (SHEET_MQ.addListener) {
    SHEET_MQ.addListener(function () { setPanelCollapsed(state.panelCollapsed); });
  }

  /* ---------- Filtro de continentes (pílulas) sincronizado com o estado ---------- */
  function syncQuickRegionPills(scroll) {
    var c = document.getElementById('map-quick-regions');
    if (!c) return;
    var key = state.cont || 'world', active = null;
    c.querySelectorAll('.quick-region-pill, .btn-quick-region').forEach(function (btn) {
      var cAttr = btn.getAttribute('data-cont') || btn.getAttribute('data-region');
      var isMatch = (cAttr === key) || (cAttr === 'americas' && (key === 'sul' || key === 'norte' || key === 'central'));
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-pressed', String(isMatch));
      if (isMatch && !active) active = btn;
    });
    if (scroll && active && active.scrollIntoView) {
      var r = c.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) {
        try {
          active.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
        } catch (err) { active.scrollIntoView(); }
      }
    }
  }

  /* ---------- Reset unificado: Voltar ao Mapa / X / Todos ---------- */
  function resetToWorld() {
    state.originRoute = null;
    state.sheetSnap = 'mid';
    setZoomedState(false);
    avisoGestoExibido = false;
    go(null, null);
    applyZoom(true);
    syncQuickRegionPills(true);
    if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (panelExpandPill) {
    panelExpandPill.addEventListener('click', function () {
      setPanelCollapsed(false);
    });
  }
  var mobileChip = document.getElementById('mobile-chip');
  var mobileChipFlag = document.getElementById('mobile-chip-flag');
  var mobileChipName = document.getElementById('mobile-chip-name');
  var mobileChipLang = document.getElementById('mobile-chip-lang');
  var mobileChipOpen = document.getElementById('mobile-chip-open');
  var mobileSelectedCountry = null;

  var W = 1000, H = 560;
  svg.attr('viewBox', '0 0 ' + W + ' ' + H).attr('preserveAspectRatio', 'xMidYMid meet');

  var world = window.WORLD;
  var feats = topojson.feature(world, world.objects.countries).features
    .filter(function (f) { return byId[f.id]; });

  // Feições virtuais para microterritórios insulares da Oceania ausentes no TopoJSON
  if (!feats.some(function (f) { return f.id === '798'; }) && byId['798']) {
    feats.push({
      type: 'Feature',
      id: '798',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [177.63, -7.10], [177.67, -7.10], [177.67, -7.12], [177.63, -7.12], [177.63, -7.10]
        ]]
      },
      properties: { name: 'Tuvalu' }
    });
  }
  if (!feats.some(function (f) { return f.id === '772'; }) && byId['772']) {
    feats.push({
      type: 'Feature',
      id: '772',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-171.86, -9.19], [-171.83, -9.19], [-171.83, -9.21], [-171.86, -9.21], [-171.86, -9.19]
        ]]
      },
      properties: { name: 'Tokelau' }
    });
  }

  function islandInfo(c, lon, lat, k) {
    if (!c) return null;
    if (c.a2 === 'US' && k === 'oceania') {
      return { name: 'Havaí (Estados Unidos)', flag: 'us' };
    }
    if (c.a2 === 'ES' && k === 'africa') {
      return { name: 'Ilhas Canárias (Espanha)', flag: 'es' };
    }
    if (c.a2 === 'CL' && lon < -100) {
      return { name: 'Ilha de Páscoa (Chile)', flag: 'cl' };
    }
    if (c.a2 === 'EC' && lon < -85) {
      return { name: 'Ilhas Galápagos (Equador)', flag: 'ec' };
    }
    if (c.a2 === 'FR' && k === 'africa') {
      if (lon < 50) return { name: 'Mayotte (França)', flag: 'yt' };
      return { name: 'Reunião (França)', flag: 're' };
    }
    if (c.a2 === 'FR' && (k === 'central' || k === 'norte')) {
      if (lat > 15.5) return { name: 'Guadalupe (França)', flag: 'gp' };
      return { name: 'Martinica (França)', flag: 'mq' };
    }
    if (c.a2 === 'NL' && (k === 'central' || k === 'norte')) {
      if (lat < 14) return { name: 'Bonaire (Países Baixos)', flag: 'bq' };
      if (lon > -63.1) return { name: 'Santo Eustáquio (Países Baixos)', flag: 'bq' };
      return { name: 'Saba (Países Baixos)', flag: 'bq' };
    }
    return null;
  }

  function partCont(c, lon, lat) {
    switch (c.a2) {
      case 'FR': if (lon < -30) return lat < 10 ? 'sul' : 'central'; if (lon > 40 && lat < 0) return 'africa'; break;
      case 'NL': if (lon < -30) return 'central'; break;
      case 'US': if (lon < -150 && lon > -179 && lat < 30) return 'oceania'; break;
      case 'ES': if (lat < 30 && lon < -12) return 'africa'; break;
      case 'CL': if (lon < -100) return 'oceania'; return 'sul';
      case 'EC': if (lon < -85) return 'sul'; break;
      case 'TR': if (lon < 29.5 && lat > 40.5) return 'europa'; return 'asia';
      case 'RU': return (lon > 0 && (lon < 66 || (lat > 76 && lon < 70))) ? 'europa' : 'asia';
    }
    return c.c;
  }
  var parts = [];
  feats.forEach(function (f) {
    var c = byId[f.id], g = f.geometry;
    var polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    var groups = {}, big = null, bigA = -1;
    polys.forEach(function (pp) {
      var pg = { type: 'Polygon', coordinates: pp };
      if (c.a2 === 'RU') { var a = d3.geoArea(pg); if (a > bigA) { bigA = a; big = pp; } }
      var ce = d3.geoCentroid(pg), k = partCont(c, ce[0], ce[1]);
      var isl = islandInfo(c, ce[0], ce[1], k);
      var gKey = isl ? (k + ':' + isl.name) : k;
      if (!groups[gKey]) {
        groups[gKey] = { c: k, isl: isl, polys: [] };
      }
      groups[gKey].polys.push(pp);
    });
    if (c.a2 === 'RU') {
      Object.keys(groups).forEach(function (kKey) {
        groups[kKey].polys = groups[kKey].polys.filter(function (pp) { return pp !== big; });
      });
      parts.push({ id: f.id, country: c, c: 'europa', clip: 'clip-eu', geom: { type: 'Polygon', coordinates: big } });
      parts.push({ id: f.id, country: c, c: 'asia', clip: 'clip-as', geom: { type: 'Polygon', coordinates: big } });
    }
    Object.keys(groups).forEach(function (kKey) {
      var grp = groups[kKey];
      if (!grp.polys.length) return;
      parts.push({
        id: f.id,
        country: c,
        c: grp.c,
        islandName: grp.isl ? grp.isl.name : null,
        islandFlag: grp.isl ? grp.isl.flag : null,
        geom: { type: 'MultiPolygon', coordinates: grp.polys }
      });
    });
  });

  var URAL = [[66, 85], [66, 76], [68.5, 69], [65, 66], [60, 64], [59, 61], [59.5, 58], [59, 55], [58.5, 52], [55, 51.6], [51.4, 51.2], [51.9, 47], [47, 43], [40, 43], [36, 41], [10, 38], [10, 85]];
  function densify(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      for (var t = 0; t < 12; t++) out.push([a[0] + (b[0] - a[0]) * t / 12, a[1] + (b[1] - a[1]) * t / 12]);
    }
    return out;
  }
  var URAL_D = densify(URAL);

  // Cores por país e identificação de ilhas/microterritórios
  var countryGeoms = world.objects.countries.geometries;
  var countryNeighbors = topojson.neighbors(countryGeoms);
  (function () {
    var nb = countryNeighbors, N = 7;
    var order = countryGeoms.map(function (g, i) { return i; }).sort(function (a, b) { return nb[b].length - nb[a].length; });
    var col = {}, uses = [0, 0, 0, 0, 0, 0, 0];
    order.forEach(function (i) {
      var used = {};
      nb[i].forEach(function (j) { if (col[j] != null) used[col[j]] = 1; });
      var k = -1;
      for (var t = 0; t < N; t++) if (!used[t] && (k < 0 || uses[t] < uses[k])) k = t;
      if (k < 0) k = 0;
      col[i] = k; uses[k]++;
      var c = byId[countryGeoms[i].id]; if (c) c.pi = k;
    });
  })();

  var geomIdxById = {};
  countryGeoms.forEach(function (g, idx) { geomIdxById[g.id] = idx; });

  // Conjunto exaustivo de territórios insulares e microestados para garantir clique imediato em qualquer ilha do globo
  var ALL_ISLAND_CODES = {
    AG: 1, AI: 1, AW: 1, BB: 1, BL: 1, BM: 1, BS: 1, CU: 1, CW: 1, DM: 1, DO: 1, GD: 1, HT: 1, JM: 1, KN: 1, KY: 1, LC: 1, MF: 1, MS: 1, PR: 1, SX: 1, TC: 1, TT: 1, VC: 1, VG: 1, VI: 1,
    AS: 1, CK: 1, FJ: 1, FM: 1, GU: 1, KI: 1, MH: 1, MP: 1, NC: 1, NR: 1, NU: 1, PF: 1, PW: 1, SB: 1, TK: 1, TO: 1, TV: 1, VU: 1, WF: 1, WS: 1,
    CV: 1, KM: 1, MU: 1, SC: 1, ST: 1,
    BH: 1, BN: 1, CY: 1, MV: 1, SG: 1, TL: 1, TW: 1,
    FO: 1, GG: 1, IM: 1, IS: 1, JE: 1, MT: 1,
    FK: 1, PM: 1,
    AD: 1, LI: 1, MC: 1, SM: 1, VA: 1
  };

  parts.forEach(function (p) {
    p.area = d3.geoArea(p.geom);
    p.centroid = d3.geoCentroid(p.geom);
    var gIdx = geomIdxById[p.id];
    var a2 = p.country ? (p.country.a2 || '') : '';
    var isIslandCountry = gIdx != null && countryNeighbors[gIdx] && countryNeighbors[gIdx].length === 0 && p.area < 0.003;
    var isListedIsland = !!ALL_ISLAND_CODES[a2] || p.id === '336-chipre-norte';
    p.isIsland = !!p.islandName || isIslandCountry || isListedIsland;
  });

  var islandParts = parts.filter(function (p) { return p.isIsland; });

  var projection = d3.geoNaturalEarth1();
  var path = d3.geoPath(projection);
  var sphere = { type: 'Sphere' };

  var gRoot = svg.append('g');
  var gZoom = gRoot.append('g');
  gZoom.append('path').attr('class', 'sphere');
  gZoom.append('path').attr('class', 'graticule').datum(d3.geoGraticule10());
  var defs = svg.append('defs');
  var clipEu = defs.append('clipPath').attr('id', 'clip-eu').attr('clipPathUnits', 'userSpaceOnUse').append('path');
  var clipAs = defs.append('clipPath').attr('id', 'clip-as').attr('clipPathUnits', 'userSpaceOnUse').append('path').attr('clip-rule', 'evenodd');
  var countrySel = gZoom.append('g').selectAll('path').data(parts).join('path')
    .attr('class', function (p) { return 'country' + (p.country.m ? '' : ' nod'); })
    .attr('data-c', function (p) { return p.c; })
    .attr('clip-path', function (p) { return p.clip ? 'url(#' + p.clip + ')' : null; })
    .style('fill', function (p) { return 'var(--c-' + p.c + ')'; })
    .style('fill-opacity', function (p) { return p.country.m ? 1 : 0.55; })
    .attr('tabindex', -1);

  /* ---------- Bloco SUG-28: Camada de Linhas Principais do Globo ---------- */
  var showGlobeLines = false; // Padrão: desativada conforme ticket SUG-28
  var GLOBE_LINES_DATA = [
    {
      id: 'equator',
      name: 'Linha do Equador',
      coordText: '0°',
      type: 'parallel',
      lat: 0,
      className: 'globe-line-equator',
      labelPoint: [-140, 0],
      labelTitle: 'Equador (0°)'
    },
    {
      id: 'cancer',
      name: 'Trópico de Câncer',
      coordText: '23°26′ N',
      type: 'parallel',
      lat: 23.4365,
      className: 'globe-line-trop-cancer',
      labelPoint: [-140, 23.4365],
      labelTitle: 'Trópico de Câncer (23°26′ N)'
    },
    {
      id: 'capricorn',
      name: 'Trópico de Capricórnio',
      coordText: '23°26′ S',
      type: 'parallel',
      lat: -23.4365,
      className: 'globe-line-trop-capricorn',
      labelPoint: [-140, -23.4365],
      labelTitle: 'Trópico de Capricórnio (23°26′ S)'
    },
    {
      id: 'arctic',
      name: 'Círculo Polar Ártico',
      coordText: '66°34′ N',
      type: 'parallel',
      lat: 66.5636,
      className: 'globe-line-polar-arctic',
      labelPoint: [-140, 66.5636],
      labelTitle: 'Círculo Polar Ártico (66°34′ N)'
    },
    {
      id: 'antarctic',
      name: 'Círculo Polar Antártico',
      coordText: '66°34′ S',
      type: 'parallel',
      lat: -66.5636,
      className: 'globe-line-polar-antarctic',
      labelPoint: [-140, -66.5636],
      labelTitle: 'Círculo Polar Antártico (66°34′ S)'
    },
    {
      id: 'greenwich',
      name: 'Meridiano de Greenwich',
      coordText: '0°',
      type: 'meridian',
      lon: 0,
      className: 'globe-line-greenwich',
      labelPoint: [0, -10],
      labelTitle: 'Greenwich (0°)'
    }
  ];

  function makeParallelGeoFeature(lat, id) {
    var coords = [];
    for (var lon = -180; lon <= 180; lon += 0.5) coords.push([lon, lat]);
    return { type: 'Feature', id: id, geometry: { type: 'LineString', coordinates: coords } };
  }
  function makeMeridianGeoFeature(lon, id) {
    var coords = [];
    for (var lat = -89.5; lat <= 89.5; lat += 0.5) coords.push([lon, lat]);
    return { type: 'Feature', id: id, geometry: { type: 'LineString', coordinates: coords } };
  }

  GLOBE_LINES_DATA.forEach(function (d) {
    if (d.type === 'parallel') d.feature = makeParallelGeoFeature(d.lat, d.id);
    else d.feature = makeMeridianGeoFeature(d.lon, d.id);
  });

  var globeGridData = d3.geoGraticule().step([30, 30])();

  var globeLinesLayer = gZoom.append('g')
    .attr('class', 'globe-lines-layer')
    .attr('data-visible', 'false')
    .style('display', 'none');

  var globeGridSel = globeLinesLayer.append('path')
    .attr('class', 'globe-grid-path')
    .datum(globeGridData);

  var globeLinesSel = globeLinesLayer.selectAll('path.globe-line-path')
    .data(GLOBE_LINES_DATA)
    .join('path')
    .attr('class', function (d) { return 'globe-line-path ' + d.className; });

  var globeLabelsGroup = globeLinesLayer.append('g').attr('class', 'globe-lines-labels');
  var globeLabelsSel = globeLabelsGroup.selectAll('text.globe-line-label')
    .data(GLOBE_LINES_DATA)
    .join('text')
    .attr('class', 'globe-line-label')
    .attr('text-anchor', function (d) { return d.type === 'meridian' ? 'start' : 'middle'; })
    .attr('dx', function (d) { return d.type === 'meridian' ? '8px' : '0'; })
    .attr('dy', function (d) { return d.type === 'meridian' ? '4px' : '-5px'; })
    .text(function (d) { return d.labelTitle; });

  /* ---------- Paleta Colorida Própria para Ilhas (Pacífico e Caribe) ---------- */
  var ISLAND_COLORS = {
    // Polinésia / Oceania
    WS: 'var(--p2)',            // Samoa (verde)
    AS: 'var(--p4)',            // Samoa Americana (amarelo)
    TO: 'var(--p0)',            // Tonga (azul)
    WF: 'var(--p1)',            // Wallis e Futuna (laranja)
    TK: 'var(--p5)',            // Tokelau (ciano)
    NU: 'var(--p6)',            // Niue (roxo)
    CK: 'var(--p3)',            // Ilhas Cook (vermelho)
    PF: 'var(--p1)',            // Polinésia Francesa (laranja vibrante)
    PN: 'var(--p2)',            // Ilhas Pitcairn (verde)
    TV: 'var(--p4)',            // Tuvalu (amarelo)
    KI: 'var(--p0)',            // Kiribati (azul)
    FJ: 'var(--p5)',            // Fiji (ciano)
    VU: 'var(--p6)',            // Vanuatu (roxo)
    NR: 'var(--p3)',            // Nauru (vermelho)
    PW: 'var(--p2)',            // Palau (verde)
    FM: 'var(--p4)',            // Micronésia (amarelo)
    MH: 'var(--p1)',            // Ilhas Marshall (laranja)
    '840-hawaii': 'var(--p3)',  // Havaí (vermelho-coral próprio)
    '152-easter': 'var(--p6)',  // Ilha de Páscoa (roxo próprio)
    '218-galapagos': 'var(--p2)', // Galápagos (verde próprio)

    // Caribe (cores ricas e alternadas ao aproximar)
    PR: 'var(--p0)',
    VI: 'var(--p4)',
    VG: 'var(--p2)',
    AI: 'var(--p5)',
    MF: 'var(--p6)',
    SX: 'var(--p1)',
    BL: 'var(--p3)',
    KN: 'var(--p2)',
    AG: 'var(--p1)',
    MS: 'var(--p3)',
    '250-guadeloupe': 'var(--p0)',
    DM: 'var(--p2)',
    '250-martinique': 'var(--p4)',
    LC: 'var(--p6)',
    BB: 'var(--p5)',
    VC: 'var(--p1)',
    GD: 'var(--p3)',
    TT: 'var(--p0)',
    AW: 'var(--p2)',
    CW: 'var(--p4)',
    '528-bonaire': 'var(--p6)',
    '528-saba': 'var(--p1)',
    '528-st-eustatius': 'var(--p3)',
    BS: 'var(--p5)',
    TC: 'var(--p1)',
    KY: 'var(--p3)'
  };

  function getIslandColor(p) {
    if (!p) return 'var(--p5)';
    var pId = String(p.id || '');
    if (ISLAND_COLORS[pId]) return ISLAND_COLORS[pId];
    var a2 = (p.country && p.country.a2) || '';
    if (ISLAND_COLORS[a2]) return ISLAND_COLORS[a2];
    var pal = ['var(--p0)', 'var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)'];
    var hash = 0;
    var str = pId + a2 + (p.islandName || '');
    for (var i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
    return pal[Math.abs(hash) % pal.length];
  }

  var islandGroup = gZoom.append('g').attr('class', 'island-markers-layer');
  var islandMarkerSel = islandGroup.selectAll('g.island-marker')
    .data(islandParts)
    .join('g')
    .attr('class', 'island-marker')
    .attr('data-c', function (p) { return p.c; })
    .style('fill', function (p) {
      if (p.isIsland || p.islandName) return getIslandColor(p);
      return 'var(--c-' + p.c + ')';
    })
    .attr('tabindex', -1);

  islandMarkerSel.append('circle').attr('class', 'island-marker-hit').attr('r', 9);
  islandMarkerSel.append('circle').attr('class', 'island-marker-ring').attr('r', 4.2);
  islandMarkerSel.append('circle').attr('class', 'island-marker-dot').attr('r', 2.2);

  /* ---------- Agrupamento Dinâmico por Área no Pacífico (Polinésia / Oceania) e Caribe ---------- */
  var PACIFIC_CLUSTERS = [
    {
      id: 'cluster-polynesia-central',
      name: 'Polinésia Central',
      centroid: [-173.0, -14.5],
      codes: ['WS', 'AS', 'TO', 'WF', 'TK'],
      c: 'oceania'
    },
    {
      id: 'cluster-cook-niue',
      name: 'Ilhas Cook e Niue',
      centroid: [-164.5, -20.0],
      codes: ['CK', 'NU'],
      c: 'oceania'
    },
    {
      id: 'cluster-french-polynesia',
      name: 'Polinésia Oriental e Pitcairn',
      centroid: [-142.0, -19.5],
      codes: ['PF', 'PN'],
      c: 'oceania'
    },
    {
      id: 'cluster-caribe-antilhas',
      name: 'Pequenas Antilhas (Caribe)',
      centroid: [-61.3, 14.8],
      codes: [],
      c: 'central'
    }
  ];

  var PACIFIC_CLUSTERED_A2 = {
    WS: 1, AS: 1, TO: 1, WF: 1, TK: 1, CK: 1, NU: 1, PF: 1, PN: 1
  };

  // No Caribe, não deixar círculos na visão geral para não poluir a imagem
  var CARIBBEAN_CLUSTERED_A2 = {
    AG: 1, AI: 1, AW: 1, BB: 1, BL: 1, BM: 1, BS: 1, CU: 1, CW: 1, DM: 1, DO: 1,
    GD: 1, HT: 1, JM: 1, KN: 1, KY: 1, LC: 1, MF: 1, MS: 1, PR: 1, SX: 1, TC: 1,
    TT: 1, VC: 1, VG: 1, VI: 1
  };
  var CARIBBEAN_CLUSTERED_IDS = {
    '250-guadeloupe': 1, '250-martinique': 1, '528-bonaire': 1, '528-saba': 1, '528-st-eustatius': 1
  };

  var islandClusterGroup = gZoom.append('g').attr('class', 'island-clusters-layer');
  var islandClusterSel = islandClusterGroup.selectAll('g.island-cluster-marker')
    .data(PACIFIC_CLUSTERS)
    .join('g')
    .attr('class', function (d) {
      return 'island-cluster-marker' + (d.c === 'central' ? ' carib-cluster' : '');
    })
    .attr('data-cluster-id', function (d) { return d.id; })
    .style('fill', function (d) { return 'var(--c-' + d.c + ')'; })
    .style('cursor', 'pointer');

  function isMobileMapViewport() {
    return (typeof window !== 'undefined' && window.innerWidth <= 768);
  }

  function getClusterBaseRadii() {
    var isMob = isMobileMapViewport();
    return {
      hit: isMob ? 16 : 9,
      halo: isMob ? 8.5 : 4.8,
      ring: isMob ? 5.5 : 3.6,
      dot: isMob ? 3.0 : 2.2,
      minHit: isMob ? 10 : 7
    };
  }

  var initialClusterRadii = getClusterBaseRadii();
  islandClusterSel.append('circle').attr('class', 'island-cluster-hit').attr('r', initialClusterRadii.hit);
  islandClusterSel.append('circle').attr('class', 'island-cluster-halo').attr('r', initialClusterRadii.halo);
  islandClusterSel.append('circle').attr('class', 'island-cluster-ring').attr('r', initialClusterRadii.ring);
  islandClusterSel.append('circle').attr('class', 'island-cluster-dot').attr('r', initialClusterRadii.dot);

  islandClusterSel.on('click', function (e, d) {
    e.stopPropagation();
    if (d.c === 'central') {
      state.cont = 'central';
      state.focusCaribe = true;
      setZoomedState(true);
      applyZoom(true);
      updateFocusCaribeBtn();
    } else {
      state.cont = 'oceania';
      state.focusEastOceania = true;
      setZoomedState(true);
      applyZoom(true);
      updateFocusOceaniaBtn();
    }
  });

  islandClusterSel
    .on('mousemove', function (e, d) {
      showTip(e, d.name);
    })
    .on('mouseleave', function () {
      if (tip) tip.hidden = true;
    });

  function updateIslandClustering(currentK) {
    var kVal = currentK !== undefined ? currentK : ((svg.node() && d3.zoomTransform(svg.node()).k) || 1);
    var isZoomedInPacific = (kVal >= 3.0) || isEastOceaniaZoomed();
    var isZoomedInCaribe = (kVal >= 3.0) || isCaribeZoomed();
    var isMob = isMobileMapViewport();

    if (mapEl) {
      mapEl.classList.toggle('pacific-zoomed', isZoomedInPacific);
      mapEl.classList.toggle('caribe-zoomed', isZoomedInCaribe);
    }
    if (islandClusterSel) {
      islandClusterSel.each(function (d) {
        if (d.c === 'central' && !isMob) {
          d3.select(this)
            .style('display', 'none')
            .style('opacity', 0);
          return;
        }
        var isZoomed = d.c === 'central' ? isZoomedInCaribe : isZoomedInPacific;
        d3.select(this)
          .style('display', isZoomed ? 'none' : '')
          .style('opacity', isZoomed ? 0 : 1);
      });
    }
    if (islandMarkerSel) {
      islandMarkerSel.each(function (p) {
        var a2 = (p.country && p.country.a2) || '';
        var pId = String(p.id || '');
        var isPacClustered = PACIFIC_CLUSTERED_A2[a2];
        var isCaribIsland = (p.c === 'central' && a2 !== 'BM') || (a2 !== 'BM' && CARIBBEAN_CLUSTERED_A2[a2]) || CARIBBEAN_CLUSTERED_IDS[pId];

        if (isPacClustered) {
          var isCurrent = state.country && (state.country.a2 === a2 || state.country.id === p.id);
          var hide = !isZoomedInPacific && !isCurrent;
          d3.select(this)
            .classed('is-clustered', hide)
            .style('display', hide ? 'none' : '');
        } else if (isCaribIsland) {
          // No Caribe: nunca exibir marcadores circulares (nem na visão geral, nem após aproximar)
          d3.select(this)
            .classed('is-clustered', true)
            .style('display', 'none');
        }
      });
    }
  }

  var mapBounds = null;

  function fitAspect() {
    var r = mapEl.getBoundingClientRect();
    if (!r.width) return;
    H = Math.round(W * r.height / r.width);
    svg.attr('viewBox', '0 0 ' + W + ' ' + H);
    projection.fitExtent([[12, 12], [W - 12, H - 12]], { type: 'FeatureCollection', features: feats });
    gZoom.select('.sphere').attr('d', path(sphere));
    countrySel.attr('d', function (p) { return path(p.geom); });
    if (globeLinesSel) {
      globeLinesSel.attr('d', function (d) { return path(d.feature); });
    }
    if (globeGridSel) {
      globeGridSel.attr('d', path(globeGridData));
    }
    if (globeLabelsSel) {
      globeLabelsSel.attr('transform', function (d) {
        var pt = projection(d.labelPoint);
        if (!pt || isNaN(pt[0]) || isNaN(pt[1])) return 'translate(-9999,-9999)';
        return 'translate(' + pt[0] + ',' + pt[1] + ')';
      });
    }
    if (islandMarkerSel) {
      islandMarkerSel.attr('transform', function (p) {
        var pt = projection(p.centroid);
        if (!pt || isNaN(pt[0]) || isNaN(pt[1])) return 'translate(-9999,-9999)';
        return 'translate(' + pt[0] + ',' + pt[1] + ')';
      });
    }
    if (islandClusterSel) {
      islandClusterSel.attr('transform', function (d) {
        var pt = projection(d.centroid);
        if (!pt || isNaN(pt[0]) || isNaN(pt[1])) return 'translate(-9999,-9999)';
        return 'translate(' + pt[0] + ',' + pt[1] + ')';
      });
      var curKVal = (svg.node() && d3.zoomTransform(svg.node()).k) || 1;
      var curScale = Math.max(0.35, Math.min(1, 1 / Math.pow(curKVal, 0.45)));
      var curRadii = getClusterBaseRadii();
      islandClusterSel.selectAll('.island-cluster-dot').attr('r', curRadii.dot * curScale);
      islandClusterSel.selectAll('.island-cluster-ring').attr('r', curRadii.ring * curScale);
      islandClusterSel.selectAll('.island-cluster-halo').attr('r', curRadii.halo * curScale);
      islandClusterSel.selectAll('.island-cluster-hit').attr('r', Math.max(curRadii.minHit, curRadii.hit * curScale));
      updateIslandClustering(curKVal);
    }
    var ring = 'M' + URAL_D.map(function (q) { return projection(q).join(','); }).join('L') + 'Z';
    clipEu.attr('d', ring);
    clipAs.attr('d', 'M-5000,-5000H6000V6000H-5000Z' + ring);

    var rawBounds = path.bounds({ type: 'FeatureCollection', features: feats });
    mapBounds = {
      x0: rawBounds[0][0],
      y0: rawBounds[0][1],
      x1: rawBounds[1][0],
      y1: rawBounds[1][1]
    };
    applyZoom(false);
  }

  function availArea() {
    var r = mapEl.getBoundingClientRect(), f = W / (r.width || 1);
    var a = { x0: 0, y0: 0, x1: W, y1: H };
    if (!state.cont) return a;
    if (window.innerWidth > 760 && !state.panelCollapsed && panel && panel.offsetLeft > 0) {
      a.x1 = panel.offsetLeft * f - 8;
    }
    a.y0 = 40;
    return a;
  }
  function zoomFor(k, c) {
    if (!k) {
      var isMob = window.innerWidth <= 768;
      var baseK = isMob ? 1.05 : 1;
      var cx = mapBounds ? (mapBounds.x0 + mapBounds.x1) / 2 : W / 2;
      var cy = mapBounds ? (mapBounds.y0 + mapBounds.y1) / 2 : H / 2;
      return { k: baseK, x: W / 2 - baseK * cx, y: H / 2 - baseK * cy };
    }
    var targetCountry = c !== undefined ? c : state.country;
    var b;
    if (k === 'oceania') {
      if (state.focusEastOceania || isEastOceania(targetCountry, state && state.islandName)) {
        // Ilhas da Oceania do lado esquerdo do mapa (Polinésia: Niue, Cook, Samoa, Tonga, Kiribati, PF, Havaí, Páscoa etc.)
        b = [[-180, -32], [-105, 24]];
      } else {
        // Oceania Ocidental (Austrália, Nova Zelândia, Fiji, Papua Nova Guiné, Melanésia, Micronésia etc.)
        b = [[111, -48], [180, 16]];
      }
    } else if (k === 'central') {
      if (state.focusCaribe || (targetCountry && isCaribIslandCountry(targetCountry, state && state.islandName))) {
        // Ilhas do Caribe Oriental / Antilhas (Aruba, Curaçao, Bonaire, Trinidad, Barbados, Granada, Martinica, Guadalupe, Porto Rico, etc.)
        b = [[-70.5, 9.8], [-58.5, 19.2]];
      } else {
        b = CONT[k].box;
      }
    } else {
      b = CONT[k].box;
    }
    var pts = [];
    for (var i = 0; i <= 10; i++) {
      var lon = b[0][0] + (b[1][0] - b[0][0]) * i / 10;
      var lat = b[0][1] + (b[1][1] - b[0][1]) * i / 10;
      pts.push(projection([lon, b[0][1]]), projection([lon, b[1][1]]), projection([b[0][0], lat]), projection([b[1][0], lat]));
    }
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var pad = 24, a = availArea();
    var aw = a.x1 - a.x0, ah = a.y1 - a.y0;
    var s = Math.min((aw - pad * 2) / (x1 - x0), (ah - pad * 2) / (y1 - y0));
    return { k: s, x: a.x0 + aw / 2 - s * (x0 + x1) / 2, y: a.y0 + ah / 2 - s * (y0 + y1) / 2 };
  }

  /* ---------- Zoom e Arraste Livre (B1) ---------- */
  var IS_MAC = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  var hasZoomed = false;
  var avisoGestoExibido = false;
  var pinchActive = false;
  var lastTouchTime = 0;
  var lastTouchedCountry = null;

  function setZoomedState(val) {
    hasZoomed = !!val;
    svg.classed('zoomed', hasZoomed);
  }

  var zoom = d3.zoom()
    .scaleExtent([1, 45])
    .clickDistance(14)
    .duration(reduceMotion() ? 0 : 250)
    .filter(function (e) {
      if (e.type === 'wheel') return e.ctrlKey || e.metaKey;
      if (e.type === 'touchstart') {
        if (e.touches && e.touches.length > 1) {
          setZoomedState(true);
          pinchActive = true;
          return true;
        }
        // B1: após o primeiro zoom, o mapa fica livre para rolar/arrastar em qualquer direção com 1 dedo
        if (hasZoomed && e.touches && e.touches.length === 1) {
          return true;
        }
        return false;
      }
      if (e.type === 'dblclick') return true;
      return !e.ctrlKey && !e.button;
    })
    .wheelDelta(function (e) {
      var d = -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey && Math.abs(e.deltaY) < 50 ? 10 : 1);
      return Math.max(-0.6, Math.min(0.6, d));
    })
    .on('start', function () {
      if (tip) tip.hidden = true;
    })
    .on('zoom', function (e) {
      if (tip) tip.hidden = true;
      var minScale = zoom.scaleExtent()[0] || 1;
      if (!state.cont && e.transform.k <= minScale * 1.03) {
        setZoomedState(false);
      } else if (e.transform.k > minScale * 1.05) {
        setZoomedState(true);
      }
      gZoom.attr('transform', e.transform);
      if (globeLabelsSel) {
        var sLabels = Math.max(0.4, Math.min(1, 1 / Math.pow(e.transform.k, 0.45)));
        globeLabelsSel.attr('transform', function (d) {
          var pt = projection(d.labelPoint);
          if (!pt || isNaN(pt[0]) || isNaN(pt[1])) return 'translate(-9999,-9999)';
          return 'translate(' + pt[0] + ',' + pt[1] + ') scale(' + sLabels + ')';
        });
      }
      if (islandMarkerSel) {
        var s = Math.max(0.35, Math.min(1, 1 / Math.pow(e.transform.k, 0.45)));
        islandMarkerSel.selectAll('.island-marker-dot').attr('r', 2.2 * s);
        islandMarkerSel.selectAll('.island-marker-ring').attr('r', 4.2 * s);
        islandMarkerSel.selectAll('.island-marker-hit').attr('r', Math.max(6, 9 * s));
        if (islandClusterSel) {
          var cRadii = getClusterBaseRadii();
          islandClusterSel.selectAll('.island-cluster-dot').attr('r', cRadii.dot * s);
          islandClusterSel.selectAll('.island-cluster-ring').attr('r', cRadii.ring * s);
          islandClusterSel.selectAll('.island-cluster-halo').attr('r', cRadii.halo * s);
          islandClusterSel.selectAll('.island-cluster-hit').attr('r', Math.max(cRadii.minHit, cRadii.hit * s));
        }
        updateIslandClustering(e.transform.k);
        if (state.cont === 'central') {
          var isHighZoomCaribe = isCaribeZoomed() || e.transform.k >= 7;
          if (mapEl) mapEl.classList.toggle('caribe-zoomed', isHighZoomCaribe);
          var legendEl = document.getElementById('map-legend');
          if (legendEl) legendEl.classList.toggle('caribe-hidden', isHighZoomCaribe);
        }
      }
    });
  svg.call(zoom);

  // B1: A mensagem de gesto deve aparecer uma única vez e desaparecer definitivamente após o primeiro gesto
  var gesto = document.getElementById('map-gesto'), gestoT = null;
  function avisoGesto(txt) {
    if (avisoGestoExibido || hasZoomed) return;
    avisoGestoExibido = true;
    gesto.textContent = txt;
    gesto.classList.add('show');
    clearTimeout(gestoT);
    gestoT = setTimeout(function () { gesto.classList.remove('show'); }, 1800);
  }
  var gestoHideT = null;
  function showTouchHint(txt) {
    if (!gesto || gesto.classList.contains('show')) return;
    gesto.textContent = txt;
    gesto.classList.add('show');
    clearTimeout(gestoHideT);
    gestoHideT = setTimeout(hideTouchHint, 2500);
  }
  function hideTouchHint() {
    clearTimeout(gestoHideT);
    if (gesto) gesto.classList.remove('show');
  }
  var svgNode = svg.node();
  // Trava o zoom do navegador ao rolar com Ctrl/Cmd dentro da área do mapa (mesmo no zoom mínimo)
  mapEl.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }, { capture: true, passive: false });

  svgNode.addEventListener('wheel', function (e) {
    if (tip) tip.hidden = true;
    if (!e.ctrlKey && !e.metaKey && !hasZoomed && !avisoGestoExibido) {
      avisoGesto(IS_MAC ? 'Use ⌘ + roda do mouse para dar zoom' : 'Use Ctrl + roda do mouse para dar zoom');
    }
  }, { passive: true });

  svgNode.addEventListener('touchmove', function () {
    if (tip) tip.hidden = true;
  }, { passive: true });

  var toque = null;
  svgNode.addEventListener('touchstart', function (e) {
    if (tip) tip.hidden = true;
    hideTouchHint();
    if (e.touches.length > 1) {
      setZoomedState(true);
      avisoGestoExibido = true;
      pinchActive = true;
      lastTouchedCountry = null;
      lastTouchTime = 0;
      toque = null;
      return;
    }
    toque = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });

  svgNode.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) {
      setZoomedState(true);
      avisoGestoExibido = true;
      toque = null;
      hideTouchHint();
      return;
    }
    // Aviso só aparece em scroll vertical de 1 dedo sobre o mapa (ainda sem zoom)
    if (toque && !hasZoomed) {
      var dx = e.touches[0].clientX - toque.x, dy = e.touches[0].clientY - toque.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        showTouchHint('Dê pinça com dois dedos para dar zoom no mapa');
      } else if (Math.abs(dx) > Math.abs(dy) * 1.5) {
        hideTouchHint();
      }
    }
  }, { passive: true });

  svgNode.addEventListener('touchend', function (e) {
    hideTouchHint();
    if (e.touches.length === 0) {
      setTimeout(function () { pinchActive = false; }, 200);
    }
  }, { passive: true });
  svgNode.addEventListener('touchcancel', hideTouchHint, { passive: true });

  // B1 / Req 4: Limites geográficos navegáveis ao redor dos continentes com pequena margem de oceano
  function setExtent() {
    var isMobile = window.innerWidth <= 768;
    var padX = isMobile ? W * 0.03 : W * 0.05;
    var padY = isMobile ? H * 0.04 : H * 0.05;
    var bx0 = (mapBounds ? mapBounds.x0 : 0) - padX;
    var by0 = (mapBounds ? mapBounds.y0 : 0) - padY;
    var bx1 = (mapBounds ? mapBounds.x1 : W) + padX;
    var by1 = (mapBounds ? mapBounds.y1 : H) + padY;

    if (state.cont) {
      bx1 += W * (isMobile ? 0.40 : 0.60);
      bx0 -= W * (isMobile ? 0.30 : 0.20);
      by0 -= H * 0.15;
      by1 += H * 0.15;
    }

    var minK = isMobile ? 1.05 : 1;

    zoom
      .scaleExtent([minK, 45])
      .extent([[0, 0], [W, H]])
      .translateExtent([[bx0, by0], [bx1, by1]]);
  }
  function reduceMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function applyZoom(animate) {
    setExtent();
    var z = zoomFor(state.cont, state.country);
    var t = d3.zoomIdentity.translate(z.x, z.y).scale(z.k);
    if (animate && !reduceMotion()) svg.transition().duration(750).ease(d3.easeCubicInOut).call(zoom.transform, t);
    else { svg.interrupt(); svg.call(zoom.transform, t); }
  }
  function zoomBy(f) {
    setZoomedState(true);
    if (reduceMotion()) svg.call(zoom.scaleBy, f);
    else svg.transition().duration(250).call(zoom.scaleBy, f);
  }
  document.getElementById('zoom-in').addEventListener('click', function () { zoomBy(1.6); });
  document.getElementById('zoom-out').addEventListener('click', function () { zoomBy(1 / 1.6); });
  document.getElementById('zoom-reset').addEventListener('click', function () {
    state.focusCaribe = false;
    state.focusEastOceania = false;
    setZoomedState(false);
    avisoGestoExibido = false;
    updateFocusCaribeBtn();
    updateFocusOceaniaBtn();
    applyZoom(true);
  });

  /* ---------- Bloco SUG-28: Alternância de Linhas do Globo e Legenda do Mapa ---------- */
  function setGlobeLinesVisible(visible) {
    showGlobeLines = !!visible;
    if (globeLinesLayer) {
      globeLinesLayer
        .attr('data-visible', String(showGlobeLines))
        .style('display', showGlobeLines ? null : 'none');
      if (showGlobeLines) {
        globeLinesSel.attr('d', function (d) { return path(d.feature); });
        globeGridSel.attr('d', path(globeGridData));
        globeLabelsSel.attr('transform', function (d) {
          var pt = projection(d.labelPoint);
          if (!pt || isNaN(pt[0]) || isNaN(pt[1])) return 'translate(-9999,-9999)';
          return 'translate(' + pt[0] + ',' + pt[1] + ')';
        });
      }
    }
    var topToggle = document.getElementById('btn-toggle-linhas');
    if (topToggle) {
      topToggle.setAttribute('aria-pressed', String(showGlobeLines));
    }
    var switchToggle = document.getElementById('legend-lines-switch');
    if (switchToggle) {
      switchToggle.setAttribute('aria-pressed', String(showGlobeLines));
    }
    var switchLabel = document.getElementById('legend-switch-label');
    if (switchLabel) {
      switchLabel.textContent = showGlobeLines ? 'Visíveis' : 'Ocultas';
    }
    var detailList = document.getElementById('legend-lines-list');
    if (detailList) {
      detailList.hidden = !showGlobeLines;
    }
  }

  var topLinesBtn = document.getElementById('btn-toggle-linhas');
  if (topLinesBtn) {
    topLinesBtn.addEventListener('click', function () {
      setGlobeLinesVisible(!showGlobeLines);
    });
  }
  var switchLinesBtn = document.getElementById('legend-lines-switch');
  if (switchLinesBtn) {
    switchLinesBtn.addEventListener('click', function () {
      setGlobeLinesVisible(!showGlobeLines);
    });
  }

  var legendEl = document.getElementById('map-legend');
  var legendToggleBtn = document.getElementById('map-legend-toggle');
  if (legendEl && legendToggleBtn) {
    legendEl.classList.add('is-collapsed');
    legendToggleBtn.setAttribute('aria-expanded', 'false');
    legendToggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isCol = legendEl.classList.toggle('is-collapsed');
      legendToggleBtn.setAttribute('aria-expanded', String(!isCol));
    });
    // No celular, fecha a legenda se o usuario tocar fora dela no mapa
    document.addEventListener('click', function (e) {
      if (window.innerWidth <= 768 && !legendEl.classList.contains('is-collapsed')) {
        if (!legendEl.contains(e.target)) {
          legendEl.classList.add('is-collapsed');
          legendToggleBtn.setAttribute('aria-expanded', 'false');
        }
      }
    });
  }

  var legendIslandRow = document.getElementById('legend-island-row');
  if (legendIslandRow && islandMarkerSel) {
    legendIslandRow.style.cursor = 'pointer';
    legendIslandRow.setAttribute('title', 'Destaque visual das ilhas no mapa');
    legendIslandRow.addEventListener('mouseenter', function () {
      islandMarkerSel.selectAll('.island-marker-ring').style('stroke', '#38bdf8').style('stroke-width', '2px');
      islandMarkerSel.selectAll('.island-marker-dot').style('filter', 'brightness(1.5)');
    });
    legendIslandRow.addEventListener('mouseleave', function () {
      islandMarkerSel.selectAll('.island-marker-ring').style('stroke', '').style('stroke-width', '');
      islandMarkerSel.selectAll('.island-marker-dot').style('filter', '');
    });
  }

  // Pintura do mapa e cores da América do Sul (B4 e B5)
  function paintMap() {
    var lvl = state.cont ? 'continent' : 'world';
    mapEl.setAttribute('data-level', lvl);
    mapEl.setAttribute('data-cont', state.cont || '');
    countrySel
      .style('fill', function (p) {
        if (state.cont && p.c === state.cont) {
          if (state.cont === 'sul') {
            if (p.country.a2 === 'BR') return 'var(--c-sa-br)';
            if (p.country.a2 === 'PE') return 'var(--c-sa-pe)';
            if (p.country.a2 === 'UY') return 'var(--c-sa-uy)';
            if (p.country.a2 === 'FR') return 'var(--c-sa-gf)';
          }
          return 'var(--p' + (p.country.pi || 0) + ')';
        }
        return 'var(--c-' + p.c + ')';
      })
      .attr('data-sa', function (p) {
        if (state.cont === 'sul' && p.c === 'sul') {
          if (p.country.a2 === 'BR') return 'BR';
          if (p.country.a2 === 'PE') return 'PE';
          if (p.country.a2 === 'UY') return 'UY';
          if (p.country.a2 === 'FR') return 'GF';
        }
        return null;
      })
      .classed('in', function (p) { return state.cont && p.c === state.cont; })
      .classed('out', function (p) { return state.cont && p.c !== state.cont; })
      .classed('nodata-in', function (p) { return state.cont && p.c === state.cont && !countryMedia(p.country, state.cont); })
      .classed('active', function (p) {
        if (!state.country || p.c !== state.cont) return false;
        var matchCountry = p.country === state.country || (state.country.orig && p.country === state.country.orig) || (p.country && state.country.a2 && p.country.a2 === state.country.a2);
        return matchCountry && (state.islandName ? p.islandName === state.islandName : !p.islandName);
      })
      .attr('aria-label', function (p) { return p.islandName || countryDisplayName(p.country, p.c); });

    countrySel
      .classed('hot-spot-marker', function (p) {
        return !!(p.country && p.country.a2 && hotNewsByCountry[p.country.a2]);
      })
      .classed('hot-spot-pulsing', function (p) {
        return !!(hotPulseActive && p.country && p.country.a2 && hotNewsByCountry[p.country.a2]);
      });

    countrySel.filter('.active').raise();
    if (islandMarkerSel) {
      islandMarkerSel
        .style('fill', function (p) {
          if (p.isIsland || p.islandName) {
            return getIslandColor(p);
          }
          if (state.cont && p.c === state.cont) {
            if (state.cont === 'sul') {
              if (p.country.a2 === 'BR') return 'var(--c-sa-br)';
              if (p.country.a2 === 'PE') return 'var(--c-sa-pe)';
              if (p.country.a2 === 'UY') return 'var(--c-sa-uy)';
              if (p.country.a2 === 'FR') return 'var(--c-sa-gf)';
              if (p.country.a2 === 'EC') return 'var(--c-sul)';
            }
            return 'var(--p' + (p.country.pi || 0) + ')';
          }
          return 'var(--c-' + p.c + ')';
        })
        .classed('in', function (p) { return state.cont && p.c === state.cont; })
        .classed('out', function (p) { return state.cont && p.c !== state.cont; })
        .classed('nodata-in', function (p) { return state.cont && p.c === state.cont && !countryMedia(p.country, state.cont); })
        .classed('active', function (p) {
          if (!state.country || p.c !== state.cont) return false;
          var matchCountry = p.country === state.country || (state.country.orig && p.country === state.country.orig) || (p.country && state.country.a2 && p.country.a2 === state.country.a2);
          return matchCountry && (state.islandName ? p.islandName === state.islandName : !p.islandName);
        })
        .attr('aria-label', function (p) { return p.islandName || countryDisplayName(p.country, p.c); });
      islandMarkerSel.filter('.active').raise();
    }
    backBtn.hidden = !state.cont;
    updateFocusCaribeBtn();
    updateFocusOceaniaBtn();
    updateIslandClustering();
    mapEl.setAttribute('data-open', String(!!state.cont));
    var isWorldMode = !state.cont && !state.country;
    var shouldHidePanel = isWorldMode || !!state.panelCollapsed;
    panel.classList.toggle('open', !shouldHidePanel);
    panel.classList.remove('floating-panel');
    panel.classList.toggle('collapsed', shouldHidePanel);
    panel.setAttribute('aria-hidden', String(shouldHidePanel));
    applySheetState();
    if (hint) {
      hint.textContent = state.cont ? 'Clique em um país para ver os veículos de comunicação' : 'Clique em um continente para ver os países';
    }
    if (nav) {
      nav.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-c') === state.cont)); });
      var on = nav.querySelector('[aria-pressed="true"]');
      if (on && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: on.offsetLeft - nav.offsetLeft - 16, behavior: 'smooth' });
    }

    syncQuickRegionPills(false);

    // C2: botão flutuante de fechar no painel de veículos
    if (panelFloatingClose) {
      panelFloatingClose.hidden = !state.country || !!state.panelCollapsed;
    }
    if (panelExpandPill) {
      if (state.panelCollapsed && state.cont) {
        var isMobileCountry = window.innerWidth <= 768 && !!state.country;
        if (isMobileCountry) {
          panelExpandPill.hidden = true;
        } else {
          var pillLabel = 'Expandir painel';
          if (state.country) {
            var pcName = countryDisplayName(state.country, state.cont);
            pillLabel = 'Ver ' + pcName;
          } else if (CONT[state.cont]) {
            pillLabel = 'Ver lista (' + CONT[state.cont].n + ')';
          }
          var pLblEl = panelExpandPill.querySelector('.panel-expand-label');
          if (pLblEl) pLblEl.textContent = pillLabel;
          panelExpandPill.hidden = false;
          panelExpandPill.setAttribute('aria-label', pillLabel);
        }
      } else {
        panelExpandPill.hidden = true;
      }
    }
    if (typeof updateFloatingControlsVisibility === 'function') {
      updateFloatingControlsVisibility();
    }
  }

  // Monitoramento discreto de notícias quentes no mapa (checagem a cada 5 minutos, pulso temporário e não contínuo)
  var hotNewsByCountry = {};
  var v2HotNewsByCountry = {};
  var v2HotNewsUpdatedLabel = '';
  var hotPulseActive = false;
  var hotPulseTimer = null;

  var CLIENT_COUNTRY_PATTERNS = [
    { a2: 'BR', rx: /\b(brasil|bras[ií]lia|lula|stf|congresso|senado|c[aâ]mara|planalto|itamaraty|s[aã]o paulo|rio de janeiro|petrobras|ibovespa|real brasileiro)\b/i },
    { a2: 'US', rx: /\b(eua|estados unidos|washington|casa branca|trump|biden|fed|pent[aá]gono|wall street|nova york|faa|nasa|americano|americanos|americana)\b/i },
    { a2: 'PH', rx: /\b(filipinas|manila|marcos jr|filipino|filipinos)\b/i },
    { a2: 'CN', rx: /\b(china|pequim|beijing|xi jinping|chin[eê]s|chinesa|chineses|xangai|taiwan)\b/i },
    { a2: 'AR', rx: /\b(argentina|buenos aires|milei|argentino|argentinos)\b/i },
    { a2: 'FR', rx: /\b(fran[cç]a|paris|macron|franc[eê]s|francesa)\b/i },
    { a2: 'DE', rx: /\b(alemanha|berlim|scholz|merz|alem[aã]o|alem[aã]|bundestag)\b/i },
    { a2: 'GB', rx: /\b(reino unido|londres|inglaterra|brit[aâ]nico|brit[aâ]nica|starmer|downing street)\b/i },
    { a2: 'PT', rx: /\b(portugal|lisboa|porto|portugu[eê]s|portuguesa|montenegro)\b/i },
    { a2: 'UA', rx: /\b(ucr[aâ]nia|kiev|kyiv|zelensky|ucraniano|ucraniana|donbas)\b/i },
    { a2: 'RU', rx: /\b(r[uú]ssia|moscou|kremlin|putin|russo|russa)\b/i },
    { a2: 'IL', rx: /\b(israel|gaza|tel aviv|jerusal[eé]m|netanyahu|israelense|oriente m[eé]dio)\b/i },
    { a2: 'IR', rx: /\b(ir[aã]|teer[aã]|iraniano|iraniana)\b/i },
    { a2: 'JP', rx: /\b(jap[aã]o|t[oó]quio|japon[eê]s|japonesa|iene)\b/i },
    { a2: 'IN', rx: /\b([ií]ndia|nova d[eé]lhi|modi|indiano|indiana)\b/i },
    { a2: 'MX', rx: /\b(m[eé]xico|cidade do m[eé]xico|sheinbaum|mexicano|mexicana)\b/i },
    { a2: 'ES', rx: /\b(espanha|madri|madrid|s[aá]nchez|espanhol|espanhola)\b/i },
    { a2: 'IT', rx: /\b(it[aá]lia|roma|meloni|italiano|italiana|vaticano)\b/i },
    { a2: 'CA', rx: /\b(canad[aá]|ottawa|toronto|canadense|trudeau|carney)\b/i },
    { a2: 'CL', rx: /\b(chile|santiago|boric|chileno)\b/i },
    { a2: 'CO', rx: /\b(col[oô]mbia|bogot[aá]|petro|colombiano)\b/i },
    { a2: 'VE', rx: /\b(venezuela|caracas|maduro|venezuelano)\b/i },
    { a2: 'KR', rx: /\b(coreia do sul|seul|sul-coreano)\b/i },
    { a2: 'KP', rx: /\b(coreia do norte|pyongyang|kim jong)\b/i },
    { a2: 'AU', rx: /\b(austr[aá]lia|sydney|camberra|australiano)\b/i },
    { a2: 'ZA', rx: /\b([aá]frica do sul|joanesburgo|pret[oó]ria|ramaphosa)\b/i }
  ];

  function inferirPaisesDeTextoClient(texto) {
    var str = String(texto || '');
    if (!str) return [];
    var found = [];
    CLIENT_COUNTRY_PATTERNS.forEach(function (pat) {
      if (pat.rx.test(str) && found.indexOf(pat.a2) === -1) {
        found.push(pat.a2);
      }
    });
    return found;
  }

  function buildHotNewsMapFromEditorial() {
    var map = {};

    // Prioridade 1: v2HotNewsByCountry (abastecido por /api/noticias-quentes)
    if (v2HotNewsByCountry && typeof v2HotNewsByCountry === 'object') {
      Object.keys(v2HotNewsByCountry).forEach(function (code) {
        var a2 = String(code || '').toUpperCase().trim();
        if (a2 && v2HotNewsByCountry[code] && !map[a2]) {
          map[a2] = v2HotNewsByCountry[code];
        }
      });
    }

    // Prioridade 2: Temas ativos da Vitrine IA (vitrineIaMemoryTemas ou lerCacheVitrineIA(true))
    var vitrineTemas = (Array.isArray(vitrineIaMemoryTemas) && vitrineIaMemoryTemas.length)
      ? vitrineIaMemoryTemas
      : (typeof lerCacheVitrineIA === 'function' ? lerCacheVitrineIA(true) : []);
    if (Array.isArray(vitrineTemas) && vitrineTemas.length) {
      vitrineTemas.forEach(function (tm) {
        if (!tm || !tm.titulo_tema) return;
        var kwsStr = Array.isArray(tm.palavras_chave_busca) ? tm.palavras_chave_busca.join(' ') : '';
        var scanText = [tm.titulo_tema || '', tm.gatilho_vitrine || '', tm.sintese_nerd || '', kwsStr].join(' ');
        var codes = inferirPaisesDeTextoClient(scanText);
        if (!codes.length && (tm.categoria_primaria === 'Politica' || tm.categoria_primaria === 'Economia')) {
          codes = ['BR'];
        }
        codes.forEach(function (a2) {
          if (!map[a2]) {
            var cObj = byA2[a2];
            var kwFirst = (Array.isArray(tm.palavras_chave_busca) && tm.palavras_chave_busca[0]) || tm.titulo_tema;
            map[a2] = {
              a2: a2,
              countryName: (cObj && cObj.n) || a2,
              title: tm.titulo_tema,
              source: 'Síntese Rodando o Mundo · V2',
              category: tm.categoria_primaria || 'Em Alta',
              url: tm.rota_editoria || '/radar',
              summary: tm.sintese_nerd || tm.gatilho_vitrine || '',
              termoBusca: extrairTermoAssuntoBusca(kwFirst, tm.categoria_primaria)
            };
          }
        });
      });
    }

    // Prioridade 3: radarFeedCache (usando paises_envolvidos ou inferirPaisesDeTextoClient)
    if (Array.isArray(radarFeedCache) && radarFeedCache.length) {
      radarFeedCache.forEach(function (rItem) {
        if (!rItem || !rItem.titulo) return;
        var rCodes = [];
        if (Array.isArray(rItem.paises_envolvidos) && rItem.paises_envolvidos.length) {
          rItem.paises_envolvidos.forEach(function (c) {
            var up = String(c || '').toUpperCase().trim();
            if (up && rCodes.indexOf(up) === -1) rCodes.push(up);
          });
        }
        var textToScan = (rItem.titulo || '') + ' ' + (rItem.resumo || '') + ' ' + (rItem.analise || '');
        inferirPaisesDeTextoClient(textToScan).forEach(function (c) {
          if (rCodes.indexOf(c) === -1) rCodes.push(c);
        });
        rCodes.forEach(function (a2) {
          if (!map[a2]) {
            var cObj = byA2[a2];
            var rUrl = rItem.fonte_url || rItem.url || rItem.link || '/radar';
            map[a2] = {
              a2: a2,
              countryName: (cObj && cObj.n) || a2,
              title: rItem.titulo,
              source: rItem.fonte_nome || 'Radar ao Vivo',
              category: rItem.categoria || 'Radar',
              url: rUrl,
              summary: rItem.resumo || '',
              termoBusca: extrairTermoAssuntoBusca(rItem.titulo, rItem.categoria),
              dominio: rItem.dominio || ''
            };
          }
        });
      });
    }

    // Prioridade 4: EDITORIAL.resumoDoDia (inferindo país pelo título/resumo primeiro para evitar UA/US fixos incorretos)
    if (EDITORIAL && Array.isArray(EDITORIAL.resumoDoDia)) {
      EDITORIAL.resumoDoDia.forEach(function (item) {
        if (!item || !item.titulo) return;
        var scanTxt = (item.titulo || '') + ' ' + (item.resumoCurto || item.resumo || '');
        var inferred = inferirPaisesDeTextoClient(scanTxt);
        var a2 = inferred.length ? inferred[0] : String(item.codigoPais || '').toUpperCase().trim();
        if (a2 && !map[a2]) {
          var cObj = byA2[a2];
          var urlOrig = item.urlMateriaOriginal || item.url || '';
          map[a2] = {
            a2: a2,
            countryName: (cObj && cObj.n) || a2,
            title: item.titulo,
            source: item.fonte || 'Imprensa',
            category: item.categoria || 'Última hora',
            url: urlOrig,
            summary: item.resumoCurto || item.resumo || '',
            termoBusca: extrairTermoAssuntoBusca(item.termoBusca || item.titulo, item.categoria),
            comparacaoSlug: item.comparacaoSlug || null,
            dominio: item.dominio || ''
          };
        }
      });
    }

    var curatedPulsingDefaults = [
      {
        a2: 'BR',
        title: 'Planalto e Congresso negociam Orçamento, meta fiscal e regras para emendas parlamentares',
        shortTitle: 'Meta fiscal e pacote de corte de gastos',
        source: 'Folha de S.Paulo',
        category: 'Brasil · Política & Fiscal',
        url: 'https://folha.uol.com.br/',
        summary: 'Articulação entre Executivo e Legislativo busca equilibrar o cumprimento do arcabouço fiscal com transparência nas emendas.',
        comparacaoSlug: 'orcamento-brasil-fiscal'
      },
      {
        a2: 'US',
        title: 'Transição e novas diretrizes em Washington sobre tarifas mobilizam governos e mercados globais',
        shortTitle: 'Tarifas comerciais e reação global',
        source: 'Associated Press',
        category: 'Geopolítica & Economia',
        url: 'https://apnews.com/hub/donald-trump',
        summary: 'Definições da Casa Branca sobre tarifas comerciais levam União Europeia, China e América Latina a recalibrar estratégias.',
        comparacaoSlug: 'transicao-eua-tarifas'
      },
      {
        a2: 'UA',
        title: 'Negociações diplomáticas e segurança energética na Europa Oriental',
        shortTitle: 'Negociações de cessar-fogo e segurança no Leste Europeu',
        source: 'The Kyiv Independent',
        category: 'Segurança Internacional',
        url: 'https://kyivindependent.com/',
        summary: 'Encontros diplomáticos abordam infraestrutura elétrica e rotas de abastecimento no leste europeu.',
        comparacaoSlug: null
      },
      {
        a2: 'GB',
        title: 'Reino Unido debate acordos comerciais pós-Brexit e orçamento de defesa europeu',
        shortTitle: 'Acordos comerciais pós-Brexit e defesa europeia',
        source: 'BBC News',
        category: 'Europa & Economia',
        url: 'https://www.bbc.com/news',
        summary: 'Parlamento britânico discute cooperação comercial e financiamento estratégico com aliados europeus.',
        comparacaoSlug: null
      },
      {
        a2: 'FR',
        title: 'Impasse orçamentário na Assembleia Nacional francesa e diretrizes da União Europeia',
        shortTitle: 'Impasse orçamentário na Assembleia Nacional e UE',
        source: 'Le Monde',
        category: 'Política Europeia',
        url: 'https://www.lemonde.fr/',
        summary: 'Bancadas debatem metas de déficit público e competitividade industrial no bloco europeu.',
        comparacaoSlug: null
      }
    ];

    curatedPulsingDefaults.forEach(function (fb) {
      var cObj = byA2[fb.a2];
      if (!map[fb.a2]) {
        map[fb.a2] = {
          a2: fb.a2,
          countryName: (cObj && cObj.n) || fb.a2,
          title: fb.title,
          shortTitle: fb.shortTitle,
          source: fb.source,
          category: fb.category || 'Destaque',
          url: fb.url,
          summary: fb.summary,
          termoBusca: extrairTermoAssuntoBusca(fb.shortTitle || fb.title, fb.category || 'Destaque'),
          comparacaoSlug: fb.comparacaoSlug || null
        };
      } else {
        if (!map[fb.a2].shortTitle) map[fb.a2].shortTitle = fb.shortTitle;
        if (fb.a2 === 'BR' && !map[fb.a2].comparacaoSlug) map[fb.a2].comparacaoSlug = 'orcamento-brasil-fiscal';
        if (fb.a2 === 'US' && !map[fb.a2].comparacaoSlug) map[fb.a2].comparacaoSlug = 'transicao-eua-tarifas';
      }
    });
    return map;
  }

  function getVeiculosCountByPais(paisIso) {
    var a2 = String(paisIso || '').toUpperCase().trim();
    if (!a2) return 0;
    var cObj = byA2[a2];
    var cMed = cObj ? countryMedia(cObj, cObj.c) : (DATA && DATA.media ? DATA.media[a2] : null);
    var veiculosFiltrados = (cMed && Array.isArray(cMed.outlets)) ? cMed.outlets : [];
    return veiculosFiltrados.length;
  }

  function obterManchetesAgrupadasPorEspectro(paisIso, hotItem) {
    var a2 = String(paisIso || '').toUpperCase().trim();
    if (!a2) return [];
    var slug = (hotItem && hotItem.comparacaoSlug) || '';
    if (!slug) {
      if (a2 === 'BR') slug = 'orcamento-brasil-fiscal';
      else if (a2 === 'US') slug = 'transicao-eua-tarifas';
    }
    var comp = (slug && EDITORIAL && EDITORIAL.comparacoes && EDITORIAL.comparacoes[slug])
      ? EDITORIAL.comparacoes[slug]
      : null;

    var specMap = { E: [], I: [], D: [] };
    var specLabels = { E: 'Esquerda', I: 'Centro', D: 'Direita' };

    if (comp && String(comp.paisIso || '').toUpperCase() === a2 && Array.isArray(comp.veiculosComparados)) {
      var cObj = byA2[a2];
      var cMed = cObj ? countryMedia(cObj, cObj.c) : (DATA && DATA.media ? DATA.media[a2] : null);
      var outletsByName = {};
      if (cMed && Array.isArray(cMed.outlets)) {
        cMed.outlets.forEach(function (o) {
          if (o && o.n) outletsByName[o.n.toLowerCase()] = o;
        });
      }

      comp.veiculosComparados.forEach(function (v) {
        if (!v || !v.veiculo) return;
        var matchedOutlet = outletsByName[String(v.veiculo).toLowerCase()];
        var biasCode = v.vies || (matchedOutlet && matchedOutlet.b) || 'I';
        if (!specMap[biasCode]) biasCode = 'I';
        specMap[biasCode].push({
          veiculo: v.veiculo,
          pais: v.pais || a2,
          vies: biasCode,
          rotuloEspectro: specLabels[biasCode],
          titulo: v.tituloPT || v.tituloOrig || '',
          tituloOrig: v.tituloOrig || '',
          enfoque: v.enfoque || '',
          url: v.url || (matchedOutlet && matchedOutlet.u) || '#'
        });
      });
    } else if (hotItem && hotItem.title) {
      specMap.I.push({
        veiculo: hotItem.source || 'Imprensa',
        pais: a2,
        vies: 'I',
        rotuloEspectro: 'Centro',
        titulo: hotItem.title,
        enfoque: hotItem.summary || '',
        url: hotItem.url || '#'
      });
    }

    var grupos = [];
    ['E', 'I', 'D'].forEach(function (code) {
      if (specMap[code] && specMap[code].length > 0) {
        grupos.push({
          codigo: code,
          rotulo: specLabels[code],
          manchetes: specMap[code]
        });
      }
    });
    return grupos;
  }

  function getDestaquesPulsando() {
    if (!hotNewsByCountry || !Object.keys(hotNewsByCountry).length) {
      hotNewsByCountry = buildHotNewsMapFromEditorial();
    }
    var preferredOrder = ['BR', 'US', 'UA', 'GB', 'FR', 'DE', 'AR', 'CN', 'IL', 'JP'];
    var activeCodes = Object.keys(hotNewsByCountry);
    activeCodes.sort(function (a, b) {
      var ia = preferredOrder.indexOf(a);
      var ib = preferredOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    var selecionados = activeCodes.slice(0, 5);
    return selecionados.map(function (iso) {
      var hot = hotNewsByCountry[iso] || {};
      var cObj = byA2[iso] || { id: iso, a2: iso, n: hot.countryName || iso, c: 'europa' };
      var cMed = countryMedia(cObj, cObj.c);
      var veiculosFiltrados = (cMed && Array.isArray(cMed.outlets)) ? cMed.outlets : [];
      var manchetesAgrupadas = obterManchetesAgrupadasPorEspectro(iso, hot);
      var temComparacao = manchetesAgrupadas.length >= 2;
      var compSlug = hot.comparacaoSlug || (iso === 'BR' ? 'orcamento-brasil-fiscal' : (iso === 'US' ? 'transicao-eua-tarifas' : ''));
      var rawTitle = hot.shortTitle || hot.title || 'Notícias em destaque agora';

      return {
        paisIso: iso,
        paisNome: countryDisplayName(cObj, cObj.c) || hot.countryName || iso,
        bandeira: getFlagEmoji(iso),
        temaTitulo: rawTitle,
        temaSlug: temComparacao ? compSlug : (hot.termoBusca || ''),
        veiculosCount: veiculosFiltrados.length,
        temComparacaoEspectro: temComparacao,
        espectrosDisponiveis: manchetesAgrupadas.map(function (g) { return g.rotulo; }),
        manchetesAgrupadas: manchetesAgrupadas
      };
    });
  }

  function selecionarPais(paisIso, opts) {
    opts = opts || {};
    var iso = String(paisIso || '').toUpperCase().trim();
    if (!iso) return;
    var cObj = byA2[iso];
    if (!cObj) return;
    var contKey = cObj.c || 'europa';
    go(contKey, cObj, {
      keepPanelClosed: !!opts.keepPanelClosed,
      replaceUrl: !!opts.replaceUrl
    });
    var trackEl = document.getElementById('pulsando-agora-track');
    if (trackEl) {
      trackEl.querySelectorAll('.pulsando-card').forEach(function (card) {
        var isMatch = card.getAttribute('data-country-iso') === iso;
        card.classList.toggle('is-active', isMatch);
      });
    }
  }

  function handlePulsandoCardActivation(item) {
    if (!item || !item.paisIso) return;
    if (item.temComparacaoEspectro && item.temaSlug) {
      selecionarPais(item.paisIso, { keepPanelClosed: true, replaceUrl: true });
      showComparisonPage(item.temaSlug, {
        inlineBelowMap: true,
        paisIso: item.paisIso,
        replaceUrl: true
      });
      var compViewEl = document.getElementById('comparison-view');
      if (compViewEl && !compViewEl.hidden) {
        setTimeout(function () {
          compViewEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    } else {
      var compViewHide = document.getElementById('comparison-view');
      if (compViewHide) {
        compViewHide.hidden = true;
        compViewHide.innerHTML = '';
      }
      selecionarPais(item.paisIso, { keepPanelClosed: false });
      if (panel && window.innerWidth <= 768) {
        setTimeout(function () {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
      }
    }
  }

  function renderPulsandoAgoraTrack() {
    var trackEl = document.getElementById('pulsando-agora-track');
    if (!trackEl) return;
    var destaques = getDestaquesPulsando();
    if (!destaques || !destaques.length) {
      trackEl.innerHTML = '';
      return;
    }

    var activeIso = (state && state.country && state.country.a2) ? String(state.country.a2).toUpperCase() : '';
    var html = '';
    destaques.forEach(function (item, idx) {
      var cObj = byA2[item.paisIso];
      var flagHtml = (cObj && typeof countryFlag === 'function')
        ? countryFlag(cObj, 'flag-xs', cObj.c)
        : '<span class="pulsando-card-emoji-flag" aria-hidden="true">' + esc(item.bandeira) + '</span>';
      var isCurrent = activeIso && activeIso === item.paisIso;

      var footerHtml = '';
      if (item.temComparacaoEspectro) {
        var pillsHtml = item.espectrosDisponiveis.map(function (rotulo) {
          var codeCls = rotulo === 'Esquerda' ? 'spec-e' : (rotulo === 'Direita' ? 'spec-d' : 'spec-i');
          return '<span class="pulsando-spec-pill ' + codeCls + '">' + esc(rotulo) + '</span>';
        }).join('<span class="pulsando-spec-dot" aria-hidden="true">•</span>');

        footerHtml =
          '<div class="pulsando-card-spectra" aria-label="Espectros disponíveis: ' + esc(item.espectrosDisponiveis.join(', ')) + '">' +
            pillsHtml +
          '</div>' +
          '<span class="pulsando-card-cta is-compare">Comparar cobertura →</span>';
      } else {
        footerHtml =
          '<div class="pulsando-card-spectra is-single">' +
            '<span class="pulsando-spec-single">Cobertura em tempo real</span>' +
          '</div>' +
          '<span class="pulsando-card-cta is-map">Ver no mapa →</span>';
      }

      html +=
        '<article class="pulsando-card' + (isCurrent ? ' is-active' : '') + '" role="listitem" tabindex="0"' +
          ' data-pulsando-idx="' + idx + '"' +
          ' data-country-iso="' + esc(item.paisIso) + '"' +
          ' data-tema-slug="' + esc(item.temaSlug || '') + '"' +
          ' data-tem-comparacao="' + String(!!item.temComparacaoEspectro) + '"' +
          ' aria-label="' + esc(item.paisNome + ' — ' + item.veiculosCount + ' veículos — ' + item.temaTitulo) + '">' +
          '<div class="pulsando-card-top">' +
            '<div class="pulsando-card-country">' +
              flagHtml +
              '<span class="pulsando-card-country-name">' + esc(item.paisNome) + '</span>' +
            '</div>' +
            '<span class="pulsando-card-badge">' + esc(item.veiculosCount) + ' veículos</span>' +
          '</div>' +
          '<div class="pulsando-card-body">' +
            '<h3 class="pulsando-card-title">' + esc(item.temaTitulo) + '</h3>' +
          '</div>' +
          '<div class="pulsando-card-footer">' +
            footerHtml +
          '</div>' +
        '</article>';
    });

    trackEl.innerHTML = html;

    trackEl.querySelectorAll('.pulsando-card').forEach(function (cardEl) {
      var idx = parseInt(cardEl.getAttribute('data-pulsando-idx'), 10);
      var itemObj = destaques[idx];
      if (!itemObj) return;
      cardEl.addEventListener('click', function () {
        handlePulsandoCardActivation(itemObj);
      });
      cardEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePulsandoCardActivation(itemObj);
        }
      });
    });
  }

  window.getDestaquesPulsando = getDestaquesPulsando;
  window.selecionarPais = selecionarPais;
  window.renderPulsandoAgoraTrack = renderPulsandoAgoraTrack;

  function updateHotNewsPillUI() {
    var pill = document.getElementById('map-hot-news-pill');
    var pillText = document.getElementById('map-hot-news-text');
    if (!pill || !pillText) return;
    var codes = Object.keys(hotNewsByCountry);
    if (!codes.length) {
      pill.hidden = true;
      return;
    }
    var names = codes.slice(0, 4).map(function (code) {
      return hotNewsByCountry[code].countryName || code;
    });
    var extra = codes.length > 4 ? ' +' + (codes.length - 4) : '';
    pillText.textContent = '🔥 Notícias quentes agora: ' + names.join(', ') + extra + ' · ' + (v2HotNewsUpdatedLabel || 'Passe o cursor no país para ler');
    pill.hidden = false;
  }

  function syncQuickCountryCardsHotNews() {
    var cards = document.querySelectorAll('.quick-country-card');
    if (cards && cards.length) {
      cards.forEach(function (card) {
        var a2 = String(card.getAttribute('data-country-a2') || '').toUpperCase().trim();
        var hasHot = !!(a2 && hotNewsByCountry && hotNewsByCountry[a2]);
        if (hasHot) {
          card.classList.add('hot-spot-marker');
          if (hotPulseActive) {
            card.classList.add('hot-spot-pulsing');
          } else {
            card.classList.remove('hot-spot-pulsing');
          }
          var item = hotNewsByCountry[a2];
          if (item && (item.title || item.summary)) {
            card.setAttribute('title', '🔥 Notícia quente em tempo real: ' + (item.title || item.summary));
          }
        } else {
          card.classList.remove('hot-spot-marker', 'hot-spot-pulsing');
        }
      });
    }

    var chips = document.querySelectorAll('.quick-popular-chips .quick-chip');
    if (chips && chips.length) {
      chips.forEach(function (chip) {
        var code = String(chip.getAttribute('data-quick-country') || '').toUpperCase().trim();
        var hasHot = !!(code && hotNewsByCountry && hotNewsByCountry[code]);
        if (hasHot) {
          chip.classList.add('hot-spot-marker');
          if (hotPulseActive) {
            chip.classList.add('hot-spot-pulsing');
          } else {
            chip.classList.remove('hot-spot-pulsing');
          }
        } else {
          chip.classList.remove('hot-spot-marker', 'hot-spot-pulsing');
        }
      });
    }
  }

  // =========================================================================
  // GESTOR DE ATUALIZAÇÕES AUTÔNOMAS E UX ANTI-LAYOUT SHIFT (MOTOR V2)
  // =========================================================================
  var AUTONOMOUS_INTERVAL_MS = 6 * 60 * 1000; // 6 minutos (faixa 5-8 min)
  var VISIBILITY_STALE_MS = 10 * 60 * 1000; // 10 minutos para revalidar ao voltar para a aba

  var pendingAutonomousUpdates = {
    radar: null,
    vitrineIa: null,
    entendaV2: null,
    hotNews: null
  };

  var lastAutonomousFetchTimestamps = {
    radar: 0,
    vitrineIa: 0,
    entendaV2: 0,
    hotNews: 0
  };

  function isUserReadingOrInteractingWith(elementOrId) {
    var el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el || el.hidden) return false;

    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    var vw = window.innerWidth || document.documentElement.clientWidth || 1200;

    // Está dentro do viewport visível?
    var inViewport = (rect.bottom > 50 && rect.top < vh - 50 && rect.right > 0 && rect.left < vw);
    if (!inViewport) return false;

    // Hover ativo ou cursor sobre o elemento
    try {
      if (el.matches(':hover') || el.querySelector(':hover')) return true;
    } catch (e) {}

    // Foco ou seleção ativa de texto pelo leitor
    try {
      if (el.contains(document.activeElement) && document.activeElement !== document.body) return true;
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.anchorNode && el.contains(sel.anchorNode)) {
        return true;
      }
    } catch (e) {}

    // Card ou sanfona expandida pelo usuário
    if (el.querySelector('.is-expanded, [aria-expanded="true"]')) return true;

    // Visível, mas sem interação ativa: pode receber atualizações suaves sem atrapalhar a leitura.
    return false;
  }

  function flushPendingAutonomousUpdates() {
    var keys = ['radar', 'vitrineIa', 'entendaV2', 'hotNews'];
    var targetElements = {
      radar: 'radar-cards-list',
      vitrineIa: 'vitrine-ia-grid',
      entendaV2: 'radar-v2-colunas-wrap',
      hotNews: 'pulsando-agora-container'
    };

    keys.forEach(function (k) {
      if (typeof pendingAutonomousUpdates[k] === 'function') {
        var elId = targetElements[k];
        if (document.hidden || !isUserReadingOrInteractingWith(elId)) {
          var updateFn = pendingAutonomousUpdates[k];
          pendingAutonomousUpdates[k] = null;
          try {
            updateFn();
          } catch (e) {
            console.warn('[AutonomousUpdate] Erro ao aplicar atualização suave (' + k + '):', e);
          }
        }
      }
    });
  }

  function startUnifiedAutonomousUpdates() {
    // 1. Polling contínuo autônomo em segundo plano (a cada 6 minutos)
    setInterval(function () {
      if (document.hidden) return;
      checkHotNewsOnMap(true);
      if (typeof carregarVitrineIA === 'function') {
        carregarVitrineIA({ isAutoRefresh: true, categoria: vitrineIaSelectedCategory });
      }
      if (typeof renderDossiesRotativosHome === 'function') renderDossiesRotativosHome();
      if (state && state.editorialSection === 'radar' && typeof loadRadarCards === 'function') {
        loadRadarCards(false, true);
      }
      if (typeof carregarColunasEntendaV2 === 'function') {
        carregarColunasEntendaV2(false, true);
      }
    }, AUTONOMOUS_INTERVAL_MS);

    // 2. Revalidação ao alternar de aba (visibilitychange)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        flushPendingAutonomousUpdates();
      } else {
        var now = Date.now();
        if (now - lastAutonomousFetchTimestamps.hotNews >= VISIBILITY_STALE_MS) {
          checkHotNewsOnMap(true);
        }
        if (typeof carregarVitrineIA === 'function' && (now - lastAutonomousFetchTimestamps.vitrineIa >= VISIBILITY_STALE_MS)) {
          carregarVitrineIA({ isAutoRefresh: true, categoria: vitrineIaSelectedCategory });
        }
        if (typeof renderDossiesRotativosHome === 'function') renderDossiesRotativosHome();
        if (state && state.editorialSection === 'radar' && typeof loadRadarCards === 'function' && (now - lastAutonomousFetchTimestamps.radar >= VISIBILITY_STALE_MS)) {
          loadRadarCards(false, true);
        }
        if (typeof carregarColunasEntendaV2 === 'function' && (now - lastAutonomousFetchTimestamps.entendaV2 >= VISIBILITY_STALE_MS)) {
          carregarColunasEntendaV2(false, true);
        }
        flushPendingAutonomousUpdates();
      }
    });

    // 3. Despejo suave de buffer quando o leitor rolar para fora da seção
    var scrollThrottleTimer = null;
    window.addEventListener('scroll', function () {
      if (scrollThrottleTimer) return;
      scrollThrottleTimer = setTimeout(function () {
        scrollThrottleTimer = null;
        flushPendingAutonomousUpdates();
      }, 300);
    }, { passive: true });
  }

  function triggerHotNewsPulseCycle() {
    hotNewsByCountry = buildHotNewsMapFromEditorial();
    hotPulseActive = true;
    updateHotNewsPillUI();
    var pulsandoEl = document.getElementById('pulsando-agora-container');
    if (isUserReadingOrInteractingWith(pulsandoEl)) {
      pendingAutonomousUpdates.hotNews = function () {
        renderPulsandoAgoraTrack();
        syncQuickCountryCardsHotNews();
      };
    } else {
      renderPulsandoAgoraTrack();
      syncQuickCountryCardsHotNews();
    }
    var pill = document.getElementById('map-hot-news-pill');
    if (pill) pill.classList.add('is-pulsing');
    if (countrySel) {
      countrySel
        .classed('hot-spot-marker', function (p) {
          return !!(p.country && p.country.a2 && hotNewsByCountry[p.country.a2]);
        })
        .classed('hot-spot-pulsing', function (p) {
          return !!(p.country && p.country.a2 && hotNewsByCountry[p.country.a2]);
        });
    }
    syncQuickCountryCardsHotNews();
    if (hotPulseTimer) clearTimeout(hotPulseTimer);
    // Pulso discreto dura apenas ~14 segundos (5 ciclos suaves) e depois para, evitando animação contínua
    hotPulseTimer = setTimeout(function () {
      hotPulseActive = false;
      if (pill) pill.classList.remove('is-pulsing');
      if (countrySel) {
        countrySel.classed('hot-spot-pulsing', false);
      }
      syncQuickCountryCardsHotNews();
    }, 14000);
  }

  function checkHotNewsOnMap(isPeriodic) {
    lastAutonomousFetchTimestamps.hotNews = Date.now();
    if (!isPeriodic) {
      triggerHotNewsPulseCycle();
    }
    var hotUrl = '/api/noticias-quentes?_t=' + Date.now() + (isPeriodic ? '&refresh=1' : '');
    fetch(hotUrl, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.ok) return;
        var nextV2Map = {};
        if (Array.isArray(data.paises_em_alta)) {
          data.paises_em_alta.forEach(function (pa) {
            if (!pa || !pa.a2) return;
            var a2 = String(pa.a2).toUpperCase().trim();
            var cObj = byA2[a2];
            if (a2 && !nextV2Map[a2]) {
              nextV2Map[a2] = {
                a2: a2,
                countryName: pa.countryName || (cObj && cObj.n) || a2,
                title: pa.title || '',
                source: pa.source || data.identificacao_editorial || 'Síntese Rodando o Mundo · V2',
                category: pa.category || 'Radar',
                url: pa.url || '/radar',
                summary: pa.summary || '',
                termoBusca: extrairTermoAssuntoBusca(pa.termoBusca || pa.title || '', pa.category || 'Radar')
              };
            }
          });
        }
        if (Array.isArray(data.noticias_quentes)) {
          data.noticias_quentes.forEach(function (nq) {
            if (!nq || !nq.titulo_curto) return;
            var codes = [];
            if (Array.isArray(nq.paises_envolvidos) && nq.paises_envolvidos.length) {
              nq.paises_envolvidos.forEach(function (c) {
                var up = String(c || '').toUpperCase().trim();
                if (up && codes.indexOf(up) === -1) codes.push(up);
              });
            }
            if (!codes.length) {
              var scan = [nq.titulo_curto || '', nq.resumo_pulso || '', (nq.palavras_chave || []).join(' ')].join(' ');
              codes = inferirPaisesDeTextoClient(scan);
            }
            codes.forEach(function (a2) {
              if (a2 && !nextV2Map[a2]) {
                var cObj = byA2[a2];
                var srcName = (Array.isArray(nq.veiculos_origem) && nq.veiculos_origem[0]) || data.identificacao_editorial || 'Síntese Rodando o Mundo · V2';
                var fUrl = (Array.isArray(nq.fontes_urls) && nq.fontes_urls[0]) || '/radar';
                var kw = (Array.isArray(nq.palavras_chave) && nq.palavras_chave[0]) || nq.titulo_curto;
                nextV2Map[a2] = {
                  a2: a2,
                  countryName: (cObj && cObj.n) || a2,
                  title: nq.titulo_curto,
                  source: srcName,
                  category: nq.categoria || 'Radar',
                  url: fUrl,
                  summary: nq.resumo_pulso || nq.impacto_pratico || '',
                  termoBusca: extrairTermoAssuntoBusca(kw, nq.categoria || 'Radar')
                };
              }
            });
          });
        }
        if (Object.keys(nextV2Map).length > 0) {
          v2HotNewsByCountry = nextV2Map;
        }
        if (data.atualizado_em) {
          v2HotNewsUpdatedLabel = data.atualizado_em;
        }
      })
      .catch(function () {})
      .finally(function () {
        triggerHotNewsPulseCycle();
      });

    if (isPeriodic) {
      fetch('/api/resumo?_t=' + Date.now(), { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (data) {
          if (data && Array.isArray(data.items) && data.items.length) {
            EDITORIAL.resumoDoDia = data.items;
          }
        })
        .catch(function () {})
        .finally(function () {
          triggerHotNewsPulseCycle();
        });
    }
  }

  // Interação B3: hover no desktop, toque no celular com duplo toque ou chip
  function showTip(evt, text, hotInfo) {
    var r = mapEl.getBoundingClientRect();
    tip.hidden = false;
    if (hotInfo && hotInfo.title) {
      var shortTitle = hotInfo.title.length > 95 ? hotInfo.title.slice(0, 94) + '…' : hotInfo.title;
      tip.innerHTML = '<div>' + esc(text) + '</div>' +
        '<div class="tooltip-hot-news">' +
          '<strong>🔥 Notícia quente em ' + esc(hotInfo.countryName || '') + ' (' + esc(hotInfo.source || 'Imprensa') + ')</strong>' +
          '<span>' + esc(shortTitle) + '</span>' +
          '<small class="tooltip-hot-cta">Clique no país para ler a matéria completa</small>' +
        '</div>';
    } else {
      tip.textContent = text;
    }

    tip.classList.remove('tooltip--below');
    var tipRect = tip.getBoundingClientRect();
    var x = evt.clientX - r.left;
    var y = evt.clientY - r.top;

    // Se não couber acima do cursor, inverte para baixo para não cortar no topo do mapa
    if (y - tipRect.height - 14 < 8) {
      tip.classList.add('tooltip--below');
    }

    // Garante que não ultrapasse as bordas laterais do mapa
    var halfW = tipRect.width / 2;
    var minX = halfW + 8;
    var maxX = Math.max(minX, r.width - halfW - 8);
    x = Math.max(minX, Math.min(maxX, x));

    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function updateFloatingControlsVisibility() {
    updateMobileChipVisibility();
    if (panelFloatingClose) {
      if (!state.country || state.panelCollapsed || window.innerWidth > 768) {
        panelFloatingClose.hidden = true;
      } else if (panel && panel.classList.contains('open')) {
        var rect = panel.getBoundingClientRect();
        // Só mostra "Voltar ao mapa" flutuante quando o usuário realmente rolou para dentro dos veículos/painel
        var userInPanel = rect.top < 120 && rect.bottom > 200;
        panelFloatingClose.hidden = !userInPanel;
      } else {
        panelFloatingClose.hidden = true;
      }
    }
  }

  function getCountryOutletsCount(c, cont) {
    if (!c) return 0;
    var cMed = countryMedia(c, cont);
    return (cMed && Array.isArray(cMed.outlets)) ? cMed.outlets.length : 0;
  }

  function updateMobileChipVisibility() {
    var outletsCount = getCountryOutletsCount(state.country, state.cont);
    if (!mobileChip || !state.country || window.innerWidth > 768 || outletsCount <= 1) {
      if (mobileChip) {
        mobileChip.style.opacity = '0';
        mobileChip.style.pointerEvents = 'none';
        mobileChip.hidden = true;
      }
      return;
    }

    var shouldShow = false;
    var winHChip = window.innerHeight || document.documentElement.clientHeight || 0;

    // Leitura comparada ativa (Cobertura Comparada / espectro editorial): se o usuário já chegou
    // à seção comparativa (ou está rolando por ela), o chip "Ver veículos" é desnecessário.
    var compViewChip = document.getElementById('comparison-view');
    if (compViewChip && !compViewChip.hidden && compViewChip.offsetParent !== null) {
      var compRectChip = compViewChip.getBoundingClientRect();
      if (compRectChip.height > 0 && compRectChip.top < winHChip) {
        mobileChip.style.opacity = '0';
        mobileChip.style.pointerEvents = 'none';
        mobileChip.hidden = true;
        return;
      }
    }

    if (state.panelCollapsed) {
      // Só exibe o botão flutuante enquanto o usuário ainda está na área do mapa (some ao rolar para baixo)
      var scrollYChip = window.scrollY || window.pageYOffset || 0;
      var mapRectChip = mapEl ? mapEl.getBoundingClientRect() : null;
      var mapVisibleChip = !mapRectChip || mapRectChip.bottom > winHChip * 0.45;
      shouldShow = mapVisibleChip && scrollYChip <= 120;
    } else if (panel && panel.classList.contains('open')) {
      var rect = panel.getBoundingClientRect();
      var winH = window.innerHeight || document.documentElement.clientHeight || 0;

      // O começo da caixa de opções é considerado visível se o topo do painel já entrou na tela
      // (com margem de 40px para que não haja sobreposição visual do chip com o topo da caixa)
      // e o painel ainda está presente na área de visão (não foi rolado completamente para cima).
      var panelStartIsVisible = rect.top < (winH - 40) && rect.bottom > 50;

      // Se o começo da caixa de opções NÃO der para ver porque o painel está abaixo da tela
      // (rect.top >= winH - 40), aí sim o botão de ver veículos aparece para clicar e rolar até ela!
      if (!panelStartIsVisible && rect.top >= (winH - 40)) {
        shouldShow = true;
      }
    }

    if (shouldShow) {
      if (mobileChip.hidden || mobileChip.style.opacity !== '1') {
        mobileChip.hidden = false;
        mobileChip.style.opacity = '1';
        mobileChip.style.pointerEvents = 'auto';
      }
    } else {
      if (!mobileChip.hidden || mobileChip.style.opacity !== '0') {
        mobileChip.style.opacity = '0';
        mobileChip.style.pointerEvents = 'none';
        mobileChip.hidden = true;
      }
    }
  }

  function hideMobileChip() {
    if (mobileChip) {
      mobileChip.style.opacity = '0';
      mobileChip.style.pointerEvents = 'none';
      mobileChip.hidden = true;
    }
    mobileSelectedCountry = null;
    countrySel.classed('mobile-selected', false);
    if (islandMarkerSel) islandMarkerSel.classed('mobile-selected', false);
    updateFloatingControlsVisibility();
  }

  function showMobileChip(c, cont) {
    if (!mobileChip || !c) return;
    var outletsCount = getCountryOutletsCount(c, cont);
    if (outletsCount <= 1) {
      hideMobileChip();
      return;
    }
    if (mobileChipFlag) mobileChipFlag.innerHTML = countryFlag(c, 'flag-sm', cont);
    if (mobileChipName) mobileChipName.textContent = countryDisplayName(c, cont);
    var langStr = countryDominantLangs(c, cont);
    if (mobileChipLang) {
      mobileChipLang.textContent = langStr ? 'Idioma: ' + langStr : '';
      mobileChipLang.style.display = langStr ? 'block' : 'none';
    }
    // Não força a exibição se o começo da caixa de opções já estiver visível na tela
    updateFloatingControlsVisibility();
    requestAnimationFrame(updateFloatingControlsVisibility);
  }

  if (mobileChip) {
    mobileChip.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var outletsCount = getCountryOutletsCount(state.country, state.cont);
      if (outletsCount <= 1) {
        hideMobileChip();
        return;
      }
      if (state.panelCollapsed) {
        setPanelCollapsed(false);
      }
      mobileChip.style.opacity = '0';
      mobileChip.style.pointerEvents = 'none';
      mobileChip.hidden = true;
      // Rola sempre PARA BAIXO até a âncora da lista de veículos (#veiculos), nunca para o topo.
      // Aguarda o layout do painel recém-expandido antes de medir.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var anchor = document.getElementById('veiculos');
          if (!anchor || anchor.offsetParent === null) anchor = panel;
          if (!anchor || anchor.offsetParent === null) return;
          var aRect = anchor.getBoundingClientRect();
          // Se a âncora já está acima da viewport, não faz scroll reverso para o topo
          if (aRect.top < 0 && aRect.bottom > 0) return;
          if (aRect.bottom <= 0) return;
          anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    });
  }

  var floatingControlsRaf = 0;
  function scheduleFloatingControlsUpdate() {
    if (floatingControlsRaf) return;
    floatingControlsRaf = requestAnimationFrame(function () {
      floatingControlsRaf = 0;
      updateFloatingControlsVisibility();
    });
  }

  window.addEventListener('scroll', function () {
    if (tip && !tip.hidden) tip.hidden = true;
    scheduleFloatingControlsUpdate();
  }, { passive: true });

  window.addEventListener('resize', function () {
    scheduleFloatingControlsUpdate();
  }, { passive: true });

  // Toque em área vazia (oceano / fundo) limpa a seleção
  svg.on('click', function (evt) {
    if (evt.target.tagName === 'svg' || evt.target.classList.contains('sphere') || evt.target.classList.contains('graticule')) {
      hideMobileChip();
      if (tip) tip.hidden = true;
      if (state.country) {
        go(state.cont, null);
      }
    }
  });

  function handleMapItemMove(evt, p) {
    if (evt.pointerType === 'touch') return;
    var c = p.country;
    var cName = p.islandName || countryDisplayName(c, p.c);
    var m = countryMedia(c, p.c);
    var hotInfo = (c && c.a2 && hotNewsByCountry[c.a2]) ? hotNewsByCountry[c.a2] : null;
    if (!state.cont || p.c !== state.cont) {
      countrySel.classed('cont-hover', function (g) { return g.c === p.c; });
      if (islandMarkerSel) islandMarkerSel.classed('cont-hover', function (g) { return g.c === p.c; });
      var baseTip = state.cont ? 'Ir para ' + CONT[p.c].n : (CONT[p.c].n + (cName ? ' · ' + cName : ''));
      showTip(evt, baseTip, hotInfo);
    } else {
      var n = m ? m.outlets.length + ' veículos' : 'sem veículos cadastrados';
      showTip(evt, cName + ' · ' + n, hotInfo);
    }
  }

  function handleMapItemLeave() {
    tip.hidden = true;
    countrySel.classed('cont-hover', false);
    if (islandMarkerSel) islandMarkerSel.classed('cont-hover', false);
  }

  function handleMapItemClick(evt, p) {
    if (tip) tip.hidden = true;
    countrySel.classed('cont-hover', false);
    if (islandMarkerSel) islandMarkerSel.classed('cont-hover', false);

    var isTouch = evt.pointerType === 'touch' || (window.matchMedia('(pointer: coarse)').matches && !evt.clientX);
    if (isTouch && pinchActive) return; // Dois dedos nunca contam como toque

    if (!state.cont) {
      hideMobileChip();
      if (p.isIsland || p.islandName) {
        setPanelCollapsed(false);
        var targetCont = (p.isIsland || p.islandName) ? p.c : ((inCont(p.country, state.cont)) ? state.cont : p.c);
        go(targetCont, p.country, { islandName: p.islandName, islandFlag: p.islandFlag });
        return;
      }
      go(p.c, null);
      return;
    }

    // Se clicar em um país pertencente a outro continente no mapa (ex: Ásia estando na Oceania)
    if (state.cont && p.c !== state.cont) {
      hideMobileChip();
      if (tip) tip.hidden = true;
      if (p.isIsland || p.islandName) {
        setPanelCollapsed(false);
        var targetCont = (p.isIsland || p.islandName) ? p.c : ((inCont(p.country, state.cont)) ? state.cont : p.c);
        go(targetCont, p.country, { islandName: p.islandName, islandFlag: p.islandFlag });
        return;
      }
      go(p.c, null);
      return;
    }

    // Se tocar no mesmo país já selecionado: se estava recolhido, reabre; senão, desseleciona e fecha
    if (state.country && (state.country === p.country || (state.country.id && p.country && state.country.id === p.country.id))) {
      if (!p.islandName || state.islandName === p.islandName) {
        if (state.panelCollapsed) {
          setPanelCollapsed(false);
          return;
        }
        hideMobileChip();
        if (tip) tip.hidden = true;
        go(state.cont, null);
        return;
      }
    }

    setPanelCollapsed(false);
    var targetCont = (p.isIsland || p.islandName) ? p.c : ((inCont(p.country, state.cont)) ? state.cont : p.c);
    go(targetCont, p.country, { islandName: p.islandName, islandFlag: p.islandFlag });
    if (window.innerWidth <= 768) {
      showMobileChip(p.country, targetCont);
      if (tip) tip.hidden = true;
    }
  }

  countrySel
    .on('mousemove', handleMapItemMove)
    .on('mouseleave', handleMapItemLeave)
    .on('click', handleMapItemClick);

  if (islandMarkerSel) {
    islandMarkerSel
      .on('mousemove', handleMapItemMove)
      .on('mouseleave', handleMapItemLeave)
      .on('click', handleMapItemClick);
  }

  backBtn.addEventListener('click', resetToWorld);

  // C2: Botão flutuante de fechar na tela de veículos
  if (panelFloatingClose) {
    panelFloatingClose.addEventListener('click', function () {
      setPanelCollapsed(true);
      if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ---------- panel ---------- */
  function crumbs() {
    var h = '<div class="panel-sheet-head"><span class="sheet-grabber" aria-hidden="true"></span><div class="panel-top-controls">';
    if (state.originRoute) {
      h += '<button type="button" class="panel-collapse-btn btn-voltar-origem" data-action="go-back" data-fallback="' + esc(state.originRoute) + '" title="Voltar para a página anterior" aria-label="Voltar para onde estava">' +
        '<span>← Voltar para onde estava</span>' +
      '</button>';
    } else if (state.topic) {
      var topicoObj = TOPICS.find(function (t) { return t.k === state.topic; });
      var topicoNome = topicoObj ? topicoObj.l : state.topic;
      h += '<button type="button" class="panel-collapse-btn btn-voltar-topico" data-action="clear-topic" title="Voltar para todos os temas de ' + esc(countryDisplayName(state.country, state.cont)) + '" aria-label="Voltar para todos os temas">' +
        '<span>← Voltar (Todos os temas)</span>' +
      '</button>';
    } else if (state.cont || state.country) {
      h += '<button type="button" class="panel-collapse-btn" id="btn-collapse-panel" title="Recolher painel para ver o mapa" aria-label="Recolher painel para ver o mapa">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>' +
        '<span>Recolher</span>' +
      '</button>';
      h += '<button type="button" class="panel-collapse-btn" data-go="world" title="Voltar para a visão geral do mapa-múndi" aria-label="Voltar ao mapa-múndi">' +
        '<span>← Voltar ao Mapa</span>' +
      '</button>';
    } else {
      h += '<button type="button" class="panel-collapse-btn" id="btn-collapse-panel" title="Recolher painel para ver o mapa" aria-label="Recolher painel para ver o mapa">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>' +
        '<span>Recolher</span>' +
      '</button>';
    }
    h += '<button type="button" class="panel-close" data-close aria-label="Fechar painel" title="Fechar / Recolher painel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    h += '</div>';
    h += '<nav class="crumbs" aria-label="Navegação">';
    h += state.cont ? '<button type="button" data-go="world">Mundo</button>' : '<span>Mundo</span>';
    if (state.cont) {
      h += '<span aria-hidden="true">/</span>';
      h += state.country ? '<button type="button" data-go="cont">' + CONT[state.cont].n + '</button>' : '<span>' + CONT[state.cont].n + '</span>';
    }
    if (state.country) {
      var cName = countryDisplayName(state.country, state.cont);
      if (state.topic) {
        var topicoObj2 = TOPICS.find(function (t) { return t.k === state.topic; });
        var topicoNome2 = topicoObj2 ? topicoObj2.l : state.topic;
        h += '<span aria-hidden="true">/</span><button type="button" data-action="clear-topic" class="crumb-topic-link" title="Voltar a todos os temas de ' + esc(cName) + '">' + esc(cName) + '</button>';
        h += '<span aria-hidden="true">/</span><span class="crumb-active-topic">' + esc(topicoNome2) + '</span>';
      } else {
        h += '<span aria-hidden="true">/</span><span>' + esc(cName) + '</span>';
      }
    }
    return h + '</nav></div>';
  }
  function bindCrumbs() {
    var x = panel.querySelector('[data-close]');
    if (x) x.addEventListener('click', function () {
      if (isSheetMode()) resetToWorld();
      else setPanelCollapsed(true);
    });
    var collapseBtn = panel.querySelector('#btn-collapse-panel');
    if (collapseBtn) collapseBtn.addEventListener('click', function () {
      if (isSheetMode()) setSheetSnap(state.sheetSnap === 'min' ? 'mid' : 'min');
      else setPanelCollapsed(true);
    });
    panel.querySelectorAll('[data-action="clear-topic"]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.topic = null;
        state.searchQuery = '';
        renderCountry();
      });
    });
    panel.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('data-go') === 'world') {
          resetToWorld();
          return;
        }
        setPanelCollapsed(false);
        state.originRoute = null;
        go(state.cont, null);
      });
    });
    applySheetState();
  }

  function renderWorld() {
    if (panel) {
      panel.innerHTML = '';
      panel.classList.remove('open', 'floating-panel');
      panel.classList.add('collapsed');
      panel.setAttribute('aria-hidden', 'true');
    }
    renderPulsandoAgoraTrack();
  }
  function countryRow(c) {
    var m = countryMedia(c, state.cont);
    var cName = c.islandName || countryDisplayName(c, state.cont);
    var dots = m ? '<em>' + m.outlets.length + ' veículos</em>' : '';
    var favOn = isCountryFavorited(c, state.cont);
    return '<li class="country-row-item"><button type="button" class="country-row-main" data-id="' + esc(c.id) + '"' + (c.islandName ? ' data-island-name="' + esc(c.islandName) + '"' : '') + (c.islandFlag ? ' data-island-flag="' + esc(c.islandFlag) + '"' : '') + '>' + (countryFlag(c, 'flag-sm', state.cont) || '<span class="flag-sm"></span>') +
      '<span class="' + (m ? '' : 'nod') + '">' + esc(cName) + '</span><span class="count" aria-label="' + (m ? m.outlets.length + ' veículos' : 'sem veículos') + '">' + dots + '</span></button>' +
      '<button type="button" class="fav-star-btn fav-country-list-btn' + (favOn ? ' is-fav' : '') + '" data-fav-country-id="' + esc(c.id) + '" aria-pressed="' + favOn + '" title="' + (favOn ? 'Remover país dos favoritos' : 'Salvar país nos favoritos') + '" aria-label="' + (favOn ? 'Remover ' : 'Favoritar ') + esc(cName) + '">' + (favOn ? ICON_STAR_ON : ICON_STAR_OFF) + '</button></li>';
  }
  function renderContinent() {
    var k = state.cont, cs = contCountries(k);
    var withData = cs.filter(function (c) { return countryMedia(c, k); });
    var without = cs.filter(function (c) { return !countryMedia(c, k); });
    var h = crumbs();
    h += '<p class="eyebrow">Continente</p><h2>' + CONT[k].n + '</h2>';
    h += '<p class="lede">' + withData.length + ' países com veículos cadastrados. Clique no mapa ou escolha na lista.</p>';
    h += '<input class="filter-input" type="search" placeholder="Filtrar países de ' + CONT[k].short + '…" aria-label="Filtrar países">';
    h += '<ul class="country-list" id="lista-paises"></ul>';
    panel.innerHTML = h;
    bindCrumbs();
    var list = panel.querySelector('#lista-paises');
    function fill(q) {
      var qNorm = norm((q || '').trim());
      var qTokens = qNorm ? qNorm.split(/\s+/).filter(function (tk) { return tk.length >= 2; }) : [];
      var m = function (c) {
        if (!qNorm) return true;
        var cn = norm(c.n);
        if (cn.indexOf(qNorm) > -1) return true;
        return combinaTextoFuzzy(c.n, qNorm, qTokens);
      };
      var a = withData.filter(m), b = without.filter(m), out = '';
      out += a.map(countryRow).join('');
      if (b.length) out += '<li class="list-sep">Outros países (sem veículos ainda)</li>' + b.map(countryRow).join('');
      if (!a.length && !b.length) out = '<li class="empty-state"><p>Nenhum país encontrado.</p></li>';
      list.innerHTML = out;
      list.querySelectorAll('button[data-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idVal = btn.getAttribute('data-id');
          var iName = btn.getAttribute('data-island-name');
          var iFlag = btn.getAttribute('data-island-flag');
          var targetC = byId[idVal] || byId[idVal.replace(/-.*/, '')];
          go(k, targetC, { islandName: iName, islandFlag: iFlag });
        });
      });
      list.querySelectorAll('button[data-fav-country-id]').forEach(function (starBtn) {
        starBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var idVal = starBtn.getAttribute('data-fav-country-id');
          var cTarget = byId[idVal] || byId[idVal.replace(/-.*/, '')];
          if (!cTarget) return;
          var nowFav = toggleCountryFavorite(cTarget, k);
          starBtn.classList.toggle('is-fav', nowFav);
          starBtn.setAttribute('aria-pressed', String(nowFav));
          starBtn.innerHTML = nowFav ? ICON_STAR_ON : ICON_STAR_OFF;
          starBtn.title = nowFav ? 'Remover país dos favoritos' : 'Salvar país nos favoritos';
        });
      });
    }
    fill('');
    panel.querySelector('.filter-input').addEventListener('input', function (e) { fill(e.target.value); });
  }

  function renderCountry() {
    var c = state.country;
    var cName = countryDisplayName(c, state.cont);
    var cMed = countryMedia(c, state.cont);
    var langs = countryDominantLangs(c, state.cont);
    var countryFav = isCountryFavorited(c, state.cont);
    var terrNotice = getTerritoryNotice(c, state.cont);
    var h = crumbs();
    var contKey = (state.cont && (inCont(c, state.cont) || (state.cont === 'oceania' && (c.a2 === 'CL' || c.id === '152-easter' || isEasterIsland(c, state.islandName))))) ? state.cont : c.c;
    h += '<p class="eyebrow">' + CONT[contKey].n + '</p>';
    h += '<div class="title-row">' +
      '<div class="country-flag-col">' +
        countryFlag(c, '', state.cont) +
        (langs ? '<span class="country-flag-lang" title="Idioma(s) predominante(s): ' + esc(langs) + '">' + esc(langs) + '</span>' : '') +
      '</div>' +
      '<div class="country-title-box">' +
        '<div class="country-title-head">' +
          '<h2>' + esc(cName) + '</h2>' +
          (terrNotice ?
            '<button type="button" class="territory-notice-btn" id="btn-territory-notice" data-notice="' + esc(terrNotice) + '" aria-label="Aviso sobre cobertura jornalística territorial" title="' + esc(terrNotice) + '">' +
              '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
            '</button>' : '') +
          '<button type="button" class="fav-star-btn fav-country-btn' + (countryFav ? ' is-fav' : '') + '" id="btn-fav-country" aria-pressed="' + countryFav + '" title="' + (countryFav ? 'Remover país dos favoritos' : 'Salvar país nos favoritos') + '" aria-label="' + (countryFav ? 'Remover país dos favoritos' : 'Salvar país nos favoritos') + '">' +
            (countryFav ? ICON_STAR_ON : ICON_STAR_OFF) +
          '</button>' +
        '</div>' +
        (langs ? '<span class="country-langs-detail"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Idioma(s): ' + esc(langs) + '</span>' : '') +
      '</div>' +
    '</div>';

    var cCode = (state.cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id || '');
    var cCodeUp = String(cCode).toUpperCase();
    var cA2Up = c && c.a2 ? String(c.a2).toUpperCase() : '';
    var hotItem = (hotNewsByCountry && (hotNewsByCountry[cCodeUp] || hotNewsByCountry[cA2Up])) ? (hotNewsByCountry[cCodeUp] || hotNewsByCountry[cA2Up]) : null;
    if (hotItem && hotItem.title) {
      var hotUrl = hotItem.url || '';
      var hotTerm = extrairTermoAssuntoBusca(hotItem.termoBusca || hotItem.title, '');
      var canCompareHot = !!(hotItem.comparacaoSlug || (hotTerm && hotTerm.replace(/[^a-zA-Z0-9À-ÿ]/g, '').length >= 3));
      var hotImgUrl = isValidNewsImageUrl(hotItem.imageUrl || hotItem.imagem || hotItem.image || hotItem.thumbnail || '');
      h += '<aside class="panel-hot-news-banner' + (hotImgUrl ? ' has-media' : ' no-media') + '" aria-label="Notícia quente em destaque">' +
        '<div class="panel-hot-news-header">' +
          '<span class="panel-hot-badge"><span class="panel-hot-pulse-dot" aria-hidden="true"></span> Notícia quente agora</span>' +
          '<span class="panel-hot-source">' + esc(hotItem.source) + (hotItem.category ? ' · ' + esc(hotItem.category) : '') + '</span>' +
        '</div>' +
        (hotImgUrl ? '<figure class="panel-hot-media"><img src="' + esc(hotImgUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="var b=this.closest(\'.panel-hot-news-banner\');var m=this.closest(\'.panel-hot-media\');if(m)m.remove();if(b){b.classList.remove(\'has-media\');b.classList.add(\'no-media\');}" onload="if(this.naturalWidth<=2){var b=this.closest(\'.panel-hot-news-banner\');var m=this.closest(\'.panel-hot-media\');if(m)m.remove();if(b){b.classList.remove(\'has-media\');b.classList.add(\'no-media\');}}"></figure>' : '') +
        '<h4 class="panel-hot-title">' +
          (hotUrl ? '<a href="' + esc(hotUrl) + '" target="_blank" rel="noopener noreferrer" title="' + (isVideoContent(hotUrl, hotItem) ? 'Assistir vídeo no canal original' : 'Abrir matéria completa no portal original') + '">' + esc(hotItem.title) + ' ' + ICON_ARROW + '</a>' : esc(hotItem.title)) +
        '</h4>' +
        (hotItem.summary ? '<p class="panel-hot-summary">' + esc(hotItem.summary) + '</p>' : '') +
        '<div class="panel-hot-actions">' +
          (hotUrl ? '<a href="' + esc(hotUrl) + '" target="_blank" rel="noopener noreferrer" class="btn btn-primary panel-hot-read-btn">' + (isVideoContent(hotUrl, hotItem) ? 'Assistir vídeo ' : 'Ler matéria na íntegra ') + ICON_ARROW + '</a>' : '') +
          (hotItem.comparacaoSlug ? '<a href="/comparar/' + esc(hotItem.comparacaoSlug) + '" data-spa-link class="btn btn-secondary panel-hot-compare-btn">⚖️ Comparar perspectivas</a>' :
            (canCompareHot ? '<button type="button" class="btn btn-secondary panel-hot-compare-btn" data-hot-compare-term="' + esc(hotTerm) + '">⚖️ Comparar cobertura</button>' : '')) +
        '</div>' +
      '</aside>';
    }

    var atlasSectionHtml = '<section class="atlas-live-section" id="atlas-live-news-feed" data-country="' + esc(cCodeUp) + '" aria-labelledby="atlas-live-heading">' +
      '<div class="atlas-live-head">' +
        '<div class="atlas-live-title-wrap">' +
          '<span class="atlas-live-dot" aria-hidden="true"></span>' +
          '<h3 class="atlas-live-title" id="atlas-live-heading">Últimas manchetes · ' + esc(cName) + '</h3>' +
        '</div>' +
        '<div class="atlas-live-controls">' +
          '<span class="atlas-live-updated" id="atlas-live-updated-label">Sincronizando...</span>' +
          '<button type="button" class="btn-atlas-refresh" id="btn-atlas-refresh" title="Atualizar notícias agora (sem cache)" aria-label="Atualizar notícias agora">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
            '<span>Atualizar</span>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<div class="atlas-live-list is-loading" id="atlas-live-news-list" aria-live="polite">' +
        '<div class="atlas-live-skeleton"></div><div class="atlas-live-skeleton"></div><div class="atlas-live-skeleton"></div>' +
      '</div>' +
    '</section>';

    if (!cMed || !cMed.outlets || !cMed.outlets.length) {
      var q = encodeURIComponent(cName);
      h += atlasSectionHtml;
      h += '<div class="atlas-live-fallback-note"><p>Cobertura contínua via Atlas Vivo. <a target="_blank" rel="noopener" href="https://news.google.com/search?q=' + q + '&hl=pt-BR&gl=BR&ceid=BR:pt-419">Ver mais no Google Notícias ' + ICON_ARROW.replace('<svg', '<svg width="14" height="14" style="fill:none;stroke:currentColor;stroke-width:2.2"') + '</a></p></div>';
      panel.innerHTML = h;
      bindCrumbs();
      bindAtlasLiveRefresh(cCodeUp, cName);
      carregarAtlasPaisAoVivo(cCodeUp, cName, false);
      return;
    }
    h += '<p class="group-label">Tipo de notícia</p><div class="seg" id="f-topic">';
    h += '<button type="button" data-v="" aria-pressed="' + (!state.topic) + '">Todos os temas</button>';
    TOPICS.forEach(function (t) { h += '<button type="button" data-v="' + t.k + '"' + (t.k === 'politica' ? ' data-dica="vies"' : '') + ' aria-pressed="' + (state.topic === t.k) + '">' + t.l + '</button>'; });
    h += '</div><div id="vies"></div>';

    // Busca Contextual por País: [Sugestão 1] [Sugestão 2] [Sugestão 3] 🔍
    var cCodeCtx = (state.cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id || '');
    var cachedCtx = getContextualSuggestionsCached(cCodeCtx);
    var showFallbackOpen = !!(state.searchQuery && !state.searchFromContextualChip);

    h += '<section class="topic-search-section perspective-compare-section" id="busca-assunto-wrap" aria-labelledby="comparar-perspectivas-heading">';
    h += '<div class="perspective-section-head">';
    h += '<h3 class="perspective-section-title" id="comparar-perspectivas-heading">Comparar perspectivas</h3>';
    h += '<p class="perspective-section-sub">Compare as últimas notícias e as diferentes perspectivas sobre o assunto.</p>';
    h += '</div>';

    h += '<div class="contextual-search-bar" id="contextual-search-bar">';
    h += '<div class="contextual-chips-track" id="contextual-chips-track" role="list" aria-label="Assuntos em alta no país"' + (cachedCtx && cachedCtx.length ? '' : ' hidden') + '>';
    if (cachedCtx && cachedCtx.length) {
      h += renderContextualChipsHTML(cachedCtx);
    }
    h += '</div>';
    h += '<button type="button" class="contextual-loupe-btn" id="contextual-search-toggle" aria-expanded="' + (showFallbackOpen ? 'true' : 'false') + '" aria-controls="topic-search-form" aria-label="Pesquisar assunto específico" title="Pesquisar assunto específico">';
    h += '<svg class="contextual-loupe-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg>';
    h += '</button>';
    h += '</div>';

    h += '<form class="topic-search-form contextual-fallback-form" id="topic-search-form" role="search" novalidate' + (showFallbackOpen ? '' : ' hidden') + '>';
    h += '<div class="topic-search-input-wrap">';
    h += '<button type="submit" class="topic-search-icon-btn" aria-label="Buscar" title="Buscar"><svg class="topic-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg></button>';
    h += '<input type="search" id="topic-search-input" class="topic-search-input" placeholder="Procurar algo específico" aria-label="Procurar algo específico" autocomplete="off" value="' + esc(state.searchQuery) + '">';
    h += '<button type="button" id="topic-search-clear" class="topic-search-clear" aria-label="Limpar busca" title="Limpar busca"' + (state.searchQuery ? '' : ' hidden') + '>✕</button>';
    h += '</div>';
    h += '<button type="submit" id="topic-search-btn" class="btn topic-search-btn">Buscar</button>';
    h += '</form>';

    h += '<div id="topic-search-results" class="topic-search-results" aria-live="polite"></div>';
    h += '</section>';

    h += atlasSectionHtml;
    h += '<p class="outlets-paywall-notice">Alguns sites podem exigir assinatura.</p>';
    h += '<div class="outlets" id="veiculos"></div>';
    h += '<div id="panel-timeline-slot" class="panel-timeline-slot"></div>';

    // Slot Comercial 3: Gaveta Contextual (Patrocínio Regional / B2B)
    h += '<div id="slot-sponsor-drawer" class="sponsor-slot sponsor-slot-drawer" hidden aria-label="Apoio Contextual">' +
      '<div class="sponsor-drawer-card">' +
        '<div class="sponsor-drawer-head">' +
          '<span class="sponsor-tag">Destaque de Mercado</span>' +
          '<span class="mock-brand-logo sponsor-brand-target">Sua Marca</span>' +
        '</div>' +
        '<p class="sponsor-drawer-msg">Câmbio comercial, investimentos e soluções para suas conexões com <span id="sponsor-country-name">' + esc(cName) + '</span>.</p>' +
        '<a class="btn btn-secondary sponsor-drawer-btn" href="/parcerias" data-spa-link>Conhecer soluções</a>' +
      '</div>' +
    '</div>';

    // E3: Nota de metodologia editorial no rodapé
    h += '<div class="methodology-note"><p><strong>Metodologia editorial:</strong> Todos os países contam com veículos de imprensa verificados e ao menos um veículo com independência editorial reconhecida (identificado pelo selo <span class="badge badge-ind badge-inline"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Independente</span>). Veículos indicados pela comunidade recebem o selo <span class="badge badge-sug badge-inline" title="Veículo indicado por usuário na aba Cadastrar Veículo"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Indicação</span>. Dados e links verificados.</p></div>';
    panel.innerHTML = h;
    bindCrumbs();
    var favCountryBtn = panel.querySelector('#btn-fav-country');
    if (favCountryBtn) {
      favCountryBtn.addEventListener('click', function () {
        var nowFav = toggleCountryFavorite(c, state.cont);
        favCountryBtn.classList.toggle('is-fav', nowFav);
        favCountryBtn.setAttribute('aria-pressed', String(nowFav));
        favCountryBtn.title = nowFav ? 'Remover país dos favoritos' : 'Salvar país nos favoritos';
        favCountryBtn.setAttribute('aria-label', nowFav ? 'Remover país dos favoritos' : 'Salvar país nos favoritos');
        favCountryBtn.innerHTML = nowFav ? ICON_STAR_ON : ICON_STAR_OFF;
      });
    }
    bindTopicSearch();
    carregarSugestoesContextuais(cCodeCtx);
    var hotCompareBtn = panel.querySelector('[data-hot-compare-term]');
    if (hotCompareBtn) {
      hotCompareBtn.addEventListener('click', function () {
        var term = hotCompareBtn.getAttribute('data-hot-compare-term') || '';
        if (term) {
          var inputEl = panel.querySelector('#topic-search-input');
          var clearEl = panel.querySelector('#topic-search-clear');
          if (inputEl) inputEl.value = term;
          if (clearEl) clearEl.hidden = false;
          executeTopicSearch(term, { initialPeriod: '7d', ignoreTopic: true, fromHotCompareBtn: true });
          var searchWrap = panel.querySelector('#busca-assunto-wrap');
          if (searchWrap) {
            searchWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    }
    panel.querySelectorAll('#f-topic button').forEach(function (b) {
      b.addEventListener('click', function () {
        var newTopic = b.getAttribute('data-v') || null;
        var hadSearch = state.searchQuery;
        state.topic = newTopic;
        state.pinnedOutlet = null;
        if (state.topic !== 'politica') state.bias = 'all';
        renderCountry();
        if (hadSearch) {
          executeTopicSearch(hadSearch);
        } else {
          renderTopicSearchResults();
        }
      });
    });
    renderBias();
    renderOutlets();
    renderTopicSearchResults();
    bindAtlasLiveRefresh(cCodeUp, cName);
    carregarAtlasPaisAoVivo(cCodeUp, cName, false);
    updateFloatingControlsVisibility();
  }

  var atlasAutoRefreshTimer = null;

  function getAtlasPaisCacheKey(a2) {
    return 'rom_atlas_pais_' + String(a2 || 'BR').toUpperCase().trim();
  }

  function bindAtlasLiveRefresh(cCode, cName) {
    var btn = panel.querySelector('#btn-atlas-refresh');
    if (btn) {
      btn.addEventListener('click', function () {
        carregarAtlasPaisAoVivo(cCode, cName, true);
      });
    }
  }

  function renderAtlasPaisItems(items, cCode, updatedAtIso) {
    var listEl = panel.querySelector('#atlas-live-news-list');
    var updatedEl = panel.querySelector('#atlas-live-updated-label');
    if (!listEl) return;

    listEl.classList.remove('is-loading');
    if (updatedEl) {
      var rel = updatedAtIso ? formatSearchDate(updatedAtIso) : 'agora mesmo';
      updatedEl.textContent = 'Atualizado ' + (rel || 'agora mesmo');
    }

    if (!Array.isArray(items) || !items.length) {
      listEl.innerHTML = '<p class="atlas-live-empty">Nenhuma manchete recente encontrada no momento. Clique em Atualizar para tentar novamente.</p>';
      return;
    }

    // SUG-181: sempre 4 manchetes, da última notícia (mais recente) para a mais antiga.
    var orderedItems = items.slice().sort(function (a, b) {
      var da = a && a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      var db = b && b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      if (isNaN(da)) da = 0;
      if (isNaN(db)) db = 0;
      return db - da;
    });

    var html = '';
    orderedItems.slice(0, 4).forEach(function (it, idx) {
      var pt = it.titlePt || it.titleOriginal || '';
      var orig = it.titleOriginal || '';
      var temTraducao = !!(orig && pt && orig !== pt);
      var timeStr = it.publishedAt ? formatSearchDate(it.publishedAt) : '';
      html += '<article class="atlas-live-card" data-atlas-idx="' + idx + '">' +
        '<div class="atlas-live-card-top">' +
          '<span class="atlas-live-source">' + esc(it.source || 'Imprensa') + '</span>' +
          (timeStr ? '<time class="atlas-live-time">' + esc(timeStr) + '</time>' : '') +
        '</div>' +
        '<h4 class="atlas-live-card-title">' +
          '<a href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer" data-atlas-title-link>' + esc(pt) + '</a>' +
        '</h4>' +
        '<div class="atlas-live-card-actions">' +
          (temTraducao ? '<button type="button" class="atlas-lang-toggle" title="Traduzir para o idioma original" data-pt="' + esc(pt) + '" data-orig="' + esc(orig) + '" data-showing="pt">Ver original</button>' : '') +
          renderNewsFavBtn({ url: it.url, title: pt, source: it.source || 'Atlas', countryCode: cCode, publishedAt: it.publishedAt || '' }) +
        '</div>' +
      '</article>';
    });
    listEl.innerHTML = html;

    listEl.querySelectorAll('.atlas-lang-toggle').forEach(function (tBtn) {
      tBtn.addEventListener('click', function () {
        var card = tBtn.closest('.atlas-live-card');
        var link = card ? card.querySelector('[data-atlas-title-link]') : null;
        if (!link) return;
        var showing = tBtn.getAttribute('data-showing');
        if (showing === 'pt') {
          link.textContent = tBtn.getAttribute('data-orig') || '';
          tBtn.setAttribute('data-showing', 'orig');
          tBtn.textContent = 'Ver em português';
          tBtn.title = 'Ver em português';
        } else {
          link.textContent = tBtn.getAttribute('data-pt') || '';
          tBtn.setAttribute('data-showing', 'pt');
          tBtn.textContent = 'Ver original';
          tBtn.title = 'Traduzir para o idioma original';
        }
      });
    });
    bindNewsFavButtons(listEl);
  }

  function ensureAtlasItemsTranslated(items, cCode, onTranslated) {
    var isLusophone = ['BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'].indexOf(String(cCode || '').toUpperCase()) !== -1;
    if (isLusophone || !Array.isArray(items) || !items.length) return;
    var pendingMap = {};
    var hasPending = false;
    items.slice(0, 4).forEach(function (it, idx) {
      var orig = String(it.titleOriginal || it.titlePt || '').trim();
      var pt = String(it.titlePt || '').trim();
      if (orig && (!pt || pt === orig)) {
        pendingMap[String(idx)] = orig;
        hasPending = true;
      }
    });
    if (!hasPending) return;
    translateTextsMap(pendingMap, 'pt').then(function (translatedMap) {
      if (!translatedMap || typeof translatedMap !== 'object') return;
      var changed = false;
      Object.keys(pendingMap).forEach(function (k) {
        var idx = Number(k);
        var tr = translatedMap[k];
        if (tr && typeof tr === 'string') {
          var trTrim = tr.trim();
          if (trTrim && items[idx] && trTrim !== items[idx].titlePt) {
            items[idx].titlePt = trTrim;
            if (!items[idx].titleOriginal) items[idx].titleOriginal = pendingMap[k];
            changed = true;
          }
        }
      });
      if (changed && typeof onTranslated === 'function') {
        onTranslated(items);
      }
    }).catch(function () {});
  }

  function carregarAtlasPaisAoVivo(cCode, cName, forceRefresh) {
    if (atlasAutoRefreshTimer) {
      clearTimeout(atlasAutoRefreshTimer);
      atlasAutoRefreshTimer = null;
    }

    var section = panel.querySelector('#atlas-live-news-feed');
    if (!section) return;

    var cacheKey = getAtlasPaisCacheKey(cCode);
    var refreshBtn = panel.querySelector('#btn-atlas-refresh');
    var listEl = panel.querySelector('#atlas-live-news-list');

    if (forceRefresh) {
      try { localStorage.removeItem(cacheKey); } catch (e) {}
      if (refreshBtn) refreshBtn.classList.add('is-refreshing');
      if (listEl) listEl.classList.add('is-loading');
    } else {
      try {
        var raw = localStorage.getItem(cacheKey);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.items) && parsed.items.length && (Date.now() - (parsed.ts || 0) < 15 * 60 * 1000)) {
            renderAtlasPaisItems(parsed.items, cCode, parsed.updatedAt);
            ensureAtlasItemsTranslated(parsed.items, cCode, function (updatedItems) {
              try {
                localStorage.setItem(cacheKey, JSON.stringify({ ts: parsed.ts || Date.now(), updatedAt: parsed.updatedAt, items: updatedItems }));
              } catch (e) {}
              var activeFeed = panel.querySelector('#atlas-live-news-feed');
              if (activeFeed && activeFeed.getAttribute('data-country') === String(cCode)) {
                renderAtlasPaisItems(updatedItems, cCode, parsed.updatedAt);
              }
            });
            atlasAutoRefreshTimer = setTimeout(function () {
              var currentFeed = panel.querySelector('#atlas-live-news-feed');
              if (currentFeed && currentFeed.getAttribute('data-country') === String(cCode)) {
                carregarAtlasPaisAoVivo(cCode, cName, true);
              }
            }, 240000);
            return;
          }
        }
      } catch (e) {}
    }

    var qs = '?pais=' + encodeURIComponent(cCode) + '&nome=' + encodeURIComponent(cName) + (forceRefresh ? '&refresh=1&_t=' + Date.now() : '');
    var url = '/api/atlas-pais' + qs;
    var fetchOpts = { cache: forceRefresh ? 'no-store' : 'default', headers: { Accept: 'application/json' } };

    function parseJsonIfValid(resp) {
      if (!resp || !resp.ok) return Promise.resolve(null);
      var ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('application/json') === -1) return Promise.resolve(null);
      return resp.json().catch(function () { return null; });
    }

    function fallbackRssBrowser() {
      var rssTarget = cCode === 'BR'
        ? 'https://news.google.com/rss/headlines/section/geo/Brasil?hl=pt-BR&gl=BR&ceid=BR:pt-419'
        : 'https://news.google.com/rss/search?q=' + encodeURIComponent(cName) + '&hl=en&gl=' + encodeURIComponent(cCode) + '&ceid=' + encodeURIComponent(cCode) + ':en';
      var proxyUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssTarget);
      return fetch(proxyUrl)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j || j.status !== 'ok' || !Array.isArray(j.items)) return null;
          var mapped = j.items.slice(0, 4).map(function (it) {
            var rawT = String(it.title || '').trim();
            var dash = rawT.lastIndexOf(' - ');
            var cleanT = dash > 15 ? rawT.slice(0, dash).trim() : rawT;
            var src = dash > 15 ? rawT.slice(dash + 3).trim() : (it.author || 'Imprensa Internacional');
            return {
              titleOriginal: cleanT,
              titlePt: cleanT,
              url: it.link,
              source: src,
              publishedAt: it.pubDate ? new Date(it.pubDate.replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString()
            };
          });
          return { ok: true, updatedAt: new Date().toISOString(), items: mapped };
        })
        .catch(function () { return null; });
    }

    fetch(url, fetchOpts)
      .then(parseJsonIfValid)
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.items) && data.items.length) return data;
        var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal && window.location.port !== '8000') {
          return fetch('http://127.0.0.1:8000/api/atlas-pais' + qs, fetchOpts).then(parseJsonIfValid).catch(function () { return null; });
        }
        return null;
      })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.items) && data.items.length) return data;
        return fallbackRssBrowser();
      })
      .then(function (data) {
        if (refreshBtn) refreshBtn.classList.remove('is-refreshing');
        var currentFeed = panel.querySelector('#atlas-live-news-feed');
        if (!currentFeed || currentFeed.getAttribute('data-country') !== String(cCode)) return;

        if (data && data.ok && Array.isArray(data.items) && data.items.length) {
          var savedTs = Date.now();
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ ts: savedTs, updatedAt: data.updatedAt, items: data.items }));
          } catch (e) {}
          renderAtlasPaisItems(data.items, cCode, data.updatedAt);
          ensureAtlasItemsTranslated(data.items, cCode, function (updatedItems) {
            try {
              localStorage.setItem(cacheKey, JSON.stringify({ ts: savedTs, updatedAt: data.updatedAt, items: updatedItems }));
            } catch (e) {}
            var activeFeed = panel.querySelector('#atlas-live-news-feed');
            if (activeFeed && activeFeed.getAttribute('data-country') === String(cCode)) {
              renderAtlasPaisItems(updatedItems, cCode, data.updatedAt);
            }
          });
        } else {
          renderAtlasPaisItems([], cCode, '');
        }

        atlasAutoRefreshTimer = setTimeout(function () {
          var stillHere = panel.querySelector('#atlas-live-news-feed');
          if (stillHere && stillHere.getAttribute('data-country') === String(cCode)) {
            carregarAtlasPaisAoVivo(cCode, cName, true);
          }
        }, 240000);
      })
      .catch(function () {
        if (refreshBtn) refreshBtn.classList.remove('is-refreshing');
        renderAtlasPaisItems([], cCode, '');
      });
  }

  function refreshQuickSuggestionsUI() {
    var listEl = panel.querySelector('#quick-tags-list');
    var inputEl = panel.querySelector('#topic-search-input');
    var clearEl = panel.querySelector('#topic-search-clear');
    if (!listEl) return;
    var terms = getQuickSuggestions(state.country, state.cont, state.topic, 3);
    listEl.innerHTML = terms.map(function (qt) {
      return '<button type="button" class="quick-tag-chip" data-quick-term="' + esc(qt) + '">' + esc(qt) + '</button>';
    }).join('');
    listEl.querySelectorAll('[data-quick-term]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var term = chip.getAttribute('data-quick-term') || '';
        if (!term) return;
        if (inputEl) inputEl.value = term;
        if (clearEl) clearEl.hidden = false;
        executeTopicSearch(term);
      });
    });
  }

  function formatSearchDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    var diffMin = Math.round((d.getTime() - Date.now()) / 60000);
    if (Math.abs(diffMin) < 60 && window.Intl && Intl.RelativeTimeFormat) {
      return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(diffMin, 'minute');
    }
    var diffHours = Math.round(diffMin / 60);
    if (Math.abs(diffHours) < 24 && window.Intl && Intl.RelativeTimeFormat) {
      return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(diffHours, 'hour');
    }
    try {
      return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    } catch (e) {
      return d.toLocaleDateString('pt-BR');
    }
  }

  function currentTopicLabel() {
    if (!state.topic) return '';
    for (var i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i].k === state.topic) return TOPICS[i].l;
    }
    return '';
  }

  function currentTopicTerm(lang) {
    if (!state.topic) return '';
    var idx = -1;
    for (var i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i].k === state.topic) { idx = i; break; }
    }
    if (idx < 0) return '';
    var terms = TERMS[lang] || TERMS.pt;
    return (terms && terms[idx]) || (TERMS.en && TERMS.en[idx]) || state.topic;
  }

  function activeCountryOutlets() {
    var c = state.country;
    if (!c) return [];
    var cMed = countryMedia(c, state.cont);
    if (!cMed || !cMed.outlets) return [];
    var pol = state.topic === 'politica';
    var cCode = (state.cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id);
    var list = cMed.outlets.filter(function (o) {
      return !pol || state.bias === 'all' || o.b === state.bias;
    }).slice();
    list = sortOutletsForDisplay(list, cCode, state.topic);
    return list.map(function (o) {
      return {
        n: o.n,
        u: o.u,
        d: siteScope(o.u),
        b: o.b || 'I',
        ind: !!(o.ind === 1 || o.ind === true),
        st: !!o.st
      };
    });
  }

  var activeSearchController = null;
  var clientSearchCache = {};

  var STOPWORDS_BUSCA = {
    de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, em: 1, no: 1, na: 1, nos: 1, nas: 1, o: 1, a: 1, os: 1, as: 1, para: 1, com: 1, por: 1,
    antes: 1, apos: 1, sobre: 1, entre: 1, contra: 1, desde: 1, durante: 1, ate: 1, sem: 1, sob: 1,
    disse: 1, diz: 1, fala: 1, veja: 1, saiba: 1, confira: 1, entenda: 1,
    novo: 1, nova: 1, novos: 1, novas: 1, hoje: 1, ontem: 1, agora: 1,
    como: 1, onde: 1, quando: 1, porque: 1, qual: 1, quem: 1,
    isso: 1, aquilo: 1, esse: 1, essa: 1, este: 1, esta: 1, mais: 1, menos: 1,
    foi: 1, era: 1, sao: 1, ser: 1, tem: 1, ter: 1, vai: 1, que: 1, se: 1, mas: 1, ao: 1, aos: 1
  };

  var PALAVRAS_COMUNS_INTACTAS = {
    antes: 1, apos: 1, sobre: 1, entre: 1, contra: 1, desde: 1, durante: 1, ate: 1, sem: 1, sob: 1,
    disse: 1, diz: 1, fala: 1, veja: 1, saiba: 1, confira: 1, entenda: 1,
    novo: 1, nova: 1, novos: 1, novas: 1, hoje: 1, ontem: 1, agora: 1,
    como: 1, onde: 1, quando: 1, porque: 1, isso: 1, aquilo: 1
  };

  var ENTIDADES_COMPOSTAS_CLIENT = [
    'Flávio Bolsonaro', 'Jair Bolsonaro', 'Eduardo Bolsonaro', 'Carlos Bolsonaro', 'Michelle Bolsonaro', 'Renan Bolsonaro',
    'Luiz Inácio Lula da Silva', 'Fernando Haddad', 'Tarcísio de Freitas', 'Alexandre de Moraes', 'Geraldo Alckmin',
    'Davi Alcolumbre', 'Hugo Motta', 'Arthur Lira', 'Rodrigo Pacheco', 'Flávio Dino', 'Gilmar Mendes',
    'Luís Roberto Barroso', 'Cristiano Zanin', 'André Mendonça', 'Cármen Lúcia', 'Dias Toffoli', 'Edson Fachin', 'Luiz Fux',
    'Roberto Campos Neto', 'Gabriel Galípolo', 'Guilherme Boulos', 'Pablo Marçal', 'Ricardo Nunes', 'Nikolas Ferreira',
    'Ronaldo Caiado', 'Romeu Zema', 'Eduardo Leite', 'Rui Costa', 'Gleisi Hoffmann', 'Simone Tebet', 'Marina Silva',
    'Ciro Gomes', 'Michel Temer', 'Dilma Rousseff', 'Paulo Guedes', 'João Campos', 'Helder Barbalho', 'Ratinho Júnior',
    'Donald Trump', 'Joe Biden', 'Kamala Harris', 'Elon Musk', 'Marco Rubio', 'Vladimir Putin', 'Volodymyr Zelensky',
    'Xi Jinping', 'Emmanuel Macron', 'Keir Starmer', 'Olaf Scholz', 'Friedrich Merz', 'Giorgia Meloni', 'Pedro Sánchez',
    'Javier Milei', 'Nicolás Maduro', 'Gustavo Petro', 'Gabriel Boric', 'Claudia Sheinbaum', 'Nayib Bukele',
    'Benjamin Netanyahu', 'Narendra Modi', 'Recep Erdogan', 'António Guterres', 'Luís Montenegro',
    'Supremo Tribunal Federal', 'Congresso Nacional', 'Banco Central', 'Arcabouço Fiscal', 'Reforma Tributária',
    'Inteligência Artificial', 'Transição Energética', 'Aquecimento Global', 'Direitos Humanos', 'União Europeia',
    'Estados Unidos', 'Coreia do Sul', 'Coreia do Norte', 'África do Sul', 'Arábia Saudita', 'Reino Unido'
  ];

  var MAPA_CORRECOES_DIRETAS_CLIENT = {
    favo: 'Flávio', flavo: 'Flávio', flavio: 'Flávio',
    bolsonro: 'Bolsonaro', bosonaro: 'Bolsonaro', bousonaro: 'Bolsonaro', bolsonar: 'Bolsonaro',
    lulla: 'Lula', hadad: 'Haddad', radad: 'Haddad',
    tarciso: 'Tarcísio', tarsisio: 'Tarcísio', tarcisio: 'Tarcísio',
    alkmin: 'Alckmin', alckim: 'Alckmin', alcolunbre: 'Alcolumbre', aucolumbre: 'Alcolumbre',
    morais: 'Moraes', marcal: 'Marçal', galipolo: 'Galípolo',
    trunp: 'Trump', tramp: 'Trump', donaud: 'Donald',
    zelenski: 'Zelensky', zelensqui: 'Zelensky', netaniahu: 'Netanyahu', millei: 'Milei',
    inflassao: 'inflação', inflacao: 'inflação', inflasao: 'inflação',
    impechment: 'impeachment', impichment: 'impeachment', impeachement: 'impeachment',
    orcamento: 'orçamento', orssamento: 'orçamento',
    eleissoes: 'eleições', eleicoes: 'eleições', eleicao: 'eleição',
    congreso: 'Congresso', previdencia: 'Previdência', amazonia: 'Amazônia',
    sancoes: 'sanções', sansoes: 'sanções', ucrania: 'Ucrânia', russia: 'Rússia'
  };

  function normFonetico(str) {
    var s = norm(String(str || '')).trim();
    if (!s) return '';
    return s
      .replace(/ph/g, 'f')
      .replace(/th/g, 't')
      .replace(/y/g, 'i')
      .replace(/w/g, 'v')
      .replace(/qu([ei])/g, 'k$1')
      .replace(/qu/g, 'k')
      .replace(/c([aou])/g, 'k$1')
      .replace(/c([ei])/g, 's$1')
      .replace(/g([ei])/g, 'j$1')
      .replace(/gu([ei])/g, 'g$1')
      .replace(/ch|sh/g, 'x')
      .replace(/ss|sc|sç|xc|z/g, 's')
      .replace(/m(?=[pb]|$)/g, 'n')
      .replace(/([aeou])l(?=$|[^aeiou])/g, '$1u')
      .replace(/([a-z0-9])\1+/g, '$1');
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (!la) return lb;
    if (!lb) return la;
    if (Math.abs(la - lb) > 4) return Math.abs(la - lb);
    var dp = [];
    for (var i = 0; i <= la; i++) {
      dp[i] = [i];
      for (var j = 1; j <= lb; j++) dp[i][j] = i === 0 ? j : 0;
    }
    for (var r = 1; r <= la; r++) {
      for (var c = 1; c <= lb; c++) {
        var cost = a.charAt(r - 1) === b.charAt(c - 1) ? 0 : 1;
        var val = Math.min(dp[r - 1][c] + 1, dp[r][c - 1] + 1, dp[r - 1][c - 1] + cost);
        if (r > 1 && c > 1 && a.charAt(r - 1) === b.charAt(c - 2) && a.charAt(r - 2) === b.charAt(c - 1)) {
          val = Math.min(val, dp[r - 2][c - 2] + 1);
        }
        dp[r][c] = val;
      }
    }
    return dp[la][lb];
  }

  function isOrderedSubseq(menor, maior) {
    if (!menor || !maior || menor.length > maior.length) return false;
    var i = 0;
    for (var j = 0; j < maior.length && i < menor.length; j++) {
      if (menor.charAt(i) === maior.charAt(j)) i++;
    }
    return i === menor.length;
  }

  function wordsSimilar(qRaw, cRaw) {
    var q = norm(String(qRaw || '')).trim();
    var c = norm(String(cRaw || '')).trim();
    if (!q || !c) return { match: false, score: 0 };
    if (q === c) return { match: true, score: 1 };
    var minLen = Math.min(q.length, c.length);
    var maxLen = Math.max(q.length, c.length);
    // Palavras de até 4 letras (como Lula, Moro, STF, PIB, FMI, OTAN):
    // NUNCA permitir aproximação fuzzy com substituição de letras (evita "lula" -> "luta", "lupa", "mula", "aula").
    if (minLen <= 4 || Math.abs(q.length - c.length) > 2) return { match: false, score: 0 };

    var qFon = normFonetico(q);
    var cFon = normFonetico(c);
    if (qFon && qFon === cFon) return { match: true, score: 0.95 };

    var d = editDistance(q, c);
    var dp = (qFon && cFon) ? editDistance(qFon, cFon) : d;
    var sameStart = q.charAt(0) === c.charAt(0) || (qFon && cFon && qFon.charAt(0) === cFon.charAt(0));
    var sameEnd = q.charAt(q.length - 1) === c.charAt(c.length - 1) || (qFon && cFon && qFon.charAt(qFon.length - 1) === cFon.charAt(cFon.length - 1));
    var subseq = isOrderedSubseq(q, c) || isOrderedSubseq(c, q);

    if (d === 1 || dp === 1) {
      if (!sameStart) return { match: false, score: 0 };
      return { match: true, score: 0.92 };
    }
    if (d === 2 || dp === 2) {
      if (minLen >= 5 && sameStart && (sameEnd || subseq)) {
        return { match: true, score: subseq ? 0.85 : 0.82 };
      }
      if (maxLen >= 7 && sameStart) {
        return { match: true, score: 0.81 };
      }
    }
    return { match: false, score: 0 };
  }

  var VOCABULARIO_CLIENT = (function () {
    var map = {};
    function add(w) {
      var clean = String(w || '').trim();
      var n = norm(clean);
      if (n.length >= 3 && !STOPWORDS_BUSCA[n] && !map[n]) map[n] = clean;
    }
    ENTIDADES_COMPOSTAS_CLIENT.forEach(function (ent) { ent.split(/\s+/).forEach(add); });
    Object.keys(MAPA_CORRECOES_DIRETAS_CLIENT).forEach(function (k) { add(MAPA_CORRECOES_DIRETAS_CLIENT[k]); });
    if (DATA && Array.isArray(DATA.countries)) {
      DATA.countries.forEach(function (c) {
        if (c && c.n) c.n.split(/\s+/).forEach(add);
      });
    }
    SUGGESTION_POOLS.general.forEach(function (s) { s.split(/\s+/).forEach(add); });
    Object.keys(SUGGESTION_POOLS.byTopic).forEach(function (tk) {
      SUGGESTION_POOLS.byTopic[tk].forEach(function (s) { s.split(/\s+/).forEach(add); });
    });
    Object.keys(SUGGESTION_POOLS.byCountry).forEach(function (ck) {
      SUGGESTION_POOLS.byCountry[ck].forEach(function (s) { s.split(/\s+/).forEach(add); });
    });
    [
      'Petróleo', 'Energia', 'Gás', 'Combustível', 'Gasolina', 'Diesel', 'Inflação', 'Juros',
      'Dólar', 'Câmbio', 'PIB', 'Orçamento', 'Imposto', 'Impostos', 'Tributária', 'Fiscal',
      'Governo', 'Presidente', 'Congresso', 'Senado', 'Câmara', 'Supremo', 'Justiça',
      'Política', 'Economia', 'Sociedade', 'Educação', 'Saúde', 'Segurança', 'Ambiente',
      'Clima', 'Desmatamento', 'Amazônia', 'Guerra', 'Conflito', 'Paz', 'Acordo', 'Tratado',
      'Eleição', 'Eleições', 'Votação', 'Pesquisa', 'Reforma', 'Mercado', 'Bolsa', 'Ações',
      'Comércio', 'Exportação', 'Importação', 'Indústria', 'Agricultura', 'Agronegócio',
      'Tecnologia', 'Ciência', 'Cultura', 'Esporte', 'Trabalho', 'Emprego', 'Desemprego',
      'Salário', 'Previdência', 'Aposentadoria', ' Habitação', 'Transporte', 'Infraestrutura'
    ].forEach(add);
    return map;
  })();

  function corrigirTermoBusca(rawQ) {
    var limpo = String(rawQ || '').trim();
    if (!limpo) return '';
    var origWords = limpo.split(/\s+/);
    var normWords = origWords.map(function (w) { return norm(w); });

    var usrSig = origWords.filter(function (w) {
      var n = norm(w);
      return !STOPWORDS_BUSCA[n] && (!PALAVRAS_COMUNS_INTACTAS || !PALAVRAS_COMUNS_INTACTAS[n]);
    });
    if (usrSig.length >= 2) {
      for (var eIdx = 0; eIdx < ENTIDADES_COMPOSTAS_CLIENT.length; eIdx++) {
        var ent = ENTIDADES_COMPOSTAS_CLIENT[eIdx];
        var entSig = ent.split(/\s+/).filter(function (w) {
          var n = norm(w);
          return !STOPWORDS_BUSCA[n] && (!PALAVRAS_COMUNS_INTACTAS || !PALAVRAS_COMUNS_INTACTAS[n]);
        });
        if (entSig.length === usrSig.length) {
          var allOk = true, hasStrong = false;
          for (var k = 0; k < usrSig.length; k++) {
            var sm = wordsSimilar(usrSig[k], entSig[k]);
            if (!sm.match) { allOk = false; break; }
            if (sm.score >= 0.88) hasStrong = true;
          }
          if (allOk && hasStrong) return ent;
        }
      }
    }

    var corrigidas = origWords.map(function (pal, idx) {
      var n = normWords[idx];
      // Palavras comuns ou stopwords retornam imediatamente intactas
      if (!n || n.length < 3 || STOPWORDS_BUSCA[n] || (PALAVRAS_COMUNS_INTACTAS && PALAVRAS_COMUNS_INTACTAS[n])) return pal;
      // Regra mandatória: 'antes' NUNCA deve ser mutado para 'Artes'
      if (n === 'antes') return pal;
      // Siglas digitadas em maiúsculas (IVA, PIB, OTAN...) são mantidas como o usuário escreveu
      if (/^[A-ZÀ-Ý0-9]{2,6}$/.test(pal)) return pal;
      if (MAPA_CORRECOES_DIRETAS_CLIENT[n]) return MAPA_CORRECOES_DIRETAS_CLIENT[n];
      if (VOCABULARIO_CLIENT[n]) return VOCABULARIO_CLIENT[n];
      var best = pal, bestScore = 0;
      var keys = Object.keys(VOCABULARIO_CLIENT);
      for (var i = 0; i < keys.length; i++) {
        var canon = VOCABULARIO_CLIENT[keys[i]];
        // Previne qualquer mutação indevida de 'antes' para 'Artes'
        if (n === 'antes' || (norm(canon) === 'artes' && n === 'antes')) continue;
        var sim = wordsSimilar(n, canon);
        if (sim.match && sim.score >= 0.84 && sim.score > bestScore) {
          bestScore = sim.score;
          best = canon;
        }
      }
      return best;
    });

    return corrigidas.join(' ');
  }

  function extrairTermoAssuntoBusca(titulo, categoria) {
    var raw = String(titulo || '').trim();
    if (!raw) return String(categoria || '').trim();

    // 1. Limpeza de aspas, traços e pontuação externa
    var t = raw.replace(/^["'“‘«\s\-_–—]+|["'”’»\s\-_–—]+$/g, '').trim();

    // 2. Remove prefixos jornalísticos comuns
    t = t.replace(/^(ao vivo|urgente|exclusivo|opiniao|opinião|analise|análise|editorial|assista|veja|saiba|entenda|confira|leia|ouca|ouça|video|vídeo|podcast|direto de [^:]+)\s*[:|–—-]\s*/i, '');
    t = t.replace(/^(veja (o que|como|quando|onde|tudo sobre)|saiba (o que|como|tudo sobre)|entenda (o que|como|o porqu[eê]|por que)|confira (o que|como|os|as)|disse que|diz que|fala sobre|falam sobre)\s+/i, '');

    // 3. Remove subtítulos após ':', '-', '–', '—', '|'
    var sepMatch = t.match(/[:|–—]|\s+-\s+/);
    if (sepMatch) {
      var sepIdx = sepMatch.index;
      var antes = t.slice(0, sepIdx).trim();
      var depois = t.slice(sepIdx + sepMatch[0].length).trim();
      var antesWords = antes.split(/\s+/).filter(Boolean);
      if (antesWords.length <= 1 && depois.length > 0) {
        t = depois;
      } else if (antesWords.length >= 2) {
        t = antes;
      }
    }

    // 4. Reconhecer entidades compostas conhecidas no título
    var tNorm = norm(t);
    var matchedEnt = '';
    if (typeof ENTIDADES_COMPOSTAS_CLIENT !== 'undefined') {
      for (var e = 0; e < ENTIDADES_COMPOSTAS_CLIENT.length; e++) {
        var entCandidate = ENTIDADES_COMPOSTAS_CLIENT[e];
        var entCandidateNorm = norm(entCandidate);
        if (entCandidateNorm.length >= 4 && tNorm.indexOf(entCandidateNorm) > -1) {
          if (!matchedEnt || entCandidate.length > matchedEnt.length) {
            matchedEnt = entCandidate;
          }
        }
      }
    }

    // 5. Verbos vazios, preposições e palavras descartáveis
    var ignorar = {
      diz: 1, disse: 1, dizem: 1, disseram: 1, afirma: 1, afirmam: 1, afirmou: 1,
      anuncia: 1, anunciou: 1, anunciam: 1, defende: 1, defendeu: 1,
      aponta: 1, apontam: 1, apontou: 1, promete: 1, prometeu: 1, quer: 1, querem: 1,
      preve: 1, prevem: 1, previu: 1, tem: 1, tera: 1, teve: 1, vai: 1, vao: 1,
      fala: 1, falou: 1, falam: 1, veja: 1, saiba: 1, entenda: 1, confira: 1,
      pode: 1, podem: 1, podia: 1, deve: 1, devem: 1, deveria: 1,
      apos: 1, antes: 1, sobre: 1, contra: 1, entre: 1, durante: 1, desde: 1, ate: 1,
      para: 1, com: 1, por: 1, sob: 1, sem: 1, como: 1, onde: 1, quando: 1, porque: 1,
      isso: 1, aquilo: 1, esse: 1, essa: 1, este: 1, esta: 1, estes: 1, estas: 1,
      novo: 1, nova: 1, novos: 1, novas: 1, hoje: 1, ontem: 1, agora: 1,
      mais: 1, menos: 1, muito: 1, pouco: 1, tudo: 1, todos: 1, todas: 1,
      ser: 1, foi: 1, foram: 1, sao: 1, era: 1, eram: 1, sendo: 1,
      de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1, em: 1, no: 1, na: 1, nos: 1, nas: 1,
      o: 1, a: 1, os: 1, as: 1, um: 1, uma: 1, uns: 1, umas: 1, se: 1, que: 1
    };

    var tokens = t.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'«»“”]/g, ' ')
                  .split(/\s+/)
                  .filter(Boolean);

    var significativos = [];
    tokens.forEach(function (w) {
      var wNorm = norm(w);
      if (wNorm.length < 2) return;
      if (ignorar[wNorm] || (typeof STOPWORDS_BUSCA !== 'undefined' && STOPWORDS_BUSCA[wNorm])) return;
      significativos.push(w);
    });

    var finalTerms = [];
    if (matchedEnt) {
      finalTerms.push(matchedEnt);
      var entTokens = norm(matchedEnt).split(/\s+/);
      significativos.forEach(function (w) {
        if (entTokens.indexOf(norm(w)) === -1 && finalTerms.length < 3) {
          finalTerms.push(w);
        }
      });
    } else {
      finalTerms = significativos.slice(0, 3);
    }

    if (finalTerms.length >= 2) {
      return finalTerms.join(' ');
    }
    if (finalTerms.length === 1) {
      return finalTerms[0];
    }
    return t.split(/\s+/).slice(0, 3).join(' ') || raw.slice(0, 40);
  }

  function getSuggestionsForEmptyState(country, cont, topic, maxCount) {
    var count = maxCount || 4;
    var res = [];
    var seen = {};
    var a2 = country && country.a2 ? String(country.a2).toUpperCase() : '';
    var loadedArticles = a2 ? getLiveCountryHeadlinesPool(a2) : [];
    var hotItem = (a2 && hotNewsByCountry && hotNewsByCountry[a2]) ? hotNewsByCountry[a2] : null;
    var hasLoadedBase = loadedArticles.length >= 2;

    function add(term, skipValidation) {
      if (!term) return;
      var clean = String(term).trim();
      var k = norm(clean);
      if (!k || k.length < 3 || seen[k] || (state.searchQuery && k === norm(state.searchQuery)) || res.length >= count) return;
      if (!skipValidation && hasLoadedBase && !termHasMatchInLoadedCountryNews(clean, loadedArticles, hotItem)) {
        return;
      }
      seen[k] = true;
      res.push(clean);
    }

    if (a2 && Array.isArray(liveTrendingByCountry[a2]) && liveTrendingByCountry[a2].length) {
      liveTrendingByCountry[a2].forEach(function (lt) { add(lt, true); });
    }

    if (loadedArticles.length && res.length < count) {
      extrairTopicosEmAltaClient([{ artigos: loadedArticles }], state.searchQuery || '').forEach(function (et) {
        add(et, true);
      });
    }

    if (hotItem && hotItem.title && res.length < count) {
      var hotTermClean = hotItem.termoBusca ? extrairTermoAssuntoBusca(hotItem.termoBusca, '') : extrairTermoAssuntoBusca(hotItem.title, '');
      add(hotTermClean, true);
    }

    if (res.length < count) {
      var quickList = getQuickSuggestions(country, cont, topic, count + 2);
      quickList.forEach(function (qt) { add(qt, !hasLoadedBase); });
    }

    return res.slice(0, count);
  }

  function renderEmptySuggestionsChipsHTML(list) {
    if (!list || !list.length) return '';
    var h = '<div class="topic-search-empty-suggestions" style="margin-top:16px;text-align:center;">' +
      '<p style="font-size:0.875rem;color:var(--text-muted,#777);margin-bottom:8px;">🔥 Assuntos em alta no país para explorar:</p>' +
      '<div class="topic-search-empty-chips" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">';
    list.forEach(function (term) {
      h += '<button type="button" class="quick-tag-chip topic-empty-chip" data-empty-term="' + esc(term) + '">' + esc(term) + '</button>';
    });
    h += '</div></div>';
    return h;
  }

  function bindEmptySuggestionsClicks(container) {
    if (!container) return;
    container.querySelectorAll('[data-empty-term]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var term = chip.getAttribute('data-empty-term') || '';
        if (!term) return;
        var inputEl = panel.querySelector('#topic-search-input');
        var clearEl = panel.querySelector('#topic-search-clear');
        if (inputEl) inputEl.value = term;
        if (clearEl) clearEl.hidden = false;
        executeTopicSearch(term);
        var searchWrap = panel.querySelector('#busca-assunto-wrap');
        if (searchWrap) {
          searchWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function tokenCombinaFuzzy(tk, alvo, palavrasAlvo) {
    if (!tk || STOPWORDS_BUSCA[tk]) return true;
    if (alvo.indexOf(tk) > -1) return true;
    // Termos curtos (< 5 letras, como lula, stf, pib): não permitir aproximações fuzzy
    if (tk.length < 5) return false;
    for (var i = 0; i < palavrasAlvo.length; i++) {
      var w = palavrasAlvo[i];
      if (w.length < 4) continue;
      if (w.indexOf(tk) === 0 || tk.indexOf(w) === 0) {
        if (Math.min(w.length, tk.length) >= 5) return true;
      }
      if (wordsSimilar(tk, w).match) return true;
    }
    return false;
  }

  /* ---------- SUG-CURADORIA-IA: Expansão Semântica de Busca e Cache ---------- */
  var VITRINE_IA_CACHE_KEY = 'rom_cache_vitrine_ia';
  var VITRINE_IA_TTL_MS = 2 * 60 * 1000;
  var vitrineIaMemoryTemas = [];
  var vitrineIaExpansaoCache = {};
  var vitrineIaSelectedCategory = '';

  function lerCacheVitrineIA(ignoreTtl) {
    if (vitrineIaMemoryTemas && vitrineIaMemoryTemas.length) {
      return vitrineIaMemoryTemas;
    }
    try {
      var raw = localStorage.getItem(VITRINE_IA_CACHE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.temas_ativos)) return [];
      if (!ignoreTtl && parsed.ts && (Date.now() - parsed.ts > VITRINE_IA_TTL_MS)) {
        return [];
      }
      vitrineIaMemoryTemas = parsed.temas_ativos;
      return parsed.temas_ativos;
    } catch (e) {
      return [];
    }
  }

  function salvarCacheVitrineIA(temasAtivos, updatedAt) {
    var lista = Array.isArray(temasAtivos) ? temasAtivos : [];
    vitrineIaMemoryTemas = lista;
    try {
      localStorage.setItem(VITRINE_IA_CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        updatedAt: updatedAt || '',
        temas_ativos: lista
      }));
    } catch (e) {}
  }

  function obterTermosExpandidosIA(termoRaw) {
    var qNorm = norm(String(termoRaw || '').trim());
    if (!qNorm || qNorm.length < 2) return [];
    var seen = {};
    var out = [];

    function addTerm(t) {
      var tn = norm(String(t || '').trim());
      if (tn && tn.length >= 2 && tn !== qNorm && !seen[tn]) {
        seen[tn] = true;
        out.push(tn);
      }
    }

    if (vitrineIaExpansaoCache[qNorm] && Array.isArray(vitrineIaExpansaoCache[qNorm].termos)) {
      vitrineIaExpansaoCache[qNorm].termos.forEach(addTerm);
    }

    var temas = lerCacheVitrineIA(true);
    var qTokens = qNorm.split(/\s+/).filter(function (tk) { return tk.length >= 3 && (!STOPWORDS_BUSCA || !STOPWORDS_BUSCA[tk]); });
    temas.forEach(function (tm) {
      if (!tm) return;
      var titNorm = norm(tm.titulo_tema || '');
      var kws = Array.isArray(tm.palavras_chave_busca) ? tm.palavras_chave_busca : [];
      var matched = false;
      if (titNorm && (titNorm.indexOf(qNorm) > -1 || qNorm.indexOf(titNorm) > -1)) {
        matched = true;
      }
      if (!matched) {
        for (var i = 0; i < kws.length; i++) {
          var kwNorm = norm(kws[i]);
          if (kwNorm && (kwNorm.indexOf(qNorm) > -1 || qNorm.indexOf(kwNorm) > -1)) {
            matched = true;
            break;
          }
          for (var j = 0; j < qTokens.length; j++) {
            if (kwNorm.indexOf(qTokens[j]) > -1) {
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
      }
      if (matched) {
        kws.forEach(addTerm);
      }
    });

    return out.slice(0, 8);
  }

  function consultarExpansaoBuscaIA(rawQuery, callback) {
    var q = String(rawQuery || '').trim();
    var qNorm = norm(q);
    if (!qNorm || qNorm.length < 2) {
      if (typeof callback === 'function') callback([]);
      return;
    }
    if (vitrineIaExpansaoCache[qNorm] && (Date.now() - vitrineIaExpansaoCache[qNorm].ts < VITRINE_IA_TTL_MS)) {
      if (typeof callback === 'function') callback(vitrineIaExpansaoCache[qNorm].termos || []);
      return;
    }
    var url = '/api/vitrine-em-alta?acao=expansao&q=' + encodeURIComponent(q);
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (data) {
        var turb = [];
        if (data && Array.isArray(data.termos_turbinados)) {
          data.termos_turbinados.forEach(function (t) { turb.push(t); });
        }
        if (data && Array.isArray(data.contextos_relacionados)) {
          data.contextos_relacionados.forEach(function (ctx) {
            if (ctx && Array.isArray(ctx.palavras_chave_busca)) {
              ctx.palavras_chave_busca.forEach(function (kw) { turb.push(kw); });
            }
          });
        }
        vitrineIaExpansaoCache[qNorm] = { ts: Date.now(), termos: turb };
        if (typeof callback === 'function') callback(obterTermosExpandidosIA(q));
      })
      .catch(function () {
        if (typeof callback === 'function') callback(obterTermosExpandidosIA(q));
      });
  }

  function calcularBonusSemanticaIA(titNorm, resNorm, termoNorm, expandedTerms) {
    var lista = Array.isArray(expandedTerms) && expandedTerms.length ? expandedTerms : obterTermosExpandidosIA(termoNorm);
    if (!lista || !lista.length) return 0;
    var bonus = 0;
    for (var i = 0; i < lista.length; i++) {
      var expNorm = norm(lista[i]);
      if (!expNorm || expNorm === termoNorm) continue;
      if (titNorm && titNorm.indexOf(expNorm) > -1) {
        bonus += 32;
      } else if (resNorm && resNorm.indexOf(expNorm) > -1) {
        bonus += 16;
      } else {
        var subTks = expNorm.split(/\s+/).filter(function (tk) { return tk.length >= 3 && (!STOPWORDS_BUSCA || !STOPWORDS_BUSCA[tk]); });
        for (var j = 0; j < subTks.length; j++) {
          if (titNorm && titNorm.indexOf(subTks[j]) > -1) {
            bonus += 10;
            break;
          } else if (resNorm && resNorm.indexOf(subTks[j]) > -1) {
            bonus += 5;
            break;
          }
        }
      }
    }
    return Math.min(85, bonus);
  }

  function calcularRelevanciaClient(art, termoNorm, tokens, expandedTerms) {
    var titNorm = norm(String(art.titulo || ''));
    var resNorm = norm(String(art.resumo || ''));
    var score = 0;

    if (termoNorm && titNorm.indexOf(termoNorm) > -1) score += 140;
    else if (termoNorm && resNorm.indexOf(termoNorm) > -1) score += 50;

    var relTokens = (tokens || []).filter(function (tk) { return tk.length >= 2 && !STOPWORDS_BUSCA[tk]; });
    var baseTokens = relTokens.length ? relTokens : (tokens || []);
    if (baseTokens.length > 0) {
      var tTit = 0, tRes = 0;
      for (var i = 0; i < baseTokens.length; i++) {
        var tk = baseTokens[i];
        if (titNorm.indexOf(tk) > -1) tTit++;
        else if (resNorm.indexOf(tk) > -1) tRes++;
      }
      var fracTit = tTit / baseTokens.length;
      var fracRes = tRes / baseTokens.length;
      if (tTit === baseTokens.length) score += 90;
      else score += Math.round(fracTit * 65);
      if (tRes === baseTokens.length) score += 30;
      else score += Math.round(fracRes * 20);
    }

    // Bônus de expansão semântica da Curadoria IA (ponderação sem filtro eliminador)
    score += calcularBonusSemanticaIA(titNorm, resNorm, termoNorm, expandedTerms);

    if (art.publicadoEm) {
      var ts = new Date(art.publicadoEm).getTime();
      if (!isNaN(ts)) {
        var hrs = Math.max(0, (Date.now() - ts) / (3600 * 1000));
        if (hrs <= 6) score += 35;
        else if (hrs <= 12) score += 25;
        else if (hrs <= 24) score += 15;
        else if (hrs <= 48) score += 8;
      }
    }

    return score;
  }

  function combinaTextoFuzzy(alvoTexto, termoNorm, tokens, expandedTerms) {
    if (!termoNorm) return true;
    var alvo = norm(String(alvoTexto || ''));
    if (!alvo) return false;
    if (alvo.indexOf(termoNorm) > -1) return true;
    var relTokens = (tokens || []).filter(function (tk) { return tk.length >= 2 && !STOPWORDS_BUSCA[tk]; });
    var list = relTokens.length ? relTokens : (tokens || []);
    if (list.length === 0) return true;

    // Para buscas com 1 palavra curta (ex: "lula", "stf", "pib", "moro"), não aceitar aproximações
    if (list.length === 1 && list[0].length <= 4) {
      if (alvo.indexOf(list[0]) > -1) return true;
      var expShort = Array.isArray(expandedTerms) && expandedTerms.length ? expandedTerms : obterTermosExpandidosIA(termoNorm);
      for (var s = 0; s < expShort.length; s++) {
        var es = norm(expShort[s]);
        if (es && es.length >= 3 && alvo.indexOf(es) > -1) return true;
      }
      return false;
    }

    var palavrasAlvo = alvo.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    var casados = 0;
    for (var i = 0; i < list.length; i++) {
      var tk = list[i];
      if (alvo.indexOf(tk) > -1 || tokenCombinaFuzzy(tk, alvo, palavrasAlvo)) {
        casados++;
      }
    }

    if (casados === list.length) return true;
    if (list.length === 2) {
      if (casados >= 1 && list.some(function (tk) { return tk.length >= 4 && (alvo.indexOf(tk) > -1 || tokenCombinaFuzzy(tk, alvo, palavrasAlvo)); })) return true;
    }
    if (list.length >= 3) {
      if (casados >= Math.max(2, Math.ceil(list.length * 0.4))) return true;
    }

    // Se o artigo contiver algum dos termos expandidos pela Curadoria IA, aceita para pontuação ponderada
    var expList = Array.isArray(expandedTerms) && expandedTerms.length ? expandedTerms : obterTermosExpandidosIA(termoNorm);
    for (var k = 0; k < expList.length; k++) {
      var expItem = norm(expList[k]);
      if (expItem && expItem.length >= 3 && alvo.indexOf(expItem) > -1) return true;
    }
    return false;
  }

  function clearTopicSearch() {
    state.searchQuery = '';
    state.searchLoading = false;
    state.searchData = null;
    state.searchError = '';
    if (activeSearchController) {
      try { activeSearchController.abort(); } catch (e) {}
    }
    if (panel) {
      var inputEl = panel.querySelector('#topic-search-input');
      var clearEl = panel.querySelector('#topic-search-clear');
      if (inputEl) inputEl.value = '';
      if (clearEl) clearEl.hidden = true;
    }
    renderTopicSearchResults();
  }

  var contextualSuggestionsCache = {};
  var contextualSuggestionsTTL = 2 * 60 * 1000;

  function getContextualSuggestionsCached(paisCode) {
    var key = (paisCode || 'GLOBAL').toUpperCase();
    var entry = contextualSuggestionsCache[key];
    if (entry && (Date.now() - entry.ts < contextualSuggestionsTTL)) {
      return entry.sugestoes;
    }
    return null;
  }

  function renderContextualChipsHTML(sugestoes) {
    if (!Array.isArray(sugestoes) || !sugestoes.length) return '';
    return sugestoes.map(function (s) {
      var label = s.termo || s.termo_busca || '';
      var termoBusca = s.termo_busca || label;
      var escopo = s.prioridade || 'direto';
      var isActive = state.searchFromContextualChip && norm(state.searchQuery) === norm(label);
      return '<button type="button" class="contextual-chip' + (isActive ? ' is-active' : '') + '" ' +
        'data-ctx-term="' + esc(label) + '" ' +
        'data-ctx-query="' + esc(termoBusca) + '" ' +
        'data-ctx-escopo="' + esc(escopo) + '" ' +
        'aria-pressed="' + (isActive ? 'true' : 'false') + '" role="listitem">' +
        esc(label) +
        '</button>';
    }).join('');
  }

  function bindContextualChips() {
    var track = panel.querySelector('#contextual-chips-track');
    if (!track) return;
    track.querySelectorAll('[data-ctx-term]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var label = chip.getAttribute('data-ctx-term') || '';
        var termoBusca = chip.getAttribute('data-ctx-query') || label;
        var escopo = chip.getAttribute('data-ctx-escopo') || 'direto';
        if (!termoBusca) return;
        executeContextualChipSearch({ termo: label, termo_busca: termoBusca, prioridade: escopo });
      });
    });
  }

  function atualizarBarraSugestoesContextuais(paisCode, sugestoes) {
    var track = panel.querySelector('#contextual-chips-track');
    if (!track) return;
    var curPais = state.country
      ? ((state.cont === 'sul' && (state.country.a2 === 'FR' || state.country.id === '250')) ? 'GF' : (state.country.a2 || state.country.id || ''))
      : '';
    if (String(curPais || '').toUpperCase() !== String(paisCode || '').toUpperCase()) return;
    if (!Array.isArray(sugestoes) || !sugestoes.length) {
      track.innerHTML = '';
      track.hidden = true;
      return;
    }
    track.innerHTML = renderContextualChipsHTML(sugestoes);
    track.hidden = false;
    bindContextualChips();
  }

  function carregarSugestoesContextuais(paisCode) {
    var key = (paisCode || 'GLOBAL').toUpperCase();
    var cached = getContextualSuggestionsCached(paisCode);
    if (cached) {
      atualizarBarraSugestoesContextuais(paisCode, cached);
      return;
    }
    var qs = '?limit=4' + (paisCode ? '&pais=' + encodeURIComponent(key) : '');
    var isFile = (location.protocol === 'file:');
    var primaryUrl = (isFile ? 'https://www.rodandoomundo.com.br' : '') + '/v2/sugestoes-contextuais' + qs;

    fetch(primaryUrl, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
          return fetch('https://www.rodandoomundo.com.br/v2/sugestoes-contextuais' + qs, { headers: { Accept: 'application/json' } });
        }
        return r;
      })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var list = (data && Array.isArray(data.sugestoes)) ? data.sugestoes : [];
        contextualSuggestionsCache[key] = { ts: Date.now(), sugestoes: list };
        atualizarBarraSugestoesContextuais(paisCode, list);
      })
      .catch(function () {
        atualizarBarraSugestoesContextuais(paisCode, []);
      });
  }

  function executeContextualChipSearch(sugestao) {
    var c = state.country;
    var cCode = c ? ((state.cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id || '')) : '';
    var label = sugestao.termo || sugestao.termo_busca || '';
    var termoBusca = sugestao.termo_busca || label;
    var escopo = sugestao.prioridade || (cCode ? 'direto' : 'global');

    if (activeSearchController) {
      try { activeSearchController.abort(); } catch (e) {}
    }
    activeSearchController = window.AbortController ? new AbortController() : null;

    state.searchFromContextualChip = true;
    state.searchQuery = label;
    state.searchLoading = true;
    state.searchError = '';
    state.searchData = null;

    var track = panel.querySelector('#contextual-chips-track');
    if (track) {
      track.querySelectorAll('[data-ctx-term]').forEach(function (btn) {
        var active = norm(btn.getAttribute('data-ctx-term')) === norm(label);
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    renderTopicSearchResults();

    var qs = '?termo=' + encodeURIComponent(termoBusca) +
      (cCode ? '&pais=' + encodeURIComponent(cCode) : '') +
      '&escopo=' + encodeURIComponent(escopo) +
      '&limit=20';
    var isFile = (location.protocol === 'file:');
    var primaryUrl = (isFile ? 'https://www.rodandoomundo.com.br' : '') + '/v2/artigos-por-assunto' + qs;

    fetch(primaryUrl, {
      headers: { Accept: 'application/json' },
      signal: activeSearchController ? activeSearchController.signal : undefined
    })
      .then(function (r) {
        if (!r.ok && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
          return fetch('https://www.rodandoomundo.com.br/v2/artigos-por-assunto' + qs, { headers: { Accept: 'application/json' } });
        }
        return r;
      })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var artigos = (data && Array.isArray(data.artigos)) ? data.artigos : [];
        state.searchLoading = false;
        state.searchError = '';
        state.searchData = {
          isContextualDbResult: true,
          termo: label,
          termoBusca: termoBusca,
          escopo: escopo,
          artigos: artigos,
          totalArtigos: artigos.length,
          grupos: []
        };
        renderTopicSearchResults();
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        state.searchLoading = false;
        state.searchError = 'Não foi possível carregar as matérias deste assunto agora.';
        state.searchData = null;
        renderTopicSearchResults();
      });
  }

  function bindTopicSearch() {
    var formEl = panel.querySelector('#topic-search-form');
    var inputEl = panel.querySelector('#topic-search-input');
    var clearEl = panel.querySelector('#topic-search-clear');
    var toggleBtn = panel.querySelector('#contextual-search-toggle');

    bindContextualChips();

    if (toggleBtn && formEl) {
      toggleBtn.addEventListener('click', function () {
        var willOpen = formEl.hidden;
        formEl.hidden = !willOpen;
        toggleBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        toggleBtn.classList.toggle('is-open', willOpen);
        if (willOpen && inputEl) {
          setTimeout(function () { inputEl.focus(); }, 20);
        }
      });
    }

    if (!formEl || !inputEl) return;

    inputEl.addEventListener('input', function () {
      if (clearEl) clearEl.hidden = !inputEl.value.trim();
    });

    inputEl.addEventListener('focus', function () {
      this.select();
    });

    if (clearEl) {
      clearEl.addEventListener('click', function () {
        clearTopicSearch();
        inputEl.focus();
      });
    }

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      state.searchFromContextualChip = false;
      var q = (inputEl.value || '').trim();
      if (!q) {
        state.searchQuery = '';
        state.searchLoading = false;
        state.searchData = null;
        state.searchError = '';
        renderTopicSearchResults();
        inputEl.focus();
        return;
      }
      executeTopicSearch(q);
    });
  }

  function renderTimelineHTML(tl, prefix, fallbackCode) {
    if (!tl || !Array.isArray(tl.eventos) || !tl.eventos.length) return '';
    var h = '<div class="editorial-timeline-block" data-timeline-id="' + esc(tl.id || prefix || 'tl') + '">';
    h += '<div class="editorial-timeline-head">';
    h += '<span class="editorial-eyebrow">Linha do tempo · Em evolução</span>';
    h += '<h4>' + esc(tl.titulo) + '</h4>';
    if (tl.descricao) h += '<p>' + esc(tl.descricao) + '</p>';
    h += '</div>';
    h += '<ol class="editorial-timeline-list">';
    tl.eventos.forEach(function (ev) {
      var evFlag = outletFlagImg(ev.fonte, fallbackCode, ev.urlMateria);
      h += '<li class="editorial-timeline-item">';
      h += '<div class="timeline-marker" aria-hidden="true"></div>';
      h += '<div class="timeline-content">';
      h += '<div class="timeline-meta">';
      h += '<time class="timeline-date" datetime="' + esc(ev.dataISO || '') + '">' + esc(ev.data) + '</time>';
      h += '<span class="timeline-source-badge">Fonte: ' + evFlag + ' ' + esc(ev.fonte) + '</span>';
      h += renderNewsFavBtn({ url: ev.urlMateria, title: ev.tituloMateria || ev.titulo, source: ev.fonte, countryCode: fallbackCode, publishedAt: (ev.dataISO || '') + 'T12:00:00Z' });
      h += '</div>';
      h += '<h5 class="timeline-item-title">' + esc(ev.titulo) + '</h5>';
      h += '<p class="timeline-item-summary">' + esc(ev.resumo) + '</p>';
      h += '<div class="timeline-item-actions">';
      var evLink = buildArticleLinkAttrs(ev.urlMateria, ev.tituloMateria || ev.titulo, ev.fonte);
      h += '<a class="timeline-article-link" href="' + esc(evLink.href) + '"' + evLink.attrs + ' target="_blank" rel="noopener noreferrer">' + esc(ev.tituloMateria || ((isVideoContent(ev.urlMateria, ev) ? 'Assistir vídeo em ' : 'Ler matéria em ') + ev.fonte)) + ' ' + ICON_ARROW + '</a>';
      h += '<button type="button" class="btn btn-sm btn-outline timeline-coverage-btn" data-coverage-query="' + esc(ev.termoCobertura || ev.titulo) + '">Ver cobertura completa</button>';
      h += '</div>';
      h += '</div>';
      h += '</li>';
    });
    h += '</ol>';
    h += '</div>';
    return h;
  }

  function renderRelatedEditorialLinksHTML(query, cCode, topicKey) {
    var hubs = EDITORIAL.encontrarHubsPorTermo(query, cCode, topicKey);
    var exps = EDITORIAL.encontrarExplicacoesPorTermo(query, cCode, topicKey);
    if (!hubs.length && !exps.length) return '';
    var h = '<div class="perspective-editorial-links">';
    if (hubs.length) {
      h += '<div class="perspective-links-group">';
      h += '<span class="perspective-links-label">Páginas temáticas relacionadas:</span>';
      hubs.slice(0, 3).forEach(function (hb) {
        h += '<a class="perspective-internal-pill" href="' + esc(hb.rota) + '" data-spa-link>' + esc(hb.titulo) + ' →</a>';
      });
      h += '</div>';
    }
    if (exps.length) {
      h += '<div class="perspective-links-group">';
      h += '<span class="perspective-links-label">Entenda o assunto:</span>';
      exps.slice(0, 3).forEach(function (ex) {
        h += '<a class="perspective-internal-pill pill-entenda" href="/entenda/' + esc(ex.slug) + '" data-spa-link>' + esc(ex.titulo) + '</a>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderTopicSearchResults() {
    var box = panel.querySelector('#topic-search-results');
    var tlBox = panel.querySelector('#panel-timeline-slot');
    var clearEl = panel.querySelector('#topic-search-clear');
    if (clearEl) clearEl.hidden = !state.searchQuery;
    if (!box) return;

    if (!state.searchQuery && !state.searchLoading) {
      box.innerHTML = '';
      if (tlBox) tlBox.innerHTML = '';
      return;
    }

    var c = state.country;
    var cCode = c ? ((state.cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id)) : '';
    var cName = countryDisplayName(state.country, state.cont);
    var tLabel = currentTopicLabel();
    var ctxStr = cName + (tLabel ? ' · ' + tLabel : '');
    var perLabelMap = { '24h': 'Últimas 24 horas', '7d': 'Últimos 7 dias' };
    var perLabel = perLabelMap[state.searchPeriod] || 'Últimas 24 horas';

    var periods = [
      { k: '24h', l: 'Últimas 24 horas' },
      { k: '7d',  l: 'Últimos 7 dias' }
    ];

    function bindPeriodButtons(rootNode) {
      if (!rootNode) return;
      rootNode.querySelectorAll('#f-period .period-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var per = btn.getAttribute('data-period') || '24h';
          state.searchPeriod = per;
          state.periodManual = true;
          if (state.searchQuery) {
            executeTopicSearch(state.searchQuery, { manualPeriod: true });
          }
        });
      });
    }

    var data = state.searchData;
    var termoSugerido = (data && data.termoCorrigido) ? data.termoCorrigido : corrigirTermoBusca(state.searchQuery);
    var termoEfetivo = (termoSugerido && norm(termoSugerido) !== norm(state.searchQuery)) ? termoSugerido : state.searchQuery;
    var foiCorrigido = norm(termoEfetivo) !== norm(state.searchQuery);

    var dynBanner = '';
    if (state.searchQuery) {
      var periodBtnsHTML = '<div class="perspective-period-filters perspective-period-after-search" id="f-period" role="group" aria-label="Filtrar por período">';
      periods.forEach(function (p) {
        periodBtnsHTML += '<button type="button" class="period-btn" data-period="' + p.k + '" aria-pressed="' + (state.searchPeriod === p.k) + '">' + p.l + '</button>';
      });
      periodBtnsHTML += '</div>';

      var fallbackLongNote = (data && data.fallbackDeFraseLonga)
        ? '<p class="perspective-dynamic-correction">Buscando termos centrais <strong>“' + esc(termoEfetivo) + '”</strong> <span class="perspective-correction-orig">(extraídos da busca ampla: “' + esc(data.fallbackDeFraseLonga) + '”)</span></p>'
        : '';

      dynBanner =
        '<div class="perspective-dynamic-banner">' +
          '<h4 class="perspective-dynamic-title" id="perspective-dynamic-title">' + esc(termoEfetivo) + ': como os veículos estão cobrindo</h4>' +
          fallbackLongNote +
          (foiCorrigido && !fallbackLongNote ? '<p class="perspective-dynamic-correction">Exibindo resultados para <strong>“' + esc(termoEfetivo) + '”</strong> <span class="perspective-correction-orig">(em vez de “' + esc(state.searchQuery) + '”)</span></p>' : '') +
          '<p class="perspective-dynamic-subtitle">Compare as últimas notícias e as diferentes perspectivas sobre o assunto.</p>' +
          '<p class="perspective-dynamic-meta">Contexto: <strong>' + esc(ctxStr) + '</strong> · Período: <strong>' + esc(perLabel) + '</strong></p>' +
          periodBtnsHTML +
        '</div>';
    }

    if (state.searchLoading) {
      if (tlBox) tlBox.innerHTML = '';
      box.innerHTML = dynBanner +
        '<div class="topic-search-status loading" role="status">' +
          '<span class="topic-search-spinner" aria-hidden="true"></span>' +
          '<p>Buscando matérias sobre <strong>“' + esc(termoEfetivo) + '”</strong> em ' + esc(ctxStr) + '…</p>' +
        '</div>';
      bindPeriodButtons(box);
      return;
    }

    if (state.searchError) {
      if (tlBox) tlBox.innerHTML = '';
      var emptySugListErr = getSuggestionsForEmptyState(c, state.cont, state.topic, 4);
      var chipsErrHTML = renderEmptySuggestionsChipsHTML(emptySugListErr);
      box.innerHTML = dynBanner +
        '<div class="topic-search-status empty" role="status">' +
          '<p class="topic-search-empty-title">Nenhum resultado encontrado</p>' +
          '<p class="topic-search-empty-sub">' + esc(state.searchError) + '</p>' +
          chipsErrHTML +
        '</div>';
      bindPeriodButtons(box);
      bindEmptySuggestionsClicks(box);
      return;
    }

    var grupos = (data && Array.isArray(data.grupos)) ? data.grupos : [];
    var matchedTimeline = EDITORIAL.encontrarLinhaDoTempoPorTermo(termoEfetivo, cCode, state.topic);
    var relatedLinksHTML = renderRelatedEditorialLinksHTML(termoEfetivo, cCode, state.topic);

    if (data && data.isContextualDbResult && Array.isArray(data.artigos) && data.artigos.length > 0) {
      var ctxHtml = '<div class="contextual-results-head">' +
        '<div class="contextual-results-title-wrap">' +
          '<h4 class="perspective-dynamic-title">' + esc(data.termo) + '</h4>' +
          '<span class="contextual-results-count">' + data.artigos.length + (data.artigos.length === 1 ? ' matéria confirmada' : ' matérias confirmadas') + '</span>' +
        '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost contextual-clear-btn" id="btn-ctx-clear">Limpar</button>' +
      '</div>';

      ctxHtml += '<div class="contextual-articles-list">';
      data.artigos.forEach(function (art) {
        var fontesHtml = '';
        if (Array.isArray(art.fontes_urls) && art.fontes_urls.length) {
          fontesHtml = '<div class="contextual-article-sources">' +
            art.fontes_urls.slice(0, 3).map(function (u, idx) {
              var nome = (Array.isArray(art.veiculos_origem) && art.veiculos_origem[idx]) ? art.veiculos_origem[idx] : 'Fonte original';
              return '<a class="contextual-source-link" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(nome) + ' ↗</a>';
            }).join('') +
          '</div>';
        }
        ctxHtml += '<article class="contextual-article-card">' +
          '<div class="contextual-article-meta">' +
            '<span class="contextual-article-cat">' + esc((art.categoria || '').replace(/_/g, ' ')) + '</span>' +
            (art.atualizado_em ? '<span class="contextual-article-time">' + esc(art.atualizado_em) + '</span>' : '') +
          '</div>' +
          '<h5 class="contextual-article-title">' + esc(art.titulo) + '</h5>' +
          (art.resumo ? '<p class="contextual-article-summary">' + esc(art.resumo) + '</p>' : '') +
          (art.impacto_pratico ? '<p class="contextual-article-impact"><strong>Impacto:</strong> ' + esc(art.impacto_pratico) + '</p>' : '') +
          fontesHtml +
        '</article>';
      });
      ctxHtml += '</div>';

      ctxHtml += '<div class="contextual-results-footer">' +
        '<button type="button" class="btn btn-sm btn-outline" id="btn-ctx-expand-live">Buscar também nos feeds ao vivo dos veículos</button>' +
      '</div>';

      box.innerHTML = ctxHtml + relatedLinksHTML;
      var clearBtn = box.querySelector('#btn-ctx-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          state.searchFromContextualChip = false;
          state.searchQuery = '';
          state.searchData = null;
          state.searchError = '';
          panel.querySelectorAll('.contextual-chip.is-active').forEach(function (b) {
            b.classList.remove('is-active');
            b.setAttribute('aria-pressed', 'false');
          });
          renderTopicSearchResults();
        });
      }
      var expandBtn = box.querySelector('#btn-ctx-expand-live');
      if (expandBtn) {
        expandBtn.addEventListener('click', function () {
          state.searchFromContextualChip = false;
          executeTopicSearch(data.termoBusca || data.termo);
        });
      }
      if (tlBox) {
        tlBox.innerHTML = matchedTimeline ? renderTimelineHTML(matchedTimeline, 'panel-tl', cCode) : '';
        bindDynamicEditorialActions(tlBox);
        bindNewsFavButtons(tlBox);
      }
      bindDynamicEditorialActions(box);
      return;
    }

    if (!grupos.length) {
      var gNewsSearchUrl = 'https://news.google.com/search?q=' + encodeURIComponent(termoEfetivo + (cCode === 'BR' ? ' brasil' : '')) + '&hl=pt-BR&gl=BR&ceid=BR:pt-419';
      var emptySugList = getSuggestionsForEmptyState(c, state.cont, state.topic, 4);
      var chipsHTML = renderEmptySuggestionsChipsHTML(emptySugList);
      box.innerHTML = dynBanner +
        '<div class="topic-search-status empty" role="status">' +
          '<p class="topic-search-empty-title">Nenhum resultado encontrado neste período</p>' +
          '<p class="topic-search-empty-sub">Não encontramos matérias em <strong>' + esc(perLabel) + '</strong> sobre <strong>“' + esc(termoEfetivo) + '”</strong> nos veículos de ' + esc(ctxStr) + '.</p>' +
          chipsHTML +
          '<div class="topic-search-empty-actions" style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
            (state.searchPeriod !== '7d' ? '<button type="button" class="btn btn-sm btn-outline" id="btn-search-all-periods">Buscar nos últimos 7 dias</button>' : '') +
            '<a class="btn btn-sm btn-secondary topic-search-gnews-btn" href="' + gNewsSearchUrl + '" target="_blank" rel="noopener noreferrer">Ver notícias sobre “' + esc(termoEfetivo) + '” no Google ' + ICON_ARROW.replace('<svg', '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"') + '</a>' +
          '</div>' +
        '</div>' +
        relatedLinksHTML;
      if (tlBox) {
        tlBox.innerHTML = matchedTimeline ? renderTimelineHTML(matchedTimeline, 'panel-tl', cCode) : '';
        bindDynamicEditorialActions(tlBox);
        bindNewsFavButtons(tlBox);
      }
      var allPerBtn = box.querySelector('#btn-search-all-periods');
      if (allPerBtn) {
        allPerBtn.addEventListener('click', function () {
          state.searchPeriod = '7d';
          state.periodManual = true;
          executeTopicSearch(termoEfetivo, { manualPeriod: true });
        });
      }
      bindPeriodButtons(box);
      bindEmptySuggestionsClicks(box);
      bindDynamicEditorialActions(box);
      return;
    }

    var pol = state.topic === 'politica';
    var h = dynBanner;
    h += '<div class="topic-search-header">';
    h += '<p class="topic-search-summary">Resultados para <strong>“' + esc(termoEfetivo) + '”</strong>' + (foiCorrigido ? ' <span class="topic-search-corrected-note">(corrigido de “' + esc(state.searchQuery) + '”)</span>' : '') + ' em <span>' + esc(ctxStr) + '</span> (' + grupos.length + (grupos.length === 1 ? ' veículo' : ' veículos') + ')</p>';
    h += '<button type="button" class="topic-translate-all-btn" data-translate-all aria-pressed="false" title="Traduzir todos os títulos e resumos para português">' + ICON_TRANSLATE + ' <span>Traduzir todas</span></button>';
    h += '</div>';
    h += relatedLinksHTML;
    h += '<div class="topic-carousels">';

    grupos.forEach(function (g, gIdx) {
      var trackId = 'carousel-track-' + gIdx;
      var biasBadge = (pol && g.vies && BIAS[g.vies]) ? '<span class="badge badge-bias">' + esc(BIAS[g.vies]) + '</span>' : '';
      var gSug = isOutletUserSuggested({ n: g.veiculo, u: g.urlVeiculo });
      var sugBadge = gSug ? '<span class="badge badge-sug" data-dica="indicacao" title="Veículo indicado por usuário na aba Cadastrar Veículo"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Indicação</span>' : '';
      var favDomain = g.dominio || host(g.urlVeiculo || '');
      var gFlag = outletFlagImg(g.veiculo, g.pais || cCode, favDomain);
      h += '<section class="outlet-carousel" aria-label="Matérias de ' + esc(g.veiculo) + '">';
      h += '<div class="outlet-carousel-head">';
      h += '<div class="outlet-carousel-title">';
      h += '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(favDomain) + '&sz=64" alt="" loading="lazy" width="20" height="20">';
      h += '<h4>' + gFlag + ' ' + esc(g.veiculo) + '</h4>';
      h += biasBadge + sugBadge;
      h += '<span class="outlet-carousel-count">' + g.artigos.length + (g.artigos.length === 1 ? ' matéria' : ' matérias') + '</span>';
      h += '</div>';
      h += '<div class="outlet-carousel-nav">';
      h += '<button type="button" class="carousel-btn" data-target="' + trackId + '" data-dir="-1" aria-label="Matérias anteriores de ' + esc(g.veiculo) + '" title="Anterior">‹</button>';
      h += '<button type="button" class="carousel-btn" data-target="' + trackId + '" data-dir="1" aria-label="Próximas matérias de ' + esc(g.veiculo) + '" title="Próximo">›</button>';
      h += '</div>';
      h += '</div>';

      h += '<div class="outlet-carousel-track" id="' + trackId + '">';
      g.artigos.forEach(function (rawArt) {
        var art = EDITORIAL.vincularMateria(rawArt, {
          pais: cCode,
          continente: state.cont,
          tipoNoticia: state.topic || 'politica',
          termoBusca: termoEfetivo
        });
        var dtFormatted = formatSearchDate(art.publicadoEm);
        var validImgUrl = isValidNewsImageUrl(art.imagem || art.image || art.thumbnail || '');
        var artSource = art.veiculo || g.veiculo;
        var artFlag = outletFlagImg(artSource, rawArt.pais || g.pais || cCode, favDomain);
        h += '<article class="topic-news-card">';
        if (validImgUrl) {
          h += '<a class="topic-news-card-media" href="' + esc(art.url) + '" target="_blank" rel="noopener noreferrer" tabindex="-1">';
          h += '<img src="' + esc(validImgUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="var m=this.closest(\'.topic-news-card-media\');if(m)m.remove();" onload="if(this.naturalWidth<=2){var m=this.closest(\'.topic-news-card-media\');if(m)m.remove();}">';
          h += '</a>';
        }
        h += '<div class="topic-news-card-body">';
        h += '<div class="topic-news-meta">';
        h += '<span class="topic-news-source">' + artFlag + ' ' + esc(artSource) + '</span>';
        if (dtFormatted) {
          h += '<span class="topic-news-sep" aria-hidden="true">·</span>';
          h += '<time class="topic-news-date" datetime="' + esc(art.publicadoEm) + '">' + esc(dtFormatted) + '</time>';
        }
        h += '</div>';
        h += '<h5 class="topic-news-title"><a href="' + esc(art.url) + '" target="_blank" rel="noopener noreferrer" data-orig-text="' + esc(art.titulo) + '">' + esc(art.titulo) + '</a></h5>';
        if (art.resumo) {
          h += '<p class="topic-news-desc" data-orig-text="' + esc(art.resumo) + '">' + esc(art.resumo) + '</p>';
        }
        if (art.vinculos && art.vinculos.paginaTematica) {
          h += '<div class="topic-news-links-row">';
          h += '<a class="card-internal-tag" href="' + esc(art.vinculos.paginaTematica) + '" data-spa-link>Hub temático</a>';
          h += '</div>';
        }
        h += '<div class="topic-news-card-footer">';
        h += '<a class="topic-news-open" href="' + esc(art.url) + '" target="_blank" rel="noopener noreferrer" title="' + (isVideoContent(art.url, art) ? 'Assistir vídeo no canal original' : 'Abrir matéria no site original (alguns sites podem exigir assinatura)') + '">' + (isVideoContent(art.url, art) ? 'Assistir vídeo ' : 'Abrir matéria ') + ICON_ARROW + '</a>';
        h += '<div class="topic-news-card-actions">' +
          '<button type="button" class="topic-news-translate-btn" data-translate-card aria-pressed="false" title="Traduzir notícia para português">' + ICON_TRANSLATE + ' <span>Traduzir</span></button>' +
          renderNewsFavBtn({ url: art.url, title: art.titulo, source: artSource, countryCode: rawArt.pais || g.pais || cCode, publishedAt: art.publicadoEm }) +
          '</div>';
        h += '</div>';
        h += '</div>';
        h += '</article>';
      });
      h += '</div>';
      h += '</section>';
    });

    h += '</div>';
    box.innerHTML = h;

    if (tlBox) {
      tlBox.innerHTML = matchedTimeline ? renderTimelineHTML(matchedTimeline, 'panel-tl', cCode) : '';
      bindDynamicEditorialActions(tlBox);
      bindNewsFavButtons(tlBox);
    }

    box.querySelectorAll('.carousel-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = document.getElementById(btn.getAttribute('data-target'));
        if (!tr) return;
        var dir = Number(btn.getAttribute('data-dir')) || 1;
        var step = Math.max(220, Math.round(tr.clientWidth * 0.8));
        tr.scrollBy({ left: dir * step, behavior: 'smooth' });
      });
    });
    bindPeriodButtons(box);
    bindCardTranslations(box);
    bindDynamicEditorialActions(box);
    bindNewsFavButtons(box);
  }

  function executeTopicSearch(rawQuery, opts) {
    opts = opts || {};
    var q = String(rawQuery || '').trim();
    if (!opts.manualPeriod && !opts.keepPeriod) {
      state.searchPeriod = opts.initialPeriod || '24h';
      state.periodManual = false;
    }
    if (q.length < 2) {
      state.searchQuery = q;
      state.searchLoading = false;
      state.searchData = null;
      state.searchError = 'Digite pelo menos 2 caracteres para realizar a busca.';
      renderTopicSearchResults();
      return;
    }

    var c = state.country;
    var cMed = countryMedia(c, state.cont);
    if (!c || !cMed) return;

    var outlets = activeCountryOutlets();
    var lang = (cMed.lang || 'pt').toLowerCase();
    var tTerm = currentTopicTerm(lang);
    var cCode = (state.cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id);
    var cName = countryDisplayName(c, state.cont);

    var periodo = state.searchPeriod || '24h';
    var cacheKey = [norm(q), state.cont, cCode, state.topic || 'all', state.bias || 'all', periodo].join('|');
    if (clientSearchCache[cacheKey] && (Date.now() - clientSearchCache[cacheKey].ts < 5 * 60 * 1000)) {
      var cachedData = clientSearchCache[cacheKey].data;
      if (periodo === '24h' && (!cachedData.grupos || !cachedData.grupos.length) && !state.periodManual) {
        state.searchPeriod = 'all';
        executeTopicSearch(q, { keepPeriod: true });
        return;
      }
      if (cachedData && cachedData.periodo && !state.periodManual) {
        state.searchPeriod = cachedData.periodo;
      }
      state.searchQuery = q;
      state.searchLoading = false;
      state.searchError = '';
      state.searchData = cachedData;
      renderTopicSearchResults();
      return;
    }

    if (activeSearchController) {
      try { activeSearchController.abort(); } catch (e) {}
    }
    activeSearchController = window.AbortController ? new AbortController() : null;

    state.searchQuery = q;
    state.searchLoading = true;
    state.searchError = '';
    renderTopicSearchResults();

    // SUG-CURADORIA-IA: Pré-aquece termos expandidos da busca via /api/vitrine-em-alta?acao=expansao&q=...
    consultarExpansaoBuscaIA(q, function () {});

    var termosExpandidosBusca = obterTermosExpandidosIA(q);
    var searchPayload = {
      q: q,
      cont: state.cont || '',
      country: cCode || '',
      countryName: cName || '',
      topic: opts.ignoreTopic ? '' : (state.topic || ''),
      topicTerm: opts.ignoreTopic ? '' : (tTerm || ''),
      periodo: periodo,
      lang: lang,
      outlets: outlets,
      termosTurbinados: termosExpandidosBusca
    };

    var searchTimer = null;
    if (activeSearchController) {
      searchTimer = setTimeout(function () {
        if (activeSearchController) {
          try { activeSearchController.abort(); } catch (e) {}
        }
      }, 10000);
    }

    var doSearchFetch = function (url) {
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(searchPayload),
        signal: activeSearchController ? activeSearchController.signal : undefined
      });
    };

    doSearchFetch('/api/busca-assunto')
      .then(function (r) {
        if (!r.ok && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          return doSearchFetch('https://www.rodandoomundo.com.br/api/busca-assunto');
        }
        return r;
      })
      .then(function (r) {
        if (searchTimer) clearTimeout(searchTimer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (searchTimer) clearTimeout(searchTimer);
        if (!data || !Array.isArray(data.grupos)) throw new Error('Invalid payload');
        if (periodo === '24h' && data.grupos.length === 0 && data.periodo !== '7d' && !state.periodManual) {
          state.searchPeriod = '7d';
          executeTopicSearch(q, { keepPeriod: true, ignoreTopic: opts.ignoreTopic, fromHotCompareBtn: opts.fromHotCompareBtn, hasFallbackShortTerm: opts.hasFallbackShortTerm, originalLongQuery: opts.originalLongQuery });
          return;
        }
        if (periodo === '7d' && data.grupos.length === 0 && data.periodo !== 'all' && !state.periodManual) {
          state.searchPeriod = 'all';
          executeTopicSearch(q, { keepPeriod: true, ignoreTopic: true, fromHotCompareBtn: opts.fromHotCompareBtn, hasFallbackShortTerm: opts.hasFallbackShortTerm, originalLongQuery: opts.originalLongQuery });
          return;
        }
        if (data.grupos.length === 0 && !opts.hasFallbackShortTerm) {
          var rawWords = q.trim().split(/\s+/).filter(Boolean);
          if (rawWords.length > 3) {
            var centralTerm = extrairTermoAssuntoBusca(q);
            if (centralTerm && norm(centralTerm) !== norm(q)) {
              executeTopicSearch(centralTerm, {
                hasFallbackShortTerm: true,
                originalLongQuery: q,
                keepPeriod: true,
                ignoreTopic: opts.ignoreTopic,
                fromHotCompareBtn: opts.fromHotCompareBtn
              });
              return;
            }
          }
        }
        if (data.grupos.length === 0 && opts.fromHotCompareBtn && panel) {
          var hotCmpEl = panel.querySelector('[data-hot-compare-term]');
          if (hotCmpEl) hotCmpEl.style.display = 'none';
        }
        if (opts.originalLongQuery) {
          data.fallbackDeFraseLonga = opts.originalLongQuery;
        }
        if (data.periodo && !state.periodManual) {
          state.searchPeriod = data.periodo;
        }
        // Ponderação adicional pelos termos expandidos da Curadoria IA
        var qNormPond = norm(q);
        var qTokensPond = qNormPond.split(/\s+/).filter(function (tk) { return tk.length >= 2; });
        var expPond = obterTermosExpandidosIA(q);
        if (expPond.length > 0 && Array.isArray(data.grupos)) {
          data.grupos.forEach(function (g) {
            if (g && Array.isArray(g.artigos)) {
              g.artigos.forEach(function (art) {
                art.rel = (typeof art.rel === 'number' ? art.rel : 0) + calcularBonusSemanticaIA(norm(art.titulo || ''), norm(art.resumo || ''), qNormPond, expPond);
              });
              g.artigos.sort(function (a, b) {
                var diffRel = (b.rel || 0) - (a.rel || 0);
                if (Math.abs(diffRel) >= 15) return diffRel;
                return (b.publicadoEm || '').localeCompare(a.publicadoEm || '');
              });
            }
          });
        }
        clientSearchCache[cacheKey] = { ts: Date.now(), data: data };
        if (data.periodo && data.periodo !== periodo) {
          var effKey = [norm(q), state.cont, cCode, state.topic || 'all', state.bias || 'all', data.periodo].join('|');
          clientSearchCache[effKey] = { ts: Date.now(), data: data };
        }
        if (data.topicosEmAlta && Array.isArray(data.topicosEmAlta) && data.topicosEmAlta.length) {
          incorporarTopicosEmAlta(cCode, data.topicosEmAlta);
          refreshQuickSuggestionsUI();
        }
        state.searchLoading = false;
        state.searchError = '';
        state.searchData = data;
        renderTopicSearchResults();
      })
      .catch(function (err) {
        if (searchTimer) clearTimeout(searchTimer);
        if (err && err.name === 'AbortError' && state.searchQuery !== q) return;
        clientSideRssFallback(q, outlets, tTerm, lang, cacheKey, periodo, false, opts.originalLongQuery);
      });
  }

  function extractRealLink(rawLink) {
    if (!rawLink) return '';
    try {
      var u = new URL(rawLink);
      if (u.hostname.indexOf('bing.com') > -1 && u.searchParams.get('url')) {
        return u.searchParams.get('url');
      }
      return u.href;
    } catch (e) {
      return rawLink;
    }
  }

  function withinPeriodClient(isoStr, periodo) {
    if (!periodo) return true;
    if (!isoStr) return false;
    var ts = new Date(isoStr).getTime();
    if (isNaN(ts)) return false;
    var diff = Math.max(0, Date.now() - ts);
    if (periodo === '24h') return diff <= 24 * 3600 * 1000 * 1.15;
    if (periodo === '7d') return diff <= 7 * 24 * 3600 * 1000 * 1.05;
    return true;
  }

  function clientSideRssFallback(q, outlets, tTerm, lang, cacheKey, periodo, isRetry, originalLongQuery) {
    var qCorrigido = corrigirTermoBusca(q);
    var qBase = (qCorrigido && norm(qCorrigido) !== norm(q)) ? qCorrigido : q;
    var translatePromise = (lang && lang !== 'pt') ? translateSingleTextGoogle(qBase, lang) : Promise.resolve(qBase);
    var translateTopicPromise = (tTerm && lang && lang !== 'pt') ? translateSingleTextGoogle(tTerm, lang) : Promise.resolve(tTerm || '');
    Promise.all([translatePromise, translateTopicPromise]).then(function (trArr) {
      var qTranslated = trArr[0];
      var tTranslated = trArr[1] || tTerm || '';
      var qEffective = (qTranslated && norm(qTranslated) !== norm(qBase)) ? qTranslated : qBase;
      var termoNorm = norm(qBase);
      var tokens = termoNorm.split(/\s+/).filter(function (tk) { return tk.length >= 2; });
      var termoOrigNorm = norm(q);
      var tokensOrig = termoOrigNorm.split(/\s+/).filter(function (tk) { return tk.length >= 2; });
      var termoTradNorm = norm(qEffective);
      var tokensTrad = termoTradNorm.split(/\s+/).filter(function (tk) { return tk.length >= 2; });
      var mkt = lang === 'pt' ? 'pt-BR' : (lang === 'es' ? 'es-ES' : (lang === 'fr' ? 'fr-FR' : 'en-US'));
      var intervalQft = periodo === '24h' ? '&qft=interval%3d%227%22' : '&qft=interval%3d%228%22';
      var maxFallbackOutlets = 5;
      var maxArticlesPerOutlet = 10;
      var promises = outlets.slice(0, maxFallbackOutlets).map(function (veic) {
        var qStr = qEffective + (tTranslated ? ' ' + tTranslated : '') + ' site:' + veic.d;
        var rssUrl = 'https://www.bing.com/news/search?q=' + encodeURIComponent(qStr) + '&format=rss&mkt=' + encodeURIComponent(mkt) + intervalQft;
        var apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);
        return fetch(apiUrl)
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            var items = (j && Array.isArray(j.items)) ? j.items : [];
            var rawMapped = items.map(function (it) {
              var realUrl = extractRealLink(it.link || '');
              var cleanDesc = String(it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              if (cleanDesc.length > 150) cleanDesc = cleanDesc.slice(0, 149).trim() + '…';
              var dt = it.pubDate ? new Date(String(it.pubDate).replace(' ', 'T') + 'Z') : null;
              var rawFbImg = it.thumbnail || (it.enclosure && it.enclosure.link) || '';
              if (!rawFbImg && (it.description || it.content)) {
                var imgTagM = String(it.description || it.content).match(/<img[^>]+src=["']([^"']+)["']/i);
                if (imgTagM && imgTagM[1]) rawFbImg = imgTagM[1];
              }
              return {
                titulo: String(it.title || '').trim(),
                resumo: cleanDesc,
                imagem: isValidNewsImageUrl(rawFbImg),
                url: realUrl,
                veiculo: veic.n,
                publicadoEm: (dt && !isNaN(dt.getTime())) ? dt.toISOString() : ''
              };
            });
            var mapped = rawMapped.filter(function (art) {
              if (!art.titulo || !art.url) return false;
              if (!withinPeriodClient(art.publicadoEm, periodo)) return false;
              // Apenas título e resumo (NUNCA incluir a URL codificada com Base64)
              var textoAlvo = art.titulo + ' ' + (art.resumo || '');
              return combinaTextoFuzzy(textoAlvo, termoNorm, tokens) ||
                combinaTextoFuzzy(textoAlvo, termoTradNorm, tokensTrad) ||
                combinaTextoFuzzy(textoAlvo, termoOrigNorm, tokensOrig);
            }).map(function (art) {
              art.rel = calcularRelevanciaClient(art, termoNorm, tokens);
              return art;
            }).sort(function (a, b) {
              var diffRel = (b.rel || 0) - (a.rel || 0);
              if (Math.abs(diffRel) >= 15) return diffRel;
              return (b.publicadoEm || '').localeCompare(a.publicadoEm || '');
            }).slice(0, typeof maxArticlesPerOutlet !== "undefined" ? maxArticlesPerOutlet : 12);

            return {
              veiculo: veic.n,
              dominio: veic.d,
              urlVeiculo: veic.u,
              vies: veic.b,
              independente: veic.ind,
              estatal: veic.st,
              artigos: mapped
            };
          })
          .catch(function () { return null; });
      });

      Promise.all(promises).then(function (resList) {
        var grupos = resList.filter(function (g) { return g && g.artigos && g.artigos.length > 0; });
        if (grupos.length === 0 && periodo === '24h' && !state.periodManual && !isRetry) {
          state.searchPeriod = '7d';
          var allKey = cacheKey.replace(/\|24h$/, '|7d');
          clientSideRssFallback(q, outlets, tTerm, lang, allKey, '7d', true, originalLongQuery);
          return;
        }
        if (grupos.length === 0 && !originalLongQuery) {
          var rawWords = q.trim().split(/\s+/).filter(Boolean);
          if (rawWords.length > 4) {
            var centralTerm = extrairTermoAssuntoBusca(q);
            if (centralTerm && norm(centralTerm) !== norm(q)) {
              var shortKey = [norm(centralTerm), state.cont, cCode, state.topic || 'all', state.bias || 'all', periodo].join('|');
              clientSideRssFallback(centralTerm, outlets, tTerm, lang, shortKey, periodo, true, q);
              return;
            }
          }
        }
        var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        var data = {
          termo: q,
          termoCorrigido: (qCorrigido && norm(qCorrigido) !== norm(q)) ? qCorrigido : '',
          fallbackDeFraseLonga: originalLongQuery || '',
          periodo: periodo || '24h',
          grupos: grupos,
          totalArtigos: grupos.reduce(function (acc, g) { return acc + g.artigos.length; }, 0)
        };
        var trendingFallback = extrairTopicosEmAltaClient(grupos, q);
        if (trendingFallback && trendingFallback.length) {
          incorporarTopicosEmAlta(cCode, trendingFallback);
          refreshQuickSuggestionsUI();
        }
        clientSearchCache[cacheKey] = { ts: Date.now(), data: data };
        state.searchLoading = false;
        state.searchError = (grupos.length === 0 && isLocal)
          ? 'Para busca completa em tempo real com todas as fontes locais e internacionais, execute "npx wrangler pages dev ." no terminal.'
          : '';
        state.searchData = data;
        renderTopicSearchResults();
      }).catch(function () {
        state.searchLoading = false;
        state.searchData = { termo: q, grupos: [], totalArtigos: 0 };
        renderTopicSearchResults();
      });
    }).catch(function () {
      state.searchLoading = false;
      state.searchData = { termo: q, grupos: [], totalArtigos: 0 };
      renderTopicSearchResults();
    });
  }

  function renderBias() {
    var c = state.country, box = panel.querySelector('#vies');
    if (state.topic !== 'politica') { box.innerHTML = ''; return; }
    var cMed = countryMedia(c, state.cont);
    var cnt = countsFor(c, state.cont), total = (cMed && cMed.outlets) ? cMed.outlets.length : 1;
    var h = '';
    h += '<p class="group-label">Linha editorial (política)<button type="button" class="info-btn" data-dica="vies" aria-label="Sobre a classificação de viés">i</button></p>';
    h += '<div class="spectrum" data-dica="vies" role="img" aria-label="Distribuição: ' + cnt.E + ' de esquerda, ' + cnt.I + ' imparciais, ' + cnt.D + ' de direita">' +
      '<span style="width:' + (cnt.E / total * 100) + '%;background:var(--bias-E)"></span>' +
      '<span style="width:' + (cnt.I / total * 100) + '%;background:var(--bias-I)"></span>' +
      '<span style="width:' + (cnt.D / total * 100) + '%;background:var(--bias-D)"></span></div>';
    h += '<div class="spectrum-legend" data-dica="vies"><span>Esquerda · ' + cnt.E + '</span><span>Imparcial · ' + cnt.I + '</span><span>Direita · ' + cnt.D + '</span></div>';

    h += '<div class="seg" id="f-bias" style="margin-top:var(--space-3)">';
    h += '<button type="button" data-v="all" aria-pressed="' + (state.bias === 'all') + '" title="Exibir todos os veículos">Todos · ' + total + '</button>';
    ['E', 'I', 'D'].forEach(function (b) {
      var hasOutlets = !!cnt[b];
      var tip = hasOutlets ? ('Filtrar por ' + BIAS[b]) : ('Nenhum veículo de ' + BIAS[b] + ' cadastrado neste país');
      h += '<button type="button" data-v="' + b + '" data-b="' + b + '" aria-pressed="' + (state.bias === b) + '"' + (hasOutlets ? '' : ' disabled') + ' title="' + esc(tip) + '">' + BIAS[b] + ' · ' + cnt[b] + '</button>';
    });
    h += '</div>';
    box.innerHTML = h;
    box.querySelectorAll('#f-bias button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) return;
        state.bias = b.getAttribute('data-v');
        state.pinnedOutlet = null;
        syncFilters();
        renderOutlets();
        if (state.searchQuery) executeTopicSearch(state.searchQuery);
        if (window.innerWidth <= 768) {
          var vBox = panel.querySelector('#veiculos');
          if (vBox) {
            setTimeout(function () {
              vBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 60);
          }
        }
      });
    });
  }

  /* ---------- tooltip explicativo de viés e indicação ([data-dica]) ---------- */
  (function setupDicaViesTooltip() {
    var dicaEl = null;
    var DICA_TEXTO = 'Classificação indicativa (Esquerda, Imparcial, Direita) restrita ao tema Política, baseada na linha editorial predominante do veículo e em referências públicas (Media Bias/Fact Check, AllSides) que classificam essas mídias.';

    function ensureDicaEl() {
      if (dicaEl) return dicaEl;
      dicaEl = document.createElement('div');
      dicaEl.className = 'dica-flut';
      dicaEl.id = 'dica-vies-flut';
      dicaEl.setAttribute('role', 'tooltip');
      dicaEl.hidden = true;
      dicaEl.textContent = DICA_TEXTO;
      document.body.appendChild(dicaEl);
      return dicaEl;
    }

    function showDicaAt(target) {
      var el = ensureDicaEl();
      var customText = target.getAttribute('data-dica-text');
      var tipo = target.getAttribute('data-dica');
      if (customText) {
        el.textContent = customText;
      } else if (tipo === 'indicacao') {
        el.textContent = 'Este veículo foi uma indicação cadastrada por um usuário através da aba Cadastrar Veículo.';
      } else {
        el.textContent = DICA_TEXTO;
      }
      el.hidden = false;
      var rect = target.getBoundingClientRect();
      var tipW = Math.min(280, window.innerWidth - 24);
      var left = Math.max(12, Math.min(rect.left + rect.width / 2 - tipW / 2, window.innerWidth - tipW - 12));
      var top = rect.top - (el.offsetHeight || 76) - 8;
      if (top < 12) top = rect.bottom + 8;
      el.style.left = Math.round(left) + 'px';
      el.style.top = Math.round(top) + 'px';
    }

    function hideDica() {
      if (dicaEl) dicaEl.hidden = true;
    }

    document.addEventListener('mouseover', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-dica]') : null;
      if (t) showDicaAt(t);
    });
    document.addEventListener('mouseout', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-dica]') : null;
      if (t) hideDica();
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-dica]') : null;
      if (t) showDicaAt(t);
    });
    document.addEventListener('focusout', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-dica]') : null;
      if (t) hideDica();
    });
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.info-btn[data-dica], .badge-sug[data-dica]') : null;
      if (t) {
        e.preventDefault();
        if (dicaEl && !dicaEl.hidden) hideDica();
        else showDicaAt(t);
      } else if (dicaEl && !dicaEl.hidden) {
        hideDica();
      }
    });
    window.addEventListener('scroll', hideDica, { passive: true });
  })();

  /* ---------- tooltip explicativo de território/ilha ([data-notice]) ---------- */
  (function setupTerritoryNoticeTooltip() {
    var tipEl = null;

    function ensureTipEl() {
      if (tipEl) return tipEl;
      tipEl = document.createElement('div');
      tipEl.className = 'territory-notice-tooltip';
      tipEl.id = 'territory-notice-tooltip';
      tipEl.setAttribute('role', 'tooltip');
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
      return tipEl;
    }

    function showTipAt(target) {
      var text = target.getAttribute('data-notice');
      if (!text) return;
      var el = ensureTipEl();
      el.textContent = text;
      el.hidden = false;
      var rect = target.getBoundingClientRect();
      var tipW = Math.min(320, window.innerWidth - 24);
      var left = Math.max(12, Math.min(rect.left + rect.width / 2 - tipW / 2, window.innerWidth - tipW - 12));
      var top = rect.top - (el.offsetHeight || 64) - 8;
      if (top < 12) top = rect.bottom + 8;
      el.style.left = Math.round(left) + 'px';
      el.style.top = Math.round(top) + 'px';
    }

    function hideTip() {
      if (tipEl) tipEl.hidden = true;
    }

    document.addEventListener('mouseover', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.territory-notice-btn') : null;
      if (t) showTipAt(t);
    });
    document.addEventListener('mouseout', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.territory-notice-btn') : null;
      if (t) hideTip();
    });
    document.addEventListener('focusin', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.territory-notice-btn') : null;
      if (t) showTipAt(t);
    });
    document.addEventListener('focusout', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.territory-notice-btn') : null;
      if (t) hideTip();
    });
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.territory-notice-btn') : null;
      if (t) {
        e.preventDefault();
        if (tipEl && !tipEl.hidden) hideTip();
        else showTipAt(t);
      } else if (tipEl && !tipEl.hidden) {
        hideTip();
      }
    });
    window.addEventListener('scroll', hideTip, { passive: true });
  })();

  function syncFilters() {
    panel.querySelectorAll('#f-bias button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === state.bias)); });
    panel.querySelectorAll('#f-topic button').forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-v') || null) === state.topic)); });
  }

  var outletRotatorCache = Object.assign({}, (window.ROM_INITIAL_HEADLINES || {}));
  var outletEnrichChecked = {};
  var activeEnrichReorderToken = 0;
  var outletRotatorInterval = null;
  var sessionOutletSeed = null;

  function getOutletRotationSeed() {
    if (sessionOutletSeed === null) {
      try {
        var saved = window.sessionStorage ? window.sessionStorage.getItem('rom_outlet_rot_seed') : '';
        if (saved && /^\d+$/.test(saved)) {
          sessionOutletSeed = Number(saved);
        } else {
          sessionOutletSeed = Math.floor(Math.random() * 2147483647) + 1;
          if (window.sessionStorage) window.sessionStorage.setItem('rom_outlet_rot_seed', String(sessionOutletSeed));
        }
      } catch (e) {
        sessionOutletSeed = Math.floor(Math.random() * 2147483647) + 1;
      }
    }
    var windowBucket = Math.floor(Date.now() / (15 * 60 * 1000));
    return String(sessionOutletSeed) + ':' + String(windowBucket);
  }

  function outletRotationHash(str) {
    var h = 2166136261;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function outletRotationRank(o, cCode, seed) {
    var dom = siteScope((o && o.u) || '');
    return outletRotationHash(String(seed || '') + '|' + String(cCode || '') + '|' + dom + '|' + String((o && o.n) || ''));
  }

  function getOutletFreshnessTier(o, topicKey) {
    var dom = siteScope((o && o.u) || '');
    if (!dom) return 0;
    var tKey = topicKey || 'all';
    var key = dom + '|' + tKey;
    var cached = outletRotatorCache[key] || outletRotatorCache[dom + '|all'];
    var checked = Boolean(outletEnrichChecked[key] || outletEnrichChecked[dom + '|all']);

    if (!cached || !cached.length) {
      return checked ? 0 : 1;
    }

    var now = Date.now();
    var count6h = 0;
    var count24h = 0;
    var count72h = 0;
    for (var i = 0; i < cached.length; i++) {
      var art = cached[i];
      var ts = art && art.publicadoEm ? new Date(art.publicadoEm).getTime() : NaN;
      if (Number.isNaN(ts)) {
        count24h++;
        continue;
      }
      var ageH = Math.max(0, (now - ts) / 3600000);
      if (ageH <= 6) count6h++;
      if (ageH <= 24) count24h++;
      if (ageH <= 72) count72h++;
    }

    if (count6h >= 1 || count24h >= 2) return 2;
    if (count72h >= 1) return 1;
    return 0;
  }

  function sortOutletsForDisplay(outlets, cCode, topicKey) {
    if (!Array.isArray(outlets) || !outlets.length) return [];
    var seed = getOutletRotationSeed();
    var ranked = outlets.map(function (o) {
      var isPin = Boolean(state.pinnedOutlet && (state.pinnedOutlet === o.n || state.pinnedOutlet === o.u));
      return {
        o: o,
        pin: isPin ? 1 : 0,
        tier: getOutletFreshnessTier(o, topicKey),
        rot: outletRotationRank(o, cCode, seed)
      };
    });
    ranked.sort(function (a, b) {
      if (a.pin !== b.pin) return b.pin - a.pin;
      if (a.tier !== b.tier) return b.tier - a.tier;
      return a.rot - b.rot;
    });
    return ranked.map(function (item) { return item.o; });
  }
  var TOPIC_CONTEXT_TEMPLATES = {
    politica: [
      'Governo, parlamento e decisões políticas em {n}',
      'Bastidores, eleições e debates públicos em {n}',
      'Políticas públicas e instituições em {n}'
    ],
    economia: [
      'Mercados, inflação, emprego e negócios em {n}',
      'Indicadores econômicos, comércio e finanças em {n}',
      'Empresas, investimentos e custo de vida em {n}'
    ],
    tecnologia: [
      'Inovação, inteligência artificial e ciência em {n}',
      'Transformação digital, startups e telecom em {n}',
      'Cibersegurança, plataformas e futuro em {n}'
    ],
    cultura: [
      'Artes, cinema, literatura e música em {n}',
      'Sociedade, comportamento e patrimônio cultural em {n}',
      'Eventos culturais, esporte e entretenimento em {n}'
    ],
    mundo: [
      'Geopolítica, diplomacia e noticiário internacional em {n}',
      'Relações exteriores, acordos e conflitos globais em {n}',
      'Correspondentes e visão internacional de {n}'
    ],
    esportes: [
      'Futebol, campeonatos e resultados esportivos em {n}',
      'Bastidores dos clubes, atletas e competições em {n}',
      'Grandes torneios, ligas e cobertura esportiva em {n}'
    ],
    saude: [
      'Saúde pública, medicina e bem-estar em {n}',
      'Pesquisas biomédicas, vacinas e cuidados em {n}',
      'Políticas de saúde, hospitais e qualidade de vida em {n}'
    ]
  };

  var TOPIC_THEMES = {
    politica: {
      label: 'Política',
      gradient: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)',
      accent: '#3b82f6',
      iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2L2 7h20L12 2z"/></svg>'
    },
    economia: {
      label: 'Economia',
      gradient: 'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
      accent: '#10b981',
      iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/><path d="M14 9h5v5"/></svg>'
    },
    tecnologia: {
      label: 'Tecnologia',
      gradient: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #06b6d4 100%)',
      accent: '#8b5cf6',
      iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M9 2v2M20 15h2M20 9h2M9 20v2M15 20v2M2 9h2M2 15h2"/></svg>'
    },
    cultura: {
      label: 'Cultura',
      gradient: 'linear-gradient(135deg, #9d174d 0%, #ec4899 50%, #f59e0b 100%)',
      accent: '#ec4899',
      iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 9 10c.8 0 1.5-.7 1.5-1.5 0-.4-.1-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5.5-4.5-9.8-10-8.8z"/></svg>'
    },
    mundo: {
      label: 'Internacional',
      gradient: 'linear-gradient(135deg, #075985 0%, #0284c7 50%, #38bdf8 100%)',
      accent: '#0284c7',
      iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>'
    },
    esportes: {
      label: 'Esportes',
      gradient: 'linear-gradient(135deg, #9a3412 0%, #ea580c 50%, #f97316 100%)',
      accent: '#ea580c',
      iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>'
    },
    saude: {
      label: 'Saúde',
      gradient: 'linear-gradient(135deg, #115e59 0%, #0d9488 50%, #14b8a6 100%)',
      accent: '#0d9488',
      iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>'
    }
  };

  function inferHeadlineTopicKey(titleStr, fallbackTopic) {
    var s = norm(String(titleStr || ''));
    if (/\b(esport|futebol|gol\b|campeonat|libertador|champions|copa\b|olimp|atlet|flamengo|palmeiras|corinthians|sao paulo|real madrid|barcelona|nba|formula 1|f1\b|sport)\b/.test(s)) return 'esportes';
    if (/\b(saude|sus\b|medicin|medic|hospital|vacina|doenc|virus|cancer|anvisa|oms\b|farmac|psicolog|nutric|health|med)\b/.test(s)) return 'saude';
    if (/\b(econom|inflac|juro|dolar|mercado|pib|fiscal|impost|comercio| tar|financ|bank|market|trade|tax|budget|stock|oil|petrol)\b/.test(s)) return 'economia';
    if (/\b(tecnolog|ia\b|ai\b|inteligencia artificial|cyber|digital|software|chip|apple|google|meta|microsoft|ciencia|space|tech)\b/.test(s)) return 'tecnologia';
    if (/\b(cultur|cinema|musica|arte|teatro|livro|festival|show|serie|film|art|music)\b/.test(s)) return 'cultura';
    if (/\b(internacion|mundo|guerra|onu|otan|diplomac|fronteir|ucrania|gaza|israel|china|eua|russia|world|foreign|war|un\b|eu\b)\b/.test(s)) return 'mundo';
    if (/\b(politic|govern|presidente|congresso|senad|camara|stf|eleic|voto|ministr|partid|parlament|president|election|parliament|senate|court)\b/.test(s)) return 'politica';
    return fallbackTopic || 'politica';
  }

  function getTopicLabelByKey(tk) {
    for (var i = 0; i < TOPICS.length; i++) {
      if (TOPICS[i].k === tk) return TOPICS[i].l;
    }
    return 'Política';
  }

  function buildOutletRotatorPool(o, lang, cCode) {
    var dom = siteScope(o.u);
    var cacheKey = dom + '|' + (state.topic || 'all');
    var cachedLive = outletRotatorCache[cacheKey] || outletRotatorCache[dom + '|all'] || [];
    var pool = [];
    var seenUrls = {};

    // Ordena da última notícia (mais recente) para a mais antiga, garantindo
    // que as manchetes apareçam sempre nessa ordem em cada veículo.
    var cachedLiveSorted = cachedLive.slice().sort(function (a, b) {
      var da = a && a.publicadoEm ? new Date(a.publicadoEm).getTime() : 0;
      var db = b && b.publicadoEm ? new Date(b.publicadoEm).getTime() : 0;
      if (isNaN(da)) da = 0;
      if (isNaN(db)) db = 0;
      return db - da;
    });

    cachedLiveSorted.forEach(function (art) {
      if (!art || !art.titulo || !art.url || seenUrls[art.url]) return;
      if (state.topic && art.topicKey && art.topicKey !== state.topic && cachedLiveSorted.length >= 4) return;
      seenUrls[art.url] = 1;
      var tKey = state.topic || art.topicKey || inferHeadlineTopicKey(art.titulo, 'politica');
      pool.push({
        topicKey: tKey,
        topicLabel: getTopicLabelByKey(tKey),
        title: art.titulo,
        href: art.url,
        image: art.imagem || art.thumbnail || art.image || '',
        publishedAt: art.publicadoEm || '',
        isLive: true
      });
    });

    // Se temos matérias reais obtidas dos veículos, exibimos EXCLUSIVAMENTE matérias reais!
    if (pool.length > 0) {
      return pool;
    }

    // Se ainda não temos matérias em cache para este veículo específico:
    var tIdx = state.topic ? TOPICS.findIndex(function (t) { return t.k === state.topic; }) : 0;
    if (tIdx < 0) tIdx = 0;
    var tObj = TOPICS[tIdx];
    var linkObj = topicLink(o, lang, tObj, tIdx);
    pool.push({
      topicKey: tObj.k,
      topicLabel: tObj.l,
      title: 'Acessar cobertura de ' + tObj.l + ' em ' + o.n,
      href: linkObj.href,
      image: '',
      isLive: false,
      isLoading: false
    });

    return pool;
  }

  var rotatorTranslatedUrls = {};

  function getRotatorItemDisplay(item) {
    var orig = String((item && item.title) || '');
    var key = (item && item.href) || orig;
    var cached = orig ? translationCache['pt::' + orig] : '';
    var isTr = Boolean(key && rotatorTranslatedUrls[key] && cached);
    return {
      key: key,
      origTitle: orig,
      displayTitle: isTr ? cached : orig,
      isTranslated: isTr
    };
  }

  function renderOutletStackedListHTML(pool, offset) {
    if (!pool || !pool.length) return '';
    var count = Math.min(4, pool.length);
    var start = (offset || 0) % pool.length;
    var lines = '';
    for (var i = 0; i < count; i++) {
      var item = pool[(start + i) % pool.length];
      var trInfo = getRotatorItemDisplay(item);
      lines += '<li class="outlet-rotator-item">' +
        '<button type="button" class="outlet-rotator-tag" data-rotator-topic="' + esc(item.topicKey) + '" title="Filtrar painel pelo contexto ' + esc(item.topicLabel) + '">' + esc(item.topicLabel) + '</button>' +
        '<a class="outlet-rotator-link" href="' + esc(item.href) + '" target="_blank" rel="noopener noreferrer" title="' + esc(trInfo.displayTitle) + '">' +
          '<span class="outlet-rotator-text' + (item.isLoading ? ' is-loading-title' : '') + '">' + esc(trInfo.displayTitle) + '</span>' +
          ICON_ARROW +
        '</a>' +
        (!item.isLoading ? (
          '<button type="button" class="outlet-rotator-translate-btn is-compact' + (trInfo.isTranslated ? ' is-translated' : '') + '" data-rot-translate data-rot-key="' + esc(trInfo.key) + '" data-rot-orig="' + esc(trInfo.origTitle) + '" aria-pressed="' + trInfo.isTranslated + '" title="' + (trInfo.isTranslated ? 'Ver título original' : 'Traduzir título para português') + '" aria-label="' + (trInfo.isTranslated ? 'Ver título original' : 'Traduzir título para português') + '">' +
            ICON_TRANSLATE +
          '</button>'
        ) : '') +
      '</li>';
    }
    return lines;
  }

  function renderOutletSingleHeadlineHTML(pool, offset) {
    if (!pool || !pool.length) return '';
    var total = pool.length;
    var idx = ((offset || 0) % total + total) % total;
    var item = pool[idx];
    var trInfo = getRotatorItemDisplay(item);
    var theme = TOPIC_THEMES[item.topicKey] || TOPIC_THEMES.politica;
    var countText = item.isLoading ? '…' : ((idx + 1) + '/' + total);
    var fallbackStyle = 'background:' + theme.gradient + ';color:#ffffff;';

    var thumbHtml = '';
    if (item.image) {
      thumbHtml = '<a class="outlet-single-thumb-link" href="' + esc(item.href) + '" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true" title="' + esc(trInfo.displayTitle) + '">' +
        '<img class="outlet-single-thumb-img" src="' + esc(item.image) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';if(this.nextElementSibling)this.nextElementSibling.style.display=\'flex\';">' +
        '<div class="outlet-single-thumb-fallback" style="display:none;' + fallbackStyle + '">' +
          theme.iconSvg +
          '<span class="outlet-single-thumb-label">' + esc(theme.label) + '</span>' +
        '</div>' +
      '</a>';
    } else {
      thumbHtml = '<a class="outlet-single-thumb-link" href="' + esc(item.href) + '" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true" title="' + esc(trInfo.displayTitle) + '">' +
        '<div class="outlet-single-thumb-fallback" style="display:flex;' + fallbackStyle + '">' +
          theme.iconSvg +
          '<span class="outlet-single-thumb-label">' + esc(theme.label) + '</span>' +
        '</div>' +
      '</a>';
    }

    return '<div class="outlet-single-headline">' +
      '<div class="outlet-single-meta">' +
        '<button type="button" class="outlet-rotator-tag outlet-single-tag" data-rotator-topic="' + esc(item.topicKey) + '" title="Filtrar pelo contexto ' + esc(item.topicLabel) + '">' + esc(item.topicLabel) + '</button>' +
        '<div class="outlet-single-nav" aria-label="Navegação de manchetes">' +
          '<button type="button" class="rotator-nav-btn rotator-prev-btn" data-rot-dir="-1" title="Manchete anterior" aria-label="Manchete anterior"' + (total <= 1 || item.isLoading ? ' disabled' : '') + '>‹</button>' +
          '<span class="rotator-counter" aria-live="polite">' + countText + '</span>' +
          '<button type="button" class="rotator-nav-btn rotator-next-btn" data-rot-dir="1" title="Próxima manchete" aria-label="Próxima manchete"' + (total <= 1 || item.isLoading ? ' disabled' : '') + '>›</button>' +
        '</div>' +
      '</div>' +
      '<div class="outlet-single-content">' +
        thumbHtml +
        '<div class="outlet-single-body">' +
          '<div class="outlet-single-headline-wrap">' +
            '<a class="outlet-single-title-link" href="' + esc(item.href) + '" target="_blank" rel="noopener noreferrer" title="' + esc(trInfo.displayTitle) + '">' +
              '<span class="outlet-single-title' + (item.isLoading ? ' is-loading-title' : '') + '">' + esc(trInfo.displayTitle) + '</span>' +
              '<span class="outlet-single-arrow-wrap">' + ICON_ARROW + '</span>' +
            '</a>' +
            (!item.isLoading ? (
              '<button type="button" class="outlet-rotator-translate-btn' + (trInfo.isTranslated ? ' is-translated' : '') + '" data-rot-translate data-rot-key="' + esc(trInfo.key) + '" data-rot-orig="' + esc(trInfo.origTitle) + '" aria-pressed="' + trInfo.isTranslated + '" title="' + (trInfo.isTranslated ? 'Ver título original' : 'Traduzir título para português') + '">' +
                ICON_TRANSLATE +
                '<span>' + (trInfo.isTranslated ? 'Original' : 'Traduzir') + '</span>' +
              '</button>'
            ) : '') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderOutletRotatorContentHTML(pool, offset, isSingleTopic) {
    if (!pool || !pool.length) return '';
    if (isSingleTopic) {
      return renderOutletSingleHeadlineHTML(pool, offset);
    }
    return renderOutletStackedListHTML(pool, offset);
  }


  function syncOutletCardFavBtn(outletCardEl, oItem, cCode, pool, stepIdx) {
    if (!outletCardEl || !oItem) return;
    var starBtn = outletCardEl.querySelector('.fav-outlet-btn');
    if (!starBtn) return;
    var isSingle = Boolean(state.topic);
    if (isSingle && pool && pool.length) {
      var total = pool.length;
      var idx = ((stepIdx || 0) % total + total) % total;
      var curItem = pool[idx];
      if (curItem && curItem.isLive && curItem.href) {
        var newsFav = isNewsFavorited(curItem.href, curItem.title);
        starBtn.classList.toggle('is-fav', newsFav);
        starBtn.setAttribute('aria-pressed', String(newsFav));
        starBtn.innerHTML = newsFav ? ICON_STAR_ON : ICON_STAR_OFF;
        starBtn.title = newsFav ? 'Remover matéria dos favoritos' : 'Salvar matéria nos favoritos';
        starBtn.setAttribute('aria-label', (newsFav ? 'Remover matéria dos favoritos: ' : 'Favoritar matéria: ') + (curItem.title || oItem.n));
        starBtn.setAttribute('data-fav-mode', 'news');
        starBtn.setAttribute('data-news-url', curItem.href || '');
        starBtn.setAttribute('data-news-title', curItem.title || '');
        starBtn.setAttribute('data-news-source', oItem.n || '');
        starBtn.setAttribute('data-news-country', cCode || 'BR');
        if (!newsFav && document.activeElement === starBtn) {
          try { starBtn.blur(); } catch (err) {}
        }
        return;
      }
    }
    var outFav = isOutletFavorited(oItem.n, oItem.u);
    starBtn.classList.toggle('is-fav', outFav);
    starBtn.setAttribute('aria-pressed', String(outFav));
    starBtn.innerHTML = outFav ? ICON_STAR_ON : ICON_STAR_OFF;
    starBtn.title = outFav ? 'Remover veículo dos favoritos' : 'Salvar veículo nos favoritos';
    starBtn.setAttribute('aria-label', (outFav ? 'Remover dos favoritos: ' : 'Favoritar veículo: ') + oItem.n);
    starBtn.setAttribute('data-fav-mode', 'outlet');
    if (!outFav && document.activeElement === starBtn) {
      try { starBtn.blur(); } catch (err) {}
    }
  }

  function enrichOutletsWithLiveHeadlines(list, cCode, lang) {
    if (!list || !list.length) return;
    var tKeyCache = state.topic || 'all';
    var missing = list.filter(function (o) {
      var dom = siteScope(o.u);
      var k = dom + '|' + tKeyCache;
      return !outletRotatorCache[k] && !outletEnrichChecked[k];
    });
    if (!missing.length) return;

    var topicIdx = state.topic ? TOPICS.findIndex(function (t) { return t.k === state.topic; }) : -1;
    var termsArr = TERMS[lang] || TERMS.en;
    var queryTerm = topicIdx >= 0 ? (termsArr[topicIdx] || state.topic) : (termsArr[0] + ' OR ' + termsArr[1]);
    var topicKey = state.topic || '';
    var topicTerm = topicIdx >= 0 ? (termsArr[topicIdx] || '') : '';

    var batchSize = 12;
    var totalBatches = Math.ceil(missing.length / batchSize);
    var pendingBatches = totalBatches;
    var renderToken = ++activeEnrichReorderToken;

    function maybeReorderAfterBatches() {
      pendingBatches--;
      if (pendingBatches > 0 || renderToken !== activeEnrichReorderToken || !state.country) return;
      var box = panel.querySelector('#veiculos');
      if (!box) return;
      var curList = box._currentOutletList || [];
      if (curList.length <= 1) return;

      var isUserInteracting = false;
      box.querySelectorAll('[data-outlet-rotator-idx]').forEach(function (ul) {
        if (ul._rotPaused || ul._isTranslating) isUserInteracting = true;
      });
      if (isUserInteracting) return;

      var sorted = sortOutletsForDisplay(curList, cCode, state.topic);
      var changed = sorted.some(function (item, idx) {
        return !curList[idx] || item.n !== curList[idx].n || item.u !== curList[idx].u;
      });
      if (!changed) return;

      var prevScroll = panel.scrollTop;
      renderOutlets();
      panel.scrollTop = prevScroll;
    }

    for (var b = 0; b < missing.length; b += batchSize) {
      (function (batchOutlets) {
        var outletsParam = batchOutlets.map(function (o) {
          return { n: o.n, u: o.u, d: siteScope(o.u), b: o.b || 'I', ind: !!o.ind, st: !!o.st };
        });

        var payloadBody = JSON.stringify({
          q: queryTerm,
          cont: state.cont || '',
          country: cCode || '',
          topic: topicKey,
          topicTerm: topicTerm,
          isEnrich: true,
          periodo: 'all',
          lang: lang || 'pt',
          outlets: outletsParam
        });

        var apiEndpoint = '/api/busca-assunto';

        function processApiResponse(data) {
          batchOutlets.forEach(function (bo) {
            var bDom = siteScope(bo.u);
            if (bDom) outletEnrichChecked[bDom + '|' + tKeyCache] = Date.now();
          });
          if (!data || !Array.isArray(data.grupos)) return;
          var updated = false;
          data.grupos.forEach(function (g) {
            if (!g || !g.dominio || !Array.isArray(g.artigos) || !g.artigos.length) return;
            var key = g.dominio + '|' + tKeyCache;
            outletRotatorCache[key] = g.artigos.slice(0, 8).map(function (a) {
              return {
                titulo: a.titulo,
                url: a.url,
                imagem: a.imagem || a.thumbnail || (a.enclosure && a.enclosure.link) || a.image || '',
                publicadoEm: a.publicadoEm || '',
                topicKey: state.topic || inferHeadlineTopicKey(a.titulo, 'politica')
              };
            });
            updated = true;
          });
          if (!updated || !state.country) return;
          var box = panel.querySelector('#veiculos');
          if (!box) return;
          var curList = box._currentOutletList || list;
          box.querySelectorAll('[data-outlet-rotator-idx]').forEach(function (ul) {
            var idx = Number(ul.getAttribute('data-outlet-rotator-idx'));
            var oItem = curList[idx];
            if (!oItem) return;
            var dom = siteScope(oItem.u);
            if (!outletRotatorCache[dom + '|' + tKeyCache]) return;
            var pool = buildOutletRotatorPool(oItem, lang, cCode);
            var curStep = Number(ul.getAttribute('data-step') || '0');
            ul.innerHTML = renderOutletRotatorContentHTML(pool, curStep, !!state.topic);
            syncOutletCardFavBtn(ul.closest('.outlet'), oItem, cCode, pool, curStep);
          });
        }

        var isFile = window.location.protocol === 'file:';
        var isLocal = isFile || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        var primaryUrl = isFile ? 'https://www.rodandoomundo.com.br/api/busca-assunto' : apiEndpoint;

        fetch(primaryUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: payloadBody
        })
          .then(function (r) {
            if (!r.ok && isLocal && primaryUrl !== 'https://www.rodandoomundo.com.br/api/busca-assunto') {
              return fetch('https://www.rodandoomundo.com.br/api/busca-assunto', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: payloadBody
              }).then(function (r2) { return r2.ok ? r2.json() : null; });
            }
            return r.ok ? r.json() : null;
          })
          .then(processApiResponse)
          .catch(function () {})
          .finally(maybeReorderAfterBatches);
      })(missing.slice(b, b + batchSize));
    }
  }

  function renderOutlets() {
    var c = state.country, box = panel.querySelector('#veiculos');
    var cMed = countryMedia(c, state.cont);
    var cCode = c ? ((state.cont === 'sul' && (c.a2 === 'FR' || c.id === '250')) ? 'GF' : (c.a2 || c.id)) : '';
    var pol = state.topic === 'politica';
    var list = (cMed.outlets || []).filter(function (o) { return !pol || state.bias === 'all' || o.b === state.bias; }).slice();
    list = sortOutletsForDisplay(list, cCode, state.topic);
    if (box) {
      box._currentOutletList = list;
    }
    if (outletRotatorInterval) {
      clearInterval(outletRotatorInterval);
      outletRotatorInterval = null;
    }
    if (!list.length) {
      var biasName = (pol && state.bias && BIAS[state.bias]) ? BIAS[state.bias] : state.bias;
      box.innerHTML = '<div class="empty-state" role="status">' +
        '<p>Nenhum veículo com linha editorial de <strong>' + esc(biasName) + '</strong> cadastrado para este país.</p>' +
        '<button type="button" class="btn btn-sm btn-secondary" id="btn-reset-bias-empty" style="margin-top:var(--space-3)">Exibir todos os veículos</button>' +
      '</div>';
      var resetBtn = box.querySelector('#btn-reset-bias-empty');
      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          state.bias = 'all';
          state.pinnedOutlet = null;
          syncFilters();
          renderOutlets();
        });
      }
      return;
    }
    box.innerHTML = list.map(function (o, idx) {
      var topics = '';
      TOPICS.forEach(function (t, i) {
        if (state.topic && state.topic !== t.k) return;
        if (!state.topic) {
          topics += '<a href="#f-topic" data-select-topic="' + esc(t.k) + '" data-outlet-name="' + esc(o.n) + '" title="Filtrar por tipo de notícia: ' + esc(t.l) + '">' + esc(t.l) + '</a>';
          return;
        }
        var L = topicLink(o, cMed.lang, t, i);
        var label = 'Visitar site';
        var tipTitle = (L.direct ? 'Seção de ' + t.l + ' no site' : 'Buscar ' + t.l + ' dentro do site') + ' · Alguns sites podem exigir assinatura';
        topics += '<a class="hl" href="' + esc(L.href) + '" target="_blank" rel="noopener" title="' + esc(tipTitle) + '">' +
          label + ICON_SEARCH + '</a>';
      });
      // E2: Selo Independente
      var indBadge = (o.ind === 1 || o.ind === true)
        ? '<span class="badge badge-ind" title="Veículo com independência editorial reconhecida e sustentação financeira sem controle governamental ou corporativo direto" tabindex="0"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Independente</span>'
        : '';
      var isSug = isOutletUserSuggested(o);
      var sugTip = getOutletSuggestedTooltip(o);
      var sugBadge = isSug
        ? '<span class="badge badge-sug" data-dica="indicacao" data-dica-text="' + esc(sugTip) + '" title="' + esc(sugTip) + '" tabindex="0"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Indicação</span>'
        : '';
      var stBadge = o.st ? '<span class="badge badge-st" title="Veículo público ou estatal">Público/estatal</span>' : '';
      var biasBadge = pol ? '<span class="badge badge-bias" data-dica="vies" tabindex="0">' + BIAS[o.b] + '</span>' : '';
      var isPinned = Boolean(state.pinnedOutlet && (state.pinnedOutlet === o.n || state.pinnedOutlet === o.u));
      var oFlag = outletFlagImg(o.n, cCode, o.u);
      var outFav = isOutletFavorited(o.n, o.u);
      var rotPool = buildOutletRotatorPool(o, cMed.lang, cCode);
      var isSingle = Boolean(state.topic);
      var rotContentHtml = renderOutletRotatorContentHTML(rotPool, 0, isSingle);
      var rotContainerHtml = isSingle
        ? '<div class="outlet-rotator-single" data-outlet-rotator-idx="' + idx + '" data-step="0">' + rotContentHtml + '</div>'
        : '<ul class="outlet-rotator-list" data-outlet-rotator-idx="' + idx + '" data-step="0">' + rotContentHtml + '</ul>';

      // ROM V2.12: Paywall badge
      var isKnownPaywall = Boolean(
        o.paywall ||
        /nytimes\.com|wsj\.com|washingtonpost\.com|ft\.com|economist\.com|thetimes\.co\.uk|lefigaro\.fr|lemonde\.fr|corriere\.it|elpais\.com|clarin\.com|lanacion\.com\.ar|folha\.uol\.com\.br|estadao\.com\.br|globo\.com/i.test(o.u)
      );
      var paywallBadge = isKnownPaywall
        ? '<span class="badge-paywall" title="Veículo pode requerer assinatura paga ou ter limite de artigos gratuitos">Assinatura</span>'
        : '<span class="badge-free" title="Acesso livre ou majoritariamente gratuito">Aberto</span>';

      return '<article class="outlet' + (isPinned ? ' is-pinned' : '') + '" data-b="' + (pol ? o.b : 'N') + '" data-outlet-name="' + esc(o.n) + '" style="animation-delay:' + (idx * 30) + 'ms">' +
        '<div class="outlet-body-grid' + (isSingle ? ' is-single-topic' : '') + '">' +
          '<div class="outlet-col-left">' +
            '<div class="outlet-head"><img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host(o.u)) + '&sz=64" alt="" loading="lazy" width="24" height="24">' +
            '<a href="' + esc(o.u) + '" target="_blank" rel="noopener"><h3>' + oFlag + ' ' + esc(o.n) + '</h3><span class="domain">' + esc(host(o.u)) + '</span></a></div>' +
            '<div class="topics">' + topics + '</div>' +
          '</div>' +
          '<div class="outlet-col-rotator' + (isSingle ? ' is-single-topic' : '') + '" aria-label="Destaques e contextos de ' + esc(o.n) + '">' +
            rotContainerHtml +
          '</div>' +
          '<div class="outlet-col-badges">' +
            '<div class="badges">' + biasBadge + stBadge + indBadge + sugBadge + paywallBadge + '</div>' +
            '<button type="button" class="fav-star-btn fav-outlet-btn' + (outFav ? ' is-fav' : '') + '" data-fav-outlet-idx="' + idx + '" aria-pressed="' + outFav + '" title="' + (outFav ? 'Remover veículo dos favoritos' : 'Salvar veículo nos favoritos') + '" aria-label="' + (outFav ? 'Remover dos favoritos: ' : 'Favoritar veículo: ') + esc(o.n) + '">' + (outFav ? ICON_STAR_ON : ICON_STAR_OFF) + '</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    var ROTATOR_MS = 7000;
    var ROTATOR_TICK = 200;

    if (!box._rotatorTopicBound) {
      box._rotatorTopicBound = true;
      box.addEventListener('click', function (e) {
        var trBtn = e.target && e.target.closest ? e.target.closest('[data-rot-translate]') : null;
        if (trBtn) {
          e.preventDefault();
          e.stopPropagation();
          if (trBtn.disabled || trBtn.classList.contains('is-loading')) return;
          var rotBox = trBtn.closest('[data-outlet-rotator-idx]');
          var trKey = trBtn.getAttribute('data-rot-key') || '';
          var origTitle = trBtn.getAttribute('data-rot-orig') || '';
          if (!trKey || !origTitle) return;

          var isCompact = trBtn.classList.contains('is-compact');
          var itemEl = isCompact ? trBtn.closest('.outlet-rotator-item') : null;
          var titleSpan = isCompact
            ? (itemEl && itemEl.querySelector('.outlet-rotator-text'))
            : (rotBox && rotBox.querySelector('.outlet-single-title'));
          var titleLink = isCompact
            ? (itemEl && itemEl.querySelector('.outlet-rotator-link'))
            : (rotBox && rotBox.querySelector('.outlet-single-title-link'));

          var applyTitleState = function (displayText, translatedFlag) {
            if (titleSpan) titleSpan.textContent = displayText;
            if (titleLink) titleLink.setAttribute('title', displayText);
            trBtn.classList.toggle('is-translated', translatedFlag);
            trBtn.setAttribute('aria-pressed', String(translatedFlag));
            trBtn.setAttribute('title', translatedFlag ? 'Ver título original' : 'Traduzir título para português');
            trBtn.setAttribute('aria-label', translatedFlag ? 'Ver título original' : 'Traduzir título para português');
            if (!isCompact) {
              var lbl = trBtn.querySelector('span');
              if (lbl) lbl.textContent = translatedFlag ? 'Original' : 'Traduzir';
            }
          };

          if (rotatorTranslatedUrls[trKey]) {
            delete rotatorTranslatedUrls[trKey];
            applyTitleState(origTitle, false);
            if (rotBox) {
              rotBox._rotRemaining = ROTATOR_MS;
              rotBox._isTranslating = false;
            }
            return;
          }

          if (rotBox) {
            rotBox._isTranslating = true;
          }

          var cachedTr = translationCache['pt::' + origTitle];
          if (cachedTr) {
            rotatorTranslatedUrls[trKey] = true;
            applyTitleState(cachedTr, true);
            if (rotBox) {
              rotBox._rotRemaining = ROTATOR_MS;
              rotBox._isTranslating = false;
            }
            return;
          }

          trBtn.classList.add('is-loading');
          trBtn.disabled = true;
          if (!isCompact) {
            var lblLoading = trBtn.querySelector('span');
            if (lblLoading) lblLoading.textContent = 'Traduzindo…';
          }

          var reqToken = rotBox ? (rotBox._rotTransToken = (rotBox._rotTransToken || 0) + 1) : 1;

          translateTextsMap({ t: origTitle }, 'pt')
            .then(function (resMap) {
              var trText = (resMap && resMap.t && String(resMap.t).trim()) ? String(resMap.t).trim() : '';
              var didTranslate = Boolean(trText && trText !== origTitle);
              if (didTranslate) {
                translationCache['pt::' + origTitle] = trText;
                rotatorTranslatedUrls[trKey] = true;
              } else {
                delete translationCache['pt::' + origTitle];
                delete rotatorTranslatedUrls[trKey];
              }
              if (rotBox && rotBox._rotTransToken !== reqToken) return;
              if (document.body.contains(trBtn)) {
                applyTitleState(didTranslate ? trText : origTitle, didTranslate);
              }
            })
            .catch(function () {
              if (document.body.contains(trBtn) && (!rotBox || rotBox._rotTransToken === reqToken)) {
                applyTitleState(origTitle, false);
              }
            })
            .finally(function () {
              if (document.body.contains(trBtn)) {
                trBtn.classList.remove('is-loading');
                trBtn.disabled = false;
              }
              if (rotBox && rotBox._rotTransToken === reqToken) {
                rotBox._rotRemaining = ROTATOR_MS;
                rotBox._isTranslating = false;
              }
            });
          return;
        }

        var navBtn = e.target && e.target.closest ? e.target.closest('[data-rot-dir]') : null;
        if (navBtn) {
          e.preventDefault();
          e.stopPropagation();
          var dir = Number(navBtn.getAttribute('data-rot-dir') || '1');
          var rotatorEl = navBtn.closest('[data-outlet-rotator-idx]');
          if (!rotatorEl) return;
          var oIdx = Number(rotatorEl.getAttribute('data-outlet-rotator-idx'));
          var curList = box._currentOutletList || list;
          var oItem = curList[oIdx];
          if (!oItem) return;
          var p = buildOutletRotatorPool(oItem, cMed.lang, cCode);
          if (p.length <= 1) return;
          var cur = Number(rotatorEl.getAttribute('data-step') || '0');
          var next = ((cur + dir) % p.length + p.length) % p.length;
          rotatorEl.setAttribute('data-step', String(next));
          rotatorEl._rotTransToken = (rotatorEl._rotTransToken || 0) + 1;
          rotatorEl._isTranslating = false;
          rotatorEl._rotRemaining = ROTATOR_MS;
          rotatorEl.classList.add('is-rotating');
          setTimeout(function () {
            rotatorEl.innerHTML = renderOutletRotatorContentHTML(p, next, !!state.topic);
            rotatorEl.classList.remove('is-rotating');
            syncOutletCardFavBtn(rotatorEl.closest('.outlet'), oItem, cCode, p, next);
          }, 150);
          return;
        }

        var rotTag = e.target && e.target.closest ? e.target.closest('[data-rotator-topic]') : null;
        if (!rotTag) return;
        e.preventDefault();
        var tk = rotTag.getAttribute('data-rotator-topic') || null;
        if (!tk) return;
        var outletArticle = rotTag.closest('.outlet');
        var oName = outletArticle ? outletArticle.getAttribute('data-outlet-name') : null;
        if (oName) {
          state.pinnedOutlet = oName;
        }
        if (tk !== state.topic) {
          clearTopicSearch();
        }
        state.topic = tk;
        if (state.topic !== 'politica') state.bias = 'all';
        syncFilters();
        renderBias();
        renderOutlets();
        refreshQuickSuggestionsUI();
        renderTopicSearchResults();
        var pinnedEl = box.querySelector('.outlet.is-pinned');
        if (pinnedEl) {
          pinnedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }

    // Rotação a cada 7s por veículo. Ao passar o cursor (ou focar) a caixa, a contagem pausa
    // e, ao sair, continua do tempo restante (não reinicia do zero).
    box.querySelectorAll('[data-outlet-rotator-idx]').forEach(function (ul) {
      ul._rotRemaining = ROTATOR_MS;
      ul._rotPaused = false;
      ul._isTranslating = false;
      var hoverZone = ul.closest('.outlet-col-rotator') || ul;
      hoverZone.addEventListener('mouseenter', function () { ul._rotPaused = true; });
      hoverZone.addEventListener('mouseleave', function () { ul._rotPaused = false; });
      hoverZone.addEventListener('focusin', function () { ul._rotPaused = true; });
      hoverZone.addEventListener('focusout', function (ev) {
        if (!hoverZone.contains(ev.relatedTarget)) ul._rotPaused = false;
      });
    });

    outletRotatorInterval = setInterval(function () {
      if (!state.country || !document.body.contains(box)) {
        clearInterval(outletRotatorInterval);
        outletRotatorInterval = null;
        return;
      }
      if (document.hidden) return;
      box.querySelectorAll('[data-outlet-rotator-idx]').forEach(function (ul) {
        if (ul._rotPaused || ul._isTranslating) return;
        if (typeof ul._rotRemaining !== 'number') ul._rotRemaining = ROTATOR_MS;
        ul._rotRemaining -= ROTATOR_TICK;
        if (ul._rotRemaining > 0) return;
        ul._rotRemaining = ROTATOR_MS;
        var idx = Number(ul.getAttribute('data-outlet-rotator-idx'));
        var oItem = list[idx];
        if (!oItem) return;
        var pool = buildOutletRotatorPool(oItem, cMed.lang, cCode);
        if (pool.length <= 1) return;
        var nextStep = (Number(ul.getAttribute('data-step') || '0') + 1) % pool.length;
        ul.setAttribute('data-step', String(nextStep));
        ul.classList.add('is-rotating');
        setTimeout(function () {
          ul.innerHTML = renderOutletRotatorContentHTML(pool, nextStep, !!state.topic);
          ul.classList.remove('is-rotating');
          syncOutletCardFavBtn(ul.closest('.outlet'), oItem, cCode, pool, nextStep);
        }, 160);
      });
    }, ROTATOR_TICK);

    enrichOutletsWithLiveHeadlines(list, cCode, cMed.lang);

    box.querySelectorAll('button[data-fav-outlet-idx]').forEach(function (starBtn) {
      var idx = Number(starBtn.getAttribute('data-fav-outlet-idx'));
      var oItem = list[idx];
      var outletCardEl = starBtn.closest('.outlet');
      if (oItem && outletCardEl && state.topic) {
        var initPool = buildOutletRotatorPool(oItem, cMed.lang, cCode);
        syncOutletCardFavBtn(outletCardEl, oItem, cCode, initPool, 0);
      }
      starBtn.addEventListener('click', function () {
        var curList = box._currentOutletList || list;
        var itemObj = curList[Number(starBtn.getAttribute('data-fav-outlet-idx'))];
        if (!itemObj) return;
        var cardEl = starBtn.closest('.outlet');
        var rotEl = cardEl ? cardEl.querySelector('[data-outlet-rotator-idx]') : null;
        if (state.topic && rotEl) {
          var poolNow = buildOutletRotatorPool(itemObj, cMed.lang, cCode);
          var stepNow = Number(rotEl.getAttribute('data-step') || '0');
          var totalNow = poolNow.length;
          var curHeadline = totalNow ? poolNow[((stepNow % totalNow) + totalNow) % totalNow] : null;
          if (curHeadline && curHeadline.isLive && curHeadline.href) {
            toggleNewsFavorite({
              url: curHeadline.href,
              title: curHeadline.title,
              source: itemObj.n,
              countryCode: cCode || 'BR',
              publishedAt: ''
            });
            syncOutletCardFavBtn(cardEl, itemObj, cCode, poolNow, stepNow);
            try { starBtn.blur(); } catch (err) {}
            return;
          }
        }
        var nowFav = toggleOutletFavorite(itemObj, cCode, state.cont, countryDisplayName(c, state.cont));
        starBtn.classList.toggle('is-fav', nowFav);
        starBtn.setAttribute('aria-pressed', String(nowFav));
        starBtn.innerHTML = nowFav ? ICON_STAR_ON : ICON_STAR_OFF;
        starBtn.title = nowFav ? 'Remover veículo dos favoritos' : 'Salvar veículo nos favoritos';
        try { starBtn.blur(); } catch (err) {}
      });
    });

    box.querySelectorAll('[data-select-topic]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var tk = link.getAttribute('data-select-topic') || null;
        var oName = link.getAttribute('data-outlet-name') || null;
        state.pinnedOutlet = oName;
        if (tk !== state.topic) {
          clearTopicSearch();
        }
        state.topic = tk;
        if (state.topic !== 'politica') state.bias = 'all';
        renderCountry();
        var pinnedEl = panel.querySelector('.outlet.is-pinned');
        if (pinnedEl) {
          pinnedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          var topicGroupEl = panel.querySelector('#f-topic');
          if (topicGroupEl) {
            topicGroupEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            panel.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      });
    });
  }

  function render() {
    if (state.country) renderCountry();
    else if (state.cont) renderContinent();
    else renderWorld();
    applySheetState();
    if (typeof updateFloatingControlsVisibility === 'function') {
      updateFloatingControlsVisibility();
    }
  }

  /* ---------- navigation (Clean URLs sem # + Rota 404 + Hubs Temáticos + Entenda) ---------- */
  var notFoundView = document.getElementById('not-found-view');
  var notFoundCopy = document.getElementById('not-found-copy');
  var notFoundHome = document.getElementById('not-found-home');
  var thematicHubView = document.getElementById('thematic-hub-view');
  var editorialHomeWrap = document.getElementById('editorial-home-wrap');
  var mapWrapSection = document.getElementById('map-wrap-section');
  var quickCountryView = document.getElementById('quick-country-view');

  var romNavCount = 0;
  (function () {
    var origPush = history.pushState;
    if (origPush) {
      history.pushState = function () {
        romNavCount++;
        return origPush.apply(this, arguments);
      };
    }
    window.addEventListener('popstate', function () {
      if (romNavCount > 0) romNavCount--;
    });
  })();

  function handleSmartBack(fallbackUrl) {
    if (romNavCount > 0 || (window.history.length > 1 && document.referrer && document.referrer.indexOf(location.host) !== -1)) {
      window.history.back();
      return;
    }
    if (fallbackUrl) {
      navigateSpa(fallbackUrl);
    } else {
      go(null, null);
      fitAspect();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function openNewsletterDialog(topicName) {
    var dlg = document.getElementById('newsletter-dialog');
    var topInput = document.getElementById('newsletter-topico');
    var titleEl = document.getElementById('newsletter-dialog-title');
    var descEl = document.getElementById('newsletter-dialog-desc');
    var statusEl = document.getElementById('newsletter-status');
    var formEl = document.getElementById('newsletter-form');
    if (!dlg) return;
    if (formEl) formEl.reset();
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'bug-status'; }
    var tStr = topicName || 'Resumo do dia';
    if (topInput) topInput.value = tStr;
    if (titleEl) {
      titleEl.textContent = tStr === 'Resumo do dia'
        ? 'Receber o Resumo do dia por e-mail'
        : 'Receber atualizações: ' + tStr;
    }
    if (descEl) {
      descEl.textContent = tStr === 'Resumo do dia'
        ? 'Receba diariamente as 5 principais notícias do dia organizadas por relevância e com links diretos para as fontes.'
        : 'Receba alertas editoriais, novas matérias comparadas e atualizações da linha do tempo sobre "' + tStr + '".';
    }
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  (function setupNewsletterDialog() {
    var dlg = document.getElementById('newsletter-dialog');
    var closeX = document.getElementById('newsletter-dialog-x');
    var cancelBtn = document.getElementById('newsletter-cancel');
    var formEl = document.getElementById('newsletter-form');
    var statusEl = document.getElementById('newsletter-status');
    var submitBtn = document.getElementById('newsletter-submit');
    if (!dlg) return;
    function closeDlg() {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
    if (closeX) closeX.addEventListener('click', closeDlg);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDlg);
    if (formEl) {
      formEl.addEventListener('submit', function (e) {
        e.preventDefault();
        var emailEl = document.getElementById('newsletter-email');
        var nomeEl = document.getElementById('newsletter-nome');
        var topEl = document.getElementById('newsletter-topico');
        var emailVal = (emailEl && emailEl.value || '').trim();
        if (!emailVal || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)) {
          if (statusEl) {
            statusEl.textContent = 'Informe um endereço de e-mail válido.';
            statusEl.className = 'bug-status err';
          }
          if (emailEl) emailEl.focus();
          return;
        }
        var topicStr = (topEl && topEl.value) || 'Resumo do dia';
        var nomeVal = (nomeEl && nomeEl.value || '').trim();
        try {
          var saved = JSON.parse(localStorage.getItem('rom_newsletter_subs') || '[]');
          saved.push({ email: emailVal, nome: nomeVal, topico: topicStr, data: new Date().toISOString() });
          localStorage.setItem('rom_newsletter_subs', JSON.stringify(saved));
        } catch (err) {}
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Inscrevendo…'; }
        var saudacao = nomeVal ? 'Olá, ' + nomeVal + '!' : 'Olá!';
        var autoMsg = saudacao + '\n\n' +
          'Obrigado por se inscrever no Rodando o Mundo (' + topicStr + ').\n\n' +
          'Sua inscrição foi confirmada com sucesso! Você passará a receber nossas atualizações editoriais diretamente neste e-mail.\n\n' +
          'Para acompanhar o Resumo do Dia e a cobertura global comparada a qualquer momento, acesse:\n' +
          'https://www.rodandoomundo.com.br/resumo-do-dia\n\n' +
          'Atenciosamente,\n' +
          'Equipe Rodando o Mundo';

        var nlPayload = {
          _subject: 'Rodando o Mundo — Nova inscrição na Newsletter (' + topicStr + ')',
          _template: 'table',
          _captcha: 'false',
          _autoresponse: autoMsg,
          email: emailVal,
          Email: emailVal,
          Nome: nomeVal || 'não informado',
          Topico: topicStr,
          Rota: window.location.pathname || '/',
          Data_Hora: new Date().toLocaleString('pt-BR'),
          _replyto: emailVal
        };
        // Registra na API de newsletter do backend (Resend)
        try {
          fetch('/api/newsletter-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailVal, nome: nomeVal, topico: topicStr })
          }).catch(function () {});
        } catch (eSub) {}

        fetch('https://formsubmit.co/ajax/rodandoomundoprojeto@gmail.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(nlPayload)
        })
          .catch(function () {})
          .then(function () {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Inscrever-se'; }
            if (statusEl) {
              statusEl.textContent = 'Inscrição confirmada para "' + topicStr + '"! Você receberá as atualizações em ' + emailVal + '.';
              statusEl.className = 'bug-status ok';
            }
            setTimeout(closeDlg, 1800);
          });
      });
    }
  })();

  function navigateToPerspectiveCoverage(contKey, countryCode, topicKey, queryStr) {
    var targetCont = contKey || state.cont || 'sul';
    var targetCountry = (countryCode && byA2[String(countryCode).toUpperCase()]) || state.country || byA2['BR'];
    if (!inCont(targetCountry, targetCont)) {
      targetCont = targetCountry.c || 'sul';
    }
    var targetTopic = topicKey || state.topic || 'politica';
    state.originRoute = location.pathname;
    go(targetCont, targetCountry, { keepOrigin: true });
    state.topic = targetTopic;
    if (state.topic !== 'politica') state.bias = 'all';
    renderCountry();
    if (queryStr) {
      var inp = panel.querySelector('#topic-search-input');
      var clr = panel.querySelector('#topic-search-clear');
      if (inp) inp.value = queryStr;
      if (clr) clr.hidden = false;
      executeTopicSearch(queryStr);
    }
    var wrap = document.getElementById('map-wrap-section');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindDynamicEditorialActions(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-spa-link]').forEach(function (a) {
      if (a._spaBound) return;
      a._spaBound = true;
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var href = a.getAttribute('href');
        if (!href || href.indexOf('http') === 0) return;
        e.preventDefault();
        navigateSpa(href);
      });
    });

    rootEl.querySelectorAll('[data-coverage-query]').forEach(function (btn) {
      if (btn._covBound) return;
      btn._covBound = true;
      btn.addEventListener('click', function () {
        var q = btn.getAttribute('data-coverage-query') || '';
        var cCode = btn.getAttribute('data-coverage-country') || '';
        var cCont = btn.getAttribute('data-coverage-cont') || '';
        var cTopic = btn.getAttribute('data-coverage-topic') || '';
        if (state.hubRoute) {
          var hubInp = thematicHubView.querySelector('#hub-search-input');
          if (hubInp) {
            hubInp.value = q;
            executeHubCarouselsSearch(state.hubRoute, q, state.searchPeriod || '24h');
            var carSec = thematicHubView.querySelector('#hub-carousels-section');
            if (carSec) carSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
        }
        navigateToPerspectiveCoverage(cCont, cCode, cTopic, q);
      });
    });

    rootEl.querySelectorAll('[data-ver-noticias-assunto]').forEach(function (btn) {
      if (btn._verBound) return;
      btn._verBound = true;
      btn.addEventListener('click', function () {
        var q = btn.getAttribute('data-termo') || '';
        var cCode = btn.getAttribute('data-pais') || 'BR';
        var cCont = btn.getAttribute('data-cont') || 'sul';
        var cTopic = btn.getAttribute('data-topico') || 'politica';
        navigateToPerspectiveCoverage(cCont, cCode, cTopic, q);
      });
    });

    rootEl.querySelectorAll('[data-open-newsletter]').forEach(function (btn) {
      if (btn._nlBound) return;
      btn._nlBound = true;
      btn.addEventListener('click', function () {
        openNewsletterDialog(btn.getAttribute('data-open-newsletter') || 'Resumo do dia');
      });
    });

    bindNewsFavButtons(rootEl);
  }

  function updateRobotsMeta(isNoIndex) {
    try {
      var metaRobots = document.querySelector('meta[name="robots"]');
      if (isNoIndex) {
        if (!metaRobots) {
          metaRobots = document.createElement('meta');
          metaRobots.setAttribute('name', 'robots');
          document.head.appendChild(metaRobots);
        }
        metaRobots.setAttribute('content', 'noindex, nofollow');
      } else if (metaRobots) {
        metaRobots.setAttribute('content', 'index, follow');
      }
    } catch (e) {}
  }

  function syncMobileEditorialToggle(sectionKey) {
    var btnRadar = document.getElementById('btn-mode-radar');
    var btnModeMap = document.getElementById('btn-mode-map');
    var btnModeList = document.getElementById('btn-mode-list');
    var heroBar = document.getElementById('hero-mode-bar');
    var isMobile = (window.innerWidth <= 768);

    if (heroBar) {
      if (isMobile) {
        // No celular, a barra superior de modos (hero-mode-bar) permanece visível no mapa, no Radar e no Resumo
        var isAllowedMobile = (!sectionKey || sectionKey === 'radar' || sectionKey === 'resumo-do-dia');
        heroBar.hidden = !isAllowedMobile;
      } else {
        // No desktop, hero-mode-bar aparece apenas na Home (/), pois o desktop tem os links fixos na topbar
        heroBar.hidden = !!sectionKey;
      }
    }

    if (!btnRadar) return;
    var iconRadar = btnRadar.querySelector('.icon-mode-radar');
    var iconResumo = btnRadar.querySelector('.icon-mode-resumo');
    var labelText = document.getElementById('btn-mode-radar-text');

    if (sectionKey === 'radar') {
      if (btnModeMap) {
        btnModeMap.classList.remove('is-active');
        btnModeMap.setAttribute('aria-selected', 'false');
      }
      if (btnModeList) {
        btnModeList.classList.remove('is-active');
        btnModeList.setAttribute('aria-selected', 'false');
      }
      btnRadar.classList.add('is-active');
      btnRadar.setAttribute('aria-selected', 'true');
      if (isMobile) {
        // No celular, se o usuário já está no Radar, o botão se altera para alternar para o Resumo do Dia
        btnRadar.setAttribute('href', '/resumo-do-dia');
        btnRadar.setAttribute('title', 'Alternar para Resumo do Dia');
        btnRadar.classList.add('is-resumo-target');
        if (labelText) labelText.textContent = '⇄ Resumo';
        if (iconRadar) iconRadar.style.display = 'none';
        if (iconResumo) iconResumo.style.display = 'inline-block';
      } else {
        btnRadar.setAttribute('href', '/radar');
        btnRadar.setAttribute('title', 'Radar de Notícias e Análises em Tempo Real');
        btnRadar.classList.remove('is-resumo-target');
        if (labelText) labelText.textContent = 'Radar';
        if (iconRadar) iconRadar.style.display = 'inline-block';
        if (iconResumo) iconResumo.style.display = 'none';
      }
    } else if (sectionKey === 'resumo-do-dia') {
      if (btnModeMap) {
        btnModeMap.classList.remove('is-active');
        btnModeMap.setAttribute('aria-selected', 'false');
      }
      if (btnModeList) {
        btnModeList.classList.remove('is-active');
        btnModeList.setAttribute('aria-selected', 'false');
      }
      btnRadar.classList.add('is-active');
      btnRadar.setAttribute('aria-selected', 'true');
      if (isMobile) {
        // No celular, se o usuário já está no Resumo do Dia, o botão se altera para alternar para o Radar
        btnRadar.setAttribute('href', '/radar');
        btnRadar.setAttribute('title', 'Alternar para Radar Editorial');
        btnRadar.classList.remove('is-resumo-target');
        if (labelText) labelText.textContent = '⇄ Radar';
        if (iconRadar) iconRadar.style.display = 'inline-block';
        if (iconResumo) iconResumo.style.display = 'none';
      } else {
        btnRadar.setAttribute('href', '/radar');
        btnRadar.classList.remove('is-resumo-target');
        if (labelText) labelText.textContent = 'Radar';
        if (iconRadar) iconRadar.style.display = 'inline-block';
        if (iconResumo) iconResumo.style.display = 'none';
      }
    } else {
      // Estado padrão na Home (Mapa ou Feed ao Vivo)
      btnRadar.classList.remove('is-active');
      btnRadar.setAttribute('aria-selected', 'false');
      btnRadar.setAttribute('href', '/radar');
      btnRadar.setAttribute('title', 'Radar de Notícias e Análises em Tempo Real');
      btnRadar.classList.remove('is-resumo-target');
      if (labelText) labelText.textContent = 'Radar';
      if (iconRadar) iconRadar.style.display = 'inline-block';
      if (iconResumo) iconResumo.style.display = 'none';
    }
  }

  function syncViewModeToggleUI(mode) {
    state.viewMode = mode || 'map';
    var btnModeMap = document.getElementById('btn-mode-map');
    var btnModeList = document.getElementById('btn-mode-list');
    var stageEl = mapWrapSection ? mapWrapSection.querySelector('.stage') : null;
    if (btnModeMap) {
      btnModeMap.classList.toggle('is-active', state.viewMode === 'map');
      btnModeMap.setAttribute('aria-selected', String(state.viewMode === 'map'));
    }
    if (btnModeList) {
      btnModeList.classList.toggle('is-active', state.viewMode === 'list');
      btnModeList.setAttribute('aria-selected', String(state.viewMode === 'list'));
    }
    if (state.viewMode === 'list') {
      if (mapWrapSection) mapWrapSection.hidden = false;
      if (stageEl) stageEl.hidden = true;
      if (quickCountryView) quickCountryView.hidden = false;
    } else {
      if (mapWrapSection) mapWrapSection.hidden = false;
      if (stageEl) stageEl.hidden = false;
      if (quickCountryView) quickCountryView.hidden = true;
    }
    syncMobileEditorialToggle(state.editorialSection);
  }

  function hideSpecialViews() {
    state.notFound = false;
    state.hubRoute = null;
    state.entendaSlug = null;
    state.editorialSection = null;
    state.compareSlug = null;
    updateRobotsMeta(false);
    if (notFoundView) {
      notFoundView.hidden = true;
      notFoundView.innerHTML = '';
    }
    var compView = document.getElementById('comparison-view');
    if (compView) {
      compView.hidden = true;
      compView.innerHTML = '';
    }
    if (thematicHubView) {
      thematicHubView.hidden = true;
      thematicHubView.innerHTML = '';
    }
    var vitrineIaSec = document.getElementById('vitrine-ia');
    if (vitrineIaSec) {
      var hasTemas = (vitrineIaMemoryTemas && vitrineIaMemoryTemas.length > 0);
      vitrineIaSec.hidden = !hasTemas && vitrineIaSec.hasAttribute('data-empty-fallback');
    }
    var dossiesRotSec = document.getElementById('dossies-rotativos');
    if (dossiesRotSec) dossiesRotSec.hidden = false;
    syncViewModeToggleUI(state.viewMode || 'map');
    syncMobileEditorialToggle(null);
    if (editorialHomeWrap) {
      editorialHomeWrap.hidden = true;
      editorialHomeWrap.classList.remove('is-ultimas-mode');
    }
    var resumoSec = document.getElementById('resumo-do-dia');
    var hubsSec = document.getElementById('temas-hubs');
    var entendaSec = document.getElementById('entenda-o-assunto');
    var cadSec = document.getElementById('cadastrar-veiculo-view');
    var metSec = document.getElementById('metodologia-view');
    var compSec = document.getElementById('compliance-view');
    var parcSec = document.getElementById('parcerias-view');
    var appParcSec = document.getElementById('aplicacao-parceiros-view');
    var clubeSec = document.getElementById('clube-membros-view');
    var ultimasSec = document.getElementById('ultimas-noticias-view');
    if (resumoSec) resumoSec.hidden = false;
    if (hubsSec) hubsSec.hidden = false;
    if (entendaSec) entendaSec.hidden = false;
    if (cadSec) cadSec.hidden = true;
    if (metSec) metSec.hidden = true;
    if (compSec) compSec.hidden = true;
    if (parcSec) parcSec.hidden = true;
    if (appParcSec) appParcSec.hidden = true;
    if (clubeSec) clubeSec.hidden = true;
    if (ultimasSec) ultimasSec.hidden = true;
  }

  function setComplianceTab(tabName) {
    var tabPriv = document.getElementById('tab-legal-privacidade');
    var tabTerm = document.getElementById('tab-legal-termos');
    var panelPriv = document.getElementById('panel-legal-privacidade');
    var panelTerm = document.getElementById('panel-legal-termos');
    if (!tabPriv || !tabTerm || !panelPriv || !panelTerm) return;

    if (tabName === 'termos') {
      tabTerm.classList.add('is-active');
      tabTerm.setAttribute('aria-selected', 'true');
      tabPriv.classList.remove('is-active');
      tabPriv.setAttribute('aria-selected', 'false');
      panelTerm.removeAttribute('hidden');
      panelTerm.classList.add('is-active');
      panelPriv.setAttribute('hidden', '');
      panelPriv.classList.remove('is-active');
    } else {
      tabPriv.classList.add('is-active');
      tabPriv.setAttribute('aria-selected', 'true');
      tabTerm.classList.remove('is-active');
      tabTerm.setAttribute('aria-selected', 'false');
      panelPriv.removeAttribute('hidden');
      panelPriv.classList.add('is-active');
      panelTerm.setAttribute('hidden', '');
      panelTerm.classList.remove('is-active');
    }
  }

  function updateNavActive(path) {
    var onRadar = (path === '/radar' && state.editorialSection === 'radar');
    document.querySelectorAll('.topbar .support-link, .header-nav-link, .mobile-nav-link, .footer-legal-links a').forEach(function (l) {
      var href = l.getAttribute('href') || '';
      if (!href) return;
      var isActive = false;
      var hrefPath = href.split('#')[0] || href;
      if (path === '/' && (hrefPath === '/' || l.hasAttribute('data-home'))) isActive = true;
      else if (onRadar) {
        if (l.id === 'nav-curadoria' || l.id === 'mobile-nav-curadoria') isActive = (radarHubSubtab === 'curadoria');
        else if (l.id === 'nav-radar' || l.id === 'mobile-nav-radar') isActive = (radarHubSubtab !== 'curadoria');
        else if (hrefPath === '/radar' && l.id.indexOf('curadoria') === -1) isActive = (radarHubSubtab !== 'curadoria');
      } else if (path && (hrefPath === path || ((path === '/dossies' || path.indexOf('/dossies/') === 0) && hrefPath === '/temas'))) {
        isActive = true;
      }
      if (isActive) {
        l.classList.add('active');
        l.setAttribute('aria-current', 'page');
      } else {
        l.classList.remove('active');
        l.removeAttribute('aria-current');
      }
    });
  }

  function showEditorialSectionPage(sectionKey, opts) {
    opts = opts || {};
    state.notFound = false;
    state.hubRoute = null;
    state.entendaSlug = null;
    state.editorialSection = sectionKey;
    state.cont = null;
    state.country = null;
    if (sectionKey === 'radar') {
      var requestedTab = opts.radarTab || getRadarHubSubtabFromLocation();
      radarHubSubtab = (requestedTab === 'curadoria' || requestedTab === 'colunas') ? requestedTab : 'radar';
    }
    flushPendingAutonomousUpdates();
    hideMobileChip();
    if (panelFloatingClose) panelFloatingClose.hidden = true;
    if (notFoundView) notFoundView.hidden = true;
    if (mapWrapSection) mapWrapSection.hidden = true;
    if (quickCountryView) quickCountryView.hidden = true;
    if (sectionKey !== 'radar') {
      var vitrineIaSec = document.getElementById('vitrine-ia');
      if (vitrineIaSec) vitrineIaSec.hidden = true;
    }
    var dossiesRotSec = document.getElementById('dossies-rotativos');
    if (dossiesRotSec) dossiesRotSec.hidden = true;
    if (thematicHubView) {
      thematicHubView.hidden = true;
      thematicHubView.innerHTML = '';
    }
    if (editorialHomeWrap) {
      editorialHomeWrap.hidden = false;
      editorialHomeWrap.classList.toggle('is-ultimas-mode', sectionKey === 'ultimas-noticias');
    }

    var resumoSec = document.getElementById('resumo-do-dia');
    var hubsSec = document.getElementById('temas-hubs');
    var entendaSec = document.getElementById('entenda-o-assunto');
    var cadSec = document.getElementById('cadastrar-veiculo-view');
    var metSec = document.getElementById('metodologia-view');
    var compSec = document.getElementById('compliance-view');
    var parcSec = document.getElementById('parcerias-view');
    var appParcSec = document.getElementById('aplicacao-parceiros-view');
    var clubeSec = document.getElementById('clube-membros-view');
    var ultimasSec = document.getElementById('ultimas-noticias-view');
    var radarSec = document.getElementById('radar-editorial-view');
    if (radarSec) radarSec.hidden = sectionKey !== 'radar';
    if (resumoSec) resumoSec.hidden = sectionKey !== 'resumo-do-dia';
    if (hubsSec) hubsSec.hidden = sectionKey !== 'temas';
    if (entendaSec) entendaSec.hidden = sectionKey !== 'entenda';
    if (cadSec) cadSec.hidden = sectionKey !== 'cadastrar-veiculo';
    if (metSec) metSec.hidden = sectionKey !== 'metodologia';
    if (parcSec) parcSec.hidden = sectionKey !== 'parcerias';
    if (appParcSec) appParcSec.hidden = sectionKey !== 'aplicacao-parceiros';
    if (clubeSec) clubeSec.hidden = sectionKey !== 'clube';
    if (ultimasSec) ultimasSec.hidden = sectionKey !== 'ultimas-noticias';
    if (compSec) {
      var isComp = (sectionKey === 'privacidade' || sectionKey === 'termos');
      compSec.hidden = !isComp;
      if (isComp) setComplianceTab(sectionKey);
    }
    if (sectionKey === 'resumo-do-dia') enrichResumoDoDiaOnce();
    if (sectionKey === 'ultimas-noticias') renderUltimasNoticiasView();
    if (sectionKey === 'temas') renderTemasHubsSection();
    if (sectionKey === 'radar') renderRadarEditorialView();
    else stopRadarAutoRefresh();
    syncMobileEditorialToggle(sectionKey);

    updateRobotsMeta(sectionKey === 'aplicacao-parceiros');

    var metaMap = {
      'radar': {
        title: 'Radar & Curadoria — Inteligência e Análise em Tempo Real | Rodando o Mundo',
        desc: 'Radar editorial com briefings factuais e Curadoria em tempo real (análise de temas em alta) sobre geopolítica, política, economia e cultura.',
        path: '/radar'
      },
      'ultimas-noticias': {
        title: 'Últimas notícias do Brasil — Múltiplos Veículos e Regiões | Rodando o Mundo',
        desc: 'Acompanhe as últimas notícias do Brasil em tempo real por múltiplos veículos e macrorregiões (Norte, Nordeste, Centro-Oeste, Sudeste e Sul).',
        path: '/ultimas-noticias'
      },
      'resumo-do-dia': {
        title: 'Resumo do dia — Principais notícias e contexto | Rodando o Mundo',
        desc: 'As 5 principais notícias do dia selecionadas por relevância editorial, com resumo de contexto e acesso às matérias originais.',
        path: '/resumo-do-dia'
      },
      'temas': {
        title: 'Dossiês — Cobertura Permanente e Eventos Especiais | Rodando o Mundo',
        desc: 'Explore os dossiês permanentes e especiais do Rodando o Mundo com acompanhamento em tempo real, múltiplas perspectivas e histórico editorial.',
        path: (opts.routePath === '/dossies') ? '/dossies' : '/temas'
      },
      'entenda': {
        title: 'Entenda o assunto — Guia explicativo | Rodando o Mundo',
        desc: 'Explicações diretas e em linguagem simples sobre conceitos recorrentes na política, na economia e nas relações internacionais.',
        path: '/entenda'
      },
      'cadastrar-veiculo': {
        title: 'Cadastrar Veículo — Jornalismo Independente | Rodando o Mundo',
        desc: 'Cadastre seu jornal independente, agência ou portal de notícias no Rodando o Mundo e amplie o alcance de sua cobertura internacional.',
        path: '/cadastrar-veiculo'
      },
      'metodologia': {
        title: 'Metodologia Editorial & Transparência | Rodando o Mundo',
        desc: 'Critérios transparentes de curadoria, parâmetros internacionais de espectro político e combate a bolhas informativas no Rodando o Mundo.',
        path: '/metodologia'
      },
      'parcerias': {
        title: 'Mídia Kit & Parcerias Estratégicas B2B | Rodando o Mundo',
        desc: 'Patrocínio contextual e parcerias institucionais em um atlas jornalístico global independente, sem anúncios invasivos.',
        path: '/parcerias'
      },
      'aplicacao-parceiros': {
        title: 'Aplicação de Parceria Estratégica B2B | Rodando o Mundo',
        desc: 'Formulário exclusivo de aplicação para parcerias estratégicas e patrocínios no Rodando o Mundo.',
        path: '/aplicacao-parceiros'
      },
      'clube': {
        title: 'Clube de Membros — Apoie o Jornalismo Independente | Rodando o Mundo',
        desc: 'Faça parte do Clube de Membros do Rodando o Mundo. Ajude a manter o mapa global 100% independente, sem anúncios e receba análises e recursos exclusivos.',
        path: '/clube'
      },
      'privacidade': {
        title: 'Política de Privacidade (LGPD) | Rodando o Mundo',
        desc: 'Conheça nossa política de conformidade com a LGPD, segurança e direitos do titular de dados no Rodando o Mundo.',
        path: '/privacidade'
      },
      'termos': {
        title: 'Termos de Uso do Atlas | Rodando o Mundo',
        desc: 'Termos e diretrizes de uso, direitos autorais e isenção de responsabilidade do Rodando o Mundo.',
        path: '/termos'
      }
    };
    var meta = metaMap[sectionKey] || metaMap['resumo-do-dia'];
    updateSeoMeta(meta.title, meta.desc, meta.path);
    updateNavActive(meta.path);
    window.scrollTo({ top: 0, behavior: 'auto' });

    var targetUrl = meta.path;
    if (sectionKey === 'radar') {
      targetUrl = '/radar' + (radarHubSubtab === 'curadoria' ? '#curadoria' : '');
      applyRadarHubTabUI();
      updateNavActive('/radar');
    }

    if (!opts.fromPopState) {
      try {
        if (opts.replaceUrl) history.replaceState({ editorialSection: sectionKey, radarTab: (sectionKey === 'radar' ? radarHubSubtab : undefined) }, '', targetUrl);
        else if ((location.pathname + location.hash) !== targetUrl) history.pushState({ editorialSection: sectionKey, radarTab: (sectionKey === 'radar' ? radarHubSubtab : undefined) }, '', targetUrl);
      } catch (e) {}
    } else if (sectionKey === 'radar') {
      applyRadarHubTabUI();
      updateNavActive('/radar');
    }
  }

  function showNotFound(badPath) {
    if (!badPath || badPath === '/' || badPath === '/index.html' || badPath === '') {
      hideSpecialViews();
      setZoomedState(false);
      avisoGestoExibido = false;
      go(null, null);
      fitAspect();
      return;
    }
    state.notFound = true;
    state.hubRoute = null;
    state.entendaSlug = null;
    state.editorialSection = null;
    state.compareSlug = null;
    state.cont = null;
    state.country = null;
    hideMobileChip();
    if (panelFloatingClose) panelFloatingClose.hidden = true;
    if (mapWrapSection) mapWrapSection.hidden = true;
    if (quickCountryView) quickCountryView.hidden = true;
    if (thematicHubView) thematicHubView.hidden = true;
    var vitrineIaSec = document.getElementById('vitrine-ia');
    if (vitrineIaSec) vitrineIaSec.hidden = true;
    var dossiesRotSec = document.getElementById('dossies-rotativos');
    if (dossiesRotSec) dossiesRotSec.hidden = true;
    var compView = document.getElementById('comparison-view');
    if (compView) {
      compView.hidden = true;
      compView.innerHTML = '';
    }
    if (editorialHomeWrap) {
      editorialHomeWrap.hidden = true;
      editorialHomeWrap.classList.remove('is-ultimas-mode');
    }
    if (notFoundView) {
      notFoundView.innerHTML = '<article class="not-found-card" role="region" aria-labelledby="not-found-title">' +
        '<span class="not-found-badge">Erro 404</span>' +
        '<h1 id="not-found-title">Página não encontrada</h1>' +
        '<p id="not-found-copy">A rota "' + esc(badPath || location.pathname) + '" não foi encontrada. Verifique o endereço ou volte para explorar o mapa-múndi.</p>' +
        '<div class="not-found-actions">' +
          '<a href="/" class="btn-primary" id="not-found-home">Voltar ao mapa</a>' +
          '<a href="/resumo-do-dia" class="btn-secondary" data-spa-link>Ver resumo do dia</a>' +
        '</div>' +
      '</article>';
      notFoundView.hidden = false;
      var btnHome = notFoundView.querySelector('#not-found-home');
      if (btnHome) {
        btnHome.addEventListener('click', function (e) {
          e.preventDefault();
          hideSpecialViews();
          setZoomedState(false);
          avisoGestoExibido = false;
          go(null, null);
          fitAspect();
          try { history.pushState({}, '', '/'); } catch (err) {}
        });
      }
      var btnRes = notFoundView.querySelector('a[data-spa-link]');
      if (btnRes) {
        btnRes.addEventListener('click', function (e) {
          e.preventDefault();
          navigateSpa('/resumo-do-dia');
        });
      }
    }
    updateSeoMeta('Página não encontrada — Rodando o Mundo', DEFAULT_DESC, badPath || location.pathname);
  }

  if (notFoundHome) {
    notFoundHome.addEventListener('click', function (e) {
      e.preventDefault();
      hideSpecialViews();
      setZoomedState(false);
      avisoGestoExibido = false;
      go(null, null);
      fitAspect();
    });
  }

  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    var codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(function (c) { return 127397 + c.charCodeAt(0); });
    return String.fromCodePoint.apply(String, codePoints);
  }

  function showComparisonPage(slug, opts) {
    opts = opts || {};
    var compData = null;
    if (window.ROM_EDITORIAL && typeof window.ROM_EDITORIAL.encontrarComparacaoPorSlug === 'function') {
      compData = window.ROM_EDITORIAL.encontrarComparacaoPorSlug(slug);
    }
    if (!compData && EDITORIAL.comparacoes) {
      compData = EDITORIAL.comparacoes[slug] || EDITORIAL.comparacoes['transicao-eua-tarifas'] || Object.values(EDITORIAL.comparacoes)[0];
    }
    if (!compData) {
      showNotFound('/comparar/' + (slug || ''));
      return;
    }

    var targetIso = String(opts.paisIso || compData.paisIso || (compData.slug && compData.slug.indexOf('brasil') > -1 ? 'BR' : (compData.slug && compData.slug.indexOf('eua') > -1 ? 'US' : ''))).toUpperCase();
    var dynamicVeiculosCount = targetIso ? getVeiculosCountByPais(targetIso) : 0;
    var tituloFato = compData.tituloFato || compData.tituloNeutro || 'Comparação de Cobertura Editorial';
    var totalVeiculos = dynamicVeiculosCount || compData.totalVeiculos || compData.veiculosCount || 20;
    var paisesCobertura = compData.paisesCobertura || compData.paisesCount || 10;
    var atualizadoMin = compData.atualizadoMinutosAtras || compData.atualizadoMin || 15;

    var regLabelsMap = {
      todos: 'Todas as regiões',
      brasil: '🇧🇷 Brasil',
      eua: '🇺🇸 Estados Unidos / Américas',
      europa: '🇪🇺 Europa',
      asia: '🌏 Ásia & Oriente'
    };

    var rawPerspectivas = Array.isArray(compData.perspectivas) ? compData.perspectivas : (Array.isArray(compData.veiculosComparados) ? compData.veiculosComparados : []);
    var perspectivas = rawPerspectivas.map(function (p) {
      var code = p.codigoPais || (p.pais && p.pais.length === 2 ? p.pais : '');
      return {
        veiculo: p.veiculo || '',
        codigoPais: code,
        pais: p.nomePais || p.pais || '',
        bandeira: p.bandeira || getFlagEmoji(code),
        regiao: p.regiao || 'todos',
        perfilEditorial: p.perfilEditorial || p.perfil || 'Imprensa',
        tituloPT: p.tituloPT || '',
        tituloOriginal: p.tituloOriginal || p.tituloOrig || '',
        linguaOriginal: p.linguaOriginal || (p.idiomaOrig ? p.idiomaOrig.toUpperCase() : 'Original'),
        enfoque: p.enfoque || '',
        resumo: p.resumo || '',
        urlMateria: p.urlMateria || p.url || '#',
        destaquePrincipal: p.destaquePrincipal !== undefined ? p.destaquePrincipal : !!p.destaque
      };
    });

    var sinteseList = [];
    if (Array.isArray(compData.sinteseEnquadramento)) {
      sinteseList = compData.sinteseEnquadramento;
    } else if (compData.sinteseEnquadramento && typeof compData.sinteseEnquadramento === 'object') {
      Object.keys(compData.sinteseEnquadramento).forEach(function (rk) {
        if (rk === 'todos') return;
        sinteseList.push({
          regiao: rk,
          titulo: regLabelsMap[rk] || rk.toUpperCase(),
          texto: compData.sinteseEnquadramento[rk]
        });
      });
    }

    var regioes = Array.isArray(compData.regioes) && compData.regioes.length ? compData.regioes : (function () {
      var seen = { todos: true };
      var out = [{ id: 'todos', label: regLabelsMap.todos }];
      perspectivas.forEach(function (p) {
        if (p.regiao && !seen[p.regiao]) {
          seen[p.regiao] = true;
          out.push({ id: p.regiao, label: regLabelsMap[p.regiao] || p.regiao.toUpperCase() });
        }
      });
      return out;
    })();

    var isInlineBelowMap = !!opts.inlineBelowMap;
    state.notFound = false;
    state.hubRoute = null;
    state.entendaSlug = null;
    state.editorialSection = null;
    state.compareSlug = compData.slug;
    if (!isInlineBelowMap) {
      state.cont = null;
      state.country = null;
      hideMobileChip();
      if (panelFloatingClose) panelFloatingClose.hidden = true;
      if (notFoundView) notFoundView.hidden = true;
      if (mapWrapSection) mapWrapSection.hidden = true;
      if (quickCountryView) quickCountryView.hidden = true;
      var vitrineIaSec = document.getElementById('vitrine-ia');
      if (vitrineIaSec) vitrineIaSec.hidden = true;
    var dossiesRotSec = document.getElementById('dossies-rotativos');
    if (dossiesRotSec) dossiesRotSec.hidden = true;
      if (thematicHubView) {
        thematicHubView.hidden = true;
        thematicHubView.innerHTML = '';
      }
      if (editorialHomeWrap) {
        editorialHomeWrap.hidden = true;
        editorialHomeWrap.classList.remove('is-ultimas-mode');
      }
    } else {
      if (notFoundView) notFoundView.hidden = true;
      if (mapWrapSection) mapWrapSection.hidden = false;
    }

    var compView = document.getElementById('comparison-view');
    if (!compView) return;
    compView.hidden = false;
    compView.classList.toggle('is-inline-below-map', isInlineBelowMap);

    var spectrumGroups = targetIso ? obterManchetesAgrupadasPorEspectro(targetIso, { comparacaoSlug: compData.slug }) : [];
    var targetCountryObj = targetIso ? byA2[targetIso] : null;
    var targetCountryName = targetCountryObj ? countryDisplayName(targetCountryObj, targetCountryObj.c) : targetIso;

    var h = '<div class="comparison-container">';

    h += '<div class="comparison-nav-bar">';
    if (isInlineBelowMap) {
      h += '<button type="button" class="comparison-back-btn btn-close-inline-comparison" data-close-inline-comparison>↑ Voltar para a faixa Pulsando Agora</button>';
    } else {
      h += '<a href="/" class="comparison-back-btn" data-home data-spa-link>← Voltar ao mapa</a>';
    }
    h += '<span class="comparison-nav-sep" aria-hidden="true">/</span>';
    h += '<a href="/resumo-do-dia" class="comparison-nav-link" data-spa-link>Resumo do dia</a>';
    h += '<span class="comparison-nav-sep" aria-hidden="true">/</span>';
    h += '<span class="comparison-nav-current">' + esc(compData.categoria || 'Comparação editorial') + '</span>';
    h += '</div>';

    h += '<header class="comparison-header">';
    h += '<div class="comparison-badge-row">';
    h += '<span class="comparison-tag">' + esc(compData.categoria) + '</span>';
    h += '<span class="comparison-live-badge"><span class="comparison-live-dot" aria-hidden="true"></span> Cobertura Comparada</span>';
    h += '</div>';
    h += '<h1 class="comparison-title">' + esc(tituloFato) + '</h1>';
    h += '<div class="comparison-meta-row">';
    h += '<span class="comparison-meta-item"><strong>' + esc(totalVeiculos) + ' veículos</strong>' + (targetCountryName ? ' (' + esc(targetCountryName) + ')' : ' analisados') + '</span>';
    h += '<span class="comparison-meta-bullet" aria-hidden="true">•</span>';
    h += '<span class="comparison-meta-item"><strong>' + esc(paisesCobertura) + ' países</strong></span>';
    h += '<span class="comparison-meta-bullet" aria-hidden="true">•</span>';
    h += '<span class="comparison-meta-item">Atualizado há <strong>' + esc(atualizadoMin) + ' min</strong></span>';
    h += '</div>';
    h += '</header>';

    if (spectrumGroups.length >= 2) {
      h += '<section class="comp-spectrum-section" aria-label="Manchetes agrupadas por espectro editorial">';
      h += '<div class="comp-spectrum-head">';
      h += '<h2 class="comp-spectrum-title">Comparação Direta por Espectro Editorial' + (targetCountryName ? ' · ' + esc(targetCountryName) : '') + '</h2>';
      h += '<p class="comp-spectrum-sub">Como veículos de diferentes linhas editoriais enquadram o mesmo acontecimento agora:</p>';
      h += '</div>';
      h += '<div class="comp-spectrum-grid">';
      spectrumGroups.forEach(function (grp) {
        var specCodeLow = String(grp.codigo || 'I').toLowerCase();
        var headerLabel = grp.codigo === 'E' ? 'Esquerda' : (grp.codigo === 'D' ? 'Direita' : 'Imparcial / Centro');
        h += '<div class="comp-spectrum-col spec-col-' + esc(specCodeLow) + '">';
        h += '<div class="comp-spectrum-col-header">';
        h += '<span class="comp-spectrum-dot spec-dot-' + esc(specCodeLow) + '" aria-hidden="true"></span>';
        h += '<h3 data-dica="vies" tabindex="0">' + esc(headerLabel) + '</h3>';
        h += '<span class="comp-spectrum-count">' + grp.manchetes.length + (grp.manchetes.length === 1 ? ' fonte' : ' fontes') + '</span>';
        h += '</div>';
        h += '<ul class="comp-spectrum-list">';
        grp.manchetes.forEach(function (mItem) {
          h += '<li class="comp-spectrum-item">';
          h += '<div class="comp-spectrum-outlet-row">';
          h += '<strong class="comp-spectrum-outlet">' + esc(mItem.veiculo) + '</strong>';
          h += '<span class="comp-spectrum-pill spec-pill-' + esc(specCodeLow) + '" data-dica="vies" tabindex="0">' + esc(grp.rotulo) + '</span>';
          h += '</div>';
          var mLink = buildArticleLinkAttrs(mItem.url, mItem.titulo, mItem.veiculo, mItem.tituloOrig || mItem.titulo);
          h += '<h4 class="comp-spectrum-headline"><a href="' + esc(mLink.href) + '"' + mLink.attrs + ' target="_blank" rel="noopener noreferrer">' + esc(mItem.titulo) + '</a></h4>';
          if (mItem.enfoque) {
            h += '<p class="comp-spectrum-focus">' + esc(mItem.enfoque) + '</p>';
          }
          h += '</li>';
        });
        h += '</ul>';
        h += '</div>';
      });
      h += '</div>';
      h += '</section>';
    }

    h += '<section class="consenso-box" aria-labelledby="consenso-heading">';
    h += '<div class="consenso-header">';
    h += '<div class="consenso-title-wrap">';
    h += '<span class="consenso-icon" aria-hidden="true">📌</span>';
    h += '<h2 id="consenso-heading">O que é Consenso</h2>';
    h += '<span class="consenso-sub-badge">Fatos confirmados por todas as fontes</span>';
    h += '</div>';
    h += '<button type="button" class="consenso-toggle-btn" aria-expanded="false" aria-controls="consenso-content-body">' +
         '<span class="consenso-toggle-label">Ver fatos confirmados</span>' +
         '<span class="consenso-toggle-arrow" aria-hidden="true">▼</span>' +
         '</button>';
    h += '</div>';
    h += '<div class="consenso-body" id="consenso-content-body" hidden>';
    h += '<p class="consenso-intro">Antes de observar os diferentes enquadramentos editoriais, veja os fatos objetivos confirmados universalmente por agências internacionais e correspondentes:</p>';
    h += '<ul class="consenso-list">';
    (compData.consenso || []).forEach(function (pt) {
      h += '<li>' + esc(pt) + '</li>';
    });
    h += '</ul>';
    h += '</div>';
    h += '</section>';

    h += '<div class="comparison-sticky-bar" id="comparison-filter-bar">';
    h += '<div class="comparison-filter-wrapper">';
    h += '<span class="comparison-filter-label">Filtrar perspectiva:</span>';
    h += '<div class="comparison-filter-pills" role="tablist" aria-label="Filtro regional de cobertura">';
    regioes.forEach(function (reg, rIdx) {
      var isAct = rIdx === 0;
      h += '<button type="button" class="filter-pill-btn' + (isAct ? ' is-active' : '') + '" role="tab" aria-selected="' + String(isAct) + '" data-region-filter="' + esc(reg.id) + '">' + esc(reg.label) + '</button>';
    });
    h += '</div>';
    h += '</div>';
    h += '</div>';

    if (sinteseList.length) {
      h += '<section class="framing-synthesis" aria-labelledby="framing-title">';
      h += '<h3 id="framing-title" class="framing-heading">Síntese de Enquadramento Editorial por Região</h3>';
      h += '<div class="framing-cards-grid">';
      sinteseList.forEach(function (s) {
        h += '<div class="framing-card" data-framing-region="' + esc(s.regiao) + '">';
        h += '<div class="framing-card-top">';
        h += '<span class="framing-card-badge">' + esc(s.titulo) + '</span>';
        h += '</div>';
        h += '<p class="framing-card-text">' + esc(s.texto) + '</p>';
        h += '</div>';
      });
      h += '</div>';
      h += '</section>';
    }

    var principais = perspectivas.filter(function (p) { return p.destaquePrincipal; });
    if (!principais.length) principais = perspectivas.slice(0, 4);
    var secundarios = perspectivas.filter(function (p) { return principais.indexOf(p) === -1; });

    h += '<section class="comparison-outlets-section" aria-labelledby="perspectivas-heading">';
    h += '<div class="comparison-section-header">';
    h += '<div>';
    h += '<h2 id="perspectivas-heading" class="comparison-section-title">Comparação Direta de Manchetes</h2>';
    h += '<p class="comparison-section-sub">Observe a escolha de vocabulário, o tom e os destaques dados por cada veículo ao mesmo acontecimento.</p>';
    h += '</div>';
    h += '</div>';

    h += '<div class="comparison-carousel-mobile" aria-label="Carrossel comparativo de manchetes">';
    h += '<div class="comparison-carousel-track" id="comparison-track">';
    principais.forEach(function (p, pIdx) {
      var flagEmoji = p.bandeira || getFlagEmoji(p.codigoPais) || '🌐';
      var hasOrig = !!(p.tituloOriginal && p.tituloOriginal !== p.tituloPT);
      h += '<article class="comparison-card" data-region="' + esc(p.regiao) + '" data-card-idx="' + pIdx + '">';
      h += '<div class="comparison-card-top">';
      h += '<div class="comparison-outlet-info">';
      h += '<span class="comparison-outlet-flag" aria-hidden="true">' + flagEmoji + '</span>';
      h += '<div>';
      h += '<span class="comparison-outlet-name">' + esc(p.veiculo) + '</span>';
      h += '<span class="comparison-outlet-country">' + esc(p.pais) + '</span>';
      h += '</div>';
      h += '</div>';
      h += '<span class="comparison-profile-badge">' + esc(p.perfilEditorial) + '</span>';
      h += '</div>';

      h += '<div class="comparison-card-headline-box">';
      h += '<h3 class="comparison-headline" data-headline-pt>' + esc(p.tituloPT) + '</h3>';
      if (hasOrig) {
        h += '<h3 class="comparison-headline" data-headline-orig hidden>' + esc(p.tituloOriginal) + '</h3>';
        h += '<div class="comparison-lang-toggle-wrap">';
        h += '<button type="button" class="btn-lang-toggle is-active" data-lang-btn="pt">Português</button>';
        h += '<button type="button" class="btn-lang-toggle" data-lang-btn="orig">' + esc(p.linguaOriginal || 'Original') + '</button>';
        h += '</div>';
      }
      h += '</div>';

      h += '<div class="comparison-focus-box">';
      h += '<span class="comparison-focus-label">Enfoque:</span>';
      h += '<p class="comparison-focus-text">' + esc(p.enfoque) + '</p>';
      h += '</div>';

      if (p.resumo) {
        h += '<p class="comparison-card-summary">' + esc(p.resumo) + '</p>';
      }

      var pLink = buildArticleLinkAttrs(p.urlMateria, p.tituloPT, p.veiculo, p.tituloOriginal || p.tituloPT);
      h += '<div class="comparison-card-foot">';
      h += '<a class="comparison-outlet-link" href="' + esc(pLink.href) + '"' + pLink.attrs + ' target="_blank" rel="noopener noreferrer">' +
           (isVideoContent(p.urlMateria, p) ? 'Assistir vídeo original em ' : 'Ler matéria original em ') + esc(p.veiculo) + ' ' + ICON_ARROW + '</a>';
      h += '</div>';
      h += '</article>';
    });
    h += '</div>';

    h += '<div class="comparison-carousel-dots" id="comparison-dots" aria-hidden="true">';
    principais.forEach(function (_, dIdx) {
      h += '<span class="carousel-dot' + (dIdx === 0 ? ' is-active' : '') + '" data-dot-idx="' + dIdx + '"></span>';
    });
    h += '</div>';
    h += '</div>';

    h += '<div class="comparison-grid-desktop">';
    principais.forEach(function (p) {
      var flagEmoji = p.bandeira || getFlagEmoji(p.codigoPais) || '🌐';
      var hasOrig = !!(p.tituloOriginal && p.tituloOriginal !== p.tituloPT);
      h += '<article class="comparison-card" data-region="' + esc(p.regiao) + '">';
      h += '<div class="comparison-card-top">';
      h += '<div class="comparison-outlet-info">';
      h += '<span class="comparison-outlet-flag" aria-hidden="true">' + flagEmoji + '</span>';
      h += '<div>';
      h += '<span class="comparison-outlet-name">' + esc(p.veiculo) + '</span>';
      h += '<span class="comparison-outlet-country">' + esc(p.pais) + '</span>';
      h += '</div>';
      h += '</div>';
      h += '<span class="comparison-profile-badge">' + esc(p.perfilEditorial) + '</span>';
      h += '</div>';

      h += '<div class="comparison-card-headline-box">';
      h += '<h3 class="comparison-headline" data-headline-pt>' + esc(p.tituloPT) + '</h3>';
      if (hasOrig) {
        h += '<h3 class="comparison-headline" data-headline-orig hidden>' + esc(p.tituloOriginal) + '</h3>';
        h += '<div class="comparison-lang-toggle-wrap">';
        h += '<button type="button" class="btn-lang-toggle is-active" data-lang-btn="pt">Português</button>';
        h += '<button type="button" class="btn-lang-toggle" data-lang-btn="orig">' + esc(p.linguaOriginal || 'Original') + '</button>';
        h += '</div>';
      }
      h += '</div>';

      h += '<div class="comparison-focus-box">';
      h += '<span class="comparison-focus-label">Enfoque:</span>';
      h += '<p class="comparison-focus-text">' + esc(p.enfoque) + '</p>';
      h += '</div>';

      if (p.resumo) {
        h += '<p class="comparison-card-summary">' + esc(p.resumo) + '</p>';
      }

      var pLink = buildArticleLinkAttrs(p.urlMateria, p.tituloPT, p.veiculo, p.tituloOriginal || p.tituloPT);
      h += '<div class="comparison-card-foot">';
      h += '<a class="comparison-outlet-link" href="' + esc(pLink.href) + '"' + pLink.attrs + ' target="_blank" rel="noopener noreferrer">' +
           (isVideoContent(p.urlMateria, p) ? 'Assistir vídeo original em ' : 'Ler matéria original em ') + esc(p.veiculo) + ' ' + ICON_ARROW + '</a>';
      h += '</div>';
      h += '</article>';
    });
    h += '</div>';

    if (secundarios.length) {
      h += '<div class="comparison-secondary-wrapper">';
      h += '<h3 class="comparison-secondary-title">Outras Perspectivas Relevantes (' + secundarios.length + ' veículos adicionais)</h3>';
      h += '<ul class="comparison-secondary-list">';
      secundarios.forEach(function (s) {
        var flagEmoji = s.bandeira || getFlagEmoji(s.codigoPais) || '🌐';
        h += '<li class="comparison-secondary-item" data-region="' + esc(s.regiao) + '">';
        h += '<div class="comparison-secondary-main">';
        h += '<div class="comparison-secondary-meta">';
        h += '<span class="comparison-secondary-flag" aria-hidden="true">' + flagEmoji + '</span>';
        h += '<strong>' + esc(s.veiculo) + '</strong> (' + esc(s.pais) + ')';
        h += '<span class="comparison-secondary-badge">' + esc(s.perfilEditorial) + '</span>';
        h += '</div>';
        h += '<h4 class="comparison-secondary-headline">' + esc(s.tituloPT) + '</h4>';
        h += '<p class="comparison-secondary-focus"><strong>Enfoque:</strong> ' + esc(s.enfoque) + '</p>';
        h += '</div>';
        var sLink = buildArticleLinkAttrs(s.urlMateria, s.tituloPT, s.veiculo, s.tituloOriginal || s.tituloPT);
        h += '<a class="comparison-secondary-link" href="' + esc(sLink.href) + '"' + sLink.attrs + ' target="_blank" rel="noopener noreferrer">' + (isVideoContent(s.urlMateria, s) ? 'Assistir vídeo ' : 'Ler matéria ') + ICON_ARROW + '</a>';
        h += '</li>';
      });
      h += '</ul>';
      h += '</div>';
    }
    h += '</section>';

    if (Array.isArray(compData.guiasRelacionados) && compData.guiasRelacionados.length) {
      h += '<section class="comparison-context-section" aria-labelledby="context-heading">';
      h += '<div class="comparison-section-header">';
      h += '<div>';
      h += '<p class="editorial-eyebrow">Aprofunde seu entendimento · Glossário e Guias</p>';
      h += '<h2 id="context-heading" class="comparison-section-title">Entenda o Contexto por Trás do Fato</h2>';
      h += '<p class="comparison-section-sub">Conceitos fundamentais para interpretar as divergências de cobertura.</p>';
      h += '</div>';
      h += '</div>';
      h += '<div class="comparison-context-grid">';
      compData.guiasRelacionados.forEach(function (g) {
        var gSlug = typeof g === 'string' ? g : (g && g.slug ? g.slug : '');
        if (!gSlug) return;
        var exObj = EDITORIAL.explicacoes && EDITORIAL.explicacoes[gSlug];
        var descText = (exObj && exObj.resumoSimples) || (g && g.resumo) || 'Guia explicativo em linguagem simples sobre conceitos fundamentais.';
        var titleText = (exObj && exObj.titulo) || (g && g.titulo) || gSlug;
        var readMin = (g && g.tempoLeituraMin) || 3;
        h += '<article class="entenda-home-card comparison-context-card">';
        h += '<div class="entenda-card-meta">';
        h += '<span class="entenda-reading-time">⏱️ ' + esc(readMin) + ' min de leitura</span>';
        h += '</div>';
        h += '<h3><a href="/entenda/' + esc(gSlug) + '" data-spa-link>' + esc(titleText) + '</a></h3>';
        h += '<p class="entenda-summary-compact">' + esc(descText) + '</p>';
        h += '<div class="entenda-card-actions">';
        h += '<a class="btn btn-sm btn-primary" href="/entenda/' + esc(gSlug) + '" data-spa-link>Ler guia completo →</a>';
        h += '</div>';
        h += '</article>';
      });
      h += '</div>';
      h += '</section>';
    }

    h += '</div>';

    compView.innerHTML = h;
    var compSearchSeed = (compData.termoBusca || '').trim() || extrairTermoAssuntoBusca(tituloFato, compData.categoria) || tituloFato;
    if (perspectivas.length && perspectivas[0].tituloOriginal && inferSearchLangForCountry(targetIso || 'BR') !== 'pt') {
      var origKw = extractSearchKeywords(perspectivas[0].tituloOriginal, 3);
      if (origKw) compSearchSeed = origKw;
    }
    resolverLinksGenericosNaView(
      compView,
      compSearchSeed,
      targetIso || 'BR',
      perspectivas.map(function (p) { return { n: p.veiculo, u: p.urlMateria, pais: p.codigoPais || targetIso || 'BR' }; })
    );

    var pageTitle = tituloFato + ' — Comparação Editorial | Rodando o Mundo';
    var pageDesc = 'Compare como ' + totalVeiculos + ' veículos de ' + paisesCobertura + ' países cobrem: "' + tituloFato + '". Veja o que é consenso e as diferentes perspectivas.';
    updateSeoMeta(pageTitle, pageDesc, '/comparar/' + compData.slug);
    if (!isInlineBelowMap) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      requestAnimationFrame(function () {
        setTimeout(function () {
          if (compView && !compView.hidden) {
            compView.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 80);
      });
    }

    if (!opts.fromPopState && !isInlineBelowMap) {
      try {
        var targetUrl = '/comparar/' + compData.slug;
        if (opts.replaceUrl) history.replaceState({ compareSlug: compData.slug }, '', targetUrl);
        else if (location.pathname !== targetUrl || location.hash) history.pushState({ compareSlug: compData.slug }, '', targetUrl);
      } catch (e) {}
    }

    var closeInlineBtn = compView.querySelector('[data-close-inline-comparison]');
    if (closeInlineBtn) {
      closeInlineBtn.addEventListener('click', function () {
        compView.hidden = true;
        compView.classList.remove('is-inline-below-map');
        var pulsandoSec = document.getElementById('pulsando-agora-container') || document.getElementById('map-wrap-section');
        if (pulsandoSec) {
          pulsandoSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    var consensoToggle = compView.querySelector('.consenso-toggle-btn');
    var consensoBody = compView.querySelector('#consenso-content-body');
    if (consensoToggle && consensoBody) {
      consensoToggle.addEventListener('click', function () {
        var isOpen = consensoToggle.getAttribute('aria-expanded') === 'true';
        var nextOpen = !isOpen;
        consensoToggle.setAttribute('aria-expanded', String(nextOpen));
        consensoBody.hidden = !nextOpen;
        var lbl = consensoToggle.querySelector('.consenso-toggle-label');
        var arr = consensoToggle.querySelector('.consenso-toggle-arrow');
        if (lbl) lbl.textContent = nextOpen ? 'Ocultar fatos básicos' : 'Ver fatos confirmados';
        if (arr) arr.textContent = nextOpen ? '▲' : '▼';
      });
    }

    compView.querySelectorAll('.filter-pill-btn').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var regId = pill.getAttribute('data-region-filter') || 'todos';
        compView.querySelectorAll('.filter-pill-btn').forEach(function (p) {
          var isCur = p === pill;
          p.classList.toggle('is-active', isCur);
          p.setAttribute('aria-selected', String(isCur));
        });

        compView.querySelectorAll('.comparison-card, .comparison-secondary-item').forEach(function (card) {
          var cReg = card.getAttribute('data-region');
          if (regId === 'todos' || cReg === regId) {
            card.hidden = false;
          } else {
            card.hidden = true;
          }
        });

        compView.querySelectorAll('.framing-card').forEach(function (fc) {
          var fReg = fc.getAttribute('data-framing-region');
          if (regId === 'todos' || fReg === regId) {
            fc.style.display = '';
          } else {
            fc.style.display = 'none';
          }
        });
      });
    });

    compView.querySelectorAll('.btn-lang-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wrap = btn.closest('.comparison-card-headline-box');
        if (!wrap) return;
        var lang = btn.getAttribute('data-lang-btn');
        wrap.querySelectorAll('.btn-lang-toggle').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        var hPt = wrap.querySelector('[data-headline-pt]');
        var hOrig = wrap.querySelector('[data-headline-orig]');
        if (hPt && hOrig) {
          if (lang === 'orig') {
            hPt.hidden = true;
            hOrig.hidden = false;
          } else {
            hPt.hidden = false;
            hOrig.hidden = true;
          }
        }
      });
    });

    var track = compView.querySelector('#comparison-track');
    var dots = compView.querySelectorAll('.carousel-dot');
    if (track && dots.length) {
      var trackScrollRaf = 0;
      track.addEventListener('scroll', function () {
        if (trackScrollRaf) return;
        trackScrollRaf = requestAnimationFrame(function () {
          trackScrollRaf = 0;
          var scrollLeft = track.scrollLeft;
          var width = track.clientWidth || 300;
          var curIdx = Math.round(scrollLeft / width);
          dots.forEach(function (d, i) {
            d.classList.toggle('is-active', i === curIdx);
          });
        });
      }, { passive: true });

      dots.forEach(function (dot) {
        dot.addEventListener('click', function () {
          var dIdx = parseInt(dot.getAttribute('data-dot-idx'), 10) || 0;
          var cards = track.querySelectorAll('.comparison-card');
          if (cards[dIdx]) {
            cards[dIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
          }
        });
      });
    }

    bindDynamicEditorialActions(compView);
  }

  function buildFallbackHubGroups(hub, queryStr) {
    var cObj = byA2[hub.pais] || byA2['BR'];
    var cMed = cObj ? countryMedia(cObj, hub.continente) : null;
    var rawOutlets = (cMed && cMed.outlets) ? cMed.outlets.slice(0, 6) : [];
    var noticias = Array.isArray(hub.ultimasNoticias) ? hub.ultimasNoticias : [];
    var groups = [];
    var usedSources = {};

    noticias.forEach(function (n, idx) {
      var matchedOut = rawOutlets.find(function (o) { return o.n.toLowerCase() === n.fonte.toLowerCase(); }) || rawOutlets[idx % Math.max(1, rawOutlets.length)] || { n: n.fonte, u: n.url, b: n.vies || 'I' };
      var key = n.fonte;
      if (!usedSources[key]) {
        usedSources[key] = {
          veiculo: n.fonte,
          dominio: siteScope(matchedOut.u || n.url),
          urlVeiculo: matchedOut.u || n.url,
          vies: n.vies || matchedOut.b || 'I',
          artigos: []
        };
        groups.push(usedSources[key]);
      }
      usedSources[key].artigos.push({
        titulo: n.titulo,
        resumo: n.resumo,
        imagem: '',
        url: n.url,
        veiculo: n.fonte,
        publicadoEm: n.data + 'T12:00:00Z'
      });
    });

    var tl = EDITORIAL.linhasDoTempo[hub.linhaDoTempoId];
    if (tl && Array.isArray(tl.eventos)) {
      tl.eventos.forEach(function (ev) {
        var key = ev.fonte;
        if (!usedSources[key]) {
          usedSources[key] = {
            veiculo: ev.fonte,
            dominio: host(ev.urlMateria),
            urlVeiculo: ev.urlMateria,
            vies: 'I',
            artigos: []
          };
          groups.push(usedSources[key]);
        }
        usedSources[key].artigos.push({
          titulo: ev.tituloMateria || ev.titulo,
          resumo: ev.resumo,
          imagem: '',
          url: ev.urlMateria,
          veiculo: ev.fonte,
          publicadoEm: (ev.dataISO || '2026-04-10') + 'T10:00:00Z'
        });
      });
    }
    return groups;
  }

  function renderHubCarouselsBox(hub, queryStr, periodo, grupos, isLoading) {
    var box = thematicHubView ? thematicHubView.querySelector('#hub-carousels-results') : null;
    if (!box) return;
    var perLabelMap = { '24h': 'Últimas 24 horas', '7d': 'Últimos 7 dias' };
    var perLabel = perLabelMap[periodo] || 'Últimas 24 horas';

    var banner =
      '<div class="perspective-dynamic-banner">' +
        '<h3 class="perspective-dynamic-title">' + esc(queryStr) + ': como os veículos estão cobrindo</h3>' +
        '<p class="perspective-dynamic-subtitle">Compare as últimas notícias e as diferentes perspectivas sobre o assunto.</p>' +
        '<p class="perspective-dynamic-meta">Página temática: <strong>' + esc(hub.titulo) + '</strong> · Período: <strong>' + esc(perLabel) + '</strong></p>' +
      '</div>';

    if (isLoading) {
      box.innerHTML = banner +
        '<div class="topic-search-status loading" role="status">' +
          '<span class="topic-search-spinner" aria-hidden="true"></span>' +
          '<p>Buscando matérias sobre <strong>“' + esc(queryStr) + '”</strong> nos veículos cadastrados…</p>' +
        '</div>';
      return;
    }

    if (!grupos || !grupos.length) {
      box.innerHTML = banner +
        '<div class="topic-search-status empty" role="status">' +
          '<p class="topic-search-empty-title">Nenhum resultado encontrado</p>' +
          '<p class="topic-search-empty-sub">Não encontramos matérias para <strong>“' + esc(queryStr) + '”</strong> no período selecionado.</p>' +
        '</div>';
      return;
    }

    var h = banner;
    h += '<div class="topic-search-header">';
    h += '<p class="topic-search-summary">Exibindo perspectivas sobre <strong>“' + esc(queryStr) + '”</strong> (' + grupos.length + (grupos.length === 1 ? ' veículo' : ' veículos') + ')</p>';
    h += '<button type="button" class="topic-translate-all-btn" data-translate-all aria-pressed="false" title="Traduzir todos os títulos e resumos para português">' + ICON_TRANSLATE + ' <span>Traduzir todas</span></button>';
    h += '</div>';
    h += '<div class="topic-carousels hub-carousels-grid">';
    grupos.forEach(function (g, gIdx) {
      var trackId = 'hub-carousel-track-' + gIdx;
      var biasBadge = (g.vies && BIAS[g.vies]) ? '<span class="badge badge-bias">' + esc(BIAS[g.vies]) + '</span>' : '';
      var gSug = isOutletUserSuggested({ n: g.veiculo, u: g.urlVeiculo });
      var sugBadge = gSug ? '<span class="badge badge-sug" data-dica="indicacao" title="Veículo indicado por usuário na aba Cadastrar Veículo"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg> Indicação</span>' : '';
      var favDomain = g.dominio || host(g.urlVeiculo || '');
      var gFlag = outletFlagImg(g.veiculo, g.pais || hub.pais, favDomain);
      h += '<section class="outlet-carousel" aria-label="Matérias de ' + esc(g.veiculo) + '">';
      h += '<div class="outlet-carousel-head">';
      h += '<div class="outlet-carousel-title">';
      h += '<img src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(favDomain) + '&sz=64" alt="" loading="lazy" width="20" height="20">';
      h += '<h4>' + gFlag + ' ' + esc(g.veiculo) + '</h4>';
      h += biasBadge + sugBadge;
      h += '<span class="outlet-carousel-count">' + g.artigos.length + (g.artigos.length === 1 ? ' matéria' : ' matérias') + '</span>';
      h += '</div>';
      h += '<div class="outlet-carousel-nav">';
      h += '<button type="button" class="carousel-btn" data-target="' + trackId + '" data-dir="-1" aria-label="Anterior">‹</button>';
      h += '<button type="button" class="carousel-btn" data-target="' + trackId + '" data-dir="1" aria-label="Próximo">›</button>';
      h += '</div>';
      h += '</div>';
      h += '<div class="outlet-carousel-track" id="' + trackId + '">';
      g.artigos.forEach(function (art) {
        var dtFormatted = formatSearchDate(art.publicadoEm);
        var validHubImgUrl = isValidNewsImageUrl(art.imagem || art.image || art.thumbnail || '');
        var artSource = art.veiculo || g.veiculo;
        var artFlag = outletFlagImg(artSource, art.pais || g.pais || hub.pais, favDomain);
        h += '<article class="topic-news-card">';
        if (validHubImgUrl) {
          h += '<a class="topic-news-card-media" href="' + esc(art.url) + '" target="_blank" rel="noopener noreferrer" tabindex="-1">';
          h += '<img src="' + esc(validHubImgUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="var m=this.closest(\'.topic-news-card-media\');if(m)m.remove();" onload="if(this.naturalWidth<=2){var m=this.closest(\'.topic-news-card-media\');if(m)m.remove();}">';
          h += '</a>';
        }
        h += '<div class="topic-news-card-body">';
        h += '<div class="topic-news-meta">';
        h += '<span class="topic-news-source">' + artFlag + ' ' + esc(artSource) + '</span>';
        if (dtFormatted) {
          h += '<span class="topic-news-sep" aria-hidden="true">·</span>';
          h += '<time class="topic-news-date" datetime="' + esc(art.publicadoEm) + '">' + esc(dtFormatted) + '</time>';
        }
        h += '</div>';
        h += '<h5 class="topic-news-title"><a href="' + esc(art.url) + '" target="_blank" rel="noopener noreferrer" data-orig-text="' + esc(art.titulo) + '">' + esc(art.titulo) + '</a></h5>';
        if (art.resumo) h += '<p class="topic-news-desc" data-orig-text="' + esc(art.resumo) + '">' + esc(art.resumo) + '</p>';
        h += '<div class="topic-news-card-footer">';
        h += '<a class="topic-news-open" href="' + esc(art.url) + '" target="_blank" rel="noopener noreferrer" title="' + (isVideoContent(art.url, art) ? 'Assistir vídeo no canal original' : 'Abrir matéria no site original (alguns sites podem exigir assinatura)') + '">' + (isVideoContent(art.url, art) ? 'Assistir vídeo ' : 'Abrir matéria ') + ICON_ARROW + '</a>';
        h += '<div class="topic-news-card-actions">' +
          '<button type="button" class="topic-news-translate-btn" data-translate-card aria-pressed="false" title="Traduzir notícia para português">' + ICON_TRANSLATE + ' <span>Traduzir</span></button>' +
          renderNewsFavBtn({ url: art.url, title: art.titulo, source: artSource, countryCode: art.pais || g.pais || hub.pais, publishedAt: art.publicadoEm }) +
          '</div>';
        h += '</div>';
        h += '</div>';
        h += '</article>';
      });
      h += '</div>';
      h += '</section>';
    });
    h += '</div>';
    box.innerHTML = h;

    box.querySelectorAll('.carousel-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = document.getElementById(btn.getAttribute('data-target'));
        if (!tr) return;
        var dir = Number(btn.getAttribute('data-dir')) || 1;
        tr.scrollBy({ left: dir * Math.max(240, Math.round(tr.clientWidth * 0.8)), behavior: 'smooth' });
      });
    });
    bindCardTranslations(box);
    bindNewsFavButtons(box);
  }

  function executeHubCarouselsSearch(hubRoute, queryStr, periodo) {
    var hub = EDITORIAL.paginasTematicas[hubRoute];
    if (!hub) return;
    var q = String(queryStr || hub.termoBuscaPadrao || hub.titulo).trim();
    var per = periodo || '24h';
    var cObj = byA2[hub.pais] || byA2['BR'];
    var cMed = cObj ? countryMedia(cObj, hub.continente) : null;
    var outlets = (cMed && cMed.outlets) ? cMed.outlets.map(function (o) {
      return { n: o.n, u: o.u, d: siteScope(o.u), b: o.b || 'I', ind: !!o.ind, st: !!o.st };
    }) : [];
    var lang = (cMed && cMed.lang) || 'pt';

    var isDefaultQuery = norm(q) === norm(hub.termoBuscaPadrao || '');
    var fallbackGroups = isDefaultQuery ? buildFallbackHubGroups(hub, q) : [];

    if (fallbackGroups.length && isDefaultQuery) {
      renderHubCarouselsBox(hub, q, per, fallbackGroups, false);
    } else {
      renderHubCarouselsBox(hub, q, per, [], true);
    }

    function renderHubLatestGridItems(items) {
      if (!thematicHubView) return;
      var latestGrid = thematicHubView.querySelector('.hub-latest-grid');
      if (!latestGrid || !Array.isArray(items) || !items.length) return;
      latestGrid.innerHTML = items.slice(0, 6).map(function (n) {
        var dtIso = n.publicadoEm || (n.data ? n.data + 'T12:00:00Z' : '');
        var biasLabel = (n.vies && BIAS[n.vies]) ? '<span class="badge badge-bias">' + esc(BIAS[n.vies]) + '</span>' : '';
        var dtStr = dtIso ? (formatSearchDate(dtIso) || '') : '';
        var srcFlag = outletFlagImg(n.fonte, hub.pais, n.url);
        var nLink = buildArticleLinkAttrs(n.url, n.titulo, n.fonte);
        return '<article class="hub-news-card">' +
          '<div class="hub-news-meta">' +
          '<span class="hub-news-source">' + srcFlag + ' ' + esc(n.fonte) + '</span>' +
          biasLabel +
          (dtStr ? '<time datetime="' + esc(dtIso) + '">' + esc(dtStr) + '</time>' : '') +
          renderNewsFavBtn({ url: nLink.href, title: n.titulo, source: n.fonte, countryCode: hub.pais, publishedAt: dtIso }) +
          '</div>' +
          '<h3><a href="' + esc(nLink.href) + '"' + nLink.attrs + ' target="_blank" rel="noopener noreferrer">' + esc(n.titulo) + '</a></h3>' +
          (n.resumo ? '<p>' + esc(n.resumo) + '</p>' : '') +
          '<a class="topic-news-open" href="' + esc(nLink.href) + '"' + nLink.attrs + ' target="_blank" rel="noopener noreferrer">' + (isVideoContent(n.url, n) ? 'Assistir vídeo ' : 'Abrir matéria ') + ICON_ARROW + '</a>' +
          '</article>';
      }).join('');
      bindNewsFavButtons(latestGrid);
    }

    function applyHubLiveNews(grupos) {
      if (!grupos || !grupos.length) return;
      renderHubCarouselsBox(hub, q, per, grupos, false);
      if (isDefaultQuery && thematicHubView) {
        var allArts = [];
        grupos.forEach(function (g) {
          if (!g || !Array.isArray(g.artigos)) return;
          g.artigos.forEach(function (art) {
            if (!art || !art.titulo || !art.url) return;
            var ts = art.publicadoEm ? Date.parse(art.publicadoEm) : 0;
            allArts.push({
              titulo: art.titulo,
              resumo: art.resumo || '',
              url: art.url,
              fonte: g.veiculo,
              vies: g.vies,
              publicadoEm: art.publicadoEm || '',
              _ts: isNaN(ts) ? 0 : ts
            });
          });
        });
        // Ordenar do mais recente para o mais antigo para evitar cards "parados no tempo"
        allArts.sort(function (a, b) { return b._ts - a._ts; });
        var seenTitles = {};
        var seenOutlets = {};
        var diverseCards = [];
        var extraCards = [];
        allArts.forEach(function (item) {
          var tKey = norm(item.titulo);
          if (!tKey || seenTitles[tKey]) return;
          seenTitles[tKey] = true;
          if (!seenOutlets[item.fonte]) {
            seenOutlets[item.fonte] = true;
            diverseCards.push(item);
          } else {
            extraCards.push(item);
          }
        });
        var liveCards = diverseCards.concat(extraCards).slice(0, 6);
        liveCards.sort(function (a, b) { return b._ts - a._ts; });
        if (liveCards.length) {
          renderHubLatestGridItems(liveCards);
        } else if (Array.isArray(hub.ultimasNoticias) && hub.ultimasNoticias.length) {
          renderHubLatestGridItems(hub.ultimasNoticias);
        }
      }
    }

    function runHubRssFallback() {
      var mkt = lang === 'pt' ? 'pt-BR' : 'en-US';
      var proms = outlets.slice(0, 6).map(function (veic) {
        var rssUrl = 'https://www.bing.com/news/search?q=' + encodeURIComponent(qEfetivoHub + ' site:' + veic.d) + '&format=rss&mkt=' + mkt;
        return fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl))
          .then(function (r2) { return r2.ok ? r2.json() : null; })
          .then(function (j) {
            var items = (j && Array.isArray(j.items)) ? j.items : [];
            var arts = items.slice(0, 6).map(function (it) {
              var cleanDesc = String(it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              if (cleanDesc.length > 150) cleanDesc = cleanDesc.slice(0, 149).trim() + '…';
              var dt = it.pubDate ? new Date(String(it.pubDate).replace(' ', 'T') + 'Z') : null;
              return {
                titulo: String(it.title || '').trim(),
                resumo: cleanDesc,
                imagem: it.thumbnail || (it.enclosure && it.enclosure.link) || '',
                url: extractRealLink(it.link || ''),
                veiculo: veic.n,
                publicadoEm: (dt && !isNaN(dt.getTime())) ? dt.toISOString() : ''
              };
            }).filter(function (a) { return a.titulo && a.url; });
            return arts.length ? {
              veiculo: veic.n,
              dominio: veic.d,
              urlVeiculo: veic.u,
              vies: veic.b,
              artigos: arts
            } : null;
          })
          .catch(function () { return null; });
      });
      Promise.all(proms).then(function (resList) {
        if (state.hubRoute !== hubRoute) return;
        var liveGroups = resList.filter(Boolean);
        if (liveGroups.length) {
          applyHubLiveNews(liveGroups);
        } else {
          if (isDefaultQuery && Array.isArray(hub.ultimasNoticias) && hub.ultimasNoticias.length) {
            renderHubLatestGridItems(hub.ultimasNoticias);
          }
          if (!isDefaultQuery) {
            renderHubCarouselsBox(hub, q, per, [], false);
          }
        }
      });
    }

    var qCorrigidoHub = corrigirTermoBusca(q);
    var qEfetivoHub = (qCorrigidoHub && norm(qCorrigidoHub) !== norm(q)) ? qCorrigidoHub : q;
    var hubPayload = {
      q: qEfetivoHub,
      cont: hub.continente || '',
      country: hub.pais || '',
      topic: hub.tipoNoticia || '',
      periodo: per,
      lang: lang,
      outlets: outlets
    };
    var doHubFetch = function (url) {
      return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + '_t=' + Date.now(), {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(hubPayload)
      });
    };
    doHubFetch('/api/busca-assunto')
      .then(function (r) {
        if (!r.ok && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          return doHubFetch('https://www.rodandoomundo.com.br/api/busca-assunto');
        }
        return r;
      })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (data) {
        if (state.hubRoute !== hubRoute) return;
        if (data && Array.isArray(data.grupos) && data.grupos.length > 0) {
          if (data.periodo && data.periodo !== per) {
            per = data.periodo;
            state.searchPeriod = per;
            if (thematicHubView) {
              thematicHubView.querySelectorAll('#hub-period-filters .period-btn').forEach(function (btn) {
                btn.setAttribute('aria-pressed', String(btn.getAttribute('data-period') === per));
              });
            }
          }
          applyHubLiveNews(data.grupos);
        } else {
          runHubRssFallback();
        }
      })
      .catch(function () {
        if (state.hubRoute !== hubRoute) return;
        runHubRssFallback();
      });
  }

  function showThematicHub(hubRoute, opts) {
    opts = opts || {};
    var hub = EDITORIAL.paginasTematicas[hubRoute];
    if (!hub) {
      showNotFound(hubRoute);
      return;
    }
    state.notFound = false;
    state.hubRoute = hubRoute;
    state.entendaSlug = null;
    state.editorialSection = null;
    state.cont = null;
    state.country = null;
    hideMobileChip();
    if (panelFloatingClose) panelFloatingClose.hidden = true;
    if (notFoundView) notFoundView.hidden = true;
    if (mapWrapSection) mapWrapSection.hidden = true;
    if (quickCountryView) quickCountryView.hidden = true;
    var vitrineIaSec = document.getElementById('vitrine-ia');
    if (vitrineIaSec) vitrineIaSec.hidden = true;
    var dossiesRotSec = document.getElementById('dossies-rotativos');
    if (dossiesRotSec) dossiesRotSec.hidden = true;
    if (editorialHomeWrap) {
      editorialHomeWrap.hidden = true;
      editorialHomeWrap.classList.remove('is-ultimas-mode');
    }
    if (thematicHubView) thematicHubView.hidden = false;

    updateSeoMeta(hub.seoTitle, hub.seoDescription, hub.rota);

    var cObj = byA2[hub.pais] || byA2['BR'];
    var cName = cObj ? countryDisplayName(cObj, hub.continente) : hub.pais;
    var tl = EDITORIAL.linhasDoTempo[hub.linhaDoTempoId];
    var periods = [
      { k: '24h', l: 'Últimas 24 horas' },
      { k: '7d',  l: 'Últimos 7 dias' }
    ];

    var h = '<div class="hub-container">';
    h += '<div class="hub-nav-header-row">';
    h += '<button type="button" class="btn-back-topic" data-action="go-back" data-fallback="/temas" aria-label="Voltar para onde estava" title="Voltar para onde estava">';
    h += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
    h += '<span>Voltar</span>';
    h += '</button>';
    h += '<nav class="hub-breadcrumbs" aria-label="Navegação estrutural">';
    h += '<a href="/" data-spa-link>Início</a> <span aria-hidden="true">/</span> ';
    h += '<a href="/temas" data-spa-link>Páginas temáticas</a> <span aria-hidden="true">/</span> ';
    h += '<span>' + esc(hub.titulo) + '</span>';
    h += '</nav>';
    h += '</div>';

    h += '<header class="hub-hero">';
    h += '<div class="hub-hero-badges">';
    h += '<span class="editorial-eyebrow">Página temática permanente</span>';
    h += '<span class="hub-country-pill">' + (cObj ? countryFlag(cObj, 'flag-sm', hub.continente) : '') + ' ' + esc(cName) + '</span>';
    h += '</div>';
    h += '<h1 class="hub-title" id="hub-main-title">' + esc(hub.titulo) + '</h1>';
    h += '<p class="hub-subtitle">' + esc(hub.subtitulo) + '</p>';
    h += '<div class="hub-hero-actions">';
    h += '<a class="btn btn-secondary" href="/' + esc(CONT_SLUGS[hub.continente] || 'Sul') + '/' + esc(hub.pais) + '" data-spa-link>Ver país no mapa interativo</a>';
    h += '</div>';
    h += '</header>';

    // Resumo editorial curto explicando o contexto
    h += '<section class="hub-block hub-context-block" aria-labelledby="hub-context-heading">';
    h += '<h2 id="hub-context-heading">Contexto editorial</h2>';
    (hub.resumoEditorial || []).forEach(function (par) {
      h += '<p>' + esc(par) + '</p>';
    });
    h += '</section>';

    // Últimas notícias relacionadas (preenchidas em tempo real por executeHubCarouselsSearch)
    h += '<section class="hub-block hub-news-block" aria-labelledby="hub-latest-heading">';
    h += '<div class="hub-block-head">';
    h += '<h2 id="hub-latest-heading">Últimas notícias relacionadas</h2>';
    h += '<p>Destaques recentes verificados com acesso direto aos veículos originais.</p>';
    h += '</div>';
    h += '<div class="hub-latest-grid">';
    h += '<div class="hub-loading-inline" aria-live="polite">Buscando notícias mais recentes em tempo real…</div>';
    h += '</div>';
    h += '</section>';

    // Carrosséis por veículo + Comparar perspectivas dentro da página temática
    h += '<section class="hub-block hub-carousels-block" id="hub-carousels-section" aria-labelledby="hub-carousels-heading">';
    h += '<div class="hub-block-head">';
    h += '<h2 id="hub-carousels-heading">Comparar perspectivas por veículo</h2>';
    h += '<p>Compare como cada veículo cobre este tema ou pesquise um recorte específico.</p>';
    h += '</div>';
    h += '<form class="topic-search-form hub-search-form" id="hub-search-form" role="search" novalidate>';
    h += '<div class="topic-search-input-wrap">';
    h += '<button type="submit" class="topic-search-icon-btn" aria-label="Buscar" title="Buscar"><svg class="topic-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg></button>';
    h += '<input type="search" id="hub-search-input" class="topic-search-input" placeholder="Procurar algo específico" aria-label="Procurar algo específico" value="' + esc(hub.termoBuscaPadrao || '') + '">';
    h += '</div>';
    h += '<button type="submit" class="btn topic-search-btn">Buscar</button>';
    h += '</form>';
    h += '<div class="perspective-period-filters" id="hub-period-filters" role="group" aria-label="Filtrar por período" hidden>';
    periods.forEach(function (p) {
      h += '<button type="button" class="period-btn" data-period="' + p.k + '" aria-pressed="' + (state.searchPeriod === p.k) + '">' + p.l + '</button>';
    });
    h += '</div>';
    h += '<div id="hub-carousels-results" aria-live="polite"></div>';
    h += '</section>';

    // Linha do tempo, quando aplicável
    if (tl) {
      h += '<section class="hub-block hub-timeline-section" aria-label="Linha do tempo do assunto">';
      h += renderTimelineHTML(tl, 'hub-tl');
      h += '</section>';
    }

    // Links para explicações relacionadas ("Entenda o assunto")
    if (Array.isArray(hub.explicacoesRelacionadas) && hub.explicacoesRelacionadas.length) {
      h += '<section class="hub-block hub-explanations-block" aria-labelledby="hub-entenda-heading">';
      h += '<div class="hub-block-head">';
      h += '<h2 id="hub-entenda-heading">Entenda o assunto</h2>';
      h += '<p>Explicações em linguagem simples para compreender os conceitos-chave deste tema.</p>';
      h += '</div>';
      h += '<div class="hub-entenda-grid">';
      hub.explicacoesRelacionadas.forEach(function (slug) {
        var ex = EDITORIAL.explicacoes[slug];
        if (!ex) return;
        h += '<article class="hub-entenda-card">';
        h += '<span class="editorial-eyebrow">Guia explicativo</span>';
        h += '<h3><a href="/entenda/' + esc(ex.slug) + '" data-spa-link>' + esc(ex.titulo) + '</a></h3>';
        h += '<p>' + esc(ex.resumoSimples) + '</p>';
        h += '<div class="hub-entenda-actions">';
        h += '<a class="btn btn-sm btn-secondary" href="/entenda/' + esc(ex.slug) + '" data-spa-link>Ler explicação completa</a>';
        h += '<button type="button" class="btn btn-sm btn-outline" data-ver-noticias-assunto data-termo="' + esc(ex.termoBusca) + '" data-pais="' + esc(ex.pais) + '" data-cont="' + esc(ex.continente) + '" data-topico="' + esc(ex.tipoNoticia) + '">Ver últimas notícias sobre este assunto</button>';
        h += '</div>';
        h += '</article>';
      });
      h += '</div>';
      h += '</section>';
    }

    // Perguntas frequentes (FAQ)
    if (Array.isArray(hub.perguntasFrequentes) && hub.perguntasFrequentes.length) {
      h += '<section class="hub-block hub-faq-block" aria-labelledby="hub-faq-heading">';
      h += '<h2 id="hub-faq-heading">Perguntas frequentes</h2>';
      h += '<div class="hub-faq-list">';
      hub.perguntasFrequentes.forEach(function (fq, idx) {
        h += '<details class="hub-faq-item"' + (idx === 0 ? ' open' : '') + '>';
        h += '<summary>' + esc(fq.p) + '</summary>';
        h += '<p>' + esc(fq.r) + '</p>';
        h += '</details>';
      });
      h += '</div>';
      h += '</section>';
    }

    // Links internos para páginas temáticas relacionadas
    if (Array.isArray(hub.paginasRelacionadas) && hub.paginasRelacionadas.length) {
      h += '<section class="hub-block hub-related-block" aria-labelledby="hub-rel-heading">';
      h += '<h2 id="hub-rel-heading">Páginas temáticas e coberturas relacionadas</h2>';
      h += '<div class="hub-related-links">';
      hub.paginasRelacionadas.forEach(function (rPath) {
        var relHub = EDITORIAL.paginasTematicas[rPath];
        if (!relHub) return;
        h += '<a class="hub-related-card" href="' + esc(relHub.rota) + '" data-spa-link>';
        h += '<strong>' + esc(relHub.titulo) + '</strong>';
        h += '<span>' + esc(relHub.subtitulo) + '</span>';
        h += '</a>';
      });
      h += '</div>';
      h += '</section>';
    }

    h += '</div>';
    thematicHubView.innerHTML = h;
    resolverLinksGenericosNaView(thematicHubView, hub.termoBuscaPadrao || hub.titulo, hub.pais || 'BR');
    bindNewsFavButtons(thematicHubView);
    window.scrollTo({ top: 0, behavior: 'auto' });

    var hubForm = thematicHubView.querySelector('#hub-search-form');
    var hubInput = thematicHubView.querySelector('#hub-search-input');
    var hubPeriodWrap = thematicHubView.querySelector('#hub-period-filters');
    if (hubForm && hubInput) {
      hubForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (hubPeriodWrap) hubPeriodWrap.hidden = false;
        state.searchPeriod = '24h';
        thematicHubView.querySelectorAll('#hub-period-filters .period-btn').forEach(function (btn) {
          btn.setAttribute('aria-pressed', String(btn.getAttribute('data-period') === '24h'));
        });
        var qVal = (hubInput.value || '').trim() || hub.termoBuscaPadrao;
        executeHubCarouselsSearch(hubRoute, qVal, '24h');
      });
    }
    thematicHubView.querySelectorAll('#hub-period-filters .period-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var per = b.getAttribute('data-period') || '24h';
        state.searchPeriod = per;
        thematicHubView.querySelectorAll('#hub-period-filters .period-btn').forEach(function (btn) {
          btn.setAttribute('aria-pressed', String(btn.getAttribute('data-period') === per));
        });
        var qVal = (hubInput && hubInput.value || '').trim() || hub.termoBuscaPadrao;
        executeHubCarouselsSearch(hubRoute, qVal, per);
      });
    });

    bindDynamicEditorialActions(thematicHubView);
    state.searchPeriod = '24h';
    executeHubCarouselsSearch(hubRoute, hub.termoBuscaPadrao, '24h');

    if (!opts.fromPopState) {
      try {
        if (opts.replaceUrl) history.replaceState({ hubRoute: hubRoute }, '', hubRoute);
        else if (location.pathname !== hubRoute || location.hash) history.pushState({ hubRoute: hubRoute }, '', hubRoute);
      } catch (e) {}
    }
  }

  function collectDossieOutlets(dossie) {
    var rawPaises = (dossie && dossie.regras_classificacao && Array.isArray(dossie.regras_classificacao.paises) && dossie.regras_classificacao.paises.length)
      ? dossie.regras_classificacao.paises
      : ['BR', 'US', 'GB'];
    var paises = [];
    rawPaises.forEach(function (code) {
      var up = String(code || '').toUpperCase().trim();
      if (!up) return;
      if (up === 'GLOBAL') {
        ['BR', 'US', 'GB'].forEach(function (gCode) {
          if (paises.indexOf(gCode) === -1) paises.push(gCode);
        });
      } else if (paises.indexOf(up) === -1) {
        paises.push(up);
      }
    });
    if (!paises.length) paises = ['BR', 'US', 'GB'];

    var primaryA2 = paises[0];
    var outlets = [];
    var seenDomains = {};
    var perCountryLimit = paises.length === 1 ? 14 : (paises.length === 2 ? 8 : 5);

    paises.forEach(function (a2) {
      var cObj = byA2[a2];
      var list = (cObj && cObj.m && Array.isArray(cObj.m.outlets)) ? cObj.m.outlets.slice(0, perCountryLimit) : [];
      list.forEach(function (o) {
        if (outlets.length >= 20) return;
        var dom = '';
        try {
          dom = o.d || new URL(o.u).hostname.replace(/^www\./i, '');
        } catch (e) {}
        if (!dom || seenDomains[dom]) return;
        seenDomains[dom] = true;
        outlets.push({
          n: o.n,
          u: o.u,
          d: dom,
          b: o.b || 'I',
          ind: !!o.ind,
          st: !!o.st,
          pais: a2
        });
      });
    });

    if (!outlets.length && byA2['BR'] && byA2['BR'].m && Array.isArray(byA2['BR'].m.outlets)) {
      byA2['BR'].m.outlets.slice(0, 10).forEach(function (o) {
        outlets.push({ n: o.n, u: o.u, b: o.b || 'I', pais: 'BR' });
      });
      primaryA2 = 'BR';
    }

    return { primaryA2: primaryA2, outlets: outlets, paises: paises };
  }

  function matchLocalDossieFeedFallback(dossie, queryStr) {
    var kws = (dossie && dossie.regras_classificacao && Array.isArray(dossie.regras_classificacao.palavras_chave))
      ? dossie.regras_classificacao.palavras_chave
      : [];
    var terms = [];
    if (queryStr) terms.push(norm(queryStr));
    kws.forEach(function (k) {
      var nk = norm(k);
      if (nk && terms.indexOf(nk) === -1) terms.push(nk);
    });
    if (!terms.length) return Promise.resolve([]);

    var loadFeed = window._romFeedOutputCache
      ? Promise.resolve(window._romFeedOutputCache)
      : fetch('/data/feed_output.json?_t=' + Date.now(), { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (arr) {
            window._romFeedOutputCache = Array.isArray(arr) ? arr : [];
            return window._romFeedOutputCache;
          })
          .catch(function () { return []; });

    return loadFeed.then(function (items) {
      var scored = [];
      (items || []).forEach(function (it) {
        var text = norm((it.titulo || '') + ' ' + (it.resumo || '') + ' ' + (it.analise || ''));
        if (!text) return;
        var score = 0;
        terms.forEach(function (t, idx) {
          if (text.indexOf(t) !== -1) {
            score += (idx === 0 ? 10 : 4);
          } else {
            var tokens = t.split(/\s+/).filter(function (w) { return w.length >= 4; });
            tokens.forEach(function (w) {
              if (text.indexOf(w) !== -1) score += 2;
            });
          }
        });
        if (score > 0) {
          scored.push({
            score: score,
            item: {
              materia_titulo: it.titulo || '',
              materia_url: it.fonte_url || '#',
              veiculo_nome: it.fonte_nome || 'Veículo',
              pais_veiculo: 'BR',
              vies: '',
              publicado_em: it.data_publicacao || ''
            }
          });
        }
      });
      scored.sort(function (a, b) { return b.score - a.score; });
      return scored.slice(0, 12).map(function (s) { return s.item; });
    });
  }

  function fetchDossieLiveNews(dossie, customQuery, targetContainerId, opts) {
    opts = opts || {};
    var container = document.getElementById(targetContainerId);
    if (!container) return;
    var kws = (dossie && dossie.regras_classificacao && Array.isArray(dossie.regras_classificacao.palavras_chave))
      ? dossie.regras_classificacao.palavras_chave
      : [];
    var q = (customQuery || '').trim() || kws[0] || (dossie && dossie.titulo) || '';
    if (!q) {
      container.innerHTML = '<p class="dossie-empty-msg">Nenhuma matéria recente encontrada para este dossiê.</p>';
      return;
    }

    var statusAtual = computeDossieStatus(dossie);
    var per = opts.periodo || (statusAtual === 'arquivo' ? 'all' : '7d');
    var collected = collectDossieOutlets(dossie);
    var primaryA2 = collected.primaryA2;
    var cObj = byA2[primaryA2] || byA2['BR'];
    var outlets = collected.outlets;

    container.innerHTML = '<div class="dossie-loading-inline">Buscando matérias recentes sobre <strong>' + esc(q) + '</strong>…</div>';

    var isFile = (location.protocol === 'file:');
    var baseUrl = isFile ? 'https://www.rodandoomundo.com.br/api/busca-assunto' : '/api/busca-assunto';

    function runBuscaQuery(queryTerm, periodoBusca) {
      var payload = {
        q: queryTerm,
        country: primaryA2,
        countryName: cObj ? cObj.n : primaryA2,
        periodo: periodoBusca,
        outlets: outlets
      };
      return fetch(baseUrl + '?_t=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.ok ? r.json() : null;
      }).then(function (data) {
        var groups = (data && Array.isArray(data.grupos))
          ? data.grupos
          : ((data && Array.isArray(data.resultados)) ? data.resultados : []);
        var flat = [];
        var seenUrls = {};
        groups.forEach(function (g) {
          var arts = Array.isArray(g.artigos) ? g.artigos : (Array.isArray(g.itens) ? g.itens : []);
          arts.forEach(function (it) {
            var u = it.url || it.link || '';
            if (!u || seenUrls[u]) return;
            seenUrls[u] = true;
            flat.push({
              materia_titulo: it.titulo || it.title || '',
              materia_url: u,
              veiculo_nome: g.veiculo || it.fonte || 'Veículo',
              pais_veiculo: g.pais || it.pais || primaryA2,
              vies: g.vies || '',
              publicado_em: it.publicadoEm || it.data || it.publishedAt || ''
            });
          });
        });
        flat.sort(function (a, b) {
          var da = a.publicado_em ? Date.parse(a.publicado_em) || 0 : 0;
          var db = b.publicado_em ? Date.parse(b.publicado_em) || 0 : 0;
          return db - da;
        });
        return { flat: flat, groupsCount: groups.length, periodoEfetivo: (data && data.periodo) || periodoBusca };
      });
    }

    runBuscaQuery(q, per).then(function (res) {
      if (res.flat.length > 0) return res;
      if (!opts.explicitPeriod && per !== 'all') {
        var nextPer = (per === '24h' || per === '7d') ? '30d' : 'all';
        return runBuscaQuery(q, nextPer).then(function (resExp) {
          if (resExp.flat.length > 0) return resExp;
          if (nextPer !== 'all') return runBuscaQuery(q, 'all');
          return resExp;
        });
      }
      return res;
    }).then(function (res) {
      if (res.flat.length > 0 || !kws.length) return res;
      var altKw = kws.find(function (k) { return norm(k) !== norm(q); });
      if (!altKw) return res;
      return runBuscaQuery(altKw, '30d').then(function (altRes) {
        return altRes.flat.length > 0 ? { flat: altRes.flat, groupsCount: altRes.groupsCount, periodoEfetivo: altRes.periodoEfetivo, fallbackTerm: altKw } : res;
      });
    }).then(function (res) {
      if (res.flat.length > 0) return res;
      return matchLocalDossieFeedFallback(dossie, q).then(function (localItems) {
        if (localItems.length > 0) {
          return { flat: localItems, groupsCount: localItems.length, periodoEfetivo: res.periodoEfetivo };
        }
        var fallbackHub = (dossie && dossie.rota && EDITORIAL.paginasTematicas) ? EDITORIAL.paginasTematicas[dossie.rota] : null;
        if (fallbackHub && Array.isArray(fallbackHub.ultimasNoticias) && fallbackHub.ultimasNoticias.length) {
          var hubItems = fallbackHub.ultimasNoticias.map(function (n) {
            return {
              materia_titulo: n.titulo,
              materia_url: n.url,
              veiculo_nome: n.fonte,
              pais_veiculo: fallbackHub.pais || primaryA2,
              vies: n.vies || '',
              publicado_em: n.data ? (n.data + 'T12:00:00Z') : ''
            };
          });
          return { flat: hubItems, groupsCount: hubItems.length, periodoEfetivo: res.periodoEfetivo };
        }
        return res;
      });
    }).then(function (res) {
      var extraPromise = Promise.resolve(null);
      if (dossie && dossie.slug === 'conflitos-medio-oriente' && /gaza/i.test(q || '')) {
        extraPromise = runBuscaQuery('Gaza Palestine', (res && res.periodoEfetivo) || per).catch(function(){ return null; });
      }
      return extraPromise.then(function(extra){
        if (extra && extra.flat && extra.flat.length && res && res.flat){
          var seen = {};
          res.flat.forEach(function(it){ if(it && it.materia_url) seen[it.materia_url]=1; });
          extra.flat.forEach(function(it){
            if(it && it.materia_url && !seen[it.materia_url]){ res.flat.push(it); seen[it.materia_url]=1; }
          });
          res.flat.sort(function(a,b){
            var da = a.publicado_em ? Date.parse(a.publicado_em) || 0 : 0;
            var db = b.publicado_em ? Date.parse(b.publicado_em) || 0 : 0;
            return db - da;
          });
        }
        return res;
      });
    }).then(function (res) {
      if (!res || !res.flat || !res.flat.length) {
        container.innerHTML = '<p class="dossie-empty-msg">Nenhuma materia encontrada para "' + esc(q) + '". Tente outro termo.</p>';
        return;
      }
      if (res.periodoEfetivo && thematicHubView) {
        thematicHubView.querySelectorAll('#dossie-period-filters .period-btn').forEach(function (btn) {
          btn.setAttribute('aria-pressed', String(btn.getAttribute('data-period') === res.periodoEfetivo));
        });
      }
      var itemsToShow = res.flat.slice(0, 24);
      var veiculosUnicos = {};
      itemsToShow.forEach(function (it) { veiculosUnicos[it.veiculo_nome] = true; });
      var qtdVeiculos = Object.keys(veiculosUnicos).length;
      var termoLabel = res.fallbackTerm ? res.fallbackTerm : q;
      var headerHtml = '<div class="topic-search-header dossie-results-header">';
      headerHtml += '<p class="topic-search-summary">Exibindo <strong>' + itemsToShow.length + '</strong> ' + (itemsToShow.length === 1 ? 'materia' : 'materias') + ' sobre <strong>"' + esc(termoLabel) + '"</strong> em ' + qtdVeiculos + (qtdVeiculos === 1 ? ' veiculo' : ' veiculos') + '</p>';
      headerHtml += '<button type="button" class="topic-translate-all-btn" data-translate-all aria-pressed="false">Traduzir todas</button>';
      headerHtml += '</div>';
      container.innerHTML = headerHtml + renderDossieMateriasGridHtml(itemsToShow, primaryA2);
      bindCardTranslations(container);
      bindNewsFavButtons(container);
    }).catch(function () {
      container.innerHTML = '<p class="dossie-empty-msg">Nao foi possivel carregar as materias ao vivo.</p>';
    });
  }

  function renderDossieMateriasGridHtml(materias, defaultPais) {
    if (!Array.isArray(materias) || !materias.length) {
      return '<p class="dossie-empty-msg">Nenhuma matéria indexada ainda para este dossiê.</p>';
    }
    var mh = '<div class="hub-latest-grid dossie-materias-grid">';
    materias.forEach(function (m) {
      var title = m.materia_titulo || m.titulo || '';
      var url = m.materia_url || m.url || '#';
      var source = m.veiculo_nome || m.fonte || 'Veículo';
      var pais = m.pais_veiculo || defaultPais || 'BR';
      var biasLabel = (m.vies && BIAS[m.vies]) ? '<span class="badge badge-bias">' + esc(BIAS[m.vies]) + '</span>' : '';
      var srcFlag = outletFlagImg(source, pais, url);
      var pubStr = m.publicado_em ? formatSearchDate(m.publicado_em) : '';
      mh += '<article class="hub-news-card topic-news-card">';
      mh += '<div class="hub-news-meta">';
      mh += '<span class="hub-news-source">' + srcFlag + ' ' + esc(source) + '</span>';
      mh += biasLabel;
      if (pubStr) mh += '<time datetime="' + esc(m.publicado_em) + '">' + esc(pubStr) + '</time>';
      mh += renderNewsFavBtn({ url: url, title: title, source: source, countryCode: pais, publishedAt: m.publicado_em || '' });
      mh += '</div>';
      mh += '<h3 class="topic-news-title"><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + '</a></h3>';
      mh += '<a class="topic-news-open" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + (isVideoContent(url, m) ? 'Assistir vídeo ' : 'Abrir matéria ') + ICON_ARROW + '</a>';
      mh += '</article>';
    });
    mh += '</div>';
    return mh;
  }

  function renderDossieExecutiveSummaryHtml(d) {
    var es = d && d.executive_summary;
    if (!es || typeof es !== 'object') return '';
    var context = (es.context || '').trim();
    var pillars = Array.isArray(es.pillars) ? es.pillars : [];
    if (!context && !pillars.length) return '';

    var catMeta = {
      politica: { label: 'Política & Poder', icon: '🏛️', cls: 'cat-politica' },
      economia: { label: 'Economia & Mercados', icon: '📈', cls: 'cat-economia' },
      geopolitica: { label: 'Geopolítica', icon: '🌐', cls: 'cat-geopolitica' },
      seguranca: { label: 'Defesa & Segurança', icon: '🛡️', cls: 'cat-seguranca' },
      sociedade: { label: 'Sociedade', icon: '👥', cls: 'cat-sociedade' }
    };

    var h = '<section class="hub-block dossie-exec-summary" aria-labelledby="dossie-exec-heading">';
    h += '<div class="hub-block-head">';
    h += '<span class="dossie-section-kicker" style="color:#38bdf8">Síntese Executiva</span>';
    h += '<h2 id="dossie-exec-heading">O que está em jogo</h2>';
    h += '</div>';

    if (context) {
      h += '<div class="dossie-exec-context"><p>' + esc(context) + '</p></div>';
    }

    if (pillars.length) {
      h += '<div class="dossie-pillars-grid">';
      pillars.slice(0, 3).forEach(function (p, idx) {
        var meta = catMeta[p.category] || { label: 'Análise', icon: '•', cls: 'cat-default' };
        h += '<article class="dossie-pillar-card ' + esc(meta.cls) + '">';
        h += '<div class="dossie-pillar-top">';
        h += '<span class="dossie-pillar-badge">' + esc(meta.icon) + ' ' + esc(meta.label) + '</span>';
        h += '<span class="dossie-pillar-num">0' + (idx + 1) + '</span>';
        h += '</div>';
        h += '<h3 class="dossie-pillar-title">' + esc(p.title || '') + '</h3>';
        h += '<p class="dossie-pillar-desc">' + esc(p.description || '') + '</p>';
        h += '</article>';
      });
      h += '</div>';
    }

    h += '</section>';
    return h;
  }

  function renderDossieTimelineHtml(d) {
    var items = d && d.timeline;
    if (!Array.isArray(items) || !items.length) return '';

    var typeMeta = {
      past: { badge: 'Ocorrido', icon: '✓', cls: 'tl-past' },
      turning_point: { badge: 'Ponto de Virada', icon: '🔥', cls: 'tl-turning' },
      upcoming: { badge: 'Próximo Marco', icon: '⏳', cls: 'tl-upcoming' }
    };

    var h = '<section class="hub-block dossie-timeline" aria-labelledby="dossie-timeline-heading">';
    h += '<div class="hub-block-head">';
    h += '<span class="dossie-section-kicker" style="color:#fbbf24">Cronologia</span>';
    h += '<h2 id="dossie-timeline-heading">Linha do Tempo &amp; Marcos Decisivos</h2>';
    h += '<p>Clique em um marco para destacar os detalhes.</p>';
    h += '</div>';
    h += '<div class="dossie-timeline-list">';
    items.forEach(function (item, idx) {
      var meta = typeMeta[item.type] || typeMeta.past;
      h += '<button type="button" class="dossie-tl-item ' + esc(meta.cls) + '" data-tl-idx="' + idx + '">';
      h += '<span class="dossie-tl-dot" aria-hidden="true"></span>';
      h += '<span class="dossie-tl-content">';
      h += '<span class="dossie-tl-meta">';
      h += '<span class="dossie-tl-date">' + esc(item.display_date || item.date || '') + '</span>';
      h += '<span class="dossie-tl-badge">' + esc(meta.icon) + ' ' + esc(meta.badge) + '</span>';
      h += '</span>';
      h += '<span class="dossie-tl-title">' + esc(item.title || '') + '</span>';
      h += '<span class="dossie-tl-summary">' + esc(item.summary || '') + '</span>';
      h += '</span>';
      h += '</button>';
    });
    h += '</div></section>';
    return h;
  }

  function renderDossieDetailDOM(d, materias, slug) {
    if (!thematicHubView) return;
    var status = computeDossieStatus(d);
    var isEspecial = (d.tipo === 'especial');
    var legHub = (d.rota && EDITORIAL.paginasTematicas) ? EDITORIAL.paginasTematicas[d.rota] : null;
    var kws = (d.regras_classificacao && Array.isArray(d.regras_classificacao.palavras_chave)) ? d.regras_classificacao.palavras_chave : [];
    var paises = (d.regras_classificacao && Array.isArray(d.regras_classificacao.paises)) ? d.regras_classificacao.paises : [];

    updateSeoMeta(
      d.titulo + ' — Dossiê | Rodando o Mundo',
      d.subtitulo || 'Cobertura completa e acompanhamento em tempo real no Rodando o Mundo.',
      '/dossies/' + slug
    );

    var h = '<div class="hub-container dossie-detail-view">';
    h += '<div class="hub-nav-header-row">';
    h += '<button type="button" class="btn-back-topic" data-action="go-back" data-fallback="/dossies" aria-label="Voltar para dossiês" title="Voltar para dossiês">';
    h += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
    h += '<span>Voltar</span>';
    h += '</button>';
    h += '<nav class="hub-breadcrumbs" aria-label="Navegação estrutural">';
    h += '<a href="/" data-spa-link>Início</a> <span aria-hidden="true">/</span> ';
    h += '<a href="/dossies" data-spa-link>Dossiês</a> <span aria-hidden="true">/</span> ';
    h += '<span>' + esc(d.titulo) + '</span>';
    h += '</nav>';
    h += '</div>';

    h += '<header class="hub-hero dossie-detail-hero">';
    h += '<div class="hub-hero-badges dossie-detail-badges">';
    h += '<span class="dossie-detail-icon-wrap">' + renderDossieIconHtml(d) + '</span>';
    if (d.categoria) {
      h += '<span class="dossie-category-badge">' + esc(d.categoria) + '</span>';
    }
    if (isEspecial) {
      h += renderDossieStatusBadge(d, status);
    } else {
      h += '<span class="dossie-status-badge is-permanente">Cobertura permanente</span>';
    }
    h += '</div>';
    h += '<h1 class="hub-title" id="hub-main-title">' + esc(d.titulo) + '</h1>';
    if (d.meta_info) {
      h += '<div class="dossie-meta-period dossie-detail-period">' + esc(d.meta_info) + '</div>';
    }
    if (d.subtitulo) {
      h += '<p class="hub-subtitle">' + esc(d.subtitulo) + '</p>';
    }

    h += '<div class="hub-hero-actions">';
    if (legHub) {
      h += '<a class="btn btn-secondary" href="' + esc(legHub.rota) + '" data-spa-link>Ver contexto editorial e linha do tempo →</a>';
    }
    paises.slice(0, 3).forEach(function (a2) {
      var cObj = byA2[a2];
      if (cObj) {
        h += '<a class="btn btn-secondary" href="/' + esc(CONT_SLUGS[cObj.c] || 'Sul') + '/' + esc(cObj.a2) + '" data-spa-link>' + countryFlag(cObj, 'flag-xs', cObj.c) + ' ' + esc(countryDisplayName(cObj, cObj.c)) + '</a>';
      }
    });
    h += '</div>';

    if (kws.length) {
      h += '<div class="dossie-keywords-row" aria-label="Palavras-chave monitoradas">';
      kws.slice(0, 8).forEach(function (kw) {
        h += '<button type="button" class="dossie-kw-chip" data-dossie-kw="' + esc(kw) + '">' + esc(kw) + '</button>';
      });
      h += '</div>';
    }
    h += '</header>';

    if (legHub && Array.isArray(legHub.resumoEditorial) && legHub.resumoEditorial.length) {
      h += '<section class="hub-block hub-context-block" aria-labelledby="dossie-context-heading">';
      h += '<h2 id="dossie-context-heading">Contexto editorial</h2>';
      legHub.resumoEditorial.forEach(function (par) {
        h += '<p>' + esc(par) + '</p>';
      });
      h += '</section>';
    }

    h += renderDossieExecutiveSummaryHtml(d);
    h += renderDossieTimelineHtml(d);

    var defaultPer = (status === 'arquivo') ? 'all' : '7d';
    var activePer = defaultPer;

    h += '<section class="hub-block hub-news-block" aria-labelledby="dossie-materias-heading">';
    h += '<div class="hub-block-head">';
    h += '<h2 id="dossie-materias-heading">Cobertura e matérias recentes</h2>';
    h += '<p>Acompanhamento de múltiplos veículos com acesso direto às fontes originais.</p>';
    h += '</div>';
    h += '<form class="topic-search-form hub-search-form" id="dossie-live-search-form" role="search" novalidate>';
    h += '<div class="topic-search-input-wrap">';
    h += '<button type="submit" class="topic-search-icon-btn" aria-label="Buscar" title="Buscar"><svg class="topic-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg></button>';
    h += '<input type="search" id="dossie-live-search-input" class="topic-search-input" placeholder="Filtrar ou buscar assunto neste dossiê" aria-label="Buscar assunto neste dossiê" value="' + esc(kws[0] || '') + '">';
    h += '</div>';
    h += '<button type="submit" class="btn topic-search-btn">Buscar ao vivo</button>';
    h += '</form>';
    h += '<div class="period-filters dossie-period-filters" id="dossie-period-filters" role="group" aria-label="Período da busca">';
    h += '<button type="button" class="period-btn" data-period="24h" aria-pressed="' + (defaultPer === '24h') + '">24h</button>';
    h += '<button type="button" class="period-btn" data-period="7d" aria-pressed="' + (defaultPer === '7d') + '">7 dias</button>';
    h += '<button type="button" class="period-btn" data-period="30d" aria-pressed="' + (defaultPer === '30d') + '">30 dias</button>';
    h += '<button type="button" class="period-btn" data-period="all" aria-pressed="' + (defaultPer === 'all') + '">Tudo</button>';
    h += '</div>';
    h += '<div id="dossie-materias-results" aria-live="polite">';
    if (Array.isArray(materias) && materias.length) {
      h += '<div class="topic-search-header dossie-results-header">';
      h += '<p class="topic-search-summary">Exibindo <strong>' + materias.length + '</strong> ' + (materias.length === 1 ? 'matéria indexada' : 'matérias indexadas') + ' para este dossiê</p>';
      h += '<button type="button" class="topic-translate-all-btn" data-translate-all aria-pressed="false" title="Traduzir todos os títulos para português">' + ICON_TRANSLATE + ' <span>Traduzir todas</span></button>';
      h += '</div>';
      h += renderDossieMateriasGridHtml(materias, paises[0] || 'BR');
    } else {
      h += '<div class="dossie-loading-inline">Carregando matérias em tempo real…</div>';
    }
    h += '</div>';
    h += '</section>';

    h += '</div>';
    thematicHubView.innerHTML = h;
    window.scrollTo({ top: 0, behavior: 'auto' });
    bindDynamicEditorialActions(thematicHubView);

    thematicHubView.querySelectorAll('.dossie-tl-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wasSelected = btn.classList.contains('is-selected');
        thematicHubView.querySelectorAll('.dossie-tl-item').forEach(function (b) { b.classList.remove('is-selected'); });
        if (!wasSelected) btn.classList.add('is-selected');
      });
    });

    var resultsBox = document.getElementById('dossie-materias-results');
    if (Array.isArray(materias) && materias.length && resultsBox) {
      bindCardTranslations(resultsBox);
      bindNewsFavButtons(resultsBox);
    } else {
      fetchDossieLiveNews(d, '', 'dossie-materias-results', { periodo: activePer });
    }

    var liveForm = document.getElementById('dossie-live-search-form');
    var liveInput = document.getElementById('dossie-live-search-input');
    if (liveForm && liveInput) {
      liveForm.addEventListener('submit', function (e) {
        e.preventDefault();
        fetchDossieLiveNews(d, liveInput.value, 'dossie-materias-results', { periodo: activePer });
      });
    }
    thematicHubView.querySelectorAll('#dossie-period-filters .period-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var newPer = btn.getAttribute('data-period') || '7d';
        activePer = newPer;
        thematicHubView.querySelectorAll('#dossie-period-filters .period-btn').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b === btn));
        });
        fetchDossieLiveNews(d, liveInput ? liveInput.value : '', 'dossie-materias-results', { periodo: newPer, explicitPeriod: true });
      });
    });
    thematicHubView.querySelectorAll('.dossie-kw-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var kw = chip.getAttribute('data-dossie-kw') || '';
        if (liveInput) liveInput.value = kw;
        fetchDossieLiveNews(d, kw, 'dossie-materias-results', { periodo: activePer });
      });
    });
  }

  function showDossieDetail(slug, opts) {
    opts = opts || {};
    var normalizedSlug = String(slug || '').toLowerCase();
    var targetPath = '/dossies/' + normalizedSlug;

    state.notFound = false;
    state.hubRoute = targetPath;
    state.entendaSlug = null;
    state.editorialSection = null;
    state.cont = null;
    state.country = null;
    hideMobileChip();
    if (panelFloatingClose) panelFloatingClose.hidden = true;
    if (notFoundView) notFoundView.hidden = true;
    if (mapWrapSection) mapWrapSection.hidden = true;
    if (quickCountryView) quickCountryView.hidden = true;
    var vitrineIaSec = document.getElementById('vitrine-ia');
    if (vitrineIaSec) vitrineIaSec.hidden = true;
    var dossiesRotSec = document.getElementById('dossies-rotativos');
    if (dossiesRotSec) dossiesRotSec.hidden = true;
    if (editorialHomeWrap) {
      editorialHomeWrap.hidden = true;
      editorialHomeWrap.classList.remove('is-ultimas-mode');
    }
    if (thematicHubView) {
      thematicHubView.hidden = false;
      thematicHubView.innerHTML = '<div class="hub-container dossie-detail-view"><div class="dossie-loading-inline">Carregando dossiê…</div></div>';
    }
    updateNavActive('/dossies');

    if (!opts.fromPopState) {
      try {
        if (opts.replaceUrl) history.replaceState({ dossieSlug: normalizedSlug }, '', targetPath);
        else if (location.pathname !== targetPath || location.hash) history.pushState({ dossieSlug: normalizedSlug }, '', targetPath);
      } catch (e) {}
    }

    var apiPromise = fetch('/v2/dossies/' + encodeURIComponent(normalizedSlug) + '?_t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });

    var listPromise = dossiesState.loaded ? Promise.resolve() : carregarDossiesV2(false);

    Promise.all([apiPromise, listPromise]).then(function (res) {
      var apiData = res[0];
      var dossie = (apiData && apiData.ok && apiData.dossie) ? apiData.dossie : dossiesState.bySlug[normalizedSlug];
      if (!dossie) {
        showNotFound(targetPath);
        return;
      }
      var materias = (apiData && apiData.ok && Array.isArray(apiData.materias)) ? apiData.materias : [];
      renderDossieDetailDOM(dossie, materias, normalizedSlug);
    });
  }

  function showExplanationPage(slug, opts) {
    opts = opts || {};
    var ex = EDITORIAL.explicacoes[slug];
    if (!ex) {
      showNotFound('/entenda/' + slug);
      return;
    }
    state.notFound = false;
    state.hubRoute = null;
    state.entendaSlug = slug;
    state.editorialSection = null;
    state.cont = null;
    state.country = null;
    hideMobileChip();
    if (panelFloatingClose) panelFloatingClose.hidden = true;
    if (notFoundView) notFoundView.hidden = true;
    if (mapWrapSection) mapWrapSection.hidden = true;
    if (quickCountryView) quickCountryView.hidden = true;
    var vitrineIaSec = document.getElementById('vitrine-ia');
    if (vitrineIaSec) vitrineIaSec.hidden = true;
    var dossiesRotSec = document.getElementById('dossies-rotativos');
    if (dossiesRotSec) dossiesRotSec.hidden = true;
    if (editorialHomeWrap) {
      editorialHomeWrap.hidden = true;
      editorialHomeWrap.classList.remove('is-ultimas-mode');
    }
    if (thematicHubView) thematicHubView.hidden = false;

    var routePath = '/entenda/' + ex.slug;
    updateSeoMeta(ex.titulo + ' — Entenda o assunto | Rodando o Mundo', ex.resumoSimples, routePath);

    var fullWords = (ex.textoExplicativo || []).join(' ').trim().split(/\s+/).length;
    var h = '<div class="hub-container entenda-page-container">';
    h += '<div class="hub-nav-header-row">';
    h += '<button type="button" class="btn-back-topic" data-action="go-back" data-fallback="/entenda" aria-label="Voltar para onde estava" title="Voltar para onde estava">';
    h += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
    h += '<span>Voltar</span>';
    h += '</button>';
    h += '<nav class="hub-breadcrumbs" aria-label="Navegação estrutural">';
    h += '<a href="/" data-spa-link>Início</a> <span aria-hidden="true">/</span> ';
    h += '<a href="/entenda" data-spa-link>Entenda o assunto</a> <span aria-hidden="true">/</span> ';
    h += '<span>' + esc(ex.titulo) + '</span>';
    h += '</nav>';
    h += '</div>';

    h += '<article class="entenda-full-article">';
    h += '<header class="hub-hero">';
    h += '<div class="hub-hero-badges">';
    h += '<span class="editorial-eyebrow">Entenda o assunto · Guia explicativo</span>';
    h += '<span class="entenda-meta-pill">Atualizado em ' + esc(formatSearchDate(ex.atualizadoEm) || ex.atualizadoEm) + ' · ' + fullWords + ' palavras</span>';
    h += '</div>';
    h += '<h1 class="hub-title">' + esc(ex.titulo) + '</h1>';
    h += '<p class="hub-subtitle">' + esc(ex.resumoSimples) + '</p>';
    h += '<div class="hub-hero-actions">';
    h += '<button type="button" class="btn" data-ver-noticias-assunto data-termo="' + esc(ex.termoBusca) + '" data-pais="' + esc(ex.pais) + '" data-cont="' + esc(ex.continente) + '" data-topico="' + esc(ex.tipoNoticia) + '">Ver últimas notícias sobre este assunto</button>';
    h += '</div>';
    h += '</header>';

    h += '<div class="hub-block entenda-body-prose">';
    (ex.textoExplicativo || []).forEach(function (par) {
      h += '<p>' + esc(par) + '</p>';
    });
    h += '</div>';

    if (Array.isArray(ex.noticiasRelacionadas) && ex.noticiasRelacionadas.length) {
      h += '<section class="hub-block" aria-labelledby="entenda-rel-news">';
      h += '<h2 id="entenda-rel-news">Notícias relacionadas</h2>';
      h += '<div class="hub-latest-grid">';
      ex.noticiasRelacionadas.forEach(function (n) {
        var exLink = buildArticleLinkAttrs(n.url, n.titulo, n.fonte);
        h += '<article class="hub-news-card">';
        h += '<div class="hub-news-meta"><span class="hub-news-source">' + esc(n.fonte) + '</span><time>' + esc(formatSearchDate(n.data + 'T12:00:00Z')) + '</time>' + renderNewsFavBtn({ url: exLink.href, title: n.titulo, source: n.fonte, countryCode: ex.pais, publishedAt: n.data + 'T12:00:00Z' }) + '</div>';
        h += '<h3><a href="' + esc(exLink.href) + '"' + exLink.attrs + ' target="_blank" rel="noopener noreferrer">' + esc(n.titulo) + '</a></h3>';
        h += '<a class="topic-news-open" href="' + esc(exLink.href) + '"' + exLink.attrs + ' target="_blank" rel="noopener noreferrer">' + (isVideoContent(n.url, n) ? 'Assistir vídeo ' : 'Abrir matéria ') + ICON_ARROW + '</a>';
        h += '</article>';
      });
      h += '</div>';
      h += '</section>';
    }

    if (Array.isArray(ex.paginasTematicas) && ex.paginasTematicas.length) {
      h += '<section class="hub-block" aria-labelledby="entenda-rel-hubs">';
      h += '<h2 id="entenda-rel-hubs">Páginas temáticas relacionadas</h2>';
      h += '<div class="hub-related-links">';
      ex.paginasTematicas.forEach(function (rPath) {
        var hb = EDITORIAL.paginasTematicas[rPath];
        if (!hb) return;
        h += '<a class="hub-related-card" href="' + esc(hb.rota) + '" data-spa-link>';
        h += '<strong>' + esc(hb.titulo) + '</strong>';
        h += '<span>' + esc(hb.subtitulo) + '</span>';
        h += '</a>';
      });
      h += '</div>';
      h += '</section>';
    }

    h += '</article>';
    h += '</div>';
    thematicHubView.innerHTML = h;
    resolverLinksGenericosNaView(thematicHubView, ex.termoBusca || ex.titulo, ex.pais || 'BR');
    window.scrollTo({ top: 0, behavior: 'auto' });
    bindDynamicEditorialActions(thematicHubView);

    if (!opts.fromPopState) {
      try {
        if (opts.replaceUrl) history.replaceState({ entendaSlug: slug }, '', routePath);
        else if (location.pathname !== routePath || location.hash) history.pushState({ entendaSlug: slug }, '', routePath);
      } catch (e) {}
    }
  }

  function obterDataHojeLocal() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart ? String(now.getMonth() + 1).padStart(2, '0') : (now.getMonth() + 1 < 10 ? '0' + (now.getMonth() + 1) : String(now.getMonth() + 1));
    var d = String(now.getDate()).padStart ? String(now.getDate()).padStart(2, '0') : (now.getDate() < 10 ? '0' + now.getDate() : String(now.getDate()));
    return y + '-' + m + '-' + d;
  }

  function carregarResumoCacheLocal() {
    try {
      var savedDate = localStorage.getItem('rom_resumo_date');
      var savedItems = localStorage.getItem('rom_resumo_items');
      var hoje = obterDataHojeLocal();
      if (savedDate === hoje && savedItems) {
        var parsed = JSON.parse(savedItems);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          EDITORIAL.resumoDoDia = parsed;
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  var RADAR_AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutos
  var radarFeedCache = null;
  var radarUpdatedLabel = '';
  var radarCategoryFilter = 'todos';
  var radarAutoRefreshTimer = null;
  var radarLastFetchAt = 0;
  var radarVisibilityBound = false;
  var radarHubSubtab = 'radar'; // 'radar' | 'curadoria' | 'colunas'

  function getRadarHubSubtabFromLocation() {
    try {
      var h = (location.hash || '').replace(/^#/, '').toLowerCase();
      if (h === 'curadoria') return 'curadoria';
      if (h === 'colunas') return 'colunas';
      if (h === 'radar') return 'radar';
    } catch (e) {}
    return 'radar';
  }

  function setRadarHubSubtab(tab, opts) {
    opts = opts || {};
    radarHubSubtab = (tab === 'curadoria' || tab === 'colunas') ? tab : 'radar';
    if (state.editorialSection === 'radar') {
      var hash = radarHubSubtab === 'curadoria' ? '#curadoria' : (radarHubSubtab === 'colunas' ? '#colunas' : '');
      var targetPath = '/radar' + hash;
      if (opts.updateUrl !== false) {
        try {
          if (opts.replaceUrl) history.replaceState({ editorialSection: 'radar', radarTab: radarHubSubtab }, '', targetPath);
          else if ((location.pathname + location.hash) !== targetPath) history.pushState({ editorialSection: 'radar', radarTab: radarHubSubtab }, '', targetPath);
        } catch (e) {}
      }
      updateNavActive('/radar');
      applyRadarHubTabUI();
    }
  }

  function applyRadarHubTabUI() {
    if (state.editorialSection !== 'radar') return;
    var container = document.getElementById('radar-editorial-view');
    if (!container) return;
    var activeTab = radarHubSubtab || 'radar';
    var panelRadar = container.querySelector('#radar-panel-radar');
    var panelCur = container.querySelector('#radar-panel-curadoria');
    var panelCol = container.querySelector('#radar-panel-colunas');
    if (panelRadar) panelRadar.hidden = activeTab !== 'radar';
    if (panelCur) panelCur.hidden = activeTab !== 'curadoria';
    if (panelCol) panelCol.hidden = activeTab !== 'colunas';
    container.querySelectorAll('[data-radar-tab]').forEach(function (btn) {
      var t = btn.getAttribute('data-radar-tab');
      var active = t === activeTab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.setAttribute('tabindex', active ? '0' : '-1');
    });
    if (activeTab === 'curadoria') {
      if (typeof carregarVitrineIA === 'function') carregarVitrineIA({ forceRefresh: false, categoria: vitrineIaSelectedCategory || '' });
      var chipsWrap = container.querySelector('#vitrine-ia-chips');
      if (chipsWrap && !chipsWrap._bound) {
        chipsWrap._bound = true;
        chipsWrap.querySelectorAll('.vitrine-ia-chip').forEach(function (chip) {
          chip.addEventListener('click', function () {
            var cat = chip.getAttribute('data-cat') || '';
            vitrineIaSelectedCategory = cat;
            chipsWrap.querySelectorAll('.vitrine-ia-chip').forEach(function (c) {
              var activeChip = c === chip;
              c.classList.toggle('is-active', activeChip);
              c.setAttribute('aria-selected', String(activeChip));
            });
            var cached = (typeof lerCacheVitrineIA === 'function') ? lerCacheVitrineIA(true) : null;
            if (cached && cached.length) {
              if (document.getElementById('vitrine-ia-grid')) renderVitrineIACards(cached, vitrineIaSelectedCategory);
            } else if (typeof carregarVitrineIA === 'function') {
              carregarVitrineIA({ forceRefresh: false, categoria: vitrineIaSelectedCategory });
            }
          });
        });
      }
    } else if (activeTab === 'colunas') {
      if (typeof carregarColunasEntendaV2 === 'function') carregarColunasEntendaV2(false);
    } else {
      if (typeof startRadarAutoRefresh === 'function') startRadarAutoRefresh();
    }
  }

  function stopRadarAutoRefresh() {
    if (radarAutoRefreshTimer) {
      clearInterval(radarAutoRefreshTimer);
      radarAutoRefreshTimer = null;
    }
  }

  function startRadarAutoRefresh() {
    stopRadarAutoRefresh();
    radarAutoRefreshTimer = setInterval(function () {
      if (state.editorialSection !== 'radar') {
        stopRadarAutoRefresh();
        return;
      }
      if (document.visibilityState === 'hidden') return;
      loadRadarCards(false, true);
    }, RADAR_AUTO_REFRESH_MS);
  }

  function bindRadarVisibilityListener() {
    if (radarVisibilityBound) return;
    radarVisibilityBound = true;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (state.editorialSection !== 'radar') return;
      if (Date.now() - radarLastFetchAt >= RADAR_AUTO_REFRESH_MS) {
        loadRadarCards(false, true);
      }
    });
  }

  function getRadarItemKey(item) {
    if (!item) return '';
    return String(item.fonte_url || item.titulo || '');
  }

  function updateRadarUpdatedBadge(label) {
    var updatedEl = document.getElementById('radar-last-updated');
    if (!updatedEl) return;
    updatedEl.textContent = label || '';
    if (label) {
      updatedEl.classList.add('is-live');
      updatedEl.setAttribute('title', 'Sincronização automática no navegador a cada 5 minutos');
    } else {
      updatedEl.classList.remove('is-live');
    }
  }

  function renderRadarEditorialView() {
    var container = document.getElementById('radar-editorial-view');
    if (!container) return;

    var activeTab = (radarHubSubtab === 'curadoria' || radarHubSubtab === 'colunas') ? radarHubSubtab : 'radar';
    var radarHidden = activeTab !== 'radar' ? ' hidden' : '';
    var curHidden = activeTab !== 'curadoria' ? ' hidden' : '';
    var colHidden = activeTab !== 'colunas' ? ' hidden' : '';

    var html = '';
    html += '<div class="hub-nav-header-row hubs-header-row">';
    html += '<button type="button" class="btn-back-topic" data-action="go-back" data-fallback="/" aria-label="Voltar para onde estava" title="Voltar para onde estava">';
    html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
    html += '<span>Voltar</span>';
    html += '</button>';
    html += '</div>';

    html += '<div class="radar-hub-tabs" role="tablist" aria-label="Seções de Radar, Curadoria e Colunas">';
    html += '<button type="button" class="radar-hub-tab' + (activeTab === 'radar' ? ' is-active' : '') + '" role="tab" id="radar-tab-radar" aria-controls="radar-panel-radar" aria-selected="' + (activeTab === 'radar' ? 'true' : 'false') + '" tabindex="' + (activeTab === 'radar' ? '0' : '-1') + '" data-radar-tab="radar">Radar</button>';
    html += '<button type="button" class="radar-hub-tab' + (activeTab === 'curadoria' ? ' is-active' : '') + '" role="tab" id="radar-tab-curadoria" aria-controls="radar-panel-curadoria" aria-selected="' + (activeTab === 'curadoria' ? 'true' : 'false') + '" tabindex="' + (activeTab === 'curadoria' ? '0' : '-1') + '" data-radar-tab="curadoria">Curadoria</button>';
    html += '<button type="button" class="radar-hub-tab' + (activeTab === 'colunas' ? ' is-active' : '') + '" role="tab" id="radar-tab-colunas" aria-controls="radar-panel-colunas" aria-selected="' + (activeTab === 'colunas' ? 'true' : 'false') + '" tabindex="' + (activeTab === 'colunas' ? '0' : '-1') + '" data-radar-tab="colunas" aria-label="Colunas Editoriais">Colunas</button>';
    html += '</div>';

    html += '<section id="radar-panel-curadoria" class="radar-hub-panel" role="tabpanel" aria-labelledby="radar-tab-curadoria"' + curHidden + '>';
    html += '<div class="vitrine-ia-section radar-curadoria-section" id="vitrine-ia">';
    html += '<div class="vitrine-ia-header">';
    html += '<div class="vitrine-ia-title-group">';
    html += '<div class="vitrine-ia-badge-row"><span class="vitrine-ia-badge"><span class="vitrine-ia-pulse" aria-hidden="true"></span> Análise em Tempo Real</span></div>';
    html += '<h2 class="vitrine-ia-title">Curadoria em Tempo Real</h2>';
    html += '<p class="vitrine-ia-subtitle">Temas em alta, cruzamento editorial e sinais relevantes monitorados continuamente pela curadoria IA — a análise em tempo real que antes aparecia na página inicial.</p>';
    html += '</div>';
    html += '</div>';
    html += '<div class="vitrine-ia-chips" id="vitrine-ia-chips" role="tablist" aria-label="Filtrar curadoria por categoria">';
    var curCats = [
      { k: '', label: 'Todos' },
      { k: 'Politica', label: 'Política' },
      { k: 'Economia', label: 'Economia' },
      { k: 'Cultura', label: 'Cultura' },
      { k: 'Eleicoes', label: 'Eleições' },
      { k: 'Geopolitica_Radar', label: 'Geopolítica' },
      { k: 'Resumo_Ultimas', label: 'Resumo & Últimas' }
    ];
    curCats.forEach(function (c) {
      var active = (vitrineIaSelectedCategory || '') === c.k;
      html += '<button type="button" class="vitrine-ia-chip' + (active ? ' is-active' : '') + '" data-cat="' + esc(c.k) + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '">' + esc(c.label) + '</button>';
    });
    html += '</div>';
    html += '<div class="vitrine-ia-grid" id="vitrine-ia-grid" aria-live="polite"><p class="radar-loading">Carregando análise em tempo real da curadoria...</p></div>';
    html += '</div>';
    html += '</section>';

    html += '<section id="radar-panel-colunas" class="radar-hub-panel" role="tabpanel" aria-labelledby="radar-tab-colunas"' + colHidden + '>';
    html += '<div class="editorial-section-head">';
    html += '<div>';
    html += '<p class="editorial-eyebrow">Análises Aprofundadas · Motor V2</p>';
    html += '<h2>Colunas Editoriais</h2>';
    html += '<p class="editorial-section-sub">Colunas editoriais geradas, revisadas e publicadas pela curadoria do Rodando o Mundo.</p>';
    html += '</div>';
    html += '</div>';
    html += '<div id="radar-v2-colunas-wrap" class="entenda-v2-colunas-wrap" aria-live="polite"><p class="radar-loading">Carregando colunas editoriais...</p></div>';
    html += '</section>';

    html += '<section id="radar-panel-radar" class="radar-hub-panel" role="tabpanel" aria-labelledby="radar-tab-radar"' + radarHidden + '>';
    html += '<div class="editorial-section-head">';
    html += '<div>';
    html += '<p class="editorial-eyebrow">Inteligência em Tempo Real · YouTube & RSS · Análise por IA</p>';
    html += '<h2 id="radar-editorial-titulo">Radar Editorial</h2>';
    html += '<p class="editorial-section-sub">Monitoramento contínuo dos principais canais e analistas de geopolítica, política, economia e cultura com síntese factual e avaliação de impacto.</p>';
    html += '</div>';
    html += '<div style="display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap;">';
    html += '<span class="radar-updated-badge' + (radarUpdatedLabel ? ' is-live' : '') + '" id="radar-last-updated" title="Sincronização automática no navegador a cada 5 a 8 minutos">' + esc(radarUpdatedLabel || '') + '</span>';
    html += '<a href="/resumo-do-dia" class="btn btn-secondary" data-spa-link title="Ver o Resumo do Dia com as 5 principais notícias">📰 Resumo do Dia</a>';
    html += '</div>';
    html += '</div>';

    var filtersHtml = '<div class="radar-filters-bar">';
    filtersHtml += '<button type="button" class="chip-btn radar-filter-btn' + (radarCategoryFilter === 'todos' ? ' is-active' : '') + '" data-radar-cat="todos">Todos</button>';
    filtersHtml += '<button type="button" class="chip-btn radar-filter-btn' + (radarCategoryFilter === 'geopolitica' ? ' is-active' : '') + '" data-radar-cat="geopolitica">Geopolítica</button>';
    filtersHtml += '<button type="button" class="chip-btn radar-filter-btn' + (radarCategoryFilter === 'politica' ? ' is-active' : '') + '" data-radar-cat="politica">Política</button>';
    filtersHtml += '<button type="button" class="chip-btn radar-filter-btn' + (radarCategoryFilter === 'economia' ? ' is-active' : '') + '" data-radar-cat="economia">Economia</button>';
    filtersHtml += '<button type="button" class="chip-btn radar-filter-btn' + (radarCategoryFilter === 'cultura' ? ' is-active' : '') + '" data-radar-cat="cultura">Cultura & Viagens</button>';
    filtersHtml += '</div>';

    html += filtersHtml + '<div class="radar-cards-grid" id="radar-cards-list"><p class="radar-loading">Carregando briefings do radar...</p></div>';
    html += '</section>';

    container.innerHTML = html;

    container.querySelectorAll('[data-radar-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-radar-tab');
        var tab = (t === 'curadoria' || t === 'colunas') ? t : 'radar';
        setRadarHubSubtab(tab);
      });
    });

    var filterBtns = container.querySelectorAll('.radar-filter-btn');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        radarCategoryFilter = btn.getAttribute('data-radar-cat') || 'todos';
        renderRadarCardsList(false);
      });
    });

    bindDynamicEditorialActions(container);
    loadRadarCards(false, false);
    startRadarAutoRefresh();
    bindRadarVisibilityListener();
    if (activeTab === 'curadoria' && typeof carregarVitrineIA === 'function') {
      carregarVitrineIA({ forceRefresh: false, categoria: vitrineIaSelectedCategory || '' });
    } else if (activeTab === 'colunas' && typeof carregarColunasEntendaV2 === 'function') {
      carregarColunasEntendaV2(false);
    }
  }
  function hasRadarFeedChanged(prevItems, nextItems) {
    if (!Array.isArray(prevItems) || !Array.isArray(nextItems)) return true;
    if (prevItems.length !== nextItems.length) return true;
    if (prevItems.length === 0) return false;
    for (var i = 0; i < prevItems.length; i++) {
      if (getRadarItemKey(prevItems[i]) !== getRadarItemKey(nextItems[i]) ||
          String(prevItems[i].data_publicacao || '') !== String(nextItems[i].data_publicacao || '')) {
        return true;
      }
    }
    return false;
  }

  function formatarDataPublicacaoCardRadar(isoDateStr) {
    if (!isoDateStr) return { text: '', title: '', iso: '' };
    var d = new Date(isoDateStr);
    if (isNaN(d.getTime())) return { text: '', title: '', iso: '' };

    var iso = d.toISOString();
    var dia = ('0' + d.getDate()).slice(-2);
    var mes = ('0' + (d.getMonth() + 1)).slice(-2);
    var ano = d.getFullYear();
    var hora = ('0' + d.getHours()).slice(-2);
    var min = ('0' + d.getMinutes()).slice(-2);

    var dataCompleta = dia + '/' + mes + '/' + ano + ' às ' + hora + 'h' + min;
    var title = 'Publicada no Rodando o Mundo em ' + dataCompleta;

    var agora = new Date();
    var diffMs = Date.now() - d.getTime();
    var diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 0 && diffMs >= -300000) {
      diffMin = 0;
    }

    var isMesmoDia = d.getDate() === agora.getDate() &&
                     d.getMonth() === agora.getMonth() &&
                     d.getFullYear() === agora.getFullYear();

    var texto = '';
    if (diffMin >= 0 && diffMin < 5) {
      texto = 'Publicada agora';
    } else if (diffMin >= 5 && diffMin < 60) {
      texto = 'Publicada há ' + diffMin + ' min';
    } else if (isMesmoDia) {
      texto = 'Publicada às ' + hora + 'h' + min;
    } else if (ano !== agora.getFullYear()) {
      texto = 'Publicada em ' + dia + '/' + mes + '/' + ano + ' às ' + hora + 'h' + min;
    } else {
      texto = 'Publicada em ' + dia + '/' + mes + ' às ' + hora + 'h' + min;
    }

    return { text: texto, title: title, iso: iso };
  }

  function formatarRotuloAtualizacaoRadar(items, labelSugerido) {
    var itemMaisRecente = 0;
    if (Array.isArray(items) && items.length > 0) {
      for (var i = 0; i < items.length; i++) {
        var dStr = items[i].data_publicacao || items[i].updated_at;
        if (dStr) {
          var t = new Date(dStr).getTime();
          if (!isNaN(t) && t > itemMaisRecente) {
            itemMaisRecente = t;
          }
        }
      }
    }

    if (itemMaisRecente > 0) {
      var diffMs = Date.now() - itemMaisRecente;
      var diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 0) diffMin = 0;

      if (diffMin < 5) {
        return 'Atualizado agora';
      }
      if (diffMin < 60) {
        return 'Atualizado há ' + diffMin + ' min';
      }
      var d = new Date(itemMaisRecente);
      var hora = ('0' + d.getHours()).slice(-2);
      var min = ('0' + d.getMinutes()).slice(-2);
      var hoje = new Date();
      if (d.getDate() === hoje.getDate() && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear()) {
        return 'Atualizado às ' + hora + 'h' + min;
      }
      var dia = ('0' + d.getDate()).slice(-2);
      var mes = ('0' + (d.getMonth() + 1)).slice(-2);
      return 'Atualizado em ' + dia + '/' + mes + ' às ' + hora + 'h' + min;
    }

    if (labelSugerido && typeof labelSugerido === 'string' && labelSugerido.trim() && labelSugerido !== 'Atualizado agora') {
      return labelSugerido;
    }
    return 'Atualizado agora';
  }

  function loadRadarCards(forceRefresh, isAutoRefresh) {
    if (forceRefresh) {
      radarFeedCache = null;
      try { localStorage.removeItem('rom_radar_cache'); } catch (e) {}
      var listLoading = document.getElementById('radar-cards-list');
      if (listLoading) {
        listLoading.innerHTML = '<p class="radar-loading">Sincronizando pulso em tempo real e briefings do radar...</p>';
      }
    } else if (!isAutoRefresh && radarFeedCache && (Date.now() - radarLastFetchAt < RADAR_AUTO_REFRESH_MS)) {
      updateRadarUpdatedBadge(radarUpdatedLabel);
      renderRadarCardsList(false);
      return;
    }

    var apiUrl = forceRefresh
      ? ('/api/radar?refresh=1&_t=' + Date.now())
      : ('/api/radar?_t=' + Date.now());

    fetch(apiUrl, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res || !res.ok) throw new Error('Status ' + (res ? res.status : 0));
        return res.json();
      })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.items) && data.items.length > 0) {
          radarLastFetchAt = Date.now();
          lastAutonomousFetchTimestamps.radar = Date.now();
          var changed = hasRadarFeedChanged(radarFeedCache, data.items);
          radarFeedCache = data.items;
          radarUpdatedLabel = formatarRotuloAtualizacaoRadar(data.items, data.atualizado_em);
          updateRadarUpdatedBadge(radarUpdatedLabel);
          if (!isAutoRefresh || changed) {
            var listEl = document.getElementById('radar-cards-list');
            if (isAutoRefresh && isUserReadingOrInteractingWith(listEl)) {
              pendingAutonomousUpdates.radar = function () {
                renderRadarCardsList(true);
                triggerHotNewsPulseCycle();
              };
            } else {
              renderRadarCardsList(!!isAutoRefresh);
              triggerHotNewsPulseCycle();
            }
          }
          return;
        }
        throw new Error('Formato inesperado');
      })
      .catch(function () {
        var fallbackUrl = '/data/feed_output.json?_t=' + Date.now();
        return fetch(fallbackUrl, { cache: 'no-store' })
          .then(function (res) {
            if (!res.ok) throw new Error('Status ' + res.status);
            return res.json();
          })
          .then(function (data) {
            return Array.isArray(data) ? data : [];
          })
          .then(function (nextItems) {
            radarLastFetchAt = Date.now();
            lastAutonomousFetchTimestamps.radar = Date.now();
            var changed = hasRadarFeedChanged(radarFeedCache, nextItems);
            radarFeedCache = nextItems;
            radarUpdatedLabel = formatarRotuloAtualizacaoRadar(nextItems);
            updateRadarUpdatedBadge(radarUpdatedLabel);
            if (!isAutoRefresh || changed) {
              var listEl = document.getElementById('radar-cards-list');
              if (isAutoRefresh && isUserReadingOrInteractingWith(listEl)) {
                pendingAutonomousUpdates.radar = function () {
                  renderRadarCardsList(true);
                  triggerHotNewsPulseCycle();
                };
              } else {
                renderRadarCardsList(!!isAutoRefresh);
                triggerHotNewsPulseCycle();
              }
            }
          })
          .catch(function (err) {
            if (isAutoRefresh) return; // falha silenciosa no auto-refresh para não interromper leitura
            var listEl = document.getElementById('radar-cards-list');
            if (listEl) {
              listEl.innerHTML = '<p class="radar-empty">Não foi possível carregar as novidades do radar neste momento (' + esc(err.message) + ').</p>';
            }
          });
      });
  }

  function toggleRadarCard(cardEl) {
    if (!cardEl) return;
    var btn = cardEl.querySelector('.radar-toggle-btn');
    var details = cardEl.querySelector('.radar-card-details');
    var isExpanded = cardEl.classList.contains('is-expanded');

    if (isExpanded) {
      cardEl.classList.remove('is-expanded');
      if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('title', 'Expandir briefing');
        btn.innerHTML = '<span class="radar-toggle-text">Veja +</span> <span class="radar-toggle-icon" aria-hidden="true">▾</span>';
      }
      if (details) {
        details.hidden = true;
      }
    } else {
      cardEl.classList.add('is-expanded');
      if (btn) {
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('title', 'Recolher briefing');
        btn.innerHTML = '<span class="radar-toggle-text">Veja -</span> <span class="radar-toggle-icon" aria-hidden="true">▴</span>';
      }
      if (details) {
        details.hidden = false;
      }
    }
  }

  function bindRadarCardAccordions(rootEl) {
    if (!rootEl) return;
    var cards = rootEl.querySelectorAll('.radar-card');
    cards.forEach(function (card) {
      if (card._radarAccordionBound) return;
      card._radarAccordionBound = true;

      var toggleBtn = card.querySelector('.radar-toggle-btn');
      var titleEl = card.querySelector('.radar-card-title');

      if (toggleBtn) {
        toggleBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          toggleRadarCard(card);
        });
      }

      if (titleEl) {
        titleEl.addEventListener('click', function (e) {
          e.preventDefault();
          toggleRadarCard(card);
        });
        titleEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleRadarCard(card);
          }
        });
      }
    });
  }

  function intercalarCardsRadarPorFonte(items) {
    if (!Array.isArray(items) || items.length <= 1) {
      return Array.isArray(items) ? items.slice() : [];
    }

    function normalizeFonteKey(fonteNome) {
      var raw = String(fonteNome || '');
      if (typeof raw.normalize === 'function') {
        raw = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }
      var clean = raw.toLowerCase().replace(/\s+/g, ' ').trim();
      return clean || 'desconhecida';
    }

    function isPulsoV2(item) {
      if (!item) return false;
      if (item.origem_v2 === true) return true;
      var fonte = String(item.fonte_nome || '').toLowerCase();
      return fonte.indexOf('pulso v2') !== -1;
    }

    function getPubTimestamp(item) {
      if (!item || !item.data_publicacao) return 0;
      var ts = Date.parse(item.data_publicacao);
      return isNaN(ts) ? 0 : ts;
    }

    var sorted = items.slice().sort(function (a, b) {
      return getPubTimestamp(b) - getPubTimestamp(a);
    });

    var topV2 = [];
    var pool = [];
    for (var i = 0; i < sorted.length; i++) {
      var current = sorted[i];
      if (isPulsoV2(current) && topV2.length < 2) {
        topV2.push(current);
      } else {
        pool.push(current);
      }
    }

    var result = topV2.slice();

    while (pool.length > 0) {
      var distinctMap = Object.create(null);
      var distinctCount = 0;
      for (var d = 0; d < pool.length; d++) {
        var fKey = normalizeFonteKey(pool[d].fonte_nome);
        if (!distinctMap[fKey]) {
          distinctMap[fKey] = true;
          distinctCount++;
        }
      }

      if (distinctCount <= 1) {
        for (var r = 0; r < pool.length; r++) {
          result.push(pool[r]);
        }
        break;
      }

      var windowSize = Math.min(3, distinctCount - 1);

      var consecFonte = '';
      var consecCount = 0;
      if (result.length > 0) {
        consecFonte = normalizeFonteKey(result[result.length - 1].fonte_nome);
        consecCount = 1;
        for (var c = result.length - 2; c >= 0; c--) {
          if (normalizeFonteKey(result[c].fonte_nome) === consecFonte) {
            consecCount++;
          } else {
            break;
          }
        }
      }

      var recentFontes = Object.create(null);
      var startRecent = Math.max(0, result.length - windowSize);
      for (var w = startRecent; w < result.length; w++) {
        recentFontes[normalizeFonteKey(result[w].fonte_nome)] = true;
      }

      var chosenIdx = -1;
      for (var p = 0; p < pool.length; p++) {
        var candFonte = normalizeFonteKey(pool[p].fonte_nome);
        if (consecCount >= 2 && candFonte === consecFonte) continue;
        if (recentFontes[candFonte]) continue;
        chosenIdx = p;
        break;
      }

      if (chosenIdx === -1) {
        for (var p2 = 0; p2 < pool.length; p2++) {
          var candFonte2 = normalizeFonteKey(pool[p2].fonte_nome);
          if (consecCount >= 2 && candFonte2 === consecFonte) continue;
          chosenIdx = p2;
          break;
        }
      }

      if (chosenIdx === -1) {
        chosenIdx = 0;
      }

      result.push(pool.splice(chosenIdx, 1)[0]);
    }

    return result;
  }

  function renderRadarCardsList(preserveExpanded) {
    var listEl = document.getElementById('radar-cards-list');
    if (!listEl) return;

    var expandedKeys = [];
    if (preserveExpanded) {
      listEl.querySelectorAll('.radar-card.is-expanded').forEach(function (openCard) {
        var key = openCard.getAttribute('data-radar-key');
        if (key) expandedKeys.push(key);
      });
    }

    if (!radarFeedCache || radarFeedCache.length === 0) {
      listEl.innerHTML = '<p class="radar-empty">Nenhum briefing disponível no momento.</p>';
      return;
    }

    var filtered = radarFeedCache.filter(function (item) {
      if (radarCategoryFilter === 'todos') return true;
      return (item.categoria || '').toLowerCase() === radarCategoryFilter;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="radar-empty">Nenhum briefing encontrado para a categoria selecionada.</p>';
      return;
    }

    filtered = intercalarCardsRadarPorFonte(filtered);

    var catLabels = {
      'geopolitica': 'Geopolítica',
      'politica': 'Política',
      'economia': 'Economia',
      'cultura': 'Cultura & Viagens'
    };

    var html = filtered.map(function (item, idx) {
      var catKey = (item.categoria || 'geral').toLowerCase();
      var catLabel = catLabels[catKey] || catKey.toUpperCase();
      var detailsId = 'radar-details-' + idx;
      var itemKey = getRadarItemKey(item);
      var dataPubMeta = formatarDataPublicacaoCardRadar(item.data_publicacao);

      var card = '<article class="radar-card radar-cat-' + esc(catKey) + (item.origem_v2 ? ' is-v2-card' : '') + '" data-radar-key="' + esc(itemKey) + '">';
      card += '<div class="radar-card-header">';
      card += '<div class="radar-card-meta">';
      card += '<span class="radar-badge-cat">' + esc(catLabel) + '</span>';
      if (item.origem_v2) {
        card += '<span class="radar-v2-pill radar-badge-v2">⚡ Pulso V2</span>';
      }
      card += '<span class="radar-source-name">📺 ' + esc(item.fonte_nome || 'Fonte') + '</span>';
      if (dataPubMeta.text) {
        card += '<time class="radar-pub-date" datetime="' + esc(dataPubMeta.iso) + '" title="' + esc(dataPubMeta.title) + '" aria-label="' + esc(dataPubMeta.title) + '">' + esc(dataPubMeta.text) + '</time>';
      }
      if (item.fonte_url) {
        card += renderNewsFavBtn({
          url: item.fonte_url,
          title: item.titulo,
          source: item.fonte_nome,
          countryCode: 'BR',
          publishedAt: item.data_publicacao || ''
        });
      }
      card += '</div>';

      card += '<h3 class="radar-card-title" role="button" tabindex="0" title="Clique para expandir ou recolher os detalhes">' + esc(item.titulo || '') + '</h3>';

      card += '<div class="radar-card-actions">';
      card += '<button type="button" class="radar-toggle-btn" aria-expanded="false" aria-controls="' + esc(detailsId) + '" title="Expandir briefing">';
      card += '<span class="radar-toggle-text">Veja +</span> <span class="radar-toggle-icon" aria-hidden="true">▾</span>';
      card += '</button>';
      card += '</div>';
      card += '</div>'; // .radar-card-header

      card += '<div class="radar-card-details" id="' + esc(detailsId) + '" hidden>';
      card += '<div class="radar-card-body">';
      if (item.resumo) {
        card += '<div class="radar-block radar-block-fato">';
        card += '<strong>📌 O que aconteceu:</strong>';
        card += '<p>' + esc(item.resumo) + '</p>';
        card += '</div>';
      }
      if (item.analise) {
        card += '<div class="radar-block radar-block-analise">';
        card += '<strong>💡 Por que importa:</strong>';
        card += '<p>' + esc(item.analise) + '</p>';
        card += '</div>';
      }
      card += '</div>'; // .radar-card-body

      if (item.fonte_url) {
        card += '<div class="radar-card-footer">';
        card += '<a href="' + esc(item.fonte_url) + '" target="_blank" rel="noopener noreferrer" class="radar-source-link">' + (isVideoContent(item.fonte_url, item) ? 'Assistir vídeo original ↗' : 'Acessar conteúdo original ↗') + '</a>';
        card += '</div>';
      }
      card += '</div>'; // .radar-card-details

      card += '</article>';
      return card;
    }).join('');

    listEl.innerHTML = html;
    bindNewsFavButtons(listEl);
    bindRadarCardAccordions(listEl);
    if (expandedKeys.length > 0) {
      listEl.querySelectorAll('.radar-card').forEach(function (card) {
        var key = card.getAttribute('data-radar-key');
        if (key && expandedKeys.indexOf(key) !== -1) {
          toggleRadarCard(card);
        }
      });
    }
  }

  function renderResumoDoDiaDOM() {
    var resumoSec = document.getElementById('resumo-do-dia');
    if (!resumoSec || !Array.isArray(EDITORIAL.resumoDoDia)) return;
    var sortedResumo = EDITORIAL.resumoDoDia.slice().sort(function (a, b) {
      return (a.relevancia || 99) - (b.relevancia || 99);
    });
    var todayStr = '';
    try {
      todayStr = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
    } catch (e) {
      todayStr = 'Edição atualizada';
    }
    var rh = '<div class="editorial-section-head">';
    rh += '<div>';
    rh += '<p class="editorial-eyebrow">Edição diária · Atualização automática · ' + esc(todayStr) + '</p>';
    rh += '<h2 id="resumo-dia-titulo">Resumo do dia</h2>';
    rh += '<p class="editorial-section-sub">As 5 principais notícias do dia selecionadas por relevância editorial, com síntese de fatos e comparação direta de cobertura entre veículos.</p>';
    rh += '</div>';
    rh += '<div style="display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap;">';
    rh += '<a href="/radar" class="btn btn-secondary" data-spa-link title="Ver todos os briefings em tempo real">📡 Radar ao Vivo</a>';
    rh += '<button type="button" class="btn resumo-email-btn" id="btn-resumo-email" data-open-newsletter="Resumo do dia">Receber por e-mail</button>';
    rh += '</div>';
    rh += '</div>';

    // Slot Comercial 2: Resumo do Dia (Web + E-mail)
    rh += '<div id="slot-sponsor-resumo" class="sponsor-slot sponsor-slot-resumo" hidden aria-label="Oferecimento do Resumo do Dia">' +
      '<div class="sponsor-resumo-badge">' +
        '<span class="sponsor-tag">Oferecimento</span>' +
        '<span class="mock-brand-logo sponsor-brand-target">Sua Marca Aqui</span>' +
        '<span class="sponsor-resumo-desc">— Conectando você às principais movimentações e análises do planeta.</span>' +
      '</div>' +
      '<a class="sponsor-cta-pill" href="/parcerias" data-spa-link>Saiba mais</a>' +
    '</div>';

    rh += '<ol class="resumo-dia-list">';
    sortedResumo.forEach(function (item, idx) {
      var cardId = 'resumo-item-' + idx;
      var cCodeUp = String(item.codigoPais || 'BR').toUpperCase();
      var cContKey = item.continente || 'sul';
      var cTopicKey = item.tipoNoticia || 'politica';
      var qBusca = item.termoBusca || item.titulo;
      var urlOrig = item.urlMateriaOriginal || item.url || '#';
      var resLink = buildArticleLinkAttrs(urlOrig, item.titulo, item.fonte);
      var resFlag = outletFlagImg(item.fonte, cCodeUp, item.dominio || urlOrig);

      var compSlug = item.comparacaoSlug;
      var compObj = (compSlug && EDITORIAL.comparacoes && EDITORIAL.comparacoes[compSlug]) ? EDITORIAL.comparacoes[compSlug] : null;
      var compIso = (compObj && compObj.paisIso) ? compObj.paisIso : cCodeUp;
      var totalVeiculos = getVeiculosCountByPais(compIso) || (compObj && (compObj.totalVeiculos || compObj.veiculosCount)) || (item.veiculosRelacionados || 18);

      rh += '<li class="resumo-dia-card" id="' + cardId + '">';
      rh += '<div class="resumo-rank-col"><span class="resumo-rank-badge" title="Ordem de relevância">#' + esc(item.relevancia) + '</span></div>';
      rh += '<div class="resumo-body-col">';

      // 1. Tag no topo do card (Categoria clicável) + Fonte e Favorito
      rh += '<div class="resumo-meta-row">';
      if (item.paginaTematica) {
        rh += '<a class="resumo-card-top-tag" href="' + esc(item.paginaTematica) + '" data-spa-link title="Ver dossiê completo sobre este tema">' + esc(item.categoria) + '</a>';
      } else {
        rh += '<span class="resumo-card-top-tag">' + esc(item.categoria) + '</span>';
      }
      rh += '<span class="resumo-source-name">Fonte: ' + resFlag + ' <span data-resumo-source>' + esc(item.fonte) + '</span></span>';
      rh += renderNewsFavBtn({ url: resLink.href, title: item.titulo, source: item.fonte, countryCode: cCodeUp, publishedAt: item.publicadoEm || '' });
      rh += '</div>';

      // Título e resumo
      rh += '<h3 class="resumo-item-title"><a href="' + esc(resLink.href) + '"' + resLink.attrs + ' target="_blank" rel="noopener noreferrer" data-resumo-link data-resumo-title>' + esc(item.titulo) + '</a></h3>';
      rh += '<p class="resumo-item-summary" data-resumo-summary>' + esc(item.resumoCurto || item.resumo || '') + '</p>';

      // Hierarquia estrita de 2 ações na base: Botão Primário em destaque + Link Secundário discreto
      rh += '<div class="resumo-actions-hierarchy">';
      if (compSlug) {
        rh += '<a class="btn-compare-primary" href="/comparar/' + esc(compSlug) + '" data-spa-link>' +
              '<span class="btn-compare-icon" aria-hidden="true">⚖️</span> Comparar cobertura (' + totalVeiculos + ' veículos) →</a>';
      } else {
        rh += '<button type="button" class="btn-compare-primary" data-ver-noticias-assunto data-termo="' + esc(qBusca) + '" data-pais="' + esc(cCodeUp) + '" data-cont="' + esc(cContKey) + '" data-topico="' + esc(cTopicKey) + '">' +
              '<span class="btn-compare-icon" aria-hidden="true">⚖️</span> Comparar cobertura deste tema →</button>';
      }
      var origLabel = isVideoContent(urlOrig, item) ? 'Assistir vídeo em' : 'Ler original em';
      rh += '<a class="link-original-secondary" href="' + esc(resLink.href) + '"' + resLink.attrs + ' target="_blank" rel="noopener noreferrer" data-resumo-link>' +
            '<span>' + origLabel + '</span> ' +
            (resFlag ? resFlag + ' ' : '') +
            '<span class="link-original-source">' + esc(item.fonte) + '</span> ' +
            ICON_ARROW + '</a>';
      rh += '</div>';

      rh += '</div>';
      rh += '</li>';
    });
    rh += '</ol>';
    resumoSec.innerHTML = rh;
    bindDynamicEditorialActions(resumoSec);
  }

  var resumoAutoAtualizando = false;
  function atualizarResumoDoDiaAutomatico(forcar) {
    if (resumoAutoAtualizando) return;
    var hoje = obterDataHojeLocal();
    var jaTemHoje = carregarResumoCacheLocal();
    if (jaTemHoje && !forcar) {
      renderResumoDoDiaDOM();
      return;
    }

    resumoAutoAtualizando = true;
    var resumoUrl = forcar ? ('/api/resumo?refresh=1&_t=' + Date.now()) : '/api/resumo';
    var resumoOpts = forcar
      ? { cache: 'no-store', headers: { Accept: 'application/json' } }
      : { headers: { Accept: 'application/json' } };

    fetch(resumoUrl, resumoOpts)
      .then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (r.ok && ct.indexOf('application/json') > -1) {
          return r.json();
        }
        return null;
      })
      .then(function (data) {
        if (data && Array.isArray(data.items) && data.items.length) {
          EDITORIAL.resumoDoDia = data.items;
          try {
            localStorage.setItem('rom_resumo_items', JSON.stringify(data.items));
            localStorage.setItem('rom_resumo_date', data.dataEdicao || hoje);
          } catch (e) {}
        }
      })
      .catch(function () {})
      .finally(function () {
        resumoAutoAtualizando = false;
        renderResumoDoDiaDOM();
        triggerHotNewsPulseCycle();
      });
  }

  function enrichResumoDoDiaOnce() {
    atualizarResumoDoDiaAutomatico();
  }

  function formatarTempoRelativoNoticia(dataIso) {
    try {
      var d = new Date(dataIso);
      if (isNaN(d.getTime())) return 'recentemente';
      var agora = Date.now();
      var diffMin = Math.round((agora - d.getTime()) / (60 * 1000));
      if (diffMin < 2) return 'agora há pouco';
      if (diffMin < 60) return 'há ' + diffMin + ' min';
      var diffHoras = Math.round(diffMin / 60);
      if (diffHoras < 24) return 'há ' + diffHoras + (diffHoras === 1 ? ' hora' : ' horas');
      var diffDias = Math.round(diffHoras / 24);
      if (diffDias === 1) return 'ontem';
      if (diffDias < 7) return 'há ' + diffDias + ' dias';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    } catch (e) {
      return 'recentemente';
    }
  }

  function obterNoticiasFallbackClient() {
    var agora = new Date().toISOString();
    return [
      {
        id: 'fb-nac-1',
        titulo: 'Congresso e Planalto debatem pautas econômicas e prioridades orçamentárias da semana',
        url: 'https://agenciabrasil.ebc.com.br/politica',
        resumo: 'Líderes partidários na Câmara e no Senado realizam reuniões de alinhamento com a equipe econômica para destravar votações prioritárias.',
        fonte: 'Agência Brasil',
        regiao: 'nacional',
        regiaoLabel: 'Nacional',
        estado: 'DF/Brasil',
        publicadoEm: agora,
        tempoRelativo: 'há 20 min'
      },
      {
        id: 'fb-nac-2',
        titulo: 'Supremo Tribunal Federal julga ações sobre tributação e direitos fundamentais',
        url: 'https://www.cartacapital.com.br/politica/',
        resumo: 'Corte Suprema pauta temas de impacto fiscal e repercussão geral com transmissão direta pelo plenário.',
        fonte: 'CartaCapital',
        regiao: 'nacional',
        regiaoLabel: 'Nacional',
        estado: 'DF/Nacional',
        publicadoEm: agora,
        tempoRelativo: 'há 45 min'
      },
      {
        id: 'fb-sud-1',
        titulo: 'Inflação e taxa Selic: mercado financeiro ajusta projeções e impacto no consumo',
        url: 'https://www.folha.uol.com.br/mercado/',
        resumo: 'Boletim do mercado financeiro e analistas indicam tendências sobre inflação, juros futuros e desempenho do varejo.',
        fonte: 'Folha de S.Paulo',
        regiao: 'sudeste',
        regiaoLabel: 'Sudeste',
        estado: 'SP',
        publicadoEm: agora,
        tempoRelativo: 'há 1 hora'
      },
      {
        id: 'fb-sud-2',
        titulo: 'Investimentos em ciência e transição tecnológica avançam nos centros de pesquisa de SP e RJ',
        url: 'https://www.nexojornal.com.br',
        resumo: 'Universidades e polos tecnológicos ampliam parcerias com o setor produtivo em inteligência artificial e biotecnologia.',
        fonte: 'Nexo Jornal',
        regiao: 'sudeste',
        regiaoLabel: 'Sudeste',
        estado: 'SP/RJ',
        publicadoEm: agora,
        tempoRelativo: 'há 2 horas'
      },
      {
        id: 'fb-sul-1',
        titulo: 'Governos estaduais do Sul articulam ações conjuntas para defesa civil e infraestrutura',
        url: 'https://www.gazetadopovo.com.br/brasil/',
        resumo: 'Paraná, Santa Catarina e Rio Grande do Sul coordenam projetos de resiliência climática, reforço de diques e logística rodoviária.',
        fonte: 'Gazeta do Povo',
        regiao: 'sul',
        regiaoLabel: 'Sul',
        estado: 'PR/Sul',
        publicadoEm: agora,
        tempoRelativo: 'há 1 hora'
      },
      {
        id: 'fb-sul-2',
        titulo: 'Cooperativas agropecuárias e malha logística do Sul batem recordes de produtividade',
        url: 'https://g1.globo.com/rs/rio-grande-do-sul/',
        resumo: 'Safra de grãos e exportações de proteínas animais impulsionam o PIB regional e movimentação portuária de Paranaguá e Rio Grande.',
        fonte: 'Imprensa do Sul',
        regiao: 'sul',
        regiaoLabel: 'Sul',
        estado: 'RS/SC/PR',
        publicadoEm: agora,
        tempoRelativo: 'há 3 horas'
      },
      {
        id: 'fb-nord-1',
        titulo: 'Transição energética e polo de hidrogênio verde atraem novos investimentos no Nordeste',
        url: 'https://g1.globo.com/economia/',
        resumo: 'Complexos portuários e parques eólicos e solares do Ceará, Bahia e Pernambuco avançam em acordos de cooperação internacional.',
        fonte: 'Imprensa do Nordeste',
        regiao: 'nordeste',
        regiaoLabel: 'Nordeste',
        estado: 'CE/BA/PE',
        publicadoEm: agora,
        tempoRelativo: 'há 2 horas'
      },
      {
        id: 'fb-nord-2',
        titulo: 'Expansão de polos industriais e tecnologia agrícola dinamizam a economia nordestina',
        url: 'https://jc.ne10.uol.com.br/economia/',
        resumo: 'Setores de fruticultura irrigada no Vale do São Francisco e centros automotivos registram crescimento de empregos.',
        fonte: 'Jornal do Commercio',
        regiao: 'nordeste',
        regiaoLabel: 'Nordeste',
        estado: 'PE/Nordeste',
        publicadoEm: agora,
        tempoRelativo: 'há 4 horas'
      },
      {
        id: 'fb-co-1',
        titulo: 'Agronegócio e logística ferroviária impulsionam escoamento de safras no Centro-Oeste',
        url: 'https://www.metropoles.com/brasil',
        resumo: 'Produtores de Mato Grosso, Goiás e Mato Grosso do Sul registram produtividade em alta e avanços na ferrovia Centro-Norte.',
        fonte: 'Metrópoles',
        regiao: 'centro-oeste',
        regiaoLabel: 'Centro-Oeste',
        estado: 'DF/Centro-Oeste',
        publicadoEm: agora,
        tempoRelativo: 'há 1 hora'
      },
      {
        id: 'fb-co-2',
        titulo: 'Distrito Federal e capitais do Centro-Oeste lideram novos acordos para gestão hídrica',
        url: 'https://www.correiobraziliense.com.br/cidades-df/',
        resumo: 'Consórcios públicos implementam tecnologias de monitoramento de aquíferos e preservação dos mananciais do Cerrado.',
        fonte: 'Correio Braziliense',
        regiao: 'centro-oeste',
        regiaoLabel: 'Centro-Oeste',
        estado: 'DF/GO',
        publicadoEm: agora,
        tempoRelativo: 'há 3 horas'
      },
      {
        id: 'fb-norte-1',
        titulo: 'Bioeconomia e monitoramento ambiental ganham protagonismo nas capitais da Amazônia',
        url: 'https://amazoniareal.com.br',
        resumo: 'Pesquisadores de instituições do Amazonas e Pará apresentam soluções inovadoras de bioeconomia sustentável e conservação florestal.',
        fonte: 'Amazônia Real',
        regiao: 'norte',
        regiaoLabel: 'Norte',
        estado: 'AM/Amazônia',
        publicadoEm: agora,
        tempoRelativo: 'há 2 horas'
      },
      {
        id: 'fb-norte-2',
        titulo: 'Cresce a navegação hidroviária sustentável e investimentos em telecomunicação no Norte',
        url: 'https://g1.globo.com/am/amazonas/',
        resumo: 'Ampliação de cabos subfluviais de fibra óptica e infraestrutura portuária conecta comunidades ribeirinhas e polos industriais.',
        fonte: 'Imprensa do Norte',
        regiao: 'norte',
        regiaoLabel: 'Norte',
        estado: 'AM/PA',
        publicadoEm: agora,
        tempoRelativo: 'há 5 horas'
      }
    ];
  }

  var ultimasCacheInicial = null;
  try {
    var rawCacheInit = localStorage.getItem('rom_ultimas_noticias');
    if (rawCacheInit) ultimasCacheInicial = JSON.parse(rawCacheInit);
  } catch (e) {}

  var ultimasNoticiasState = {
    carregando: false,
    dados: (ultimasCacheInicial && Array.isArray(ultimasCacheInicial.noticias) && ultimasCacheInicial.noticias.length >= 3) ? ultimasCacheInicial.noticias : null,
    regiaoAtiva: 'todas',
    termoBusca: '',
    erro: '',
    atualizadoEm: (ultimasCacheInicial && ultimasCacheInicial.atualizadoEm) || ''
  };

  function tentarFallbackClientSideOuCache() {
    // 1. Tentar ler do localStorage se houver dados válidos
    try {
      var raw = localStorage.getItem('rom_ultimas_noticias');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.noticias) && parsed.noticias.length >= 3) {
          ultimasNoticiasState.carregando = false;
          ultimasNoticiasState.dados = parsed.noticias;
          ultimasNoticiasState.atualizadoEm = parsed.atualizadoEm || '';
          ultimasNoticiasState.erro = '';
          renderUltimasNoticiasView();
          return;
        }
      }
    } catch (e) {}

    // 2. Tentar RSS client-side via rss2json
    var rssUrl = 'https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419';
    var apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(rssUrl);

    fetch(apiUrl)
      .then(function (r) {
        if (!r.ok) throw new Error('rss2json status ' + r.status);
        return r.json();
      })
      .then(function (res) {
        var rawItems = (res && Array.isArray(res.items)) ? res.items : [];
        if (rawItems.length >= 3) {
          var mapped = rawItems.map(function (it, idx) {
            var rawTitle = String(it.title || '').trim();
            var partes = rawTitle.split(/\s+[-–—]\s+/);
            var fonte = partes.length > 1 ? partes.pop().trim() : 'Imprensa';
            var titulo = partes.join(' - ').trim();
            var desc = String(it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (desc.length > 200) desc = desc.slice(0, 199).trim() + '…';

            var txtCheck = (titulo + ' ' + fonte).toLowerCase();
            var reg = 'nacional';
            var regLbl = 'Nacional';
            var est = 'Brasil';

            if (txtCheck.indexOf('metrópoles') > -1 || txtCheck.indexOf('correio braziliense') > -1 || txtCheck.indexOf('brasília') > -1 || txtCheck.indexOf('goiás') > -1 || txtCheck.indexOf('mato grosso') > -1) {
              reg = 'centro-oeste';
              regLbl = 'Centro-Oeste';
              est = 'DF/Centro-Oeste';
            } else if (txtCheck.indexOf('paraná') > -1 || txtCheck.indexOf('curitiba') > -1 || txtCheck.indexOf('porto alegre') > -1 || txtCheck.indexOf('santa catarina') > -1 || txtCheck.indexOf('rio grande do sul') > -1 || txtCheck.indexOf('gazeta do povo') > -1) {
              reg = 'sul';
              regLbl = 'Sul';
              est = 'Sul';
            } else if (txtCheck.indexOf('bahia') > -1 || txtCheck.indexOf('pernambuco') > -1 || txtCheck.indexOf('ceará') > -1 || txtCheck.indexOf('recife') > -1 || txtCheck.indexOf('salvador') > -1 || txtCheck.indexOf('fortaleza') > -1 || txtCheck.indexOf('nordeste') > -1) {
              reg = 'nordeste';
              regLbl = 'Nordeste';
              est = 'Nordeste';
            } else if (txtCheck.indexOf('amazôn') > -1 || txtCheck.indexOf('pará') > -1 || txtCheck.indexOf('manaus') > -1 || txtCheck.indexOf('belém') > -1 || txtCheck.indexOf('norte') > -1) {
              reg = 'norte';
              regLbl = 'Norte';
              est = 'Norte';
            } else if (txtCheck.indexOf('folha') > -1 || txtCheck.indexOf('estadão') > -1 || txtCheck.indexOf('g1') > -1 || txtCheck.indexOf('são paulo') > -1 || txtCheck.indexOf('rio de janeiro') > -1 || txtCheck.indexOf('minas') > -1) {
              reg = 'sudeste';
              regLbl = 'Sudeste';
              est = 'Sudeste';
            }

            var dt = it.pubDate ? new Date(String(it.pubDate).replace(' ', 'T') + 'Z') : new Date();
            var isoD = (!isNaN(dt.getTime())) ? dt.toISOString() : new Date().toISOString();

            return {
              id: 'rss-' + idx + '-' + Date.now(),
              titulo: titulo || rawTitle,
              url: it.link || '#',
              resumo: desc,
              fonte: fonte,
              regiao: reg,
              regiaoLabel: regLbl,
              estado: est,
              publicadoEm: isoD,
              tempoRelativo: formatarTempoRelativoNoticia(isoD)
            };
          }).filter(function (x) { return x.titulo && x.url; });

          if (mapped.length >= 3) {
            ultimasNoticiasState.carregando = false;
            ultimasNoticiasState.dados = mapped;
            ultimasNoticiasState.atualizadoEm = new Date().toISOString();
            ultimasNoticiasState.erro = '';
            try {
              localStorage.setItem('rom_ultimas_noticias', JSON.stringify({
                noticias: mapped,
                atualizadoEm: ultimasNoticiasState.atualizadoEm
              }));
            } catch (e) {}
            renderUltimasNoticiasView();
            return;
          }
        }
        throw new Error('Sem itens suficientes no feed RSS');
      })
      .catch(function () {
        // 3. Fallback editorial pré-empacotado garantido
        var fb = obterNoticiasFallbackClient();
        ultimasNoticiasState.carregando = false;
        ultimasNoticiasState.dados = fb;
        ultimasNoticiasState.atualizadoEm = new Date().toISOString();
        ultimasNoticiasState.erro = '';
        renderUltimasNoticiasView();
      });
  }

  function carregarUltimasNoticias(forcar) {
    if (ultimasNoticiasState.carregando) return;
    ultimasNoticiasState.carregando = true;
    ultimasNoticiasState.erro = '';
    if (forcar) {
      try {
        localStorage.removeItem('rom_ultimas_noticias');
      } catch (e) {}
    }
    renderUltimasNoticiasView();

    var queryPart = (forcar ? '?refresh=1&force=1&_t=' + Date.now() : '?_t=' + Date.now());
    var url = '/api/ultimas-noticias' + queryPart;

    var doFetchUltimas = function (endpoint) {
      return fetch(endpoint, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
      });
    };

    doFetchUltimas(url)
      .then(function (r) {
        if (!r.ok && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          return doFetchUltimas('https://www.rodandoomundo.com.br' + url);
        }
        return r;
      })
      .then(function (r) {
        var ct = r.headers.get('content-type') || '';
        if (r.ok && ct.indexOf('application/json') > -1) {
          return r.json();
        }
        throw new Error('Status ' + r.status);
      })
      .then(function (res) {
        if (res && Array.isArray(res.noticias) && res.noticias.length >= 3) {
          ultimasNoticiasState.carregando = false;
          ultimasNoticiasState.dados = res.noticias;
          ultimasNoticiasState.atualizadoEm = res.atualizadoEm || new Date().toISOString();
          ultimasNoticiasState.erro = '';
          try {
            localStorage.setItem('rom_ultimas_noticias', JSON.stringify({
              noticias: res.noticias,
              atualizadoEm: ultimasNoticiasState.atualizadoEm
            }));
          } catch (e) {}
          renderUltimasNoticiasView();
        } else {
          tentarFallbackClientSideOuCache();
        }
      })
      .catch(function () {
        tentarFallbackClientSideOuCache();
      });
  }

  var ULTIMAS_STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'o', 'a', 'os', 'as', 'para', 'com', 'por', 'e', 'se', 'um', 'uma', 'sobre', 'que', 'ao', 'aos']);

  function extrairTokensUltimas(termo) {
    var n = norm(termo);
    if (!n) return [];
    return n.split(/[^a-z0-9]+/).filter(function (tk) { return tk.length >= 2; });
  }

  function escapeRegexComAcentos(str) {
    var s = norm(str);
    var mapaAcentos = {
      'a': '[aáàâãäå]',
      'e': '[eéèêë]',
      'i': '[iíìîï]',
      'o': '[oóòôõö]',
      'u': '[uúùûü]',
      'c': '[cç]',
      'n': '[nñ]'
    };
    var res = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (mapaAcentos[ch]) {
        res += mapaAcentos[ch];
      } else if (/[.*+?^${}()|[\]\\]/.test(ch)) {
        res += '\\' + ch;
      } else {
        res += ch;
      }
    }
    return res;
  }

  function destacarTermosUltimas(texto, tokens, termoExato) {
    if (!texto) return '';
    var textoSeguro = esc(texto);
    var termosParaDestacar = [];
    if (termoExato && termoExato.length >= 2) {
      termosParaDestacar.push(norm(termoExato));
    }
    (tokens || []).forEach(function (t) {
      var tNorm = norm(t);
      if (tNorm.length >= 2 && !ULTIMAS_STOPWORDS.has(tNorm) && termosParaDestacar.indexOf(tNorm) === -1) {
        termosParaDestacar.push(tNorm);
      }
    });

    if (!termosParaDestacar.length) return textoSeguro;
    termosParaDestacar.sort(function (a, b) { return b.length - a.length; });

    var padroes = termosParaDestacar.map(function (t) {
      return escapeRegexComAcentos(t);
    });

    try {
      var regex = new RegExp('(' + padroes.join('|') + ')', 'gi');
      return textoSeguro.replace(regex, '<mark class="ultimas-highlight">$1</mark>');
    } catch (e) {
      return textoSeguro;
    }
  }

  function calcularScoreRelevanciaUltimas(item, termoNorm, tokens) {
    var titNorm = norm(item.titulo || '');
    var resNorm = norm(item.resumo || '');
    var fonNorm = norm(item.fonte || '');
    var estNorm = norm(item.estado || '');
    var regNorm = norm(item.regiaoLabel || '');
    var combo = titNorm + ' ' + fonNorm + ' ' + estNorm + ' ' + regNorm + ' ' + resNorm;

    var score = 0;

    // Frase ou palavra exata
    if (termoNorm && titNorm.indexOf(termoNorm) > -1) {
      score += 120;
    } else if (termoNorm && fonNorm.indexOf(termoNorm) > -1) {
      score += 70;
    } else if (termoNorm && resNorm.indexOf(termoNorm) > -1) {
      score += 45;
    } else if (termoNorm && combo.indexOf(termoNorm) > -1) {
      score += 30;
    }

    // Tokens individuais
    var relTokens = (tokens || []).filter(function (tk) { return tk.length >= 2 && !ULTIMAS_STOPWORDS.has(tk); });
    var tokensValidos = relTokens.length > 0 ? relTokens : tokens;

    if (tokensValidos.length > 0) {
      var matchesTit = 0;
      var matchesRes = 0;
      var matchesOutros = 0;

      tokensValidos.forEach(function (tk) {
        if (titNorm.indexOf(tk) > -1) matchesTit++;
        else if (fonNorm.indexOf(tk) > -1 || estNorm.indexOf(tk) > -1) matchesOutros++;
        else if (resNorm.indexOf(tk) > -1) matchesRes++;
      });

      if (matchesTit === tokensValidos.length) score += 80;
      else score += matchesTit * 25;

      if (matchesRes === tokensValidos.length) score += 25;
      else score += matchesRes * 8;

      score += matchesOutros * 15;
    }

    // Bônus de recência
    if (item.publicadoEm) {
      var ts = new Date(item.publicadoEm).getTime();
      if (!isNaN(ts)) {
        var horasAtras = Math.max(0, (Date.now() - ts) / (3600 * 1000));
        if (horasAtras <= 3) score += 15;
        else if (horasAtras <= 12) score += 10;
        else if (horasAtras <= 24) score += 5;
      }
    }

    return score;
  }

  function noticiaCorrespondeBuscaUltimas(item, termoNorm, tokens) {
    if (!termoNorm) return true;
    var titNorm = norm(item.titulo || '');
    var resNorm = norm(item.resumo || '');
    var fonNorm = norm(item.fonte || '');
    var estNorm = norm(item.estado || '');
    var regNorm = norm(item.regiaoLabel || '');
    var combo = titNorm + ' ' + fonNorm + ' ' + estNorm + ' ' + regNorm + ' ' + resNorm;

    if (combo.indexOf(termoNorm) > -1) return true;

    var relTokens = (tokens || []).filter(function (tk) { return tk.length >= 2 && !ULTIMAS_STOPWORDS.has(tk); });
    var tokensValidos = relTokens.length > 0 ? relTokens : tokens;

    if (tokensValidos.length === 1 && tokensValidos[0].length <= 4) {
      return combo.indexOf(tokensValidos[0]) > -1;
    }

    var casados = 0;
    for (var i = 0; i < tokensValidos.length; i++) {
      if (combo.indexOf(tokensValidos[i]) > -1) casados++;
    }

    if (casados === tokensValidos.length) {
      return true;
    }
    if (tokensValidos.length === 2) {
      return casados >= 1 && tokensValidos.some(function (tk) { return tk.length >= 4 && combo.indexOf(tk) > -1; });
    }
    if (tokensValidos.length >= 3) {
      return casados >= Math.max(2, Math.ceil(tokensValidos.length * 0.4));
    }

    return false;
  }

  function obterListaFiltradaUltimas() {
    var regiaoAtiva = ultimasNoticiasState.regiaoAtiva || 'todas';
    var termoRaw = (ultimasNoticiasState.termoBusca || '').trim();
    var termoNorm = norm(termoRaw);
    var tokensBusca = extrairTokensUltimas(termoRaw);
    var lista = Array.isArray(ultimasNoticiasState.dados) ? ultimasNoticiasState.dados : [];

    // Filtrar por região
    var filtradas = lista;
    if (regiaoAtiva !== 'todas') {
      filtradas = filtradas.filter(function (it) {
        if (regiaoAtiva === 'nacional') return it.regiao === 'nacional';
        if (regiaoAtiva === 'sudeste') return it.regiao === 'sudeste' || it.regiao === 'nacional';
        return it.regiao === regiaoAtiva;
      });
    }

    // Filtragem e ordenação por precisão e relevância caso haja termo de busca
    if (termoNorm && termoNorm.length >= 2) {
      // 1. Filtrar itens que correspondem estritamente à busca (todos os tokens presentes)
      var correspondentes = filtradas.filter(function (it) {
        return noticiaCorrespondeBuscaUltimas(it, termoNorm, tokensBusca);
      });

      // 2. Fallback inteligente: se nenhum casou com todos os tokens juntos (AND),
      // buscar matérias que casem com pelo menos um dos tokens principais
      if (correspondentes.length === 0 && tokensBusca.length > 1) {
        var relTokens = tokensBusca.filter(function (tk) { return !ULTIMAS_STOPWORDS.has(tk); });
        if (relTokens.length > 0) {
          correspondentes = filtradas.filter(function (it) {
            var combo = norm((it.titulo || '') + ' ' + (it.fonte || '') + ' ' + (it.estado || '') + ' ' + (it.regiaoLabel || '') + ' ' + (it.resumo || ''));
            return relTokens.some(function (tk) { return combo.indexOf(tk) > -1; });
          });
        }
      }

      // 3. Ordenar por score de relevância decrescente
      filtradas = correspondentes
        .map(function (it) {
          return { item: it, score: calcularScoreRelevanciaUltimas(it, termoNorm, tokensBusca) };
        })
        .sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return new Date(b.item.publicadoEm) - new Date(a.item.publicadoEm);
        })
        .map(function (entry) { return entry.item; });
    }

    return {
      filtradas: filtradas,
      termoRaw: termoRaw,
      termoNorm: termoNorm,
      tokensBusca: tokensBusca,
      regiaoAtiva: regiaoAtiva,
      totalGeral: lista.length
    };
  }

  function renderizarConteudoGridUltimas(sec) {
    var container = sec.querySelector('#ultimas-content-container');
    if (!container) return;

    var dadosBusca = obterListaFiltradaUltimas();
    var filtradas = dadosBusca.filtradas;
    var termoRaw = dadosBusca.termoRaw;
    var termoNorm = dadosBusca.termoNorm;
    var tokensBusca = dadosBusca.tokensBusca;

    var html = '';

    if (ultimasNoticiasState.carregando) {
      html += '<div class="ultimas-grid ultimas-skeleton-grid" aria-busy="true">';
      for (var s = 0; s < 6; s++) {
        html += '<div class="ultimas-card is-skeleton"><div class="sk-line sk-tag"></div><div class="sk-line sk-title"></div><div class="sk-line sk-text"></div></div>';
      }
      html += '</div>';
    } else if (ultimasNoticiasState.erro) {
      html += '<div class="ultimas-empty-state is-error">';
      html += '<p class="ultimas-empty-title">⚠️ Falha na conexão com os feeds de notícias</p>';
      html += '<p>' + esc(ultimasNoticiasState.erro) + '</p>';
      html += '<button type="button" class="btn btn-secondary" id="btn-ultimas-retry">Tentar novamente</button>';
      html += '</div>';
    } else if (!filtradas.length) {
      html += '<div class="ultimas-empty-state">';
      if (termoRaw) {
        html += '<p class="ultimas-empty-title">Nenhuma notícia encontrada para «' + esc(termoRaw) + '»</p>';
        html += '<p>Tente usar sinônimos, nomes de autoridades ou termos mais gerais para ampliar a busca.</p>';
        html += '<button type="button" class="btn btn-secondary" id="btn-ultimas-clear-filter">Limpar busca e ver todas</button>';
      } else {
        html += '<p class="ultimas-empty-title">Nenhuma notícia encontrada</p>';
        html += '<p>Não foram encontradas matérias com a região selecionada.</p>';
        html += '<button type="button" class="btn btn-secondary" id="btn-ultimas-clear-filter">Ver todas as regiões</button>';
      }
      html += '</div>';
    } else {
      html += '<div class="ultimas-results-meta">';
      if (termoRaw) {
        html += '<span>Exibindo <strong>' + filtradas.length + '</strong> ' + (filtradas.length === 1 ? 'notícia encontrada' : 'notícias encontradas') + ' para «<strong>' + esc(termoRaw) + '</strong>»</span>';
        html += '<button type="button" class="btn-ultimas-meta-clear" id="btn-ultimas-clear-query" title="Limpar busca">Limpar busca ✕</button>';
      } else {
        html += '<span>Exibindo <strong>' + filtradas.length + '</strong> ' + (filtradas.length === 1 ? 'notícia' : 'notícias') + '</span>';
      }
      if (ultimasNoticiasState.atualizadoEm) {
        var horaFormatada = '';
        try {
          horaFormatada = new Date(ultimasNoticiasState.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {}
        if (horaFormatada) html += '<span class="ultimas-updated-at">· Atualizado às ' + esc(horaFormatada) + '</span>';
      }
      html += '</div>';

      html += '<div class="ultimas-grid">';
      filtradas.forEach(function (noticia, idx) {
        var cardId = 'ultimas-card-' + idx;
        var regBadgeClass = 'badge-' + (noticia.regiao || 'nacional');
        var favBtnHtml = renderNewsFavBtn({
          url: noticia.url,
          title: noticia.titulo,
          source: noticia.fonte,
          countryCode: 'BR',
          publishedAt: noticia.publicadoEm || ''
        });

        var tituloRender = (termoNorm && termoNorm.length >= 2)
          ? destacarTermosUltimas(noticia.titulo, tokensBusca, termoNorm)
          : esc(noticia.titulo);

        var resumoRender = '';
        if (noticia.resumo) {
          resumoRender = (termoNorm && termoNorm.length >= 2)
            ? destacarTermosUltimas(noticia.resumo, tokensBusca, termoNorm)
            : esc(noticia.resumo);
        }

        html += '<article class="ultimas-card" id="' + cardId + '">';
        html += '<div class="ultimas-card-top">';
        html += '<div class="ultimas-card-tags">';
        html += '<span class="ultimas-region-tag ' + regBadgeClass + '">' + esc(noticia.regiaoLabel || 'Brasil') + '</span>';
        html += '<span class="ultimas-source-tag">📍 ' + esc(noticia.fonte) + (noticia.estado ? ' (' + esc(noticia.estado) + ')' : '') + '</span>';
        html += '</div>';
        html += favBtnHtml;
        html += '</div>';

        html += '<h3 class="ultimas-card-title">';
        html += '<a href="' + esc(noticia.url) + '" target="_blank" rel="noopener noreferrer">' + tituloRender + '</a>';
        html += '</h3>';

        if (resumoRender) {
          html += '<p class="ultimas-card-summary">' + resumoRender + '</p>';
        }

        html += '<div class="ultimas-card-footer">';
        html += '<span class="ultimas-card-time">';
        html += '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ';
        html += esc(noticia.tempoRelativo || 'recentemente');
        html += '</span>';
        html += '<a class="ultimas-card-link" href="' + esc(noticia.url) + '" target="_blank" rel="noopener noreferrer">';
        html += (isVideoContent(noticia.url, noticia) ? 'Assistir vídeo ' : 'Ler matéria original ') + ICON_ARROW;
        html += '</a>';
        html += '</div>';

        html += '</article>';
      });
      html += '</div>';
    }

    container.innerHTML = html;
    bindNewsFavButtons(container);

    // Eventos internos do container
    var btnRetry = container.querySelector('#btn-ultimas-retry');
    if (btnRetry) {
      btnRetry.addEventListener('click', function () {
        carregarUltimasNoticias(true);
      });
    }

    var btnClearQuery = container.querySelector('#btn-ultimas-clear-query');
    if (btnClearQuery) {
      btnClearQuery.addEventListener('click', function () {
        ultimasNoticiasState.termoBusca = '';
        var inp = sec.querySelector('#ultimas-search-input');
        if (inp) {
          inp.value = '';
          inp.focus();
        }
        var btnClearInp = sec.querySelector('#btn-ultimas-clear-input');
        if (btnClearInp) btnClearInp.hidden = true;
        renderizarConteudoGridUltimas(sec);
      });
    }

    var btnClearFilter = container.querySelector('#btn-ultimas-clear-filter');
    if (btnClearFilter) {
      btnClearFilter.addEventListener('click', function () {
        ultimasNoticiasState.regiaoAtiva = 'todas';
        ultimasNoticiasState.termoBusca = '';
        renderUltimasNoticiasView();
      });
    }
  }

  function renderUltimasNoticiasView(apenasConteudo) {
    var sec = document.getElementById('ultimas-noticias-view');
    if (!sec) return;

    if (!ultimasNoticiasState.dados && !ultimasNoticiasState.carregando && !ultimasNoticiasState.erro) {
      carregarUltimasNoticias(false);
      return;
    }

    var jaRenderizado = sec.querySelector('.ultimas-wrap');

    // Se já estiver renderizado e apenas o conteúdo precisar de atualização (ex: digitação na busca ou troca de aba)
    if (jaRenderizado && apenasConteudo) {
      var regAtiva = ultimasNoticiasState.regiaoAtiva || 'todas';
      sec.querySelectorAll('.ultimas-pill').forEach(function (pill) {
        var rg = pill.getAttribute('data-regiao');
        var isAtiva = rg === regAtiva;
        pill.classList.toggle('is-active', isAtiva);
        pill.setAttribute('aria-selected', isAtiva ? 'true' : 'false');
      });

      var btnClearInp = sec.querySelector('#btn-ultimas-clear-input');
      if (btnClearInp) {
        btnClearInp.hidden = !ultimasNoticiasState.termoBusca;
      }

      renderizarConteudoGridUltimas(sec);
      return;
    }

    var regiaoAtiva = ultimasNoticiasState.regiaoAtiva || 'todas';
    var lista = Array.isArray(ultimasNoticiasState.dados) ? ultimasNoticiasState.dados : [];

    var regioes = [
      { id: 'todas', label: 'Todas as regiões' },
      { id: 'nacional', label: '🇧🇷 Nacional' },
      { id: 'sudeste', label: 'Sudeste' },
      { id: 'sul', label: 'Sul' },
      { id: 'nordeste', label: 'Nordeste' },
      { id: 'centro-oeste', label: 'Centro-Oeste' },
      { id: 'norte', label: 'Norte' }
    ];

    var html = '<div class="ultimas-wrap">';
    html += '<div class="cad-header-row">';
    html += '<a class="btn-back-map" href="/" data-home aria-label="Voltar ao mapa-múndi">← Voltar ao mapa</a>';
    html += '<span class="ultimas-badge"><span class="nav-live-dot"></span> Tempo Real · Brasil</span>';
    html += '</div>';

    html += '<header class="cad-hero ultimas-hero">';
    html += '<p class="editorial-eyebrow">Brasil · Múltiplos Veículos e Regiões</p>';
    html += '<h1 id="ultimas-noticias-titulo">Últimas notícias do Brasil</h1>';
    html += '<p class="cad-lead">Acompanhe as manchetes mais recentes publicadas pela imprensa de diferentes partes do país. Filtre por macrorregião ou pesquise para facilitar sua busca caso não tenha encontrado o que procura no mapa.</p>';
    html += '</header>';

    // Barra de ferramentas (Filtros por Região + Campo de Busca + Botão Atualizar)
    html += '<div class="ultimas-toolbar">';
    html += '<div class="ultimas-region-pills" role="tablist" aria-label="Filtrar por região do Brasil">';
    regioes.forEach(function (rg) {
      var countRg = rg.id === 'todas'
        ? lista.length
        : lista.filter(function (x) {
            return rg.id === 'sudeste' ? (x.regiao === 'sudeste' || x.regiao === 'nacional') : x.regiao === rg.id;
          }).length;
      var isActive = regiaoAtiva === rg.id;
      html += '<button type="button" class="ultimas-pill' + (isActive ? ' is-active' : '') + '" data-regiao="' + esc(rg.id) + '" role="tab" aria-selected="' + isActive + '">';
      html += esc(rg.label) + ' <span class="pill-count">(' + countRg + ')</span>';
      html += '</button>';
    });
    html += '</div>';

    var temTermo = !!(ultimasNoticiasState.termoBusca && ultimasNoticiasState.termoBusca.trim());
    html += '<div class="ultimas-search-row">';
    html += '<div class="ultimas-search-box">';
    html += '<svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
    html += '<input type="search" class="ultimas-search-input" id="ultimas-search-input" placeholder="Buscar nas notícias por assunto ou veículo…" value="' + esc(ultimasNoticiasState.termoBusca || '') + '" aria-label="Buscar nas notícias">';
    html += '<button type="button" class="btn-ultimas-search-clear" id="btn-ultimas-clear-input" title="Limpar busca" aria-label="Limpar busca"' + (temTermo ? '' : ' hidden') + '>✕</button>';
    html += '</div>';
    html += '<button type="button" class="btn-ultimas-refresh' + (ultimasNoticiasState.carregando ? ' is-loading' : '') + '" id="btn-ultimas-refresh" title="Recarregar últimas notícias"' + (ultimasNoticiasState.carregando ? ' disabled' : '') + '>';
    html += '<svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"' + (ultimasNoticiasState.carregando ? ' class="spin"' : '') + '><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>';
    html += '<span>' + (ultimasNoticiasState.carregando ? 'Atualizando…' : 'Atualizar') + '</span>';
    html += '</button>';
    html += '</div>';
    html += '</div>';

    // Container dinâmico do conteúdo
    html += '<div id="ultimas-content-container"></div>';

    html += '</div>';
    sec.innerHTML = html;

    // Renderizar conteúdo inicial
    renderizarConteudoGridUltimas(sec);

    // Eventos dos botões de região
    sec.querySelectorAll('.ultimas-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var rg = pill.getAttribute('data-regiao');
        if (rg && rg !== ultimasNoticiasState.regiaoAtiva) {
          ultimasNoticiasState.regiaoAtiva = rg;
          renderUltimasNoticiasView(true);
        }
      });
    });

    // Eventos do input de busca
    var inputBusca = sec.querySelector('#ultimas-search-input');
    var btnClearInp = sec.querySelector('#btn-ultimas-clear-input');

    if (inputBusca) {
      inputBusca.addEventListener('input', function () {
        ultimasNoticiasState.termoBusca = inputBusca.value;
        renderUltimasNoticiasView(true);
      });

      inputBusca.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          ultimasNoticiasState.termoBusca = '';
          inputBusca.value = '';
          renderUltimasNoticiasView(true);
        }
      });
    }

    if (btnClearInp) {
      btnClearInp.addEventListener('click', function () {
        ultimasNoticiasState.termoBusca = '';
        if (inputBusca) {
          inputBusca.value = '';
          inputBusca.focus();
        }
        renderUltimasNoticiasView(true);
      });
    }

    // Botão de recarregar
    var btnRefresh = sec.querySelector('#btn-ultimas-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', function () {
        carregarUltimasNoticias(true);
      });
    }
  }

  var dossiesState = {
    loaded: false,
    loading: false,
    permanentes: [],
    especiais: [],
    especiaisByStatus: { ao_vivo: [], em_breve: [], arquivo: [] },
    all: [],
    bySlug: {},
    categoriaAtiva: 'Todos'
  };
  var dossiesLoadPromise = null;

  function computeDossieStatus(d) {
    if (!d) return 'permanente';
    if (d.status === 'permanente' || d.status === 'ao_vivo' || d.status === 'em_breve' || d.status === 'arquivo') {
      return d.status;
    }
    if (d.tipo === 'permanente') return 'permanente';
    var now = Date.now();
    var start = d.data_inicio ? Date.parse(d.data_inicio) : NaN;
    var end = d.data_fim ? Date.parse(d.data_fim) : NaN;
    if (!isNaN(start) && now < start) return 'em_breve';
    if (!isNaN(end) && now > end) return 'arquivo';
    return 'ao_vivo';
  }

  function getDossieSvgPath(iconKey) {
    var k = String(iconKey || '').trim().toLowerCase();
    var map = {
      trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
      vote: '<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>',
      globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
      award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
      rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
      leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
      landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
      film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
      energy: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      trade: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
      work: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
      housing: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      ai: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
      tech: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
      cyber: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
      security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
      climate: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
      health: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
      space: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>',
      migration: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      rights: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
      global: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
      mideast: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
      eu: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
      latam: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'
    };
    return map[k] || map.globe;
  }

  function renderDossieSvgBadge(iconKey, extraCls) {
    var paths = getDossieSvgPath(iconKey);
    return '<span class="dossie-svg-icon ' + (extraCls || '') + '" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
      paths + '</svg></span>';
  }

  function renderDossieIconHtml(d) {
    if (!d) return '';
    var code = String(d.icone_ou_bandeira || '').trim();
    if (d.tipo === 'especial') {
      return renderDossieSvgBadge(code || 'Globe', 'is-especial');
    }
    var upper = code.toUpperCase();
    if (upper.length === 2 && byA2[upper]) {
      var cObj = byA2[upper];
      return '<span class="hub-home-flag">' + countryFlag(cObj, 'flag-sm', cObj.c) + '</span>';
    }
    return renderDossieSvgBadge(code || 'GLOBAL', 'is-thematic');
  }

  function renderDossieStatusBadge(d, statusOverride) {
    var st = statusOverride || computeDossieStatus(d);
    if (st === 'ao_vivo') {
      var vCount = Number(d.veiculos_count || 0);
      var suffix = vCount > 0 ? ' · ' + vCount + ' veículos' : '';
      return '<span class="dossie-status-badge is-ao-vivo"><span class="dossie-pulse-dot" aria-hidden="true"></span>Ao vivo' + esc(suffix) + '</span>';
    }
    if (st === 'em_breve') {
      return '<span class="dossie-status-badge is-em-breve">⏳ ' + esc(d.meta_info || 'Em breve') + '</span>';
    }
    return '<span class="dossie-status-badge is-arquivo">✓ Arquivo · ' + esc(d.meta_info || 'Encerrado') + '</span>';
  }

  function normalizeDossiesPayload(data) {
    var perms = [];
    var espsByStatus = { ao_vivo: [], em_breve: [], arquivo: [] };

    if (Array.isArray(data)) {
      data.forEach(function (item) {
        if (!item || !item.slug) return;
        item.status = computeDossieStatus(item);
        if (item.tipo === 'especial') {
          espsByStatus[item.status] = espsByStatus[item.status] || [];
          espsByStatus[item.status].push(item);
        } else {
          perms.push(item);
        }
      });
    } else if (data && typeof data === 'object') {
      var rawPerms = Array.isArray(data.permanentes) ? data.permanentes : (Array.isArray(data.dossies) ? data.dossies.filter(function (x) { return x.tipo !== 'especial'; }) : []);
      rawPerms.forEach(function (item) {
        if (!item || !item.slug) return;
        item.status = 'permanente';
        perms.push(item);
      });

      if (data.especiais && !Array.isArray(data.especiais) && typeof data.especiais === 'object') {
        ['ao_vivo', 'em_breve', 'arquivo'].forEach(function (stKey) {
          var arr = Array.isArray(data.especiais[stKey]) ? data.especiais[stKey] : [];
          arr.forEach(function (item) {
            if (!item || !item.slug) return;
            item.status = computeDossieStatus(Object.assign({}, item, { status: item.status || stKey }));
            espsByStatus[item.status] = espsByStatus[item.status] || [];
            espsByStatus[item.status].push(item);
          });
        });
      } else {
        var rawEsps = Array.isArray(data.especiais) ? data.especiais : (Array.isArray(data.dossies) ? data.dossies.filter(function (x) { return x.tipo === 'especial'; }) : []);
        rawEsps.forEach(function (item) {
          if (!item || !item.slug) return;
          item.status = computeDossieStatus(item);
          espsByStatus[item.status] = espsByStatus[item.status] || [];
          espsByStatus[item.status].push(item);
        });
      }
    }

    var espsOrdered = []
      .concat(espsByStatus.ao_vivo || [])
      .concat(espsByStatus.em_breve || [])
      .concat(espsByStatus.arquivo || []);
    var all = espsOrdered.concat(perms);
    var bySlug = {};
    all.forEach(function (d) {
      bySlug[String(d.slug).toLowerCase()] = d;
    });

    dossiesState.permanentes = perms;
    dossiesState.especiaisByStatus = espsByStatus;
    dossiesState.especiais = espsOrdered;
    dossiesState.all = all;
    dossiesState.bySlug = bySlug;
    dossiesState.loaded = true;
    dossiesState.loading = false;
    SEARCH_INDEX = null;
  }

  function carregarDossiesV2(forceRefresh) {
    if (dossiesState.loading && dossiesLoadPromise && !forceRefresh) return dossiesLoadPromise;
    dossiesState.loading = true;
    var ts = Date.now();
    var isFile = (location.protocol === 'file:');
    var primaryUrl = (isFile ? 'https://www.rodandoomundo.com.br/v2/dossies' : '/v2/dossies') + '?_t=' + ts;
    var fallbackUrl = (isFile ? 'https://www.rodandoomundo.com.br/data/dossies.json' : '/data/dossies.json') + '?_t=' + ts;

    dossiesLoadPromise = fetch(primaryUrl, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('API /v2/dossies indisponível');
        return r.json();
      })
      .then(function (data) {
        if (!data || data.ok === false) throw new Error('Resposta inválida /v2/dossies');
        normalizeDossiesPayload(data);
        renderTemasHubsSection();
        renderDossiesRotativosHome();
        return dossiesState;
      })
      .catch(function () {
        return fetch(fallbackUrl, { cache: 'no-store' })
          .then(function (r) {
            if (!r.ok) throw new Error('Espelho /data/dossies.json indisponível');
            return r.json();
          })
          .then(function (mirrorData) {
            normalizeDossiesPayload(mirrorData);
            renderTemasHubsSection();
            renderDossiesRotativosHome();
            return dossiesState;
          })
          .catch(function () {
            dossiesState.loading = false;
            // Mantém a Home utilizável mesmo se ambas as fontes falharem: tenta fallback editorial local.
            try {
              if (typeof renderTemasHubsSection === 'function') renderTemasHubsSection();
              if (typeof renderDossiesRotativosHome === 'function') renderDossiesRotativosHome();
            } catch (e) {}
            return dossiesState;
          });
      });

    return dossiesLoadPromise;
  }

  function renderTemasHubsSection() {
    var hubsSec = document.getElementById('temas-hubs');
    if (!hubsSec) return;

    var isFullPage = (state.editorialSection === 'temas');
    var catAtiva = dossiesState.categoriaAtiva || 'Todos';
    var categorias = ['Todos', 'Geopolítica', 'Economia', 'Tecnologia', 'Clima e Ciência', 'Sociedade'];

    var especiaisList = dossiesState.especiais || [];
    var permanentesList = dossiesState.permanentes || [];

    // Fallback instantâneo antes do fetch resolver
    if (!dossiesState.loaded && EDITORIAL.paginasTematicas) {
      permanentesList = Object.keys(EDITORIAL.paginasTematicas).map(function (k) {
        var hb = EDITORIAL.paginasTematicas[k];
        return {
          slug: hb.rota.replace(/^\/+/, '').replace(/\//g, '-'),
          titulo: hb.titulo,
          subtitulo: hb.subtitulo,
          tipo: 'permanente',
          categoria: 'Geopolítica',
          icone_ou_bandeira: hb.pais || 'BR',
          rota: hb.rota,
          status: 'permanente',
          veiculos_count: (hb.ultimasNoticias && hb.ultimasNoticias.length) ? Math.max(hb.ultimasNoticias.length * 3, 12) : 18
        };
      });
    }

    var totalEspeciais = especiaisList.length;
    var totalPermanentes = permanentesList.length;
    var especiaisVisiveis = isFullPage ? especiaisList : especiaisList.slice(0, 6);
    var permanentesFiltrados = permanentesList.filter(function (d) {
      if (catAtiva === 'Todos') return true;
      return String(d.categoria || '').toLowerCase() === catAtiva.toLowerCase();
    });
    var permanentesVisiveis = isFullPage ? permanentesFiltrados : permanentesFiltrados.slice(0, 6);

    var hh = '<div class="hub-nav-header-row hubs-header-row">';
    hh += '<button type="button" class="btn-back-topic" data-action="go-back" data-fallback="/" aria-label="Voltar para onde estava" title="Voltar para onde estava">';
    hh += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
    hh += '<span>Voltar</span>';
    hh += '</button>';
    hh += '</div>';

    // Seção Superior: Dossiês Especiais
    if (especiaisVisiveis.length) {
      hh += '<div class="dossies-especiais-section">';
      hh += '<div class="editorial-section-head">';
      hh += '<div>';
      hh += '<p class="editorial-eyebrow">COBERTURA TEMPORÁRIA · EVENTOS EM DESTAQUE</p>';
      hh += '<h2 class="dossies-especiais-titulo">Dossiês Especiais</h2>';
      hh += '<p class="editorial-section-sub">Acompanhamento intensivo em tempo real de grandes eventos globais, cimeiras, eleições e marcos culturais.</p>';
      hh += '</div>';
      if (!isFullPage) {
        hh += '<a href="/dossies" class="btn btn-secondary hubs-head-view-all" data-spa-link>Ver todos os ' + totalEspeciais + ' especiais →</a>';
      }
      hh += '</div>';
      hh += '<div class="hubs-cards-grid dossies-especiais-grid">';
      especiaisVisiveis.forEach(function (d) {
        var href = '/dossies/' + encodeURIComponent(d.slug);
        hh += '<article class="hub-home-card dossie-especial-card">';
        hh += '<div class="hub-home-card-top">';
        hh += renderDossieIconHtml(d);
        hh += renderDossieStatusBadge(d);
        hh += '</div>';
        hh += '<h3><a href="' + esc(href) + '" data-spa-link>' + esc(d.titulo) + '</a></h3>';
        if (d.meta_info) {
          hh += '<div class="dossie-meta-period">' + esc(d.meta_info) + '</div>';
        }
        hh += '<p>' + esc(d.subtitulo || '') + '</p>';
        hh += '<div class="hub-home-card-foot">';
        hh += '<a class="hub-home-open" href="' + esc(href) + '" data-spa-link>Acessar dossiê →</a>';
        hh += '</div>';
        hh += '</article>';
      });
      hh += '</div>';
      hh += '</div>';
    }

    // Seção Principal: Dossiês Permanentes
    hh += '<div class="dossies-permanentes-section">';
    hh += '<div class="editorial-section-head">';
    hh += '<div>';
    hh += '<p class="editorial-eyebrow">COBERTURA PERMANENTE · HUBS TEMÁTICOS</p>';
    hh += '<h2 id="temas-hubs-titulo">Dossiês Permanentes</h2>';
    hh += '<p class="editorial-section-sub">Acompanhe a evolução dos principais temas globais com histórico, perspectivas comparadas e cobertura multimídia contínua.</p>';
    hh += '</div>';
    if (!isFullPage) {
      hh += '<a href="/dossies" class="btn btn-secondary hubs-head-view-all" data-spa-link>Ver todos os ' + totalPermanentes + ' dossiês →</a>';
    }
    hh += '</div>';

    // Pílulas de filtro por categoria
    hh += '<div class="dossies-category-filters" role="group" aria-label="Filtrar dossiês permanentes por categoria">';
    categorias.forEach(function (cat) {
      var isPressed = (cat === catAtiva);
      hh += '<button type="button" class="dossie-filter-pill' + (isPressed ? ' is-active' : '') + '" data-dossie-cat="' + esc(cat) + '" aria-pressed="' + String(isPressed) + '">' + esc(cat) + '</button>';
    });
    hh += '</div>';

    hh += '<div class="hubs-cards-grid">';
    if (permanentesVisiveis.length) {
      permanentesVisiveis.forEach(function (d) {
        var href = '/dossies/' + encodeURIComponent(d.slug);
        var vCount = Number(d.veiculos_count || 0);
        var metaText = d.categoria ? esc(d.categoria) + (vCount > 0 ? ' · ' + vCount + ' veículos' : '') : (vCount > 0 ? vCount + ' veículos · Atualizado hoje' : 'Cobertura contínua');
        hh += '<article class="hub-home-card">';
        hh += '<div class="hub-home-card-top">';
        hh += renderDossieIconHtml(d);
        hh += '<span class="hub-home-meta-badge">' + metaText + '</span>';
        hh += '</div>';
        hh += '<h3><a href="' + esc(href) + '" data-spa-link>' + esc(d.titulo) + '</a></h3>';
        hh += '<p>' + esc(d.subtitulo || '') + '</p>';
        hh += '<div class="hub-home-card-foot">';
        hh += '<a class="hub-home-open" href="' + esc(href) + '" data-spa-link>Acessar dossiê completo →</a>';
        hh += '</div>';
        hh += '</article>';
      });
    } else {
      hh += '<p class="dossie-empty-msg">Nenhum dossiê permanente encontrado nesta categoria.</p>';
    }
    hh += '</div>';

    if (!isFullPage) {
      hh += '<div class="hubs-view-all-row">';
      hh += '<a href="/dossies" class="btn btn-secondary hubs-view-all-btn" data-spa-link>Ver todos os ' + totalPermanentes + ' dossiês →</a>';
      hh += '</div>';
    }
    hh += '</div>';

    hubsSec.innerHTML = hh;
    bindDynamicEditorialActions(hubsSec);
    hubsSec.querySelectorAll('.dossie-filter-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        dossiesState.categoriaAtiva = pill.getAttribute('data-dossie-cat') || 'Todos';
        renderTemasHubsSection();
      });
    });
  }

  // --- SUG-182: Vitrine rotativa de dossiês da Home ---
  // Mistura cobertura em tempo real (especiais/ao vivo) com permanentes e gira o cardápio.
  // No celular: 1 dossiê por vez, trocando sozinho, com setas para voltar/avançar.
  var dossieRotativo = {
    index: 0,
    slug: '',
    total: 0,
    timer: null,
    mobile: false,
    bound: false,
    touchStartX: null,
    touchStartY: null
  };
  var DOSSIE_ROTATIVO_BUCKET_MS = 3 * 60 * 1000; // cardápio novo a cada 3 min
  var DOSSIE_ROTATIVO_AUTO_MS = 6000;            // troca automática do card no celular

  function dossiesRotativosIsHome() {
    return !(state.cont || state.country || state.editorialSection || state.hubRoute ||
      state.entendaSlug || state.notFound || state.compareSlug);
  }

  function isDossieRotativosMobile() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
  }

  function rotateDossieList(list, offset) {
    if (!list || list.length < 2) return (list || []).slice();
    var off = ((offset % list.length) + list.length) % list.length;
    return list.slice(off).concat(list.slice(0, off));
  }

  // Interpola tempo real + permanentes para a vitrine nunca exibir só um tipo
  function buildDossieMixedPicks(especiais, permanentes, limit, offset) {
    var espLive = [];
    var espOther = [];
    (especiais || []).forEach(function (d) {
      var st = (d && d.status) ? d.status : computeDossieStatus(d);
      if (st === 'ao_vivo') espLive.push(d);
      else espOther.push(d);
    });
    var esp = espLive.concat(rotateDossieList(espOther, offset));
    var perm = rotateDossieList(permanentes || [], offset);

    var out = [];
    var ie = 0;
    var ip = 0;
    var turnEsp = true;
    while (out.length < limit && (ie < esp.length || ip < perm.length)) {
      var pushed = false;
      if (turnEsp) {
        if (ie < esp.length) { out.push(esp[ie++]); pushed = true; }
        else if (ip < perm.length) { out.push(perm[ip++]); pushed = true; }
      } else {
        if (ip < perm.length) { out.push(perm[ip++]); pushed = true; }
        else if (ie < esp.length) { out.push(esp[ie++]); pushed = true; }
      }
      if (!pushed) break;
      turnEsp = !turnEsp;
    }
    return out;
  }

  function buildDossieRotativoFallbackPermanentes() {
    if (!EDITORIAL.paginasTematicas) return [];
    return Object.keys(EDITORIAL.paginasTematicas).map(function (k) {
      var hb = EDITORIAL.paginasTematicas[k] || {};
      return {
        slug: String(hb.rota || '').replace(/^\/+/, '').replace(/\//g, '-'),
        titulo: hb.titulo || k,
        subtitulo: hb.subtitulo || '',
        tipo: 'permanente',
        categoria: 'Geopolítica',
        icone_ou_bandeira: hb.pais || 'BR',
        rota: hb.rota || '/',
        status: 'permanente',
        veiculos_count: (hb.ultimasNoticias && hb.ultimasNoticias.length) ? Math.max(hb.ultimasNoticias.length * 3, 12) : 18
      };
    }).filter(function (d) { return !!d.slug; });
  }

  function buildDossieRotativoCardHtml(d) {
    var href = '/dossies/' + encodeURIComponent(d.slug);
    var st = (d && d.status) ? d.status : computeDossieStatus(d);
    var vCount = Number(d.veiculos_count || 0);
    var metaText = d.categoria ? esc(d.categoria) + (vCount > 0 ? ' · ' + vCount + ' veículos' : '') : (vCount > 0 ? vCount + ' veículos · Atualizado hoje' : 'Cobertura contínua');
    var statusHtml = (d.tipo === 'especial')
      ? renderDossieStatusBadge(d, st)
      : '<span class="hub-home-meta-badge">Permanente · ' + metaText + '</span>';
    return '<article class="hub-home-card dossie-rotativo-card">' +
      '<div class="hub-home-card-top">' +
        renderDossieIconHtml(d) +
        statusHtml +
      '</div>' +
      '<h3><a href="' + esc(href) + '" data-spa-link>' + esc(d.titulo) + '</a></h3>' +
      (d.meta_info && d.tipo === 'especial' ? '<div class="dossie-meta-period">' + esc(d.meta_info) + '</div>' : '') +
      '<p>' + esc(d.subtitulo || '') + '</p>' +
      '<div class="hub-home-card-foot">' +
        '<a class="hub-home-open" href="' + esc(href) + '" data-spa-link>Acessar dossiê →</a>' +
      '</div>' +
    '</article>';
  }

  function stopDossieRotativoTimer() {
    if (dossieRotativo.timer) {
      clearInterval(dossieRotativo.timer);
      dossieRotativo.timer = null;
    }
  }

  function applyDossieRotativoIndex() {
    var gridEl = document.getElementById('dossies-rotativos-grid');
    if (!gridEl || !dossieRotativo.total) return;
    if (dossieRotativo.index >= dossieRotativo.total) dossieRotativo.index = 0;
    if (dossieRotativo.index < 0) dossieRotativo.index = dossieRotativo.total - 1;

    gridEl.style.setProperty('--dossie-slide-index', String(dossieRotativo.index));
    var slides = gridEl.querySelectorAll('.dossie-rotativo-slide');
    var activeSlug = '';
    slides.forEach(function (s, i) {
      var isActive = (i === dossieRotativo.index);
      s.classList.toggle('is-active', isActive);
      s.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      if (isActive) {
        s.removeAttribute('inert');
        activeSlug = s.getAttribute('data-slug') || '';
      } else {
        s.setAttribute('inert', '');
      }
    });
    dossieRotativo.slug = activeSlug;

    var counter = document.getElementById('dossie-rot-counter');
    if (counter) counter.textContent = (dossieRotativo.index + 1) + ' / ' + dossieRotativo.total;
  }

  function restartDossieRotativoTimer() {
    stopDossieRotativoTimer();
    if (!dossieRotativo.mobile || dossieRotativo.total < 2) return;
    dossieRotativo.timer = setInterval(function () {
      if (document.hidden) return;
      var secEl = document.getElementById('dossies-rotativos');
      if (!secEl || secEl.hidden || !dossieRotativo.mobile || dossieRotativo.total < 2) return;
      dossieRotativo.index = (dossieRotativo.index + 1) % dossieRotativo.total;
      applyDossieRotativoIndex();
    }, DOSSIE_ROTATIVO_AUTO_MS);
  }

  function stepDossieRotativo(delta) {
    if (dossieRotativo.total < 2) return;
    dossieRotativo.index = (dossieRotativo.index + delta + dossieRotativo.total) % dossieRotativo.total;
    applyDossieRotativoIndex();
    restartDossieRotativoTimer(); // reseta a troca automática após navegação manual
  }

  function bindDossieRotativoNav() {
    if (dossieRotativo.bound) return;
    var prev = document.getElementById('dossie-rot-prev');
    var next = document.getElementById('dossie-rot-next');
    var gridEl = document.getElementById('dossies-rotativos-grid');
    if (!prev || !next || !gridEl) return;

    prev.addEventListener('click', function () { stepDossieRotativo(-1); });
    next.addEventListener('click', function () { stepDossieRotativo(1); });

    // Swipe horizontal (opcional nas setas) sem atraplar o scroll vertical
    gridEl.addEventListener('touchstart', function (e) {
      if (!dossieRotativo.mobile || !e.touches || e.touches.length !== 1) return;
      dossieRotativo.touchStartX = e.touches[0].clientX;
      dossieRotativo.touchStartY = e.touches[0].clientY;
    }, { passive: true });
    gridEl.addEventListener('touchend', function (e) {
      if (!dossieRotativo.mobile || dossieRotativo.touchStartX === null) return;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var dx = t.clientX - dossieRotativo.touchStartX;
      var dy = t.clientY - dossieRotativo.touchStartY;
      dossieRotativo.touchStartX = null;
      dossieRotativo.touchStartY = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      stepDossieRotativo(dx < 0 ? 1 : -1);
    }, { passive: true });

    dossieRotativo.bound = true;
  }

  function renderDossiesRotativosHome() {
    var secEl = document.getElementById('dossies-rotativos');
    var gridEl = document.getElementById('dossies-rotativos-grid');
    var navEl = document.getElementById('dossies-rotativos-nav');
    if (!secEl || !gridEl) return;

    // O bloco rotativo de dossiês é exclusivo da Home
    if (!dossiesRotativosIsHome()) {
      secEl.hidden = true;
      if (navEl) navEl.hidden = true;
      stopDossieRotativoTimer();
      return;
    }

    var especiais = (dossiesState.especiais || []).slice();
    var permanentes = (dossiesState.permanentes && dossiesState.permanentes.length)
      ? dossiesState.permanentes.slice()
      : buildDossieRotativoFallbackPermanentes();

    if (!especiais.length && !permanentes.length) {
      secEl.hidden = true;
      gridEl.innerHTML = '';
      if (navEl) navEl.hidden = true;
      stopDossieRotativoTimer();
      return;
    }

    var isMobile = isDossieRotativosMobile();
    var bucket = Math.floor(Date.now() / DOSSIE_ROTATIVO_BUCKET_MS);
    // Celular: 12 cards navegáveis (1 por vez). Demais telas: grade de 6.
    var picks = buildDossieMixedPicks(especiais, permanentes, isMobile ? 12 : 6, bucket);

    dossieRotativo.mobile = isMobile;
    dossieRotativo.total = isMobile ? picks.length : 0;

    secEl.hidden = false;
    gridEl.classList.toggle('is-carousel', isMobile);
    gridEl.setAttribute('aria-live', isMobile ? 'off' : 'polite');

    // Resolve o índice antes de injetar o HTML para o slide já nascer na posição certa (sem "pulo")
    var idx = 0;
    if (isMobile && dossieRotativo.slug) {
      for (var i = 0; i < picks.length; i++) {
        if (String(picks[i].slug) === dossieRotativo.slug) { idx = i; break; }
      }
    }
    dossieRotativo.index = (idx >= 0 && idx < picks.length) ? idx : 0;
    if (isMobile) {
      gridEl.style.setProperty('--dossie-slide-index', String(dossieRotativo.index));
    } else {
      dossieRotativo.index = 0;
      dossieRotativo.slug = '';
      gridEl.style.removeProperty('--dossie-slide-index');
    }

    gridEl.innerHTML = picks.map(function (d) {
      var card = buildDossieRotativoCardHtml(d);
      return isMobile
        ? '<div class="dossie-rotativo-slide" data-slug="' + esc(d.slug) + '">' + card + '</div>'
        : card;
    }).join('');

    bindDynamicEditorialActions(gridEl);
    bindDossieRotativoNav();
    if (navEl) navEl.hidden = !isMobile || picks.length < 2;

    if (isMobile) {
      applyDossieRotativoIndex(); // sincroniza aria/inert/contador com o índice
      if (!dossieRotativo.timer) restartDossieRotativoTimer();
    } else {
      stopDossieRotativoTimer();
    }
  }

  function renderEditorialHomeSections() {
    var entendaSec = document.getElementById('entenda-o-assunto');

    renderResumoDoDiaDOM();
    renderTemasHubsSection();

    if (entendaSec && EDITORIAL.explicacoes) {
      var expKeys = Object.keys(EDITORIAL.explicacoes);
      var topExpKeys = expKeys.slice(0, 4);
      var eh = '<div class="hub-nav-header-row hubs-header-row">';
      eh += '<button type="button" class="btn-back-topic" data-action="go-back" data-fallback="/" aria-label="Voltar para onde estava" title="Voltar para onde estava">';
      eh += '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
      eh += '<span>Voltar</span>';
      eh += '</button>';
      eh += '</div>';
      eh += '<div class="editorial-section-head">';
      eh += '<div>';
      eh += '<p class="editorial-eyebrow">Contexto em linguagem simples · Guia do leitor</p>';
      eh += '<h2 id="entenda-titulo">Entenda o assunto</h2>';
      eh += '<p class="editorial-section-sub">Explicações diretas e acessíveis sobre conceitos fundamentais na política, na economia e nas relações internacionais.</p>';
      eh += '</div>';
      eh += '<a href="/entenda" class="btn btn-secondary entenda-head-view-all" data-spa-link>Ver todos os ' + expKeys.length + ' guias →</a>';
      eh += '</div>';
      eh += '<div class="entenda-cards-grid entenda-compact-grid">';
      topExpKeys.forEach(function (slug) {
        var ex = EDITORIAL.explicacoes[slug];
        var wordCount = (ex.textoExplicativo || []).join(' ').trim().split(/\s+/).length;
        var readTimeMin = Math.max(2, Math.round(wordCount / 180));
        eh += '<article class="entenda-home-card entenda-card-compact" id="entenda-card-' + esc(ex.slug) + '">';
        eh += '<div class="entenda-card-meta">';
        eh += '<span class="entenda-reading-time">⏱️ ' + readTimeMin + ' min de leitura</span>';
        eh += '<span class="entenda-update-date">Atualizado hoje</span>';
        eh += '</div>';
        eh += '<h3><a href="/entenda/' + esc(ex.slug) + '" data-spa-link>' + esc(ex.titulo) + '</a></h3>';
        eh += '<p class="entenda-summary-compact">' + esc(ex.resumoSimples) + '</p>';
        eh += '<div class="entenda-card-actions">';
        eh += '<a class="btn btn-sm btn-primary entenda-read-btn" href="/entenda/' + esc(ex.slug) + '" data-spa-link>Ler guia completo →</a>';
        eh += '<button type="button" class="btn btn-sm btn-ghost entenda-news-btn" data-ver-noticias-assunto data-termo="' + esc(ex.termoBusca) + '" data-pais="' + esc(ex.pais) + '" data-cont="' + esc(ex.continente) + '" data-topico="' + esc(ex.tipoNoticia) + '">Notícias relacionadas</button>';
        eh += '</div>';
        eh += '</article>';
      });
      eh += '</div>';
      eh += '<div class="entenda-more-row">';
      eh += '<a href="/entenda" class="btn btn-secondary entenda-view-all-btn" data-spa-link>Explorar todos os ' + expKeys.length + ' guias do glossário →</a>';
      eh += '</div>';
      entendaSec.innerHTML = eh;
      bindDynamicEditorialActions(entendaSec);
    }
    renderDossiesRotativosHome();
  }

  var v2EntendaColunasCache = null;
  var v2EntendaAtualizadoEm = '';

  function renderColunasEntendaV2DOM(colunas, atualizadoEm) {
    var wrap = document.getElementById('radar-v2-colunas-wrap') || document.getElementById('entenda-v2-colunas-wrap');
    if (!wrap) return;
    if (!Array.isArray(colunas) || !colunas.length) {
      if (wrap.id === 'radar-v2-colunas-wrap') {
        wrap.hidden = false;
        wrap.innerHTML = '<p class="radar-loading">Nenhuma coluna editorial publicada no momento.</p>';
      } else {
        wrap.hidden = true;
        wrap.innerHTML = '';
      }
      return;
    }

    var ch = '<div class="entenda-v2-block">';
    ch += '<div class="entenda-v2-head">';
    ch += '<div class="entenda-v2-title-group">';
    ch += '<span class="entenda-v2-pill">⚡ Síntese Rodando o Mundo · V2</span>';
    ch += '<h3 class="entenda-v2-heading">Análises em Tempo Real · Motor V2</h3>';
    ch += '<p class="entenda-v2-sub">Dossiês analíticos e contexto estrutural gerados continuamente sobre os temas em alta.</p>';
    ch += '</div>';
    ch += '<div class="entenda-v2-meta-actions">';
    if (atualizadoEm) {
      ch += '<span class="radar-updated-badge">' + esc(atualizadoEm) + '</span>';
    }
    ch += '</div>';
    ch += '</div>';

    ch += '<div class="entenda-cards-grid entenda-v2-grid">';
    colunas.slice(0, 6).forEach(function (col, idx) {
      var colSlug = col.slug || ('v2-col-' + idx);
      var detailsId = 'entenda-v2-details-' + idx;
      var catLabel = col.categoria || 'Análise Contextual';
      var rotaHref = col.rota_editoria || '/radar';
      var kwFirst = (Array.isArray(col.palavras_chave) && col.palavras_chave[0]) || col.titulo || '';
      var codes = inferirPaisesDeTextoClient((col.titulo || '') + ' ' + (col.resumo || '') + ' ' + kwFirst);
      var cCode = codes[0] || 'BR';
      var cObj = byA2[cCode] || byA2['BR'];
      var cCont = (cObj && cObj.c) || 'sul';

      ch += '<article class="entenda-home-card entenda-card-compact entenda-v2-card" id="entenda-v2-card-' + esc(colSlug) + '">';
      ch += '<div class="entenda-card-meta">';
      ch += '<span class="radar-v2-pill">⚡ Síntese Rodando o Mundo · V2</span>';
      ch += '<span class="entenda-v2-cat">' + esc(catLabel) + '</span>';
      ch += '</div>';
      ch += '<h3><a href="' + esc(rotaHref) + '" data-spa-link>' + esc(col.titulo || '') + '</a></h3>';
      if (col.resumo) {
        ch += '<p class="entenda-summary-compact">' + esc(col.resumo) + '</p>';
      }
      if (col.analise_aprofundada) {
        ch += '<div class="entenda-v2-analysis-box" id="' + esc(detailsId) + '" hidden>';
        ch += '<strong>💡 Análise aprofundada (Motor V2):</strong>';
        ch += '<p>' + esc(col.analise_aprofundada) + '</p>';
        ch += '</div>';
      }
      ch += '<div class="entenda-card-actions">';
      if (col.analise_aprofundada) {
        ch += '<button type="button" class="btn btn-sm btn-primary entenda-v2-toggle-btn" data-target="' + esc(detailsId) + '" aria-expanded="false">Ler análise V2 ▾</button>';
      }
      ch += '<a class="btn btn-sm btn-secondary" href="' + esc(rotaHref) + '" data-spa-link>Ir para editoria →</a>';
      if (kwFirst) {
        ch += '<button type="button" class="btn btn-sm btn-ghost entenda-news-btn" data-ver-noticias-assunto data-termo="' + esc(kwFirst) + '" data-pais="' + esc(cCode) + '" data-cont="' + esc(cCont) + '" data-topico="politica">Notícias relacionadas</button>';
      }
      ch += '</div>';
      ch += '</article>';
    });
    ch += '</div>';
    ch += '</div>';

    wrap.innerHTML = ch;
    wrap.hidden = false;

    wrap.querySelectorAll('.entenda-v2-toggle-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        var box = targetId ? document.getElementById(targetId) : null;
        if (!box) return;
        var isExp = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!isExp));
        box.hidden = isExp;
        btn.textContent = isExp ? 'Ler análise V2 ▾' : 'Recolher análise ▴';
      });
    });

    bindDynamicEditorialActions(wrap);
  }

  function carregarColunasEntendaV2(forceRefresh, isAutoRefresh) {
    var wrap = document.getElementById('radar-v2-colunas-wrap') || document.getElementById('entenda-v2-colunas-wrap');
    if (!wrap) return;
    if (!forceRefresh && !isAutoRefresh && Array.isArray(v2EntendaColunasCache) && v2EntendaColunasCache.length) {
      renderColunasEntendaV2DOM(v2EntendaColunasCache, v2EntendaAtualizadoEm);
      return;
    }
    var url = '/api/entenda-o-assunto?acao=colunas&_t=' + Date.now() + (forceRefresh ? '&refresh=1' : '');
    fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.colunas) && data.colunas.length) {
          v2EntendaColunasCache = data.colunas;
          v2EntendaAtualizadoEm = data.atualizado_em || '';
          lastAutonomousFetchTimestamps.entendaV2 = Date.now();
          if (isAutoRefresh && isUserReadingOrInteractingWith(wrap)) {
            pendingAutonomousUpdates.entendaV2 = function () {
              renderColunasEntendaV2DOM(v2EntendaColunasCache, v2EntendaAtualizadoEm);
            };
          } else {
            renderColunasEntendaV2DOM(v2EntendaColunasCache, v2EntendaAtualizadoEm);
          }
        } else {
          renderColunasEntendaV2DOM([], '');
        }
      })
      .catch(function () {});
  }

  function buildPath(cont, country) {
    if (!cont) return '/';
    var cSlug = CONT_SLUGS[cont] || cont;
    if (!country) return '/' + cSlug;
    if (cont === 'sul' && (country.a2 === 'FR' || country.id === '250')) return '/' + cSlug + '/GF';
    if (cont === 'sul' && (country.id === '218-galapagos' || (country.a2 === 'EC' && (country.islandName || (state && state.islandName)))) ) return '/' + cSlug + '/218-galapagos';
    if (cont === 'oceania' && (country.id === '152-easter' || (country.a2 === 'CL' && (country.islandName || (state && state.islandName)))) ) return '/' + cSlug + '/152-easter';
    if (cont === 'oceania' && (country.id === '840-hawaii' || (country.a2 === 'US' && (country.islandName || (state && state.islandName)))) ) return '/' + cSlug + '/840-hawaii';
    var code = (country.a2 || country.id);
    return '/' + cSlug + '/' + code;
  }

  function go(cont, country, opts) {
    opts = opts || {};
    if (!opts.keepOrigin) {
      state.originRoute = opts.originRoute || null;
    }
    if (!opts.keepListMode) {
      state.viewMode = 'map';
    }
    setPanelCollapsed(!!opts.keepPanelClosed);
    var stageElCheck = mapWrapSection ? mapWrapSection.querySelector('.stage') : null;
    var wasHiddenMap = (mapWrapSection && mapWrapSection.hidden) || (stageElCheck && stageElCheck.hidden);
    var wasEditorialTemas = (state.editorialSection === 'temas');
    hideSpecialViews();
    if (wasEditorialTemas) {
      renderTemasHubsSection();
    }
    if (wasHiddenMap && state.viewMode === 'map') {
      fitAspect();
    }
    var contChanged = cont !== state.cont;
    var nextIsland = opts.islandName || (country && country.islandName) || null;
    var oceaniaSideChanged = cont === 'oceania' && (isEastOceania(country, nextIsland) !== isEastOceania(state.country, state.islandName));
    var easterChanged = cont === 'sul' && (isEasterIsland(country, nextIsland) !== isEasterIsland(state.country, state.islandName));
    var caribChanged = cont === 'central' && (isCaribIslandCountry(country, nextIsland) !== isCaribIslandCountry(state.country, state.islandName));
    if (cont !== 'central') {
      state.focusCaribe = false;
    }
    if (cont !== 'oceania') {
      state.focusEastOceania = false;
    }
    if (country !== state.country || contChanged) {
      state.bias = 'all';
      state.topic = null;
      state.pinnedOutlet = opts.pinnedOutlet || null;
      state.searchQuery = '';
      state.searchPeriod = '24h';
      state.searchLoading = false;
      state.searchData = null;
      state.searchError = '';
      if (activeSearchController) {
        try { activeSearchController.abort(); } catch (e) {}
      }
    } else if (opts.pinnedOutlet) {
      state.pinnedOutlet = opts.pinnedOutlet;
      state.bias = 'all';
    }
    var globalBusca = document.getElementById('busca');
    var globalBuscaLista = document.getElementById('busca-lista');
    if (globalBusca && globalBusca.value) {
      globalBusca.value = '';
      if (globalBuscaLista) globalBuscaLista.hidden = true;
      globalBusca.setAttribute('aria-expanded', 'false');
    }
    state.islandName = opts.islandName || (country && country.islandName) || null;
    state.islandFlag = opts.islandFlag || (country && country.islandFlag) || null;
    state.cont = cont; state.country = country;
    if (country) {
      var cCodeNav = (cont === 'sul' && (country.a2 === 'FR' || country.id === '250')) ? 'GF' : (country.a2 || country.id);
      carregarTopicosDinamicosSalvos(cCodeNav);
      var cMedNav = countryMedia(country, cont);
      var langNav = (cMedNav && cMedNav.lang) ? cMedNav.lang : 'pt';
      var outletsNav = (cMedNav && cMedNav.outlets) ? cMedNav.outlets : [];
      buscarTopicosEmAltaAoVivo(cCodeNav, langNav, outletsNav);
    }
    hideMobileChip();
    paintMap();
    render();
    if (typeof renderDossiesRotativosHome === 'function') renderDossiesRotativosHome();
    syncQuickRegionPills(true);
    var pulsandoTrackSync = document.getElementById('pulsando-agora-track');
    if (pulsandoTrackSync) {
      var curA2 = (country && country.a2) ? String(country.a2).toUpperCase() : '';
      pulsandoTrackSync.querySelectorAll('.pulsando-card').forEach(function (card) {
        card.classList.toggle('is-active', !!curA2 && card.getAttribute('data-country-iso') === curA2);
      });
    }
    if (opts.pinnedOutlet) {
      setTimeout(function () {
        var el = panel.querySelector('.outlet.is-pinned') || panel.querySelector('#veiculos');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (window.innerWidth <= 768) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    } else {
      panel.scrollTop = 0;
    }
    if (contChanged || oceaniaSideChanged || easterChanged || caribChanged) {
      setZoomedState(!!cont);
      applyZoom(true);
    }
    if (country && window.innerWidth <= 768) {
      showMobileChip(country, cont);
    }
    var targetPath = buildPath(cont, country);
    updateNavActive(cont ? null : '/');
    if (country) {
      var cName = countryDisplayName(country, cont);
      updateSeoMeta(cName + ' — Veículos e Perspectivas | Rodando o Mundo', 'Compare os veículos de comunicação e perspectivas editoriais de ' + cName + ' no Rodando o Mundo.', targetPath);
    } else if (cont && CONT[cont]) {
      updateSeoMeta(CONT[cont].n + ' — Rodando o Mundo', 'Explore os países e veículos de comunicação de ' + CONT[cont].n + ' no Rodando o Mundo.', targetPath);
    } else {
      updateSeoMeta(DEFAULT_TITLE, DEFAULT_DESC, '/');
    }
    if (!opts.fromPopState) {
      try {
        if (opts.replaceUrl) {
          history.replaceState({ cont: cont, country: country ? (country.a2 || country.id) : null }, '', targetPath);
        } else if (location.pathname !== targetPath || location.hash) {
          history.pushState({ cont: cont, country: country ? (country.a2 || country.id) : null }, '', targetPath);
        }
      } catch (e) {}
    }
  }

  function parseRoute(pathname, hash) {
    var legacyHash = false;
    var rawPath = pathname || '/';
    if (hash && hash.indexOf('#/') === 0) {
      rawPath = hash.replace(/^#/, '');
      legacyHash = true;
    } else if (hash === '#') {
      legacyHash = true;
    } else if (hash && hash.length > 1) {
      if (hash === '#colabore' || hash === '#sugestao' || hash === '#resumo-do-dia' || hash === '#temas-hubs' || hash === '#entenda-o-assunto' || hash === '#explorar-mapa' || hash === '#map-wrap-section') {
        // Âncoras internas de rolagem na página inicial
      } else if (rawPath === '/' || !rawPath || rawPath === '/index.html') {
        // Recuperação transparente de qualquer rota via hash (ex: #Sul, #sul, #/sul, #resumo-do-dia, #sul/BR)
        rawPath = '/' + hash.replace(/^#[!\/]*/, '');
        legacyHash = true;
      } else {
        // Rota já presente no pathname acompanhada de hash residual (ex: /Sul#Sul)
        legacyHash = true;
      }
    }

    var clean = rawPath.split('?')[0].replace(/\/index\.html$/i, '').replace(/^\/+|\/+$/g, '');
    if (!clean) {
      return { valid: true, type: 'map', cont: null, country: null, replaceUrl: legacyHash };
    }

    var normalizedRoute = '/' + clean.toLowerCase();
    if (normalizedRoute === '/comparar') {
      return { valid: true, type: 'comparar', compareSlug: null, replaceUrl: legacyHash };
    }
    if (normalizedRoute.indexOf('/comparar/') === 0) {
      var compSlug = normalizedRoute.replace('/comparar/', '').replace(/^\/+|\/+$/g, '');
      return { valid: true, type: 'comparar', compareSlug: compSlug, replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/radar' || normalizedRoute === '/radar-editorial') {
      return { valid: true, type: 'editorial-section', sectionKey: 'radar', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/ultimas-noticias' || normalizedRoute === '/ultimas' || normalizedRoute === '/noticias-brasil') {
      return { valid: true, type: 'editorial-section', sectionKey: 'ultimas-noticias', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/resumo-do-dia' || normalizedRoute === '/resumo') {
      return { valid: true, type: 'editorial-section', sectionKey: 'resumo-do-dia', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/temas' || normalizedRoute === '/temas-hubs' || normalizedRoute === '/dossies') {
      return {
        valid: true,
        type: 'editorial-section',
        sectionKey: 'temas',
        routePath: (normalizedRoute === '/dossies') ? '/dossies' : '/temas',
        replaceUrl: legacyHash
      };
    }
    if (normalizedRoute === '/entenda' || normalizedRoute === '/entenda-o-assunto') {
      return { valid: true, type: 'editorial-section', sectionKey: 'entenda', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/cadastrar-veiculo' || normalizedRoute === '/cadastrar-veicolo' || normalizedRoute === '/cadastro-veiculo') {
      return { valid: true, type: 'editorial-section', sectionKey: 'cadastrar-veiculo', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/metodologia' || normalizedRoute === '/criterios' || normalizedRoute === '/criterios-editoriais' || normalizedRoute === '/transparencia') {
      return { valid: true, type: 'editorial-section', sectionKey: 'metodologia', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/privacidade' || normalizedRoute === '/politica-de-privacidade' || normalizedRoute === '/lgpd') {
      return { valid: true, type: 'editorial-section', sectionKey: 'privacidade', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/termos' || normalizedRoute === '/termos-de-uso' || normalizedRoute === '/termos-e-condicoes') {
      return { valid: true, type: 'editorial-section', sectionKey: 'termos', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/parcerias' || normalizedRoute === '/anuncie' || normalizedRoute === '/midia-kit' || normalizedRoute === '/anunciar' || normalizedRoute === '/patrocinio') {
      return { valid: true, type: 'editorial-section', sectionKey: 'parcerias', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/aplicacao-parceiros' || normalizedRoute === '/aplicacao-parceria') {
      return { valid: true, type: 'editorial-section', sectionKey: 'aplicacao-parceiros', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/clube' || normalizedRoute === '/membros' || normalizedRoute === '/clube-de-membros' || normalizedRoute === '/apoiador' || normalizedRoute === '/apoiar') {
      return { valid: true, type: 'editorial-section', sectionKey: 'clube', replaceUrl: legacyHash };
    }
    if (normalizedRoute === '/politica') {
      return { valid: true, type: 'hub', hubRoute: '/politica/brasil', replaceUrl: true };
    }
    if (normalizedRoute === '/economia') {
      return { valid: true, type: 'hub', hubRoute: '/economia/brasil', replaceUrl: true };
    }
    if (EDITORIAL.paginasTematicas && EDITORIAL.paginasTematicas[normalizedRoute]) {
      return { valid: true, type: 'hub', hubRoute: normalizedRoute, replaceUrl: legacyHash };
    }

    var segs = clean.split('/');
    if (segs.length === 2 && segs[0].toLowerCase() === 'dossies') {
      var dossieSlug = decodeURIComponent(segs[1]).toLowerCase();
      return { valid: true, type: 'dossie-detail', slug: dossieSlug, replaceUrl: legacyHash };
    }
    if (segs.length === 2 && segs[0].toLowerCase() === 'entenda') {
      var slug = decodeURIComponent(segs[1]).toLowerCase();
      if (EDITORIAL.explicacoes && EDITORIAL.explicacoes[slug]) {
        return { valid: true, type: 'entenda', slug: slug, replaceUrl: legacyHash };
      }
      return { valid: false, badPath: rawPath };
    }

    if (segs.length === 1) {
      var cKey = decodeURIComponent(segs[0]).toLowerCase();
      if (CONT[cKey]) {
        return { valid: true, type: 'map', cont: cKey, country: null, replaceUrl: legacyHash };
      }
      return { valid: false, badPath: rawPath };
    }

    if (segs.length === 2) {
      var cKey2 = decodeURIComponent(segs[0]).toLowerCase();
      var rawCode = decodeURIComponent(segs[1]);
      var upperCode = rawCode.toUpperCase();
      if (!CONT[cKey2]) return { valid: false, badPath: rawPath };

      var country = null;
      if (cKey2 === 'sul' && upperCode === 'GF') {
        country = byA2['FR'] || byId['250'] || null;
      } else if (cKey2 === 'sul' && (upperCode === 'EC-W' || rawCode === '218-galapagos')) {
        country = byId['218-galapagos'] || byA2['EC'] || null;
      } else if (cKey2 === 'oceania' && (upperCode === 'CL' || rawCode === '152-easter')) {
        country = byId['152-easter'] || byA2['CL'] || null;
      } else if (cKey2 === 'oceania' && (upperCode === 'US' || rawCode === '840-hawaii')) {
        country = byId['840-hawaii'] || byA2['US'] || null;
      } else {
        country = byA2[upperCode] || byId[rawCode] || null;
      }
      if (country && (inCont(country, cKey2) || (cKey2 === 'oceania' && (country.a2 === 'CL' || country.a2 === 'US')))) {
        return { valid: true, type: 'map', cont: cKey2, country: country, replaceUrl: legacyHash };
      }
      if (country && cKey2 === 'norte' && inCont(country, 'central')) {
        return { valid: true, type: 'map', cont: 'central', country: country, replaceUrl: true };
      }
      return { valid: false, badPath: rawPath };
    }

    return { valid: false, badPath: rawPath };
  }

  function navigateSpa(href) {
    var u;
    try { u = new URL(href, location.origin); } catch (e) { return; }
    if (u.pathname === '/' && u.hash && (u.hash === '#colabore' || u.hash === '#sugestao' || u.hash === '#resumo-do-dia' || u.hash === '#temas-hubs' || u.hash === '#entenda-o-assunto' || u.hash === '#explorar-mapa' || u.hash === '#map-wrap-section') && document.querySelector(u.hash)) {
      if (state.hubRoute || state.entendaSlug || state.editorialSection || state.notFound || state.compareSlug) {
        go(null, null);
        fitAspect();
      }
      var targetEl = document.querySelector(u.hash);
      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var parsed = parseRoute(u.pathname, u.hash);
    if (!parsed.valid) {
      showNotFound(u.pathname);
      return;
    }
    if (parsed.type === 'comparar') {
      showComparisonPage(parsed.compareSlug, { fromPopState: false });
      return;
    }
    if (parsed.type === 'editorial-section') {
      var secOpts = { fromPopState: false, routePath: parsed.routePath };
      if (parsed.sectionKey === 'radar') {
        secOpts.radarTab = (u.hash === '#curadoria' ? 'curadoria' : 'radar');
      }
      showEditorialSectionPage(parsed.sectionKey, secOpts);
      return;
    }
    if (parsed.type === 'dossie-detail') {
      showDossieDetail(parsed.slug, { fromPopState: false });
      return;
    }
    if (parsed.type === 'hub') {
      showThematicHub(parsed.hubRoute, { fromPopState: false });
      return;
    }
    if (parsed.type === 'entenda') {
      showExplanationPage(parsed.slug, { fromPopState: false });
      return;
    }
    go(parsed.cont, parsed.country, { fromPopState: false });
    fitAspect();
  }

  function fromLocation() {
    var parsed = parseRoute(location.pathname, location.hash);
    if (!parsed.valid) {
      showNotFound(parsed.badPath);
      return;
    }
    if (parsed.type === 'comparar') {
      showComparisonPage(parsed.compareSlug, { fromPopState: !parsed.replaceUrl, replaceUrl: parsed.replaceUrl });
      return;
    }
    if (parsed.type === 'editorial-section') {
      var secOpts2 = { fromPopState: !parsed.replaceUrl, replaceUrl: parsed.replaceUrl, routePath: parsed.routePath };
      if (parsed.sectionKey === 'radar') {
        secOpts2.radarTab = (location.hash === '#curadoria' ? 'curadoria' : 'radar');
      }
      showEditorialSectionPage(parsed.sectionKey, secOpts2);
      return;
    }
    if (parsed.type === 'dossie-detail') {
      showDossieDetail(parsed.slug, { fromPopState: !parsed.replaceUrl, replaceUrl: parsed.replaceUrl });
      return;
    }
    if (parsed.type === 'hub') {
      showThematicHub(parsed.hubRoute, { fromPopState: !parsed.replaceUrl, replaceUrl: parsed.replaceUrl });
      return;
    }
    if (parsed.type === 'entenda') {
      showExplanationPage(parsed.slug, { fromPopState: !parsed.replaceUrl, replaceUrl: parsed.replaceUrl });
      return;
    }
    go(parsed.cont, parsed.country, {
      fromPopState: !parsed.replaceUrl,
      replaceUrl: parsed.replaceUrl
    });
  }
  window.addEventListener('popstate', function () { fromLocation(); });

  // C3: Clicar na logo ou no botão Início retorna ao início (/); links [data-spa-link] navegam na SPA
  document.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented) return;
    if (e.button !== 0) return;

    var target = e.target;

    var goBackBtn = target && target.closest ? target.closest('[data-action="go-back"]') : null;
    if (goBackBtn) {
      e.preventDefault();
      var fb = goBackBtn.getAttribute('data-fallback') || '/';
      handleSmartBack(fb);
      return;
    }

    var homeBtn = target && target.closest ? target.closest('[data-home]') : null;
    if (homeBtn) {
      e.preventDefault();
      state.viewMode = 'map';
      hideSpecialViews();
      setZoomedState(false);
      avisoGestoExibido = false;
      go(null, null);
      fitAspect();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    var link = target && target.closest ? target.closest('a[data-spa-link]') : null;
    if (!link) return;

    var href = link.getAttribute('href');
    if (!href || href.indexOf('http') === 0 || href.indexOf('//') === 0 || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;

    e.preventDefault();
    navigateSpa(href);
  });

  /* ---------- search autocomplete ---------- */
  var input = document.getElementById('busca'), sl = document.getElementById('busca-lista'), cur = -1, results = [];
  function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

  var SEARCH_INDEX = null;
  function getSearchIndex() {
    if (SEARCH_INDEX) return SEARCH_INDEX;
    var allCountries = DATA.countries.slice();
    // Territórios e ilhas com soberania entre parênteses pesquisáveis
    allCountries.push({
      id: '250',
      a2: 'FR',
      flagCode: 'gf',
      n: 'Guiana Francesa (França)',
      c: 'sul',
      m: DATA.media['GF']
    });
    allCountries.push({
      id: '840-hawaii',
      a2: 'US',
      flagCode: 'us',
      n: 'Havaí (Estados Unidos)',
      c: 'oceania',
      islandName: 'Havaí (Estados Unidos)',
      islandFlag: 'us',
      m: byA2['US'] ? byA2['US'].m : null,
      orig: byA2['US']
    });
    allCountries.push({
      id: '724-canarias',
      a2: 'ES',
      flagCode: 'es',
      n: 'Ilhas Canárias (Espanha)',
      c: 'africa',
      islandName: 'Ilhas Canárias (Espanha)',
      islandFlag: 'es',
      m: byA2['ES'] ? byA2['ES'].m : null,
      orig: byA2['ES']
    });
    allCountries.push({
      id: '152-easter',
      a2: 'CL',
      flagCode: 'cl',
      n: 'Ilha de Páscoa (Chile)',
      c: 'oceania',
      islandName: 'Ilha de Páscoa (Chile)',
      islandFlag: 'cl',
      m: byA2['CL'] ? byA2['CL'].m : null,
      orig: byA2['CL']
    });
    allCountries.push({
      id: '218-galapagos',
      a2: 'EC',
      flagCode: 'ec',
      n: 'Ilhas Galápagos (Equador)',
      c: 'sul',
      islandName: 'Ilhas Galápagos (Equador)',
      islandFlag: 'ec',
      m: byA2['EC'] ? byA2['EC'].m : null,
      orig: byA2['EC']
    });
    allCountries.push({
      id: '250-mayotte',
      a2: 'FR',
      flagCode: 'yt',
      n: 'Mayotte (França)',
      c: 'africa',
      islandName: 'Mayotte (França)',
      islandFlag: 'yt',
      m: null,
      orig: byA2['FR']
    });
    allCountries.push({
      id: '250-reunion',
      a2: 'FR',
      flagCode: 're',
      n: 'Reunião (França)',
      c: 'africa',
      islandName: 'Reunião (França)',
      islandFlag: 're',
      m: null,
      orig: byA2['FR']
    });
    allCountries.push({
      id: '250-guadeloupe',
      a2: 'FR',
      flagCode: 'gp',
      n: 'Guadalupe (França)',
      c: 'central',
      islandName: 'Guadalupe (França)',
      islandFlag: 'gp',
      m: null,
      orig: byA2['FR']
    });
    allCountries.push({
      id: '250-martinique',
      a2: 'FR',
      flagCode: 'mq',
      n: 'Martinica (França)',
      c: 'central',
      islandName: 'Martinica (França)',
      islandFlag: 'mq',
      m: null,
      orig: byA2['FR']
    });
    allCountries.push({
      id: '528-bonaire',
      a2: 'NL',
      flagCode: 'bq',
      n: 'Bonaire (Países Baixos)',
      c: 'central',
      islandName: 'Bonaire (Países Baixos)',
      islandFlag: 'bq',
      m: null,
      orig: byA2['NL']
    });
    allCountries.push({
      id: '528-st-eustatius',
      a2: 'NL',
      flagCode: 'bq',
      n: 'Santo Eustáquio (Países Baixos)',
      c: 'central',
      islandName: 'Santo Eustáquio (Países Baixos)',
      islandFlag: 'bq',
      m: null,
      orig: byA2['NL']
    });
    allCountries.push({
      id: '528-saba',
      a2: 'NL',
      flagCode: 'bq',
      n: 'Saba (Países Baixos)',
      c: 'central',
      islandName: 'Saba (Países Baixos)',
      islandFlag: 'bq',
      m: null,
      orig: byA2['NL']
    });

    var items = [];
    var seenOutlets = {};

    allCountries.forEach(function (c) {
      items.push({
        type: 'country',
        n: c.n,
        norm: norm(c.n),
        clean: norm(c.n).replace(/[^a-z0-9]/g, ''),
        a2: (c.a2 || '').toLowerCase(),
        country: c
      });

      var med = c.m || (c.a2 && DATA.media[c.a2]) || DATA.media[c.id];
      if (med && Array.isArray(med.outlets)) {
        med.outlets.forEach(function (o) {
          if (!o || !o.n) return;
          var key = (c.a2 || c.id || c.n) + '::' + o.n;
          if (seenOutlets[key]) return;
          seenOutlets[key] = true;
          var oHost = '';
          if (o.u) {
            try { oHost = new URL(o.u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) {}
          }
          items.push({
            type: 'outlet',
            n: o.n,
            norm: norm(o.n),
            clean: norm(o.n).replace(/[^a-z0-9]/g, ''),
            host: oHost,
            outlet: o,
            country: c
          });
        });
      }
    });

    if (Array.isArray(dossiesState.all) && dossiesState.all.length) {
      dossiesState.all.forEach(function (d) {
        if (!d || !d.slug || !d.titulo) return;
        var kws = (d.regras_classificacao && Array.isArray(d.regras_classificacao.palavras_chave))
          ? d.regras_classificacao.palavras_chave.join(' ')
          : '';
        items.push({
          type: 'dossie',
          n: d.titulo,
          norm: norm(d.titulo),
          clean: norm(d.titulo).replace(/[^a-z0-9]/g, ''),
          subNorm: norm(d.subtitulo || ''),
          catNorm: norm(d.categoria || ''),
          kwNorm: norm(kws),
          dossie: d
        });
      });
    }

    SEARCH_INDEX = items;
    return SEARCH_INDEX;
  }

  function openList(q) {
    var rawQuery = (q || '').trim();
    q = norm(rawQuery);
    if (!q) { sl.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }

    var qClean = q.replace(/[^a-z0-9]/g, '');
    var qTokens = q.split(/\s+/).filter(function (tk) { return tk.length >= 2; });
    var items = getSearchIndex();

    results = items.filter(function (it) {
      if (it.norm.indexOf(q) > -1) return true;
      if (qClean && it.clean && it.clean.indexOf(qClean) > -1) return true;
      if (it.type === 'country' && it.a2 && it.a2 === q) return true;
      if (it.type === 'outlet' && it.host && it.host.indexOf(q) > -1) return true;
      if (it.type === 'dossie') {
        if (it.subNorm && it.subNorm.indexOf(q) > -1) return true;
        if (it.catNorm && it.catNorm.indexOf(q) > -1) return true;
        if (it.kwNorm && it.kwNorm.indexOf(q) > -1) return true;
      }
      return combinaTextoFuzzy(it.n, q, qTokens);
    }).sort(function (a, b) {
      var aExact = a.norm === q ? 0 : 1;
      var bExact = b.norm === q ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      var as = a.norm.indexOf(q) === 0 ? 0 : 1;
      var bs = b.norm.indexOf(q) === 0 ? 0 : 1;
      if (as !== bs) return as - bs;

      var aContains = a.norm.indexOf(q) > -1 ? 0 : 1;
      var bContains = b.norm.indexOf(q) > -1 ? 0 : 1;
      if (aContains !== bContains) return aContains - bContains;

      if (a.type !== b.type) {
        if (a.type === 'country' && a.norm.indexOf(q) === 0) return -1;
        if (b.type === 'country' && b.norm.indexOf(q) === 0) return 1;
      }
      return a.n.localeCompare(b.n, 'pt');
    }).slice(0, 8);

    if (rawQuery.length >= 2) {
      var targetCountry = state.country || byA2['BR'] || DATA.countries[0];
      var targetCont = (targetCountry && targetCountry.c) || state.cont || 'sul';
      var targetCountryName = targetCountry ? countryDisplayName(targetCountry, targetCont) : 'Brasil';
      results.push({
        type: 'topic_search',
        query: rawQuery,
        country: targetCountry,
        countryName: targetCountryName,
        cont: targetCont
      });
    }

    cur = results.length ? 0 : -1;
    sl.innerHTML = results.length ? results.map(function (it, i) {
      if (it.type === 'topic_search') {
        return '<li role="option" id="opt-' + i + '" class="search-item-topic-action" aria-selected="' + (i === cur) + '" data-i="' + i + '">' +
          '<div class="search-item-main"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:8px;vertical-align:-2px;flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span class="search-item-name">Comparar notícias sobre <strong>“' + esc(it.query) + '”</strong></span></div>' +
          '<small><span class="search-type-pill is-topic">Assunto</span> em ' + esc(it.countryName) + '</small></li>';
      }
      if (it.type === 'dossie') {
        var d = it.dossie;
        var dIcon = renderDossieIconHtml(d);
        var dCat = d.categoria ? ' · ' + esc(d.categoria) : '';
        var dTipoLabel = d.tipo === 'especial' ? 'Especial' : 'Dossiê';
        return '<li role="option" id="opt-' + i + '" aria-selected="' + (i === cur) + '" data-i="' + i + '">' +
          '<div class="search-item-main">' + dIcon + '<span class="search-item-name">' + esc(it.n) + '</span></div>' +
          '<small><span class="search-type-pill is-dossie">' + dTipoLabel + '</span>' + dCat + '</small></li>';
      }
      var c = it.country;
      var flagImg = countryFlag(c, 'flag-sm', c.c) || '<span class="flag-placeholder flag-sm"></span>';
      var isOutlet = it.type === 'outlet';
      var metaHtml = isOutlet
        ? '<span class="search-type-pill is-outlet">Veículo</span> ' + esc(countryDisplayName(c, c.c))
        : esc(CONT[c.c] ? CONT[c.c].short : '') + (c.m && c.m.outlets ? ' · ' + c.m.outlets.length + ' veículos' : '');
      return '<li role="option" id="opt-' + i + '" aria-selected="' + (i === cur) + '" data-i="' + i + '">' +
        '<div class="search-item-main">' + flagImg + '<span class="search-item-name">' + esc(it.n) + '</span></div>' +
        '<small>' + metaHtml + '</small></li>';
    }).join('') : '<li class="empty">Nenhum país ou veículo encontrado</li>';
    sl.hidden = false; input.setAttribute('aria-expanded', 'true');
  }

  function pick(i) {
    var it = results[i]; if (!it) return;
    input.value = ''; sl.hidden = true; input.setAttribute('aria-expanded', 'false'); input.blur();
    if (it.type === 'dossie') {
      navigateSpa('/dossies/' + encodeURIComponent(it.dossie.slug));
      return;
    }
    if (it.type === 'topic_search') {
      var cObj = it.country;
      var realCountryObj = cObj.orig || byA2[cObj.a2] || byId[cObj.id] || cObj;
      go(it.cont, realCountryObj);
      setTimeout(function () {
        var inputTopic = panel.querySelector('#topic-search-input');
        if (inputTopic) inputTopic.value = it.query;
        var clearEl = panel.querySelector('#topic-search-clear');
        if (clearEl) clearEl.hidden = false;
        var wrap = panel.querySelector('#busca-assunto-wrap');
        if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
        executeTopicSearch(it.query);
      }, 200);
      return;
    }
    var c = it.country;
    var realCountry = c.orig || byA2[c.a2] || byId[c.id] || c;
    if (it.type === 'outlet') {
      go(c.c, realCountry, {
        islandName: c.islandName,
        islandFlag: c.islandFlag,
        pinnedOutlet: it.outlet.n
      });
    } else {
      go(c.c, realCountry, {
        islandName: c.islandName,
        islandFlag: c.islandFlag
      });
    }
  }
  input.addEventListener('focus', function () { this.select(); });
  input.addEventListener('input', function () { openList(input.value); });
  input.addEventListener('keydown', function (e) {
    if (sl.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      sl.querySelectorAll('li[data-i]').forEach(function (li, i) { li.setAttribute('aria-selected', String(i === cur)); });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(cur >= 0 ? cur : (results.length ? 0 : -1));
    }
    else if (e.key === 'Escape') { sl.hidden = true; }
  });
  sl.addEventListener('touchstart', function (e) {
    var li = e.target.closest('li[data-i]');
    if (li) {
      e.preventDefault();
      pick(+li.getAttribute('data-i'));
    }
  }, { passive: false });
  sl.addEventListener('mousedown', function (e) { var li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(+li.getAttribute('data-i')); } });
  input.addEventListener('blur', function () { setTimeout(function () { sl.hidden = true; }, 280); });

  document.querySelectorAll('[data-scroll]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      if (state.hubRoute || state.entendaSlug || state.editorialSection || state.notFound) {
        go(null, null);
      }
      var t = document.querySelector(a.getAttribute('href'));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.cont && document.activeElement !== input) go(null, null);
  });

  /* ---------- abas de apoio & cópia do PIX ---------- */
  (function setupSupportSection() {
    var tabPix = document.getElementById('tab-pix');
    var tabPaypal = document.getElementById('tab-paypal');
    var panelPix = document.getElementById('panel-pix');
    var panelPaypal = document.getElementById('panel-paypal');
    var btnCopyPix = document.getElementById('btn-copy-pix');
    var pixInput = document.getElementById('pix-copy-input');
    var pixFeedback = document.getElementById('pix-feedback-msg');
    var btnTogglePixInfo = document.getElementById('btn-toggle-pix-info');
    var pixBeneficiaryDetails = document.getElementById('pix-beneficiary-details');

    function activateSupportTab(activeTab, inactiveTab, activePanel, inactivePanel) {
      activeTab.classList.add('is-active');
      activeTab.setAttribute('aria-selected', 'true');
      inactiveTab.classList.remove('is-active');
      inactiveTab.setAttribute('aria-selected', 'false');
      activePanel.removeAttribute('hidden');
      activePanel.classList.add('is-active');
      inactivePanel.setAttribute('hidden', '');
      inactivePanel.classList.remove('is-active');
    }

    if (tabPix && tabPaypal && panelPix && panelPaypal) {
      tabPix.addEventListener('click', function () {
        activateSupportTab(tabPix, tabPaypal, panelPix, panelPaypal);
      });

      tabPaypal.addEventListener('click', function () {
        activateSupportTab(tabPaypal, tabPix, panelPaypal, panelPix);
      });
    }

    if (btnTogglePixInfo && pixBeneficiaryDetails) {
      btnTogglePixInfo.addEventListener('click', function () {
        var isHidden = pixBeneficiaryDetails.hasAttribute('hidden');
        if (isHidden) {
          pixBeneficiaryDetails.removeAttribute('hidden');
        } else {
          pixBeneficiaryDetails.setAttribute('hidden', '');
        }
        var isRevealed = isHidden;
        btnTogglePixInfo.classList.toggle('is-revealed', isRevealed);
        btnTogglePixInfo.setAttribute('aria-expanded', isRevealed ? 'true' : 'false');
        btnTogglePixInfo.setAttribute(
          'aria-label',
          isRevealed ? 'Ocultar dados do favorecido do PIX' : 'Mostrar dados do favorecido do PIX'
        );
        var labelSpan = btnTogglePixInfo.querySelector('.pix-toggle-label');
        if (labelSpan) {
          labelSpan.textContent = isRevealed ? 'Ocultar dados' : 'Ver dados do favorecido';
        }
      });
    }

    if (btnCopyPix && pixInput) {
      var copyTimer = null;
      btnCopyPix.addEventListener('click', function () {
        var textToCopy = pixInput.value.trim();

        function handleCopied() {
          btnCopyPix.classList.add('copied');
          var textSpan = btnCopyPix.querySelector('.copy-btn-text');
          if (textSpan) textSpan.textContent = 'Código PIX Copiado! ✓';
          if (pixFeedback) pixFeedback.textContent = 'Chave copiada! Cole no aplicativo do seu banco para transferir.';
          clearTimeout(copyTimer);
          copyTimer = setTimeout(function () {
            btnCopyPix.classList.remove('copied');
            if (textSpan) textSpan.textContent = 'Copiar código PIX';
            if (pixFeedback) pixFeedback.textContent = '';
          }, 4000);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(handleCopied).catch(function () {
            pixInput.select();
            document.execCommand('copy');
            handleCopied();
          });
        } else {
          pixInput.select();
          document.execCommand('copy');
          handleCopied();
        }
      });
    }
  })();

  /* ---------- abas de compliance (Privacidade & Termos) ---------- */
  (function setupComplianceSection() {
    var tabPriv = document.getElementById('tab-legal-privacidade');
    var tabTerm = document.getElementById('tab-legal-termos');
    if (tabPriv) {
      tabPriv.addEventListener('click', function () {
        setComplianceTab('privacidade');
        try { history.pushState({ editorialSection: 'privacidade' }, '', '/privacidade'); } catch (e) {}
        updateSeoMeta('Política de Privacidade (LGPD) | Rodando o Mundo', 'Conheça nossa política de conformidade com a LGPD e uso de dados no Rodando o Mundo.', '/privacidade');
        updateNavActive('/privacidade');
      });
    }
    if (tabTerm) {
      tabTerm.addEventListener('click', function () {
        setComplianceTab('termos');
        try { history.pushState({ editorialSection: 'termos' }, '', '/termos'); } catch (e) {}
        updateSeoMeta('Termos de Uso do Atlas | Rodando o Mundo', 'Termos e diretrizes de uso, direitos autorais e isenção de responsabilidade do Rodando o Mundo.', '/termos');
        updateNavActive('/termos');
      });
    }
  })();

  /* ---------- sugestão & formulários unificados (/api/contato no Cloudflare Pages + fallback FormSubmit) ---------- */
  var FB_ENDPOINT = 'https://formsubmit.co/ajax/rodandoomundoprojeto@gmail.com';

  function enviarDadosFormulario(payload) {
    // 1º Tenta a rota /api/contato no Cloudflare Pages Functions
    return fetch('/api/contato', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function (r) {
      if (r.ok) {
        return r.json().catch(function () { return { ok: true }; }).then(function (j) {
          if (j && j.ok !== false) return { ok: true, via: 'api' };
          throw new Error('Retorno inválido de /api/contato');
        });
      }
      throw new Error('HTTP ' + r.status);
    })
    .catch(function () {
      // 2º Se a API interna falhar, tenta FormSubmit via AJAX direto
      return fetch(FB_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (r.ok && String(j.success) !== 'false') return { ok: true, via: 'formsubmit' };
          throw new Error('Falha FormSubmit');
        });
      });
    });
  }

  var form = document.getElementById('fb-form');
  var fbStatus = document.getElementById('fb-status');
  var fbMsg = document.getElementById('fb-msg');
  var fbSend = document.getElementById('fb-send');
  function setStatus(t, cls) { fbStatus.textContent = t; fbStatus.className = 'fb-status' + (cls ? ' ' + cls : ''); }
  if (fbMsg) {
    fbMsg.addEventListener('input', function () { fbMsg.removeAttribute('aria-invalid'); if (fbStatus.classList.contains('err')) setStatus(''); });
  }

  function fallbackPost(payload) {
    if (form) form.reset();
    var cadForm = document.getElementById('cad-veiculo-form');
    if (cadForm) cadForm.reset();
    var parcForm = document.getElementById('parcerias-form');
    if (parcForm) parcForm.reset();
    setStatus('Mensagem recebida com sucesso! Obrigado pelo retorno.', 'ok');
    var cadStatus = document.getElementById('cad-veiculo-status');
    if (cadStatus) {
      cadStatus.innerHTML = 'Recebemos sua solicitação! Entraremos em contato pelo e-mail informado.';
      cadStatus.className = 'cad-status active ok';
    }
    var parcStatus = document.getElementById('parc-status');
    if (parcStatus) {
      parcStatus.innerHTML = 'Recebemos sua proposta! Entraremos em contato em breve.';
      parcStatus.className = 'cad-status active ok';
    }
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      if (fd.get('_honey')) return;
      var msgVal = String(fd.get('mensagem') || '').trim();
      if (msgVal.length < 5) {
        fbMsg.setAttribute('aria-invalid', 'true'); fbMsg.focus();
        setStatus('Escreva sua sugestão antes de enviar.', 'err'); return;
      }
      var emailVal = String(fd.get('email') || '').trim();
      if (emailVal && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)) { setStatus('Confira o e-mail informado.', 'err'); return; }
      var payload = {
        _subject: 'Rodando o Mundo — Sugestão',
        _template: 'table',
        _captcha: 'false',
        Nota: fd.get('nota') ? fd.get('nota') + ' de 5' : 'não informada',
        Nome: fd.get('nome') || 'anônimo',
        'Sugestão': msgVal,
        'Aberto no mapa': state.country ? countryDisplayName(state.country, state.cont) : (state.cont ? CONT[state.cont].n : 'Mundo')
      };
      if (emailVal) { payload.email = emailVal; payload._replyto = emailVal; }
      fbSend.disabled = true; fbSend.textContent = 'Enviando…'; setStatus('');
      enviarDadosFormulario(payload)
        .then(function () {
          form.reset();
          setStatus('Obrigado. Sua sugestão foi enviada.', 'ok');
        })
        .catch(function () {
          form.reset();
          setStatus('Obrigado pelo retorno! Se desejar, fale conosco em rodandoomundoprojeto@gmail.com.', 'ok');
        })
        .then(function () { fbSend.disabled = false; fbSend.textContent = 'Enviar'; });
    });
  }

  /* ---------- cadastro de veículo independente (SUG-31) ---------- */
  function initCadastroVeiculoForm() {
    var cadForm = document.getElementById('cad-veiculo-form');
    if (!cadForm) return;

    var cadStatus = document.getElementById('cad-veiculo-status');
    var cadSubmit = document.getElementById('cad-veiculo-submit');
    var descEl = document.getElementById('cad-veiculo-desc');
    var counterEl = document.getElementById('cad-desc-counter');
    var radioGroup = cadForm.querySelectorAll('input[name="e_responsavel"]');
    var relacaoInput = document.getElementById('cad-relacao-detalhe');
    var relacaoReq = document.getElementById('cad-relacao-req');
    var paisSelect = document.getElementById('cad-veiculo-pais');

    function setCadStatus(msg, type) {
      if (!cadStatus) return;
      if (!msg) {
        cadStatus.textContent = '';
        cadStatus.className = 'cad-status';
        return;
      }
      cadStatus.innerHTML = msg;
      cadStatus.className = 'cad-status active ' + (type || 'ok');
      cadStatus.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Atualizar contador de caracteres
    if (descEl && counterEl) {
      descEl.addEventListener('input', function () {
        var len = descEl.value.length;
        counterEl.textContent = len + ' / 2500 caracteres';
        if (cadStatus.classList.contains('err')) setCadStatus('');
      });
    }

    // Toggle e foco para o campo de relação com o veículo
    radioGroup.forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (radio.value === 'nao_responsavel') {
          if (relacaoReq) relacaoReq.hidden = false;
          if (relacaoInput) {
            relacaoInput.setAttribute('required', 'true');
            relacaoInput.focus();
          }
        } else {
          if (relacaoReq) relacaoReq.hidden = true;
          if (relacaoInput) relacaoInput.removeAttribute('required');
        }
        if (cadStatus.classList.contains('err')) setCadStatus('');
      });
    });

    // Preencher select de países com países de DATA.countries caso disponíveis
    if (paisSelect && typeof DATA !== 'undefined' && Array.isArray(DATA.countries)) {
      var existingVals = {};
      Array.from(paisSelect.options).forEach(function (opt) { existingVals[opt.value.toLowerCase()] = true; });
      var extraCountries = DATA.countries.filter(function (c) {
        return c && c.n && !existingVals[c.n.toLowerCase()];
      }).sort(function (a, b) {
        return a.n.localeCompare(b.n, 'pt-BR');
      });
      extraCountries.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.n;
        opt.textContent = c.n;
        paisSelect.appendChild(opt);
      });
    }

    // Envio do formulário com validação detalhada
    cadForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(cadForm);
      if (fd.get('_honey')) return; // Anti-spam

      var nome = String(fd.get('nome_solicitante') || '').trim();
      if (nome.length < 3) {
        setCadStatus('Por favor, informe seu nome completo.', 'err');
        var el = document.getElementById('cad-nome');
        if (el) el.focus();
        return;
      }

      var email = String(fd.get('email_solicitante') || '').trim();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        setCadStatus('Por favor, informe um endereço de e-mail válido para que possamos responder.', 'err');
        var elEmail = document.getElementById('cad-email');
        if (elEmail) elEmail.focus();
        return;
      }

      var eResponsavel = fd.get('e_responsavel');
      if (!eResponsavel) {
        setCadStatus('Por favor, informe se você é dono(a) / responsável pelo jornal ou leitor(a) indicando.', 'err');
        var elRadio = cadForm.querySelector('input[name="e_responsavel"]');
        if (elRadio) elRadio.focus();
        return;
      }

      var relacaoDetalhe = String(fd.get('relacao_detalhe') || '').trim();
      if (eResponsavel === 'nao_responsavel' && relacaoDetalhe.length < 3) {
        setCadStatus('Como você indicou não ser dono nem responsável, informe brevemente qual a sua relação com o veículo.', 'err');
        if (relacaoInput) relacaoInput.focus();
        return;
      }

      var veiculoNome = String(fd.get('nome_veiculo') || '').trim();
      if (veiculoNome.length < 2) {
        setCadStatus('Por favor, informe o nome do veículo ou jornal.', 'err');
        var elVNome = document.getElementById('cad-veiculo-nome');
        if (elVNome) elVNome.focus();
        return;
      }

      var veiculoUrl = String(fd.get('url_veiculo') || '').trim();
      if (veiculoUrl.length < 4 || !veiculoUrl.includes('.')) {
        setCadStatus('Por favor, informe a URL ou link completo do site do veículo (ex: https://meusite.com.br).', 'err');
        var elVUrl = document.getElementById('cad-veiculo-url');
        if (elVUrl) elVUrl.focus();
        return;
      }

      var regiao = String(fd.get('regiao_veiculo') || '').trim();
      if (regiao.length < 2) {
        setCadStatus('Por favor, informe a cidade, estado ou região de atuação do veículo.', 'err');
        var elRegiao = document.getElementById('cad-veiculo-cidade');
        if (elRegiao) elRegiao.focus();
        return;
      }

      var desc = String(fd.get('descricao_veiculo') || '').trim();
      if (desc.length < 15) {
        setCadStatus('Por favor, escreva uma breve descrição do veículo e de sua linha editorial (mínimo de 15 caracteres).', 'err');
        if (descEl) descEl.focus();
        return;
      }

      if (!fd.get('aceite_termos')) {
        setCadStatus('Por favor, marque a caixa confirmando a veracidade das informações e o compromisso ético.', 'err');
        var elTermos = document.getElementById('cad-termos');
        if (elTermos) elTermos.focus();
        return;
      }

      var mapResponsavelLabels = {
        dono_fundador: 'Sim (Dono/Fundador/Sócio)',
        editor_jornalista: 'Sim (Editor-chefe / Jornalista responsável)',
        equipe_redacao: 'Sim (Membro da equipe / Redação)',
        nao_responsavel: 'Não (Leitor / Colaborador / Fã indicando)'
      };

      var temas = fd.getAll('temas');

      var payload = {
        _subject: 'Rodando o Mundo — Novo Cadastro de Veículo: ' + veiculoNome,
        _template: 'table',
        _captcha: 'false',
        'Nome do Solicitante': nome,
        'E-mail': email,
        'Telefone / WhatsApp': String(fd.get('telefone_solicitante') || 'Não informado').trim(),
        'Cargo no Veículo': String(fd.get('cargo_solicitante') || 'Não informado').trim(),
        'É Dono ou Responsável?': mapResponsavelLabels[eResponsavel] || eResponsavel,
        'Relação com o Veículo': (eResponsavel === 'nao_responsavel') ? relacaoDetalhe : 'Responsável direto pelo veículo',
        'Nome do Veículo': veiculoNome,
        'URL do Site': veiculoUrl,
        'Feed RSS': String(fd.get('rss_veiculo') || 'Não informado').trim(),
        'País Sede': String(fd.get('pais_veiculo') || 'Brasil'),
        'Cidade / Região': regiao,
        'Escopo Geográfico': String(fd.get('escopo_veiculo') || 'Regional'),
        'Tipo Editorial': String(fd.get('perfil_veiculo') || 'Independente'),
        'Ano de Fundação': String(fd.get('ano_fundacao') || 'Não informado').trim(),
        'Temas Principais': temas.length ? temas.join(', ') : 'Geral',
        'Descrição / Linha Editorial': desc,
        'Link de Matéria em Destaque': String(fd.get('link_destaque') || 'Não informado').trim(),
        'Termos e Ética': 'Declarou veracidade e compromisso com apuração jornalística',
        'Data do Envio': new Date().toLocaleString('pt-BR')
      };
      payload.email = email;
      payload._replyto = email;

      if (cadSubmit) {
        cadSubmit.disabled = true;
        cadSubmit.textContent = 'Enviando inscrição…';
      }
      setCadStatus('');

      var regRecord = {
        nome: veiculoNome,
        url: veiculoUrl,
        pais: String(fd.get('pais_veiculo') || 'Brasil'),
        solicitante: nome,
        data: new Date().toLocaleDateString('pt-BR'),
        timestamp: Date.now()
      };
      saveLocalRegisteredOutlet(regRecord);

      enviarDadosFormulario(payload)
      .then(function () {
        cadForm.reset();
        if (counterEl) counterEl.textContent = '0 / 2500 caracteres';
        if (relacaoReq) relacaoReq.hidden = true;
        setCadStatus(
          '🎉 <strong>Inscrição enviada com sucesso!</strong> Recebemos o cadastro do veículo <strong>' +
          esc(veiculoNome) + '</strong>. Nossa curadoria editorial analisará as informações e entraremos em contato pelo e-mail <strong>' +
          esc(email) + '</strong> assim que a integração for validada no mapa.',
          'ok'
        );
      })
      .catch(function () {
        cadForm.reset();
        setCadStatus(
          '✓ <strong>Cadastro salvo com sucesso!</strong> Recebemos as informações e analisaremos em breve. Se desejar, confirme em <a href="mailto:rodandoomundoprojeto@gmail.com">rodandoomundoprojeto@gmail.com</a>.',
          'ok'
        );
      })
      .then(function () {
        if (cadSubmit) {
          cadSubmit.disabled = false;
          cadSubmit.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg> <span>Enviar cadastro do veículo</span>';
        }
      });
    });
  }

  // =========================================================================
  // INTEGRAÇÃO WEBHOOK — SOLICITAÇÃO DO FORMULÁRIO DE PARCERIA (/parcerias)
  // Webhook Make configurado: https://hook.us2.make.com/98hr4ve5jclewkf8pcwc9895jcoo59nh
  // =========================================================================
  var WEBHOOK_URL = (typeof window !== 'undefined' && window.WEBHOOK_URL) || 'https://hook.us2.make.com/98hr4ve5jclewkf8pcwc9895jcoo59nh';

  function resolveWebhookEndpoint(raw) {
    var s = String(raw || '').trim().replace(/^\[|\]$/g, '').trim();
    if (/^https?:\/\//i.test(s)) {
      return s;
    }
    // Converte automaticamente formato <token>@hook.<regiao>.make.com para https://hook.<regiao>.make.com/<token>
    var makeMatch = s.match(/^([a-zA-Z0-9_-]+)@(hook\.[a-z0-9.-]+\.make\.com)$/i);
    if (makeMatch) {
      return 'https://' + makeMatch[2] + '/' + makeMatch[1];
    }
    return s;
  }

  /* ---------- Mídia Kit & Parcerias: catálogo de cotas contextual (MK-COTAS-PARCERIAS) ---------- */
  var COTAS_PARCERIAS = {
    cota_master: {
      key: 'cota_master',
      label: 'Cota 01 — Founding Partner (Master)',
      titulo: 'Cota 01 — Founding Partner (Master)',
      subtitle: 'Esta é a solicitação da Cota 01 — Founding Partner (Master). O time institucional está preparando o Mídia Kit desta cota exclusiva e enviará o material completo junto com as condições vigentes por e-mail.'
    },
    dossie_tematico: {
      key: 'dossie_tematico',
      label: 'Cota 02 — Inteligência Setorial (Dossiês)',
      titulo: 'Cota 02 — Inteligência Setorial (Dossiês)',
      subtitle: 'Esta é a solicitação da Cota 02 — Inteligência Setorial (Dossiês). O time institucional está preparando o dossiê setorial exclusivo e enviará o material completo junto com as condições vigentes por e-mail.'
    },
    resumo_dia: {
      key: 'resumo_dia',
      label: 'Cota 03 — Briefing Matinal (Resumo do Dia)',
      titulo: 'Cota 03 — Briefing Matinal (Resumo do Dia)',
      subtitle: 'Esta é a solicitação da Cota 03 — Briefing Matinal (Resumo do Dia). O time institucional está preparando o briefing matinal exclusivo e enviará o material completo junto com as condições vigentes por e-mail.'
    },
    gaveta_contextual: {
      key: 'gaveta_contextual',
      label: 'Cota 04 — Território & Contexto (Geo)',
      titulo: 'Cota 04 — Território & Contexto (Geo)',
      subtitle: 'Esta é a solicitação da Cota 04 — Território & Contexto (Geo). O time institucional está preparando a contextualização territorial exclusiva e enviará o material completo junto com as condições vigentes por e-mail.'
    },
    geral: {
      key: 'geral',
      label: 'CTA Geral — Mídia Kit Completo',
      titulo: 'Receba o formulário de parceria',
      subtitle: 'Informe seus dados abaixo e o link exclusivo para o formulário de aplicação será enviado imediatamente para o seu e-mail.'
    }
  };

  function getCotaInfo(cotaKey) {
    var c = COTAS_PARCERIAS[cotaKey];
    if (c) return c;
    return COTAS_PARCERIAS.geral;
  }

  /* ---------- modal de captura de lead para envio do formulário de parceria ---------- */
  function initParceriaLeadModal() {
    var leadDialog = document.getElementById('parceria-lead-dialog');
    var leadForm = document.getElementById('parceria-lead-form');
    var btnOpen = document.getElementById('btn-solicitar-form-parceria');
    var btnCloseX = document.getElementById('parceria-lead-x');
    var fieldsBox = document.getElementById('parceria-lead-fields');
    var confirmBox = document.getElementById('parceria-lead-confirm');
    var statusEl = document.getElementById('parceria-lead-status');
    var submitBtn = document.getElementById('parceria-lead-submit');
    var nomeInput = document.getElementById('parceria-lead-nome');
    var emailInput = document.getElementById('parceria-lead-email');
    var cotaSelecionadaAtual = 'geral';

    if (!leadDialog) return;

    function setLeadStatus(msg, type) {
      if (!statusEl) return;
      if (!msg) {
        statusEl.textContent = '';
        statusEl.className = 'bug-status parceria-lead-status';
        return;
      }
      statusEl.textContent = msg;
      statusEl.className = 'bug-status parceria-lead-status ' + (type || 'ok');
    }

    function openLeadModal(btn) {
      var cotaKey = (btn && btn.getAttribute && btn.getAttribute('data-cota')) || 'geral';
      var cotaInfo = getCotaInfo(cotaKey);
      cotaSelecionadaAtual = cotaKey;
      if (leadDialog) leadDialog.setAttribute('data-cota-selecionada', cotaKey);
      var leadTitleEl = document.getElementById('parceria-lead-title');
      var leadSubtitleEl = document.getElementById('parceria-lead-subtitle');
      if (leadTitleEl) leadTitleEl.textContent = cotaInfo.titulo;
      if (leadSubtitleEl) leadSubtitleEl.textContent = cotaInfo.subtitle;
      if (leadForm) leadForm.reset();
      if (fieldsBox) fieldsBox.hidden = false;
      if (confirmBox) confirmBox.hidden = true;
      setLeadStatus('');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Enviar link agora</span>';
      }
      if (typeof leadDialog.showModal === 'function') {
        leadDialog.showModal();
      } else {
        leadDialog.setAttribute('open', '');
      }
      if (nomeInput) {
        setTimeout(function () {
          try { nomeInput.focus(); } catch (e) {}
        }, 60);
      }
    }

    function closeLeadModal() {
      if (typeof leadDialog.close === 'function') {
        leadDialog.close();
      } else {
        leadDialog.removeAttribute('open');
      }
    }

    if (btnOpen) {
      btnOpen.addEventListener('click', function () { openLeadModal(btnOpen); });
    }

    document.querySelectorAll('[data-open-parceria-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () { openLeadModal(btn); });
    });

    if (btnCloseX) {
      btnCloseX.addEventListener('click', closeLeadModal);
    }

    leadDialog.addEventListener('click', function (e) {
      if (e.target === leadDialog) {
        closeLeadModal();
      }
    });

    if (leadForm) {
      leadForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(leadForm);
        if (fd.get('_honey')) return;

        var nomeVal = String((nomeInput && nomeInput.value) || fd.get('nome') || '').trim();
        if (nomeVal.length < 2) {
          setLeadStatus('Por favor, informe seu nome completo.', 'err');
          if (nomeInput) nomeInput.focus();
          return;
        }

        var emailVal = String((emailInput && emailInput.value) || fd.get('email') || '').trim();
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailVal || !emailRegex.test(emailVal)) {
          setLeadStatus('Por favor, informe um endereço de e-mail válido.', 'err');
          if (emailInput) emailInput.focus();
          return;
        }

        setLeadStatus('');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>Enviando...</span>';
        }

        var webhookPayload = {
          nome: nomeVal,
          email: emailVal,
          origem: 'pagina-parcerias',
          cota_selecionada: cotaSelecionadaAtual
        };

        function handleSuccess() {
          if (fieldsBox) fieldsBox.hidden = true;
          if (confirmBox) confirmBox.hidden = false;
          setLeadStatus('');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Enviar link agora</span>';
          }
        }

        function handleError() {
          setLeadStatus('Não foi possível enviar agora. Tente novamente em instantes.', 'err');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Enviar link agora</span>';
          }
        }

        fetch(resolveWebhookEndpoint(WEBHOOK_URL), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(webhookPayload)
        })
          .then(function (res) {
            if (!res.ok) {
              handleError();
              return;
            }
            handleSuccess();
          })
          .catch(function () {
            handleError();
          });
      });
    }
  }

  /* ---------- formulário de parcerias e mídia kit B2B (/aplicacao-parceiros) ---------- */
  function initParceriasForm() {
    var parcForm = document.getElementById('parcerias-form');
    if (!parcForm) return;

    var parcStatus = document.getElementById('parc-status');
    var parcSubmit = document.getElementById('parc-submit');

    function setParcStatus(msg, type) {
      if (!parcStatus) return;
      if (!msg) {
        parcStatus.textContent = '';
        parcStatus.className = 'cad-status';
        return;
      }
      parcStatus.innerHTML = msg;
      parcStatus.className = 'cad-status active ' + (type || 'ok');
    }

    parcForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(parcForm);

      // Verificação de honeypot antispam
      var honey = fd.get('_honey');
      if (honey) return;

      var nome = String(fd.get('nome') || '').trim();
      if (nome.length < 2) {
        setParcStatus('Por favor, informe seu nome ou da pessoa de contato.', 'err');
        var elNome = document.getElementById('parc-nome');
        if (elNome) elNome.focus();
        return;
      }

      var empresa = String(fd.get('empresa') || '').trim();
      if (empresa.length < 2) {
        setParcStatus('Por favor, informe o nome da sua empresa ou organização.', 'err');
        var elEmp = document.getElementById('parc-empresa');
        if (elEmp) elEmp.focus();
        return;
      }

      var email = String(fd.get('email') || '').trim();
      var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        setParcStatus('Por favor, informe um endereço de e-mail corporativo válido.', 'err');
        var elEmail = document.getElementById('parc-email');
        if (elEmail) elEmail.focus();
        return;
      }

      var msg = String(fd.get('mensagem') || '').trim();
      if (msg.length < 10) {
        setParcStatus('Por favor, detalhe brevemente os objetivos da parceria (mínimo de 10 caracteres).', 'err');
        var elMsg = document.getElementById('parc-msg');
        if (elMsg) elMsg.focus();
        return;
      }

      var segmentoLabels = {
        'fintech': 'Fintech / Investimentos / Câmbio',
        'turismo': 'Turismo / Mobilidade / Seguros',
        'educacao': 'Educação / Idiomas / Vestibulares',
        'tecnologia': 'Tecnologia / Inteligência Artificial / SaaS',
        'institucional': 'Institucional / Think Tank / ONG'
      };

      var formatoLabels = {
        'cota_master': 'Cota 01 — Founding Partner (Master)',
        'dossie_tematico': 'Cota 02 — Inteligência Setorial (Dossiês)',
        'resumo_dia': 'Cota 03 — Briefing Matinal (Resumo do Dia)',
        'gaveta_contextual': 'Cota 04 — Território & Contexto (Geo)',
        'projeto_especial': 'Projeto Especial / Outros'
      };

      var orcamentoLabels = {
        'ate_1500': 'Até R$ 1.500 / mês (Piloto)',
        '1500_a_5000': 'R$ 1.500 a R$ 5.000 / mês',
        'acima_5000': 'Acima de R$ 5.000 / mês',
        'ate_5k': 'Até R$ 5.000 / mês',
        '5k_a_15k': 'R$ 5.000 a R$ 15.000 / mês',
        'acima_15k': 'Acima de R$ 15.000 / mês',
        'grant_internacional': 'Fundo / Grant Internacional (USD / EUR)',
        'nao_informado': 'Prefere discutir na reunião'
      };

      var segmentoKey = String(fd.get('segmento') || 'fintech');
      var formatoKey = String(fd.get('formato_interesse') || 'cota_master');
      var orcamentoKey = String(fd.get('faixa_orcamento') || '1500_a_5000');

      var payload = {
        _subject: 'Nova Solicitação de Parceria B2B — ' + empresa + ' (' + nome + ')',
        _captcha: 'false',
        'Nome do Contato': nome,
        'Empresa / Organização': empresa,
        'Segmento': segmentoLabels[segmentoKey] || segmentoKey,
        'E-mail Corporativo': email,
        'Formato de Interesse': formatoLabels[formatoKey] || formatoKey,
        'Faixa de Investimento': orcamentoLabels[orcamentoKey] || orcamentoKey,
        'Mensagem e Objetivos': msg,
        'Origem': 'Aplicação de Parceiros (/aplicacao-parceiros)',
        'Data do Envio': new Date().toLocaleString('pt-BR')
      };
      payload.email = email;
      payload._replyto = email;

      if (parcSubmit) {
        parcSubmit.disabled = true;
        parcSubmit.textContent = 'Enviando proposta…';
      }
      setParcStatus('');

      enviarDadosFormulario(payload)
      .then(function () {
        parcForm.reset();
        setParcStatus(
          '🎉 <strong>Solicitação enviada com sucesso!</strong> Agradecemos o interesse da <strong>' +
          esc(empresa) + '</strong>. Nossa equipe entrará em contato em até 24 horas úteis no e-mail <strong>' +
          esc(email) + '</strong> com nosso mídia kit detalhado e proposta de patrocínio.',
          'ok'
        );
      })
      .catch(function () {
        parcForm.reset();
        setParcStatus(
          '✓ <strong>Proposta registrada!</strong> Entraremos em contato em breve pelo e-mail informado.',
          'ok'
        );
      })
      .then(function () {
        if (parcSubmit) {
          parcSubmit.disabled = false;
          parcSubmit.textContent = 'Solicitar Mídia Kit & Proposta';
        }
      });
    });
  }

  /* ---------- Clube de Membros: lógica interativa e adesão ---------- */
  function initClubeMembros() {
    var clubeSec = document.getElementById('clube-membros-view');
    if (!clubeSec) return;

    var billingToggle = document.getElementById('clube-billing-toggle');
    var labelMonthly = document.getElementById('billing-label-monthly');
    var labelAnnual = document.getElementById('billing-label-annual');
    var valExplorador = document.getElementById('price-val-explorador');
    var periodExplorador = document.getElementById('price-period-explorador');
    var valCorrespondente = document.getElementById('price-val-correspondente');
    var periodCorrespondente = document.getElementById('price-period-correspondente');
    var cicloSelect = document.getElementById('clube-ciclo-select');
    var planoSelect = document.getElementById('clube-plano-select');
    var selectedTierNameSpan = document.getElementById('checkout-selected-tier-name');
    var copyBtn = document.getElementById('btn-copy-pix-clube');
    var pixInput = document.getElementById('clube-pix-input');
    var pixFeedback = document.getElementById('clube-pix-feedback');
    var clubeForm = document.getElementById('clube-form');
    var clubeStatus = document.getElementById('clube-status');
    var clubeSubmit = document.getElementById('clube-submit');

    var isAnnual = true;

    function applyBillingCycle(annual) {
      isAnnual = Boolean(annual);
      if (billingToggle) billingToggle.setAttribute('aria-checked', isAnnual ? 'true' : 'false');
      if (labelAnnual) {
        if (isAnnual) labelAnnual.classList.add('is-active');
        else labelAnnual.classList.remove('is-active');
      }
      if (labelMonthly) {
        if (!isAnnual) labelMonthly.classList.add('is-active');
        else labelMonthly.classList.remove('is-active');
      }
      if (cicloSelect) cicloSelect.value = isAnnual ? 'anual' : 'mensal';

      if (valExplorador) valExplorador.textContent = isAnnual ? '99,00' : '9,90';
      if (periodExplorador) periodExplorador.innerHTML = isAnnual ? '/ ano <small>(equivale a R$ 8,25/mês)</small>' : '/ mês';

      if (valCorrespondente) valCorrespondente.textContent = isAnnual ? '249,00' : '24,90';
      if (periodCorrespondente) periodCorrespondente.innerHTML = isAnnual ? '/ ano <small>(equivale a R$ 20,75/mês)</small>' : '/ mês';
    }

    if (billingToggle) {
      billingToggle.addEventListener('click', function () {
        applyBillingCycle(!isAnnual);
      });
    }
    if (labelMonthly) {
      labelMonthly.addEventListener('click', function () { applyBillingCycle(false); });
    }
    if (labelAnnual) {
      labelAnnual.addEventListener('click', function () { applyBillingCycle(true); });
    }
    if (cicloSelect) {
      cicloSelect.addEventListener('change', function () {
        applyBillingCycle(cicloSelect.value === 'anual');
      });
    }

    // Botões de escolha de plano nos cards
    clubeSec.querySelectorAll('.btn-tier-select').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tier = btn.getAttribute('data-tier') || 'correspondente';
        var tName = btn.getAttribute('data-tier-name') || 'Correspondente';
        if (planoSelect) planoSelect.value = tier;
        if (selectedTierNameSpan) selectedTierNameSpan.textContent = tName;
        var panel = document.getElementById('clube-adesao-panel');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        var nameInput = document.getElementById('clube-nome');
        if (nameInput) {
          setTimeout(function () {
            try { nameInput.focus(); } catch (e) {}
          }, 350);
        }
      });
    });

    if (planoSelect) {
      planoSelect.addEventListener('change', function () {
        var opt = planoSelect.options[planoSelect.selectedIndex];
        var tierText = opt ? opt.text.split('(')[0].replace(/^[^\wÀ-ÿ]+/i, '').trim() : 'Correspondente';
        if (selectedTierNameSpan) selectedTierNameSpan.textContent = tierText;
      });
    }

    // Copiar código PIX do Clube
    if (copyBtn && pixInput) {
      var copyTimer = null;
      copyBtn.addEventListener('click', function () {
        var textToCopy = pixInput.value.trim();

        function handleCopied() {
          copyBtn.classList.add('copied');
          var textSpan = copyBtn.querySelector('.copy-btn-text');
          if (textSpan) textSpan.textContent = 'Código PIX Copiado! ✓';
          if (pixFeedback) pixFeedback.textContent = 'Chave copiada com sucesso! Cole no app do seu banco para transferir.';
          clearTimeout(copyTimer);
          copyTimer = setTimeout(function () {
            copyBtn.classList.remove('copied');
            if (textSpan) textSpan.textContent = 'Copiar código PIX';
            if (pixFeedback) pixFeedback.textContent = '';
          }, 4000);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(textToCopy).then(handleCopied).catch(function () {
            pixInput.select();
            document.execCommand('copy');
            handleCopied();
          });
        } else {
          pixInput.select();
          document.execCommand('copy');
          handleCopied();
        }
      });
    }

    // Formulário de Confirmação de Membro
    if (clubeForm) {
      function setClubeStatus(msg, type) {
        if (!clubeStatus) return;
        if (!msg) {
          clubeStatus.textContent = '';
          clubeStatus.className = 'cad-status';
          return;
        }
        clubeStatus.innerHTML = msg;
        clubeStatus.className = 'cad-status active ' + (type || 'ok');
      }

      clubeForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(clubeForm);
        var honey = fd.get('_honey');
        if (honey) return;

        var nome = String(fd.get('nome') || '').trim();
        if (nome.length < 2) {
          setClubeStatus('Por favor, informe seu nome ou como prefere ser chamado.', 'err');
          var elNome = document.getElementById('clube-nome');
          if (elNome) elNome.focus();
          return;
        }

        var email = String(fd.get('email') || '').trim();
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          setClubeStatus('Por favor, informe um endereço de e-mail válido para envio dos benefícios.', 'err');
          var elEmail = document.getElementById('clube-email');
          if (elEmail) elEmail.focus();
          return;
        }

        var plano = String(fd.get('plano') || 'correspondente');
        var ciclo = String(fd.get('ciclo') || 'anual');
        var metodo = String(fd.get('metodo_pagamento') || 'pix');
        var msg = String(fd.get('mensagem') || '').trim();
        var exibirHall = fd.get('exibir_no_hall') ? 'Sim' : 'Não (deseja anonimato)';

        var planoLabels = {
          'explorador': '🧭 Explorador (R$ 9,90/mês ou R$ 99/ano)',
          'correspondente': '🌐 Correspondente (R$ 24,90/mês ou R$ 249/ano)'
        };
        var cicloLabels = {
          'mensal': 'Mensal',
          'anual': 'Anual (2 meses grátis)'
        };
        var metodoLabels = {
          'aguardando_lancamento': 'Lista de Espera VIP (desejo ser avisado na abertura de vagas)',
          'pix': 'PIX Direto (Chave Oficial)',
          'paypal': 'PayPal Internacional',
          'outro': 'Outro / Solicitar outro formato de apoio',
          'esperar_plano': 'Prefiro esperar o plano.'
        };

        var payload = {
          _subject: 'Lista de Espera VIP / Clube de Membros — ' + nome + ' (' + (plano === 'correspondente' ? 'Correspondente' : 'Explorador') + ')',
          _captcha: 'false',
          'Nome do Membro': nome,
          'E-mail': email,
          'Plano de Interesse': planoLabels[plano] || plano,
          'Periodicidade': cicloLabels[ciclo] || ciclo,
          'Interesse ou Forma de Apoio': metodoLabels[metodo] || metodo,
          'Exibir no Hall de Apoiadores': exibirHall,
          'Mensagem ou Comprovante': msg || 'Nenhuma mensagem adicional.',
          'Origem': 'Clube de Membros (/clube)',
          'Data da Inscrição': new Date().toLocaleString('pt-BR')
        };
        payload.email = email;
        payload._replyto = email;

        if (clubeSubmit) {
          clubeSubmit.disabled = true;
          clubeSubmit.textContent = 'Registrando inscrição…';
        }
        setClubeStatus('');

        // Salvar localmente o selo de membro no navegador
        try {
          localStorage.setItem('rom_member_tier', plano);
          localStorage.setItem('rom_member_name', nome);
        } catch (e) {}

        enviarDadosFormulario(payload)
        .then(function () {
          clubeForm.reset();
          setClubeStatus(
            '🎉 <strong>Inscrição registrada com sucesso, ' + esc(nome) + '!</strong> Você está na Lista de Espera VIP do plano <strong>' +
            esc(plano === 'correspondente' ? 'Correspondente' : 'Explorador') + '</strong>. Assim que as vagas oficiais forem abertas, você receberá no e-mail <strong>' +
            esc(email) + '</strong> o link com condições especiais de membro pioneiro.',
            'ok'
          );
        })
        .catch(function (err) {
          console.error('Falha ao registrar formulário do Clube:', err);
          setClubeStatus(
            '⚠️ <strong>Não foi possível registrar seu e-mail automaticamente no momento.</strong><br>Por favor, envie seus dados diretamente para <a href="mailto:rodandoomundoprojeto@gmail.com" style="color:var(--c-accent-blue);text-decoration:underline;font-weight:600;">rodandoomundoprojeto@gmail.com</a> para garantirmos sua vaga na Lista de Espera VIP.',
            'err'
          );
        })
        .then(function () {
          if (clubeSubmit) {
            clubeSubmit.disabled = false;
            clubeSubmit.textContent = 'Entrar na Lista de Espera VIP';
          }
        });
      });
    }
  }

  /* ---------- D2: Typewriter com 7 frases sorteadas (rotação de 5 min) ---------- */
  (function () {
    var twEl = document.getElementById('typewriter-text');
    if (!twEl) return;
    var phrases = [
      'para onde vamos hoje?',
      'o que está acontecendo agora no mundo?',
      'viajando para…',
      'de olho no mundo...',
      'acontecendo agora...',
      'rodando o mundo...',
      'procurando algo?'
    ];
    var ROTATE_INTERVAL = 5 * 60 * 1000; // 5 minutos (300.000 ms)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var staticIdx = Math.floor(Math.random() * phrases.length);
      twEl.textContent = phrases[staticIdx];
      setInterval(function () {
        staticIdx = (staticIdx + 1) % phrases.length;
        twEl.textContent = phrases[staticIdx];
      }, ROTATE_INTERVAL);
      return;
    }
    var phraseIndex = Math.floor(Math.random() * phrases.length);
    var charIndex = 0;
    var deleting = false;
    function tick() {
      var curPhrase = phrases[phraseIndex];
      if (deleting) {
        charIndex--;
        twEl.textContent = curPhrase.substring(0, charIndex);
        if (charIndex <= 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          setTimeout(tick, 400);
          return;
        }
        setTimeout(tick, 35);
      } else {
        charIndex++;
        twEl.textContent = curPhrase.substring(0, charIndex);
        if (charIndex >= curPhrase.length) {
          deleting = true;
          setTimeout(tick, ROTATE_INTERVAL);
          return;
        }
        setTimeout(tick, 65);
      }
    }
    tick();
  })();


  /* ---------- D5: Relato de bugs via FormSubmit ---------- */
  (function () {
    var bugDialog = document.getElementById('bug-dialog');
    var bugCancel = document.getElementById('bug-cancel');
    var bugForm = document.getElementById('bug-form');
    var bugStatus = document.getElementById('bug-status');
    var bugSubmit = document.getElementById('bug-submit');
    if (!bugDialog) return;

    function setVal(id1, id2, val) {
      var el = document.getElementById(id1) || document.getElementById(id2);
      if (el) el.value = val;
    }

    function openBugDialog() {
      setVal('bug-meta-rota', 'bug-route', window.location.pathname || '/');
      setVal('bug-meta-navegador', 'bug-ua', navigator.userAgent);
      setVal('bug-meta-tempo', 'bug-time', new Date().toISOString());
      setVal('bug-meta-res', 'bug-screen', window.innerWidth + 'x' + window.innerHeight);
      if (bugStatus) { bugStatus.textContent = ''; bugStatus.className = 'bug-status'; }
      if (bugForm) bugForm.reset();
      bugDialog.showModal();
    }

    var bugBtn = document.getElementById('bug-btn');
    if (bugBtn) {
      bugBtn.addEventListener('click', openBugDialog);
    }

    var footerBugBtn = document.getElementById('footer-bug-btn');
    if (footerBugBtn) {
      footerBugBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openBugDialog();
      });
    }
    var footerBugTextBtn = document.getElementById('footer-bug-text-btn');
    if (footerBugTextBtn) {
      footerBugTextBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openBugDialog();
      });
    }

    var bugX = document.getElementById('bug-dialog-x');
    if (bugX) {
      bugX.addEventListener('click', function () {
        bugDialog.close();
      });
    }

    if (bugCancel) {
      bugCancel.addEventListener('click', function () {
        bugDialog.close();
      });
    }

    if (bugForm) {
      bugForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var desc = (document.getElementById('bug-desc').value || '').trim();
        if (desc.length < 5) {
          bugStatus.textContent = 'Por favor, descreva brevemente o problema encontrado.';
          bugStatus.className = 'bug-status err';
          return;
        }
        var email = (document.getElementById('bug-email').value || '').trim();
        var bugPayload = {
          _subject: 'Rodando o Mundo — Relato de Erro / Bug',
          _template: 'table',
          _captcha: 'false',
          Descricao: desc,
          Email: email || 'não informado',
          Rota: window.location.pathname || '/',
          Navegador: navigator.userAgent,
          Resolucao: window.innerWidth + 'x' + window.innerHeight,
          Data_Hora: new Date().toLocaleString('pt-BR')
        };
        if (email) bugPayload._replyto = email;

        function marcarSucessoBug() {
          try {
            var logs = JSON.parse(localStorage.getItem('rom_bug_reports') || '[]');
            logs.push(bugPayload);
            localStorage.setItem('rom_bug_reports', JSON.stringify(logs.slice(-25)));
          } catch (err) {}
          bugStatus.textContent = 'Relato enviado com sucesso! Muito obrigado pelo aviso.';
          bugStatus.className = 'bug-status ok';
          if (bugForm) bugForm.reset();
          setTimeout(function () { bugDialog.close(); }, 2200);
        }

        if (bugSubmit) { bugSubmit.disabled = true; bugSubmit.textContent = 'Enviando…'; }

        enviarDadosFormulario(bugPayload)
        .then(function () {
          marcarSucessoBug();
        })
        .catch(function () {
          marcarSucessoBug();
        })
        .then(function () {
          if (bugSubmit) { bugSubmit.disabled = false; bugSubmit.textContent = 'Enviar relato'; }
        });
      });
    }
  })();

  /* ---------- Versão do sistema (definida pelo nome da pasta do deploy, ex: ROM V2 -> v2, ROM V2.10 -> v2.10) ---------- */
  var ROM_CURRENT_VERSION = 'v2.1';

  function initSiteVersion() {
    try {
      // Remove qualquer badge do topo/cabeçalho
      var topBadges = document.querySelectorAll('.brand-name .site-version-badge, .topbar .site-version-badge');
      topBadges.forEach(function (b) { b.remove(); });

      // Sincroniza a versão no rodapé (.footer-version)
      var footers = document.querySelectorAll('.footer-version');
      if (footers.length) {
        footers.forEach(function (fv) {
          fv.textContent = ROM_CURRENT_VERSION;
          fv.title = 'Versão atual do site: ' + ROM_CURRENT_VERSION;
        });
      } else {
        var credits = document.querySelectorAll('.footer-credit');
        credits.forEach(function (fc) {
          if (!fc.querySelector('.footer-version')) {
            var fv = document.createElement('span');
            fv.className = 'footer-version';
            fv.title = 'Versão atual do site: ' + ROM_CURRENT_VERSION;
            fv.textContent = ROM_CURRENT_VERSION;
            var ano = fc.querySelector('#ano');
            if (ano && ano.nextSibling) {
              var dot1 = document.createTextNode(' · ');
              var dot2 = document.createTextNode(' · ');
              var parent = ano.parentNode;
              parent.insertBefore(dot1, ano.nextSibling);
              parent.insertBefore(fv, dot1.nextSibling);
            } else {
              fc.appendChild(document.createTextNode(' · '));
              fc.appendChild(fv);
            }
          }
        });
      }

      var verEls = document.querySelectorAll('.current-rom-version, .about-version-chip');
      verEls.forEach(function (el) {
        el.textContent = ROM_CURRENT_VERSION;
      });
    } catch (e) {}
  }
  initSiteVersion();
  window.addEventListener('DOMContentLoaded', initSiteVersion);
  window.addEventListener('load', initSiteVersion);

  /* ---------- init ---------- */
  (function setupFavoritesDialog() {
    var topBtn = document.getElementById('fav-top-btn');
    var dlg = document.getElementById('favorites-dialog');
    var closeX = document.getElementById('favorites-dialog-x');
    var pPaises = document.getElementById('favorites-panel-paises');
    var pVeiculos = document.getElementById('favorites-panel-veiculos');
    var pNoticias = document.getElementById('favorites-panel-noticias');
    var footerEl = document.getElementById('favorites-dialog-footer');
    var clearAllBtn = document.getElementById('fav-clear-all-btn');
    var activeTab = 'paises';
    syncFavoritesTopCounter();
    if (!topBtn || !dlg) return;

    function updateFooterVisibility() {
      if (!footerEl) return;
      var currentList = favState[activeTab] || [];
      footerEl.hidden = currentList.length === 0;
    }

    function switchTab(tabKey) {
      if (tabKey === 'veiculos' || tabKey === 'noticias') activeTab = tabKey;
      else activeTab = 'paises';
      dlg.querySelectorAll('[data-fav-tab]').forEach(function (b) {
        b.setAttribute('aria-selected', String(b.getAttribute('data-fav-tab') === activeTab));
      });
      if (pPaises) pPaises.hidden = activeTab !== 'paises';
      if (pVeiculos) pVeiculos.hidden = activeTab !== 'veiculos';
      if (pNoticias) pNoticias.hidden = activeTab !== 'noticias';
      updateFooterVisibility();
    }

    function renderFavoritesDialogContent() {
      syncFavoritesTopCounter();
      if (pPaises) {
        if (!favState.paises.length) {
          pPaises.innerHTML = '<div class="fav-empty">Nenhum país favoritado ainda. Clique na estrela ☆ ao lado do nome de qualquer país para salvá-lo aqui.</div>';
        } else {
          pPaises.innerHTML = '<ul class="fav-items-list">' + favState.paises.map(function (p, idx) {
            var fUrl = p.flagCode === 'chipre-do-norte' ? FLAG_TRNC : (p.flagCode === 'somaliland' ? '/somaliland.svg' : (p.flagCode ? 'https://flagcdn.com/w40/' + esc(p.flagCode) + '.png' : ''));
            var contLabel = (CONT[p.cont] && CONT[p.cont].short) || p.cont;
            return '<li class="fav-item-row">' +
              '<button type="button" class="fav-item-main" data-open-fav-country="' + idx + '">' +
                (fUrl ? '<img class="outlet-country-flag" src="' + fUrl + '" alt="" width="20" height="14">' : '') +
                '<span class="fav-item-title">' + esc(p.name) + '</span>' +
                '<span class="fav-item-meta">' + esc(contLabel) + '</span>' +
              '</button>' +
              '<button type="button" class="fav-remove-btn" data-remove-fav-country="' + idx + '" title="Remover dos favoritos" aria-label="Remover ' + esc(p.name) + '">✕</button>' +
            '</li>';
          }).join('') + '</ul>';

          pPaises.querySelectorAll('[data-open-fav-country]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var item = favState.paises[Number(btn.getAttribute('data-open-fav-country'))];
              if (!item) return;
              if (typeof dlg.close === 'function') dlg.close();
              else dlg.removeAttribute('open');
              var cObj = (item.code === 'GF') ? (byA2['FR'] || byId['250']) : (byA2[item.code] || byId[item.id]);
              if (cObj) go(item.cont || cObj.c || 'sul', cObj);
            });
          });
          pPaises.querySelectorAll('[data-remove-fav-country]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var i = Number(btn.getAttribute('data-remove-fav-country'));
              favState.paises.splice(i, 1);
              saveFavorites();
              renderFavoritesDialogContent();
              if (state.country) renderCountry();
              else if (state.cont) renderContinent();
            });
          });
        }
      }

      if (pVeiculos) {
        if (!favState.veiculos.length) {
          pVeiculos.innerHTML = '<div class="fav-empty">Nenhum veículo favoritado ainda. Clique na estrela ☆ no cartão de qualquer veículo para salvá-lo aqui.</div>';
        } else {
          pVeiculos.innerHTML = '<ul class="fav-items-list">' + favState.veiculos.map(function (v, idx) {
            var flagHtml = outletFlagImg(v.name, v.countryCode, v.domain || v.url);
            return '<li class="fav-item-row fav-item-outlet">' +
              '<div class="fav-outlet-info">' +
                '<img class="fav-outlet-fav" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(v.domain || host(v.url)) + '&sz=64" alt="" width="20" height="20" loading="lazy">' +
                '<div class="fav-outlet-text">' +
                  '<a href="' + esc(v.url) + '" target="_blank" rel="noopener" class="fav-outlet-name">' + flagHtml + ' ' + esc(v.name) + '</a>' +
                  '<span class="fav-item-meta">' + esc(v.countryName || v.countryCode) + ' · ' + esc(v.domain || host(v.url)) + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="fav-outlet-actions">' +
                '<a class="btn btn-sm fav-visit-btn" href="' + esc(v.url) + '" target="_blank" rel="noopener" title="Alguns sites podem exigir assinatura">Visitar site ' + ICON_SEARCH + '</a>' +
                '<button type="button" class="fav-remove-btn" data-remove-fav-outlet="' + idx + '" title="Remover dos favoritos" aria-label="Remover ' + esc(v.name) + '">✕</button>' +
              '</div>' +
            '</li>';
          }).join('') + '</ul>';

          pVeiculos.querySelectorAll('[data-remove-fav-outlet]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var i = Number(btn.getAttribute('data-remove-fav-outlet'));
              favState.veiculos.splice(i, 1);
              saveFavorites();
              renderFavoritesDialogContent();
              if (state.country) renderOutlets();
            });
          });
        }
      }

      if (pNoticias) {
        if (!favState.noticias.length) {
          pNoticias.innerHTML = '<div class="fav-empty">Nenhuma notícia favoritada ainda. Clique na estrela ☆ em qualquer matéria para salvá-la aqui.</div>';
        } else {
          pNoticias.innerHTML = '<ul class="fav-items-list">' + favState.noticias.map(function (n, idx) {
            var flagHtml = outletFlagImg(n.source, n.countryCode, n.url);
            var dtStr = formatSearchDate(n.publishedAt);
            return '<li class="fav-item-row fav-item-outlet">' +
              '<div class="fav-outlet-info">' +
                '<div class="fav-outlet-text">' +
                  '<a href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer" class="fav-outlet-name" data-fav-news-title="' + idx + '">' + esc(n.title) + '</a>' +
                  '<span class="fav-item-meta">' + flagHtml + ' ' + esc(n.source || host(n.url)) + (dtStr ? ' · ' + esc(dtStr) : '') + '</span>' +
                '</div>' +
              '</div>' +
              '<div class="fav-outlet-actions">' +
                '<a class="btn btn-sm fav-visit-btn" href="' + esc(n.url) + '" target="_blank" rel="noopener noreferrer" title="Alguns sites podem exigir assinatura">Abrir ' + ICON_ARROW + '</a>' +
                (isFavNewsForeign(n) ? '<button type="button" class="btn btn-sm fav-translate-btn" data-fav-translate="' + idx + '" aria-pressed="false" title="Traduzir título para português">' + ICON_TRANSLATE + '<span>Traduzir</span></button>' : '') +
                '<button type="button" class="fav-remove-btn" data-remove-fav-news="' + idx + '" title="Remover dos favoritos" aria-label="Remover notícia">✕</button>' +
              '</div>' +
            '</li>';
          }).join('') + '</ul>';

          pNoticias.querySelectorAll('[data-fav-translate]').forEach(function (btn) {
            var sp = btn.querySelector('span');
            var i = Number(btn.getAttribute('data-fav-translate'));
            var n = favState.noticias[i];
            var titleEl = pNoticias.querySelector('[data-fav-news-title="' + i + '"]');
            if (!n || !titleEl) return;
            btn.addEventListener('click', function () {
              if (btn.disabled) return;
              if (btn.getAttribute('aria-pressed') === 'true') {
                titleEl.textContent = n.title;
                btn.setAttribute('aria-pressed', 'false');
                btn.title = 'Traduzir título para português';
                if (sp) sp.textContent = 'Traduzir';
                return;
              }
              btn.disabled = true;
              btn.classList.add('is-loading');
              if (sp) sp.textContent = 'Traduzindo…';
              translateSingleTextGoogle(n.title, 'pt').then(function (tr) {
                if (tr && tr.trim()) {
                  titleEl.textContent = tr;
                  btn.setAttribute('aria-pressed', 'true');
                  btn.title = 'Ver título original';
                  if (sp) sp.textContent = 'Ver original';
                } else if (sp) {
                  sp.textContent = 'Traduzir';
                }
              }).catch(function () {
                if (sp) sp.textContent = 'Traduzir';
              }).then(function () {
                btn.disabled = false;
                btn.classList.remove('is-loading');
              });
            });
          });

          pNoticias.querySelectorAll('[data-remove-fav-news]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var i = Number(btn.getAttribute('data-remove-fav-news'));
              favState.noticias.splice(i, 1);
              saveFavorites();
              renderFavoritesDialogContent();
              if (state.country && state.searchData) renderTopicSearchResults();
            });
          });
        }
      }
      updateFooterVisibility();
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function () {
        var currentList = favState[activeTab] || [];
        if (!currentList.length) return;
        var tabLabel = activeTab === 'paises' ? 'países' : (activeTab === 'veiculos' ? 'veículos' : 'notícias');
        if (!window.confirm('Deseja remover todos os ' + tabLabel + ' dos favoritos?')) return;

        if (activeTab === 'paises') {
          favState.paises = [];
          saveFavorites();
          renderFavoritesDialogContent();
          if (state.country) renderCountry();
          else if (state.cont) renderContinent();
          document.querySelectorAll('.fav-country-list-btn.is-fav, .fav-country-btn.is-fav').forEach(function (b) {
            b.classList.remove('is-fav');
            b.setAttribute('aria-pressed', 'false');
            b.innerHTML = ICON_STAR_OFF;
            b.title = 'Salvar país nos favoritos';
          });
        } else if (activeTab === 'veiculos') {
          favState.veiculos = [];
          saveFavorites();
          renderFavoritesDialogContent();
          if (state.country) renderOutlets();
          document.querySelectorAll('.fav-outlet-btn.is-fav').forEach(function (b) {
            b.classList.remove('is-fav');
            b.setAttribute('aria-pressed', 'false');
            b.innerHTML = ICON_STAR_OFF;
            b.title = 'Salvar veículo nos favoritos';
          });
        } else if (activeTab === 'noticias') {
          favState.noticias = [];
          saveFavorites();
          renderFavoritesDialogContent();
          if (state.country && state.searchData) renderTopicSearchResults();
          document.querySelectorAll('.fav-news-btn.is-fav').forEach(function (b) {
            b.classList.remove('is-fav');
            b.setAttribute('aria-pressed', 'false');
            b.innerHTML = ICON_STAR_OFF;
            b.title = 'Salvar notícia nos favoritos';
          });
        }
      });
    }

    dlg.querySelectorAll('[data-fav-tab]').forEach(function (b) {
      b.addEventListener('click', function () {
        switchTab(b.getAttribute('data-fav-tab'));
      });
    });

    topBtn.addEventListener('click', function () {
      renderFavoritesDialogContent();
      if (favState.paises.length === 0 && favState.veiculos.length > 0) {
        switchTab('veiculos');
      } else if (favState.paises.length === 0 && favState.veiculos.length === 0 && favState.noticias.length > 0) {
        switchTab('noticias');
      } else {
        switchTab(activeTab);
      }
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });

    if (closeX) {
      closeX.addEventListener('click', function () {
        if (typeof dlg.close === 'function') dlg.close();
        else dlg.removeAttribute('open');
      });
    }
  })();

  (function setupScrollTopButton() {
    var scrollBtn = document.getElementById('scroll-top-btn');
    if (!scrollBtn) return;

    // Agrupa "↑ Topo" e "✕ Voltar ao mapa" num único container flex vertical fixo
    // (evita sobreposição no mobile; ordem: Topo em cima, Voltar ao mapa embaixo).
    (function mountFloatingActionsStack() {
      var stack = document.getElementById('floating-actions-stack');
      if (!stack) {
        stack = document.createElement('div');
        stack.id = 'floating-actions-stack';
        stack.className = 'floating-actions-stack';
        document.body.appendChild(stack);
      }
      if (scrollBtn.parentNode !== stack) stack.appendChild(scrollBtn);
      if (panelFloatingClose && panelFloatingClose.parentNode !== stack) stack.appendChild(panelFloatingClose);
    })();

    function updateScrollBtn() {
      var winScrolled = (window.scrollY || document.documentElement.scrollTop || 0) > 420;
      var panelScrolled = panel && panel.classList.contains('open') && panel.scrollTop > 420;
      var show = winScrolled || panelScrolled;
      if (scrollBtn.hidden !== !show) scrollBtn.hidden = !show;
      if (show) {
        var floatingCloseVisible = panelFloatingClose && !panelFloatingClose.hidden && window.innerWidth <= 768;
        scrollBtn.classList.toggle('above-panel-close', !!floatingCloseVisible);
      }
    }

    var scrollBtnRaf = 0;
    function scheduleScrollBtnUpdate() {
      if (scrollBtnRaf) return;
      scrollBtnRaf = requestAnimationFrame(function () {
        scrollBtnRaf = 0;
        updateScrollBtn();
      });
    }

    window.addEventListener('scroll', scheduleScrollBtnUpdate, { passive: true });
    if (panel) panel.addEventListener('scroll', scheduleScrollBtnUpdate, { passive: true });
    window.addEventListener('resize', scheduleScrollBtnUpdate, { passive: true });

    scrollBtn.addEventListener('click', function () {
      if (panel && panel.classList.contains('open') && panel.scrollTop > 120) {
        panel.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if ((window.scrollY || document.documentElement.scrollTop || 0) > 50) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  })();

  /* ---------- Topbar Menu Dropdown (+ Mais opções) ---------- */
  (function setupTopbarMoreDropdown() {
    var dropdown = document.getElementById('topbar-more-dropdown');
    var btn = document.getElementById('topbar-more-btn');
    var menu = document.getElementById('topbar-more-menu');
    if (!dropdown || !btn || !menu) return;

    var originalParent = dropdown;

    function posicionarMenu() {
      var isMobile = window.innerWidth <= 768;
      if (isMobile) {
        if (menu.parentElement !== document.body) {
          document.body.appendChild(menu);
        }
        var rect = btn.getBoundingClientRect();
        var menuWidth = Math.min(250, window.innerWidth - 24);
        var leftPos = Math.min(
          Math.max(12, rect.right - menuWidth),
          window.innerWidth - menuWidth - 12
        );
        var topPos = Math.max(8, Math.round(rect.bottom + 6));
        menu.style.setProperty('position', 'fixed', 'important');
        menu.style.setProperty('top', topPos + 'px', 'important');
        menu.style.setProperty('left', Math.round(leftPos) + 'px', 'important');
        menu.style.setProperty('right', 'auto', 'important');
        menu.style.setProperty('width', menuWidth + 'px', 'important');
        menu.style.setProperty('z-index', '999999', 'important');
        menu.style.setProperty('display', 'flex', 'important');
      } else {
        if (menu.parentElement !== originalParent) {
          originalParent.appendChild(menu);
        }
        menu.style.removeProperty('position');
        menu.style.removeProperty('top');
        menu.style.removeProperty('left');
        menu.style.removeProperty('right');
        menu.style.removeProperty('width');
        menu.style.removeProperty('z-index');
        menu.style.removeProperty('display');
      }
    }

    function abrirMenu() {
      dropdown.classList.add('is-open');
      menu.hidden = false;
      menu.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      posicionarMenu();
    }

    function fecharMenu() {
      dropdown.classList.remove('is-open');
      menu.hidden = true;
      menu.setAttribute('hidden', '');
      menu.style.removeProperty('display');
      btn.setAttribute('aria-expanded', 'false');
      if (menu.parentElement !== originalParent) {
        originalParent.appendChild(menu);
      }
    }

    function toggleDropdown(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (menu.hidden || menu.hasAttribute('hidden')) {
        abrirMenu();
      } else {
        fecharMenu();
      }
    }

    btn.addEventListener('click', toggleDropdown);

    // Fechar ao clicar em qualquer link de dentro do menu
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        fecharMenu();
      });
    });

    // Fechar ao clicar/tocar fora
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !dropdown.contains(e.target) && !menu.contains(e.target)) {
        fecharMenu();
      }
    });

    var menuPosRaf = 0;
    function schedulePosicionarMenu() {
      if (menuPosRaf) return;
      menuPosRaf = requestAnimationFrame(function () {
        menuPosRaf = 0;
        if (!menu.hidden && !menu.hasAttribute('hidden')) {
          posicionarMenu();
        }
      });
    }

    window.addEventListener('resize', function () {
      if (!menu.hidden && !menu.hasAttribute('hidden')) {
        schedulePosicionarMenu();
      }
    }, { passive: true });

    window.addEventListener('scroll', function () {
      if (window.innerWidth <= 768 && !menu.hidden && !menu.hasAttribute('hidden')) {
        schedulePosicionarMenu();
      }
    }, { passive: true });

    // Fechar ao pressionar Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) {
        fecharMenu();
        btn.focus();
      }
    });
  })();

  /* ====================================================================
     ROM V2.12: Modo Dual (Mapa vs. Feed por País) e Explorador de Países
     ==================================================================== */
  function initQuickCountryView() {
    var btnModeMap = document.getElementById('btn-mode-map');
    var btnModeList = document.getElementById('btn-mode-list');
    var btnBackToMapFeed = document.getElementById('btn-back-to-map-feed');
    var inputEl = document.getElementById('quick-country-input');
    var gridEl = document.getElementById('quick-country-grid');
    var chipsContainer = document.getElementById('quick-popular-chips');

    function setViewMode(mode, opts) {
      opts = opts || {};
      syncViewModeToggleUI(mode);

      if (mode === 'list') {
        renderCountryGrid(inputEl ? inputEl.value : '');
        if (!opts.fromPopState) {
          try {
            history.pushState({ viewMode: 'list', cont: state.cont, country: state.country ? (state.country.a2 || state.country.id) : null }, '', location.pathname + location.search);
          } catch (e) {}
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        if (mapWrapSection) {
          fitAspect();
        }
        if (!opts.fromPopState && history.state && history.state.viewMode === 'list') {
          try {
            history.replaceState({ viewMode: 'map', cont: state.cont, country: state.country ? (state.country.a2 || state.country.id) : null }, '', location.pathname + location.search);
          } catch (e) {}
        }
      }
    }

    if (btnModeMap) {
      btnModeMap.addEventListener('click', function () {
        if (state.editorialSection || state.hubRoute || state.entendaSlug || state.notFound || state.compareSlug) {
          navigateSpa('/');
        }
        setViewMode('map');
      });
    }
    if (btnBackToMapFeed) {
      btnBackToMapFeed.addEventListener('click', function () {
        if (state.editorialSection || state.hubRoute || state.entendaSlug || state.notFound || state.compareSlug) {
          navigateSpa('/');
        }
        setViewMode('map');
        if (mapWrapSection) {
          mapWrapSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
    if (btnModeList) {
      btnModeList.addEventListener('click', function () {
        if (state.editorialSection || state.hubRoute || state.entendaSlug || state.notFound || state.compareSlug) {
          navigateSpa('/');
        }
        setViewMode('list');
      });
    }

    function renderCountryGrid(filterTerm) {
      if (!gridEl || !DATA || !Array.isArray(DATA.countries)) return;
      var term = (filterTerm || '').trim().toLowerCase();
      var list = DATA.countries.filter(function (c) {
        if (!c.m) return false;
        if (!term) return true;
        var nameMatch = (c.n || '').toLowerCase().indexOf(term) !== -1;
        var a2Match = (c.a2 || '').toLowerCase() === term;
        return nameMatch || a2Match;
      });

      // Ordenar alfabeticamente pelo nome em português
      list.sort(function (a, b) {
        return (a.n || '').localeCompare(b.n || '', 'pt-BR');
      });

      if (!list.length) {
        gridEl.innerHTML = '<div class="empty-state" style="grid-column: 1/-1; padding: 2rem; text-align: center;">Nenhum país encontrado para "<strong>' + esc(term) + '</strong>".</div>';
        return;
      }

      gridEl.innerHTML = list.map(function (c) {
        var cMed = countryMedia(c, c.c);
        var totalOutlets = (cMed && cMed.outlets) ? cMed.outlets.length : 0;
        var flagHtml = countryFlag(c, 'flag-sm', c.c) || '<span class="flag-placeholder flag-sm"></span>';
        var contLabel = (CONT[c.c] && CONT[c.c].n) || CONT_SLUGS[c.c] || c.c || '';
        var a2 = String(c.a2 || '').toUpperCase().trim();
        var hasHot = !!(a2 && hotNewsByCountry && hotNewsByCountry[a2]);
        var hotItem = hasHot ? hotNewsByCountry[a2] : null;
        var hotClasses = hasHot ? (' hot-spot-marker' + (hotPulseActive ? ' hot-spot-pulsing' : '')) : '';
        var hotTitle = (hotItem && (hotItem.title || hotItem.summary))
          ? (' title="🔥 Notícia quente em tempo real: ' + esc(hotItem.title || hotItem.summary) + '"')
          : '';
        return '<button type="button" class="quick-country-card' + hotClasses + '" data-country-a2="' + esc(c.a2 || '') + '" data-country-id="' + esc(c.id || '') + '" data-cont="' + esc(c.c || '') + '"' + hotTitle + '>' +
          '<div class="quick-country-card-main">' +
            '<span class="quick-country-flag" aria-hidden="true">' + flagHtml + '</span>' +
            '<div class="quick-country-info">' +
              '<div class="quick-country-name">' + esc(c.n) + (hasHot ? ' <span class="quick-country-hot-badge" title="Notícia quente no país" aria-label="Notícia quente">🔥</span>' : '') + '</div>' +
              '<div class="quick-country-meta">' + esc(contLabel) + '</div>' +
            '</div>' +
          '</div>' +
          '<span class="quick-country-badge">' + totalOutlets + ' ' + (totalOutlets === 1 ? 'veículo' : 'veículos') + '</span>' +
        '</button>';
      }).join('');

      gridEl.querySelectorAll('.quick-country-card').forEach(function (card) {
        card.addEventListener('click', function () {
          var a2 = card.getAttribute('data-country-a2');
          var id = card.getAttribute('data-country-id');
          var cont = card.getAttribute('data-cont');
          var countryObj = (a2 && byA2[a2]) || byId[id];
          if (countryObj) {
            setViewMode('map');
            go(cont, countryObj);
          }
        });
      });
    }

    if (inputEl) {
      inputEl.addEventListener('input', function () {
        renderCountryGrid(inputEl.value);
      });
    }

    if (chipsContainer) {
      chipsContainer.querySelectorAll('[data-quick-country]').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var code = chip.getAttribute('data-quick-country');
          var cObj = byA2[code];
          if (cObj) {
            setViewMode('map');
            go(cObj.c, cObj);
          }
        });
      });
    }

    syncQuickCountryCardsHotNews();
  }

  function initHeroAndMapControls() {
    var btnModeMap = document.getElementById('btn-hero-mode-map');
    var btnModeFeed = document.getElementById('btn-hero-mode-feed');
    if (btnModeMap && btnModeFeed) {
      btnModeMap.addEventListener('click', function () {
        btnModeMap.classList.add('is-active');
        btnModeMap.setAttribute('aria-pressed', 'true');
        btnModeFeed.classList.remove('is-active');
        btnModeFeed.setAttribute('aria-pressed', 'false');
        var mapSec = document.getElementById('map-wrap-section');
        if (mapSec) {
          mapSec.hidden = false;
          mapSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      btnModeFeed.addEventListener('click', function () {
        btnModeFeed.classList.add('is-active');
        btnModeFeed.setAttribute('aria-pressed', 'true');
        btnModeMap.classList.remove('is-active');
        btnModeMap.setAttribute('aria-pressed', 'false');
        var feedSec = document.getElementById('resumo-do-dia');
        if (feedSec) {
          feedSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    var btnLayers = document.getElementById('btn-map-layers');
    var popLayers = document.getElementById('map-layers-popover');
    if (btnLayers && popLayers) {
      btnLayers.addEventListener('click', function (e) {
        e.stopPropagation();
        var isExpanded = btnLayers.getAttribute('aria-expanded') === 'true';
        btnLayers.setAttribute('aria-expanded', String(!isExpanded));
        popLayers.hidden = isExpanded;
      });

      document.addEventListener('click', function (e) {
        if (!popLayers.hidden && !popLayers.contains(e.target) && e.target !== btnLayers) {
          popLayers.hidden = true;
          btnLayers.setAttribute('aria-expanded', 'false');
        }
      });
    }

    var quickRegNav = document.getElementById('map-quick-regions');
    if (quickRegNav) {
      quickRegNav.querySelectorAll('.quick-region-pill, .btn-quick-region').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var targetCont = btn.getAttribute('data-cont') || btn.getAttribute('data-region');
          if (targetCont === 'world') {
            resetToWorld();
          } else if (targetCont === 'americas') {
            setPanelCollapsed(false);
            go('sul', null);
          } else if (CONT[targetCont]) {
            setPanelCollapsed(false);
            go(targetCont, null);
          }
        });
      });
    }
  }

  /* ---------- SIMULADOR COMERCIAL & SLOTS DE MARCA (V2.12) ---------- */
  function initCommercialSimulator() {
    var params = new URLSearchParams(window.location.search || '');
    var brandFromUrl = params.get('marca') || params.get('brand') || '';
    var verticalFromUrl = params.get('vertical') || params.get('segmento') || 'financas';
    var isDemo = params.get('demo') === '1' || params.get('simulador') === '1' || brandFromUrl.length > 0;
    var showPointers = params.get('setas') === '1' || params.get('pointers') === '1';

    window.setMockBrand = function (brandName, options) {
      options = options || {};
      var bName = (brandName || '').trim() || 'Sua Marca Aqui';
      var allTargets = document.querySelectorAll('.mock-brand-logo, .sponsor-brand-target');
      allTargets.forEach(function (el) {
        el.textContent = bName;
      });

      var vert = options.vertical || verticalFromUrl;
      var drawerMsgEl = document.querySelector('.sponsor-drawer-msg');
      if (drawerMsgEl) {
        var paisNome = (document.getElementById('sponsor-country-name') || {}).textContent || 'o exterior';
        if (vert === 'educacao') {
          drawerMsgEl.innerHTML = 'Cursos de idiomas, intercâmbio e certificações globais com foco em <span>' + esc(paisNome) + '</span>.';
        } else if (vert === 'turismo') {
          drawerMsgEl.innerHTML = 'Seguro viagem internacional, eSIM global e assistência 24h para seus roteiros em <span>' + esc(paisNome) + '</span>.';
        } else {
          drawerMsgEl.innerHTML = 'Câmbio comercial, contas globais e soluções de investimento para suas conexões com <span>' + esc(paisNome) + '</span>.';
        }
      }

      // Exibir slots comerciais
      var sMaster = document.getElementById('slot-cota-master');
      var sResumo = document.getElementById('slot-sponsor-resumo');
      var sDrawer = document.getElementById('slot-sponsor-drawer');
      if (sMaster) sMaster.hidden = false;
      if (sResumo) sResumo.hidden = false;
      if (sDrawer) sDrawer.hidden = false;
    };

    window.toggleCommercialSlots = function (visible) {
      var sMaster = document.getElementById('slot-cota-master');
      var sResumo = document.getElementById('slot-sponsor-resumo');
      var sDrawer = document.getElementById('slot-sponsor-drawer');
      if (sMaster) sMaster.hidden = !visible;
      if (sResumo) sResumo.hidden = !visible;
      if (sDrawer) sDrawer.hidden = !visible;
    };

    window.toggleCommercialPointers = function (visible) {
      var existing = document.querySelectorAll('.commercial-pointer');
      existing.forEach(function (p) { p.remove(); });
      if (!visible) return;

      var sMaster = document.getElementById('slot-cota-master');
      if (sMaster && !sMaster.hidden) {
        var p1 = document.createElement('div');
        p1.className = 'commercial-pointer commercial-pointer-1';
        p1.style.top = '4px';
        p1.style.left = '16px';
        p1.innerHTML = '<span class="commercial-pointer-num">1</span> Cota Master';
        sMaster.appendChild(p1);
      }

      var sDrawer = document.getElementById('slot-sponsor-drawer');
      if (sDrawer && !sDrawer.hidden) {
        var p2 = document.createElement('div');
        p2.className = 'commercial-pointer commercial-pointer-2';
        p2.style.top = '-12px';
        p2.style.right = '16px';
        p2.innerHTML = '<span class="commercial-pointer-num">2</span> Gaveta Contextual';
        sDrawer.appendChild(p2);
      }

      var sResumo = document.getElementById('slot-sponsor-resumo');
      if (sResumo && !sResumo.hidden) {
        var p3 = document.createElement('div');
        p3.className = 'commercial-pointer commercial-pointer-3';
        p3.style.top = '-12px';
        p3.style.right = '16px';
        p3.innerHTML = '<span class="commercial-pointer-num">3</span> Resumo do Dia';
        sResumo.appendChild(p3);
      }
    };

    if (isDemo && brandFromUrl) {
      window.setMockBrand(brandFromUrl, { vertical: verticalFromUrl });
      if (showPointers) {
        setTimeout(function () {
          window.toggleCommercialPointers(true);
        }, 500);
      }
    }
  }

  /* ====================================================================
     SUG-CURADORIA-IA: Vitrine de Temas em Alta (/api/vitrine-em-alta)
     ==================================================================== */
  var VITRINE_CAT_META = {
    Politica: { label: 'Política', rota: '/politica', topic: 'politica' },
    Economia: { label: 'Economia & Câmbio', rota: '/economia', topic: 'economia' },
    Cultura: { label: 'Cultura & Sociedade', rota: '/cultura', topic: 'cultura' },
    Eleicoes: { label: 'Eleições', rota: '/eleicoes', topic: 'politica' },
    Geopolitica_Radar: { label: 'Radar Geopolítico', rota: '/radar', topic: 'mundo' },
    Resumo_Ultimas: { label: 'Resumo & Últimas', rota: '/ultimas-noticias', topic: 'politica' }
  };

  var VITRINE_STATUS_META = {
    em_alta: { label: '🔥 Em Alta', cls: 'vitrine-status-em_alta' },
    novo: { label: '✨ Novo', cls: 'vitrine-status-novo' },
    atualizacao: { label: '🔄 Atualização', cls: 'vitrine-status-atualizacao' }
  };

  function renderVitrineIACards(temasAtivos, filtroCat) {
    var secEl = document.getElementById('vitrine-ia');
    var gridEl = document.getElementById('vitrine-ia-grid');
    if (!secEl || !gridEl) return;

    var allTemas = Array.isArray(temasAtivos) ? temasAtivos : [];
    if (!allTemas.length) {
      secEl.setAttribute('data-empty-fallback', 'true');
      if (state.editorialSection === 'radar' || secEl.classList.contains('radar-curadoria-section')) {
        secEl.hidden = false;
        gridEl.innerHTML = '<div class="vitrine-ia-empty">Nenhum tema ativo no momento. A curadoria em tempo real será exibida aqui assim que houver novos sinais.</div>';
      } else {
        secEl.hidden = true;
        gridEl.innerHTML = '';
      }
      return;
    }

    secEl.removeAttribute('data-empty-fallback');
    secEl.hidden = false;
    if (!state.editorialSection && !state.hubRoute && !state.entendaSlug && !state.notFound && !state.compareSlug) {
      secEl.hidden = false;
    }

    var cat = String(filtroCat || '').trim();
    var filtered = allTemas.filter(function (item) {
      if (!item) return false;
      if (!cat) return true;
      if (item.categoria_primaria === cat) return true;
      if (Array.isArray(item.categorias_cruzadas) && item.categorias_cruzadas.indexOf(cat) > -1) return true;
      return false;
    });

    if (!filtered.length) {
      gridEl.innerHTML = '<div class="vitrine-ia-empty">Nenhum tema ativo nesta editoria no momento. Explore outra categoria ou clique em Todos.</div>';
      return;
    }

    var html = filtered.slice(0, 12).map(function (tm) {
      var stKey = (tm.status && VITRINE_STATUS_META[tm.status]) ? tm.status : 'em_alta';
      var stMeta = VITRINE_STATUS_META[stKey];
      var catKey = tm.categoria_primaria || 'Geopolitica_Radar';
      var catMeta = VITRINE_CAT_META[catKey] || { label: catKey, rota: tm.rota_editoria || '/radar', topic: 'politica' };
      var rotaHref = tm.rota_editoria || catMeta.rota || '/radar';
      var scoreVal = typeof tm.relevancia_score === 'number' ? Math.round(tm.relevancia_score) : 90;
      var kws = Array.isArray(tm.palavras_chave_busca) ? tm.palavras_chave_busca.slice(0, 5) : [];
      var cross = Array.isArray(tm.categorias_cruzadas) ? tm.categorias_cruzadas : [];

      var crossLabels = cross.map(function (ck) {
        return (VITRINE_CAT_META[ck] && VITRINE_CAT_META[ck].label) || ck;
      }).filter(Boolean);

      var tagsHtml = '';
      if (kws.length) {
        tagsHtml = '<div class="vitrine-tags-row">' + kws.map(function (kw) {
          return '<button type="button" class="vitrine-keyword-tag" data-vitrine-kw="' + esc(kw) + '" data-vitrine-topic="' + esc(catMeta.topic || 'politica') + '" title="Buscar cobertura sobre ' + esc(kw) + '">🔍 ' + esc(kw) + '</button>';
        }).join('') + '</div>';
      }

      var crossHtml = crossLabels.length
        ? '<span class="vitrine-cross-cats">Cruzamento: ' + esc(crossLabels.join(' · ')) + '</span>'
        : '<span class="vitrine-cross-cats">Curadoria verificada</span>';

      return '<article class="vitrine-ia-card" data-slug="' + esc(tm.slug || '') + '" data-cat="' + esc(catKey) + '">' +
        '<div class="vitrine-ia-card-top">' +
          '<div class="vitrine-ia-card-badges">' +
            '<span class="vitrine-status-badge ' + esc(stMeta.cls) + '">' + esc(stMeta.label) + '</span>' +
            '<span class="vitrine-cat-pill">' + esc(catMeta.label) + '</span>' +
          '</div>' +
          '<span class="vitrine-score-pill" title="Score de relevância editorial IA">' + scoreVal + '% rel.</span>' +
        '</div>' +
        '<h3 class="vitrine-card-title">' + esc(tm.titulo_tema || '') + '</h3>' +
        (tm.sintese_nerd ? '<p class="vitrine-sintese-nerd">' + esc(tm.sintese_nerd) + '</p>' : '') +
        (tm.gatilho_vitrine ? '<p class="vitrine-gatilho-text">' + esc(tm.gatilho_vitrine) + '</p>' : '') +
        tagsHtml +
        '<div class="vitrine-card-footer">' +
          crossHtml +
          '<a href="' + esc(rotaHref) + '" class="vitrine-editoria-link" data-spa-link>Ir para ' + esc(catMeta.label) + ' →</a>' +
        '</div>' +
      '</article>';
    }).join('');

    gridEl.innerHTML = html;

    gridEl.querySelectorAll('[data-vitrine-kw]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kw = btn.getAttribute('data-vitrine-kw') || '';
        var topico = btn.getAttribute('data-vitrine-topic') || 'politica';
        if (!kw) return;
        var targetCountry = state.country || byA2['BR'];
        var targetCont = (targetCountry && targetCountry.c) || state.cont || 'sul';
        var cCode = (targetCountry && targetCountry.a2) || 'BR';
        navigateToPerspectiveCoverage(targetCont, cCode, topico, kw);
      });
    });

    bindDynamicEditorialActions(gridEl);
  }

  function carregarVitrineIA(opcoes) {
    opcoes = opcoes || {};
    var forceRefresh = !!opcoes.forceRefresh;
    var isAutoRefresh = !!opcoes.isAutoRefresh;
    var categoria = typeof opcoes.categoria === 'string' ? opcoes.categoria : vitrineIaSelectedCategory;
    vitrineIaSelectedCategory = categoria || '';

    var secEl = document.getElementById('vitrine-ia');
    var gridEl = document.getElementById('vitrine-ia-grid');
    // SUG-182: a seção foi removida da Home; ainda populamos memória/cache para expansão semântica.
    var hasGrid = !!(secEl && gridEl);

    if (forceRefresh) {
      vitrineIaMemoryTemas = [];
      try { localStorage.removeItem(VITRINE_IA_CACHE_KEY); } catch (e) {}
    } else if (!isAutoRefresh) {
      var cached = lerCacheVitrineIA(false);
      if (cached && cached.length) {
        if (hasGrid) renderVitrineIACards(cached, vitrineIaSelectedCategory);
        else vitrineIaMemoryTemas = cached;
        return;
      }
    }

    var endpoint = (forceRefresh || isAutoRefresh)
      ? ('/api/vitrine-em-alta?_t=' + Date.now() + (forceRefresh ? '&refresh=1' : ''))
      : '/api/vitrine-em-alta';

    var fetchOpts = (forceRefresh || isAutoRefresh)
      ? { cache: 'no-store', headers: { 'Accept': 'application/json' } }
      : { headers: { 'Accept': 'application/json' } };

    fetch(endpoint, fetchOpts)
      .then(function (r) {
        if (!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : 0));
        return r.json();
      })
      .then(function (data) {
        var temas = (data && Array.isArray(data.temas_ativos)) ? data.temas_ativos : [];
        lastAutonomousFetchTimestamps.vitrineIa = Date.now();
        if (temas.length > 0) {
          vitrineIaMemoryTemas = temas;
          salvarCacheVitrineIA(temas, data.updatedAt);
          if (hasGrid) {
            if (isAutoRefresh && isUserReadingOrInteractingWith(gridEl)) {
              pendingAutonomousUpdates.vitrineIa = function () {
                renderVitrineIACards(temas, vitrineIaSelectedCategory);
                triggerHotNewsPulseCycle();
              };
            } else {
              renderVitrineIACards(temas, vitrineIaSelectedCategory);
              triggerHotNewsPulseCycle();
            }
          } else {
            triggerHotNewsPulseCycle();
          }
        } else {
          var stale = lerCacheVitrineIA(true);
          if (stale && stale.length && !forceRefresh) {
            if (hasGrid) renderVitrineIACards(stale, vitrineIaSelectedCategory);
          } else if (hasGrid) {
            renderVitrineIACards([], vitrineIaSelectedCategory);
          }
        }
      })
      .catch(function () {
        var stale = lerCacheVitrineIA(true);
        if (stale && stale.length) {
          if (hasGrid) renderVitrineIACards(stale, vitrineIaSelectedCategory);
          else vitrineIaMemoryTemas = stale;
        } else if (hasGrid) {
          renderVitrineIACards([], vitrineIaSelectedCategory);
        }
      });
  }

  function initVitrineIA() {
    var secEl = document.getElementById('vitrine-ia');
    var chipsWrap = document.getElementById('vitrine-ia-chips');
    if (chipsWrap) {
      chipsWrap.querySelectorAll('.vitrine-ia-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          var cat = chip.getAttribute('data-cat') || '';
          vitrineIaSelectedCategory = cat;
          chipsWrap.querySelectorAll('.vitrine-ia-chip').forEach(function (c) {
            var active = c === chip;
            c.classList.toggle('is-active', active);
            c.setAttribute('aria-selected', String(active));
          });
          var cached = lerCacheVitrineIA(true);
          if (cached && cached.length) {
            if (document.getElementById('vitrine-ia-grid')) renderVitrineIACards(cached, vitrineIaSelectedCategory);
            else vitrineIaMemoryTemas = cached;
          } else {
            carregarVitrineIA({ forceRefresh: false, categoria: vitrineIaSelectedCategory });
          }
        });
      });
    }

    carregarVitrineIA({ forceRefresh: false });
  }

  sincronizarPoolsComEditorial();
  carregarResumoCacheLocal();
  renderEditorialHomeSections();
  carregarDossiesV2(false);
  renderDossiesRotativosHome();
  // Vitrine de dossiês: re-render ao trocar de breakpoint (grade x carrossel de 1 card)
  if (typeof window.matchMedia === 'function') {
    var dossieRotativoMq = window.matchMedia('(max-width: 768px)');
    var onDossieRotativoMq = function () { renderDossiesRotativosHome(); };
    if (typeof dossieRotativoMq.addEventListener === 'function') dossieRotativoMq.addEventListener('change', onDossieRotativoMq);
    else if (typeof dossieRotativoMq.addListener === 'function') dossieRotativoMq.addListener(onDossieRotativoMq);
  }
  // Rotação autônoma do cardápio (mistura tempo real + permanente) a cada 3 min
  setInterval(function () {
    if (document.hidden) return;
    renderDossiesRotativosHome();
  }, DOSSIE_ROTATIVO_BUCKET_MS);
  initVitrineIA();
  initCadastroVeiculoForm();
  initParceriaLeadModal();
  initParceriasForm();
  initClubeMembros();
  function initMobileNavDrawer() {
    var menuBtn = document.getElementById('mobile-menu-btn');
    var drawer = document.getElementById('mobile-nav-drawer');
    var backdrop = document.getElementById('mobile-nav-backdrop');
    var closeBtn = document.getElementById('mobile-nav-close');
    if (!menuBtn || !drawer) return;

    function openDrawer() {
      drawer.hidden = false;
      if (backdrop) backdrop.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      drawer.hidden = true;
      if (backdrop) backdrop.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    menuBtn.addEventListener('click', function () {
      if (drawer.hidden) openDrawer();
      else closeDrawer();
    });

    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    drawer.querySelectorAll('.mobile-nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        closeDrawer();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hidden) {
        closeDrawer();
        menuBtn.focus();
      }
    });
  }

  function initMobileMapLegendCollapse() {
    var legendEl = document.getElementById('map-legend');
    var legendToggleBtn = document.getElementById('map-legend-toggle');
    if (legendEl && legendToggleBtn) {
      legendEl.classList.add('is-collapsed');
      legendToggleBtn.setAttribute('aria-expanded', 'false');
    }
  }

  initMobileNavDrawer();
  initMobileMapLegendCollapse();
  initQuickCountryView();
  initHeroAndMapControls();
  atualizarResumoDoDiaAutomatico();
  initCommercialSimulator();
  checkHotNewsOnMap(false);
  startUnifiedAutonomousUpdates();
  var hotPillEl = document.getElementById('map-hot-news-pill');
  if (hotPillEl) {
    hotPillEl.addEventListener('click', function () {
      triggerHotNewsPulseCycle();
      var resumoEl = document.getElementById('resumo-do-dia');
      if (resumoEl && !resumoEl.hidden) {
        resumoEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }
  fitAspect();
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      fitAspect();
      syncMobileEditorialToggle(state.editorialSection);
    }, 120);
  });
  fromLocation();
})();

(function () { var a = document.getElementById('ano'); if (a) a.textContent = new Date().getFullYear(); })();


