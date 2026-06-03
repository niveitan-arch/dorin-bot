// Static neighborhood catalogs per Yad2 city, used to render a multi-select
// picker in the wizard. Generated from Yad2's address-autocomplete (Iteration 5).
// Names are cleaned of the trailing ", <city>" suffix.

export interface CatalogCity {
  cityId: number;
  cityName: string;
  base: Record<string, string | number>; // topArea, area, city
  neighborhoods: { id: string; name: string }[];
}

const TEL_AVIV: CatalogCity = {
  cityId: 5000,
  cityName: 'תל אביב יפו',
  base: { topArea: 2, area: 1, city: 5000 },
  neighborhoods: [
    { id: '1490', name: 'אזורי חן, גימל החדשה' },
    { id: '1514', name: 'אפקה' },
    { id: '1518', name: 'בבלי' },
    { id: '486', name: 'ביצרון ורמת ישראל' },
    { id: '211', name: 'גני צהלה, רמות צהלה' },
    { id: '1462', name: 'גני שרונה, קרית הממשלה' },
    { id: '195', name: 'הגוש הגדול, רמת אביב החדשה, נופי ים' },
    { id: '1513', name: 'הדר יוסף' },
    { id: '315', name: 'המשתלה' },
    { id: '1519', name: 'הצפון החדש - דרום' },
    { id: '1516', name: 'הצפון החדש - כיכר המדינה' },
    { id: '204', name: 'הצפון החדש - צפון' },
    { id: '1461', name: 'הצפון הישן - דרום' },
    { id: '1483', name: 'הצפון הישן - צפון' },
    { id: '206', name: 'יד אליהו' },
    { id: '321', name: "יפו ד', גבעת התמרים" },
    { id: '320', name: 'יפו העתיקה' },
    { id: '198', name: 'כוכב הצפון' },
    { id: '1521', name: 'כרם התימנים' },
    { id: '1520', name: 'לב תל אביב, לב העיר צפון' },
    { id: '485', name: 'מונטיפיורי, הרכבת' },
    { id: '214', name: 'מעוז אביב' },
    { id: '483', name: 'מרכז הירידים' },
    { id: '200', name: "נאות אפקה א'" },
    { id: '199', name: "נאות אפקה ב'" },
    { id: '196', name: 'נווה אביבים' },
    { id: '209', name: 'נווה אליעזר וכפר שלם מזרח' },
    { id: '208', name: 'נווה ברבור, כפר שלם מערב' },
    { id: '492', name: "נווה גולן, יפו ג'" },
    { id: '207', name: 'נווה חן' },
    { id: '213', name: 'נווה עופר, תל כביר' },
    { id: '848', name: 'נווה צדק' },
    { id: '307', name: 'נווה שאנן' },
    { id: '314', name: 'נווה שרת' },
    { id: '317', name: 'נחלת יצחק' },
    { id: '493', name: "עג'מי, גבעת העליה" },
    { id: '482', name: 'עתידים, אזור התעסוקה רמת החייל' },
    { id: '489', name: 'פארק דרום' },
    { id: '205', name: 'פלורנטין' },
    { id: '313', name: 'צהלה' },
    { id: '494', name: 'צהלון, שיכוני חסכון' },
    { id: '991431', name: 'צוקי אביב' },
    { id: '1517', name: 'צמרות איילון, פארק צמרת' },
    { id: '495', name: 'צפון יפו, המושבה האמריקאית-גרמנית' },
    { id: '212', name: 'קרית שלום' },
    { id: '202', name: 'רביבים' },
    { id: '197', name: 'רמת אביב' },
    { id: '1515', name: "רמת אביב ג'" },
    { id: '203', name: 'רמת החייל' },
    { id: '1649', name: 'רמת הטייסים' },
    { id: '201', name: 'שיכון דן, נווה דן' },
    { id: '215', name: 'שפירא' },
    { id: '849', name: "תכנית ל' (למד)" },
    { id: '312', name: 'תל ברוך' },
    { id: '481', name: 'תל ברוך צפון' },
    { id: '318', name: 'תל חיים' },
  ],
};

