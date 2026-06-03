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

export const HOOD_CATALOG: Record<number, CatalogCity> = {
  5000: TEL_AVIV,
};

export function catalogForCity(cityId: number | string | undefined): CatalogCity | undefined {
  if (cityId == null) return undefined;
  return HOOD_CATALOG[Number(cityId)];
}