const RAMAT_GAN: CatalogCity = {
  cityId: 8600,
  cityName: 'רמת גן',
  base: { topArea: 2, area: 3, city: 8600 },
  neighborhoods: [
    { id: '235', name: 'שכונת גפן' },
    { id: '237', name: 'נגבה' },
    { id: '238', name: 'נווה רם, שיכון מזרחי' },
    { id: '239', name: 'נווה יהושע, ערמונים' },
    { id: '240', name: 'שיכון הותיקים' },
    { id: '241', name: 'תל גנים' },
    { id: '242', name: 'שיכון צנחנים' },
    { id: '327', name: 'חרוזים' },
    { id: '328', name: 'שכונת הלל' },
    { id: '329', name: 'פארק לאומי' },
    { id: '331', name: 'קרית קריניצי' },
    { id: '332', name: 'רמת עמידר' },
    { id: '466', name: 'כפר אז"ר' },
    { id: '467', name: 'רמת אפעל' },
    { id: '653', name: 'בורסה' },
    { id: '1473', name: "שכונת בן גוריון, מרכז העיר ג'" },
    { id: '1474', name: 'נחלת גנים' },
    { id: '1477', name: 'שכונת חשמונאים, מרכז העיר א' },
    { id: '1478', name: 'עליות' },
    { id: '1479', name: 'מרום נווה, רמת יצחק' },
    { id: '1482', name: 'יד לבנים' },
    { id: '1484', name: 'שכונת יהלום, מרכז העיר ב' },
    { id: '1487', name: 'אזור הבילויים' },
    { id: '1645', name: 'קרית בורוכוב' },
    { id: '1647', name: 'שכונת הראשונים' },
    { id: '1648', name: 'רמת חן' },
    { id: '1651', name: 'גבעת גאולה' },
    { id: '2111', name: 'רמת השקמה' },
  ],
};

const GIVATAYIM: CatalogCity = {
  cityId: 6300,
  cityName: 'גבעתיים',
  base: { topArea: 2, area: 3, city: 6300 },
  neighborhoods: [
    { id: '245', name: 'שטח 9' },
    { id: '355', name: 'בורוכוב' },
    { id: '1481', name: 'שינקין' },
    { id: '1485', name: 'פועלי הרכבת' },
    { id: '1488', name: 'תל גנים' },
    { id: '1642', name: 'ארלוזורוב' },
    { id: '1643', name: 'גבעת הרמב"ם' },
    { id: '991509', name: 'סיטי' },
    { id: '991511', name: 'חברת חשמל' },
    { id: '991512', name: 'גבעת קוזלובסקי' },
  ],
};

const BEER_SHEVA: CatalogCity = {
  cityId: 9000,
  cityName: 'באר שבע',
  base: { topArea: 43, area: 22, city: 9000 },
  neighborhoods: [
    { id: '35', name: 'נווה מנחם' },
    { id: '36', name: 'שכונה י"א' },
    { id: '37', name: "שכונה ו'" },
    { id: '38', name: 'רמות' },
    { id: '39', name: "שכונה ב'" },
    { id: '40', name: "שכונה ה'" },
    { id: '42', name: "שכונה א'" },
    { id: '43', name: 'נאות לון' },
    { id: '44', name: 'העיר העתיקה, רמב"ם, דרום' },
    { id: '45', name: 'נווה נוי' },
    { id: '322', name: 'נווה זאב, נאות אילן' },
    { id: '323', name: 'נחל בקע' },
    { id: '1343', name: 'בית חולים סורוקה' },
    { id: '1344', name: "שכונה ג'" },
    { id: '1346', name: "שכונה ד'" },
    { id: '22103', name: 'רקפות' },
    { id: '991397', name: 'רמות הרכס' },
    { id: '991398', name: 'פלח שבע' },
    { id: '991399', name: "שכונה ט'" },
    { id: '991438', name: 'סיגליות' },
    { id: '2002002', name: 'כלניות' },
    { id: '20060013', name: 'סנטרל פארק / האצטדיון' },
  ],
};

export const HOOD_CATALOG: Record<number, CatalogCity> = {
  5000: TEL_AVIV,
  8600: RAMAT_GAN,
  6300: GIVATAYIM,
  9000: BEER_SHEVA,
};

export function catalogForCity(cityId: number | string | undefined): CatalogCity | undefined {
  if (cityId == null) return undefined;
  return HOOD_CATALOG[Number(cityId)];
}
