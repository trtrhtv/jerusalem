#!/usr/bin/env node
// Digitization of the Wilson 1865 survey — Jaffa Gate / David Street corridor.
//
// The PIXEL POLYGONS below are the primary digitization artifact: block
// outlines traced visually on the local scan (data/scans/
// wilson-1865-huntington-3532px.jpg, coordinates in that image's pixels) over
// gridded 4× enlargements. Sheet names in quotes ("Suwaikat Allun", block
// numbers 17/64/65/67) are Wilson's own labels. Running this script converts
// them through the georeference transform (scripts/wilson-transform.mjs, with
// the Jaffa-Gate tie-point correction) and writes
// data/features/wilson-1865-buildings.json.
//
// The blocks are BLOCK outlines, not individual houses — that is what a
// 1:2500 survey actually records, and we do not invent finer detail. Their
// geometryConfidence is "surveyed"; existence in 1865 is documented by the
// survey itself, while construction dates are not (the fabric is medieval
// accretion), hence builtPeriod "mamluk" with builtYear null — the same
// convention as the intra-mural quarters in city-growth.json.
//
// Run: node scripts/digitize-wilson.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { localPxToLonLatCorrected, fitRmsMeters } from "./wilson-transform.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Traced features. px lists are [x, y] pixels on the 3532px scan.
 * Polygons are traced clockwise on the image and closed automatically.
 */
export const TRACED = [
  {
    id: "wilson-bldg-plaza-northeast",
    name: "Courtyard building at the gate plaza's northeast corner (Wilson 1865)",
    nameHe: "בניין החצר בפינה הצפון-מזרחית של כיכר השער (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1466, 2903], [1472, 2897], [1502, 2900], [1503, 2908], [1502, 2925],
      [1465, 2926], [1460, 2925],
    ],
    notesHe:
      "הבניין הבודד שוילסון מצייר בפינת הכיכר, חזיתו אל רחוב דוד וחצרו נפתחת דרומה. ממערב וצפונה לו — קרקע פתוחה (גינות הרובע), שוילסון מבחין ממנה בהצללה: את השטח הפתוח הזה במכוון לא דיגטנו כבינוי.",
    notes:
      "The single courtyard building Wilson draws at the plaza corner, fronting David Street. West and north of it lies open ground (quarter gardens) which Wilson distinguishes by lighter hatching — deliberately NOT digitized as built fabric.",
  },
  {
    id: "wilson-pool-hezekiah",
    name: "Pool of Hezekiah (Birket Hammam al-Batrak)",
    nameHe: "בריכת חזקיהו (בירכת חמאם אל-בטרק)",
    geometryType: "Polygon",
    buildingType: "monument",
    builtPeriod: "second-temple",
    px: [
      [1534, 2789], [1611, 2786], [1613, 2907], [1533, 2910],
    ],
    notesHe:
      "בריכת המים הגדולה שוילסון מסמן \"Birket Hammam al Batrak (Pool of Hezekiah)\" — 120×78 פיקסלים בסריקה ≈ 74×48 מ', תואם למידותיה המתועדות (כ-73×44 מ'), אימות עצמאי לקנה המידה של היישור. קיומה ב-1865 מתועד במדידה; זיהויה עם בריכה עתיקה (מגדלון של יוספוס) הוא מסורת מחקרית — התאריך מקורב במכוון.",
    notes:
      "The great open reservoir Wilson labels \"Birket Hammam al Batrak (Pool of Hezekiah)\" — 120×78 scan pixels ≈ 74×48 m, matching its documented ~73×44 m, an independent check of the georeference scale. Its 1865 existence is documented by the survey; identification with the ancient pool (Josephus' Amygdalon) is scholarly tradition — dating deliberately approximate.",
  },
  {
    id: "wilson-blk-david-north-strip",
    name: "Shop strip north of David Street incl. block 17 (Wilson 1865)",
    nameHe: "רצועת החנויות מצפון לרחוב דוד כולל גוש 17 (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "commercial",
    px: [
      [1632, 2871], [1640, 2871], [1640, 2884], [1662, 2884], [1667, 2874],
      [1700, 2872], [1702, 2886], [1722, 2888], [1745, 2882], [1770, 2886],
      [1800, 2882], [1830, 2884], [1848, 2891], [1846, 2904], [1800, 2911],
      [1750, 2916], [1700, 2920], [1618, 2914],
    ],
    notesHe:
      "הרצועה הבנויה בין רחוב דוד (\"Sûk al Bizâr\") לשטח המוריסתאן, מרחוב הנוצרים עד השווקים המשולשים — וילסון מסמן בה שורת תאי חנויות ואת גוש 17.",
    notes:
      "The built strip between David Street (\"Sûk al Bizâr\") and the open Muristan, from Christian Street to the triple bazaars — Wilson draws its row of shop cells and block 17.",
  },
  {
    id: "wilson-blk-65",
    name: "Block 65, south of David Street (Wilson 1865)",
    nameHe: "גוש 65 מדרום לרחוב דוד (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1529, 2946], [1560, 2940], [1614, 2931], [1611, 2962], [1607, 3002],
      [1560, 3006], [1534, 3000], [1524, 2966],
    ],
    notesHe:
      "הגוש שוילסון מספרר 65: בין רחוב דוד (צפון), דרך אל-מאוכף לאורך המצודה (מערב) והסמטאות שמדרום.",
    notes:
      "Wilson's block 65: bounded by David Street (north), Harat al-Maukaf along the citadel (west) and the lanes to the south.",
  },
  {
    id: "wilson-blk-67",
    name: "Block 67 between David St and Harat ad-Dawaye (Wilson 1865)",
    nameHe: "גוש 67 בין רחוב דוד לחארת א-דוואיה (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1624, 2937], [1700, 2929], [1780, 2919], [1846, 2909], [1844, 2975],
      [1765, 2968], [1690, 2960], [1650, 2948],
    ],
    notesHe:
      "הגוש דמוי-העדשה שוילסון מספרר 67, בין רחוב דוד לרחוב חארת א-דוואיה המתפצל ממנו מזרחה — מתחדד לצומת במערב ומתרחב אל השווקים במזרח.",
    notes:
      "Wilson's lens-shaped block 67 between David Street and the diverging Harat ad-Dawaye — tapering to their junction at the west, widening to the bazaars at the east.",
  },
  {
    id: "wilson-blk-64",
    name: "Block 64, south of Harat ad-Dawaye (Wilson 1865)",
    nameHe: "גוש 64 מדרום לחארת א-דוואיה (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1618, 2950], [1660, 2960], [1692, 2968], [1687, 3005], [1627, 3008],
      [1612, 2999], [1615, 2960],
    ],
    notesHe: "הגוש שוילסון מספרר 64, מדרום לחארת א-דוואיה ובגבול הרובע הארמני.",
    notes:
      "Wilson's block 64, south of Harat ad-Dawaye at the edge of the Armenian quarter.",
  },
  {
    id: "wilson-blk-15",
    name: "Block 15 strip east of Christian Street (Wilson 1865)",
    nameHe: "רצועת גוש 15 ממזרח לרחוב הנוצרים (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1633, 2790], [1656, 2790], [1652, 2845], [1649, 2871], [1632, 2871],
      [1620, 2868], [1625, 2830],
    ],
    notesHe:
      "הרצועה הבנויה בין רחוב הנוצרים לשטח המוריסתאן הפתוח. מתאר ברמת גוש.",
    notes:
      "The built strip between Christian Street and the open Muristan. Block-level outline.",
  },
  {
    id: "wilson-blk-16",
    name: "Block 16 west of Suk al-Lahhamin (Wilson 1865)",
    nameHe: "גוש 16 ממערב לסוק אל-לחאמין (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1802, 2762], [1843, 2760], [1843, 2810], [1802, 2812],
    ],
    notesHe: "קצה הגוש שוילסון מספרר 16, בין המוריסתאן לשווקים. מתאר ברמת גוש.",
    notes:
      "Edge of Wilson's block 16 between the Muristan and the bazaars. Block-level outline.",
  },
  {
    id: "wilson-blk-66",
    name: "Block 66 with its courtyard compound (Wilson 1865)",
    nameHe: "גוש 66 על מתחם החצר שבו (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1530, 3020], [1560, 3015], [1655, 3012], [1660, 3040], [1665, 3090],
      [1545, 3098], [1530, 3075], [1520, 3050],
    ],
    notesHe:
      "הגוש שוילסון מספרר 66, מדרום לסמטת דרב אל-יעקוביה, ובו מתחם חצר מצויר בנפרד. מתאר ברמת גוש.",
    notes:
      "Wilson's block 66 south of the Darau al-Yahubiye lane, containing an individually drawn courtyard compound. Block-level outline.",
  },
  {
    id: "wilson-blk-63",
    name: "Block 63 (Wilson 1865)",
    nameHe: "גוש 63 (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1700, 2995], [1755, 2988], [1800, 3000], [1795, 3040], [1740, 3060],
      [1705, 3040],
    ],
    notesHe: "הגוש שוילסון מספרר 63, בגבול הרובע הארמני. מתאר ברמת גוש.",
    notes: "Wilson's block 63 at the Armenian quarter edge. Block-level outline.",
  },
  {
    id: "wilson-blk-62",
    name: "Block 62 (Wilson 1865)",
    nameHe: "גוש 62 (וילסון 1865)",
    geometryType: "Polygon",
    buildingType: "mixed",
    px: [
      [1758, 2985], [1842, 2988], [1835, 3035], [1790, 3045], [1755, 3010],
    ],
    notesHe:
      "הגוש שוילסון מספרר 62, בין חארת א-דוואיה לחארת אל-ג'אוואני. מתאר ברמת גוש.",
    notes:
      "Wilson's block 62 between Harat ad-Dawaye and Harat al-Jawany. Block-level outline.",
  },
  {
    id: "wilson-deir-as-surian",
    name: "Deir as-Surian — the Syriac convent (Wilson block 4)",
    nameHe: "דיר א-סוריאן — מנזר הסורים (גוש 4 אצל וילסון)",
    geometryType: "Polygon",
    buildingType: "religious-compound",
    px: [
      [1752, 3055], [1800, 3050], [1805, 3092], [1755, 3095],
    ],
    notesHe:
      "המתחם שוילסון מסמן \"Deir as-Surian 4\" — מנזר הסורים-אורתודוקסים (מסורת מר מרקוס). מתאר מתחם.",
    notes:
      "The compound Wilson labels \"Deir as-Surian 4\" — the Syriac Orthodox convent (St Mark's tradition). Compound outline.",
  },
  {
    id: "wilson-harat-al-maukaf",
    name: "Harat al-Maukaf street along the citadel (Wilson 1865)",
    nameHe: "רחוב חארת אל-מאוכף לאורך המצודה (וילסון 1865)",
    geometryType: "LineString",
    buildingType: "road",
    px: [
      [1528, 2944], [1522, 2960], [1517, 2985], [1508, 3010], [1500, 3040],
      [1495, 3070],
    ],
    notesHe:
      "הרחוב היורד דרומה מרחוב דוד לאורך חזית המצודה — קו האמצע כפי שמדד וילסון.",
    notes:
      "The street descending south from David Street along the citadel front — centerline as Wilson surveyed it.",
  },
  {
    id: "wilson-david-street",
    name: "David Street (Suwaikat Allun / Suk al-Bizar), Wilson 1865",
    nameHe: "רחוב דוד (סוויקת עלון / סוק אל-ביזאר), וילסון 1865",
    geometryType: "LineString",
    buildingType: "road",
    px: [
      [1408, 2941], [1450, 2935], [1500, 2929], [1560, 2926], [1616, 2923],
      [1700, 2925], [1780, 2916], [1848, 2907],
    ],
    notesHe:
      "ציר רחוב דוד משער יפו עד השווקים המשולשים, כפי שמדד וילסון — קו האמצע של הרחוב. התוואי עתיק בהרבה מ-1865; כאן מתועד מיקומו המדויק.",
    notes:
      "The David Street axis from Jaffa Gate to the triple bazaars as Wilson surveyed it — the street centerline. The alignment is far older than 1865; what is documented here is its measured position.",
  },
  {
    id: "wilson-harat-an-nasara",
    name: "Harat an-Nasara / Christian Quarter street (Wilson 1865)",
    nameHe: "חארת א-נסארה / רחוב הנוצרים (וילסון 1865)",
    geometryType: "LineString",
    buildingType: "road",
    px: [
      [1630, 2745], [1625, 2800], [1620, 2860], [1616, 2895], [1614, 2914],
    ],
    notesHe:
      "רחוב הרובע הנוצרי התוחם את בריכת חזקיהו ממזרח ונפגש עם רחוב דוד — קו האמצע כפי שמדד וילסון. הצלע הצפונית של צומת הפיילוט.",
    notes:
      "The Christian-quarter street bounding the Pool of Hezekiah on the east, meeting David Street — centerline as Wilson surveyed it. The pilot junction's northern arm.",
  },
  {
    id: "wilson-harat-ad-dawaye",
    name: "Harat ad-Dawaye street (Wilson 1865)",
    nameHe: "רחוב חארת א-דוואיה (וילסון 1865)",
    geometryType: "LineString",
    buildingType: "road",
    px: [
      [1620, 2946], [1665, 2957], [1700, 2963], [1765, 2971], [1848, 2982],
    ],
    notesHe:
      "הרחוב המתפצל מרחוב דוד מזרחה-דרומה — קו האמצע כפי שמדד וילסון.",
    notes:
      "The street diverging southeast from David Street — centerline as Wilson surveyed it.",
  },
];

const features = TRACED.map((t) => {
  const coords = t.px.map(([x, y]) => localPxToLonLatCorrected(x, y));
  const geometry =
    t.geometryType === "Polygon"
      ? { type: "Polygon", coordinates: [[...coords, coords[0]]] }
      : { type: "LineString", coordinates: coords };
  return {
    type: "Feature",
    geometry,
    properties: {
      id: t.id,
      name: t.name,
      nameHe: t.nameHe,
      builtPeriod: t.builtPeriod ?? "mamluk",
      builtYear: null,
      buildingType: t.buildingType,
      evidenceTier: "documented",
      geometryConfidence: "surveyed",
      sources: ["wilson-1865"],
      notesHe: t.notesHe,
      notes: t.notes,
    },
  };
});

const collection = {
  type: "FeatureCollection",
  name: "wilson-1865-buildings",
  metadata: {
    generatedBy: "scripts/digitize-wilson.mjs — do not edit by hand; edit the traced pixel polygons there and re-run",
    method:
      "Block outlines and street centerlines traced visually on the Huntington scan (data/scans/wilson-1865-huntington-3532px.jpg) over gridded 4x enlargements, then transformed to WGS84 via the affine fit of the 5 ground-control points in public/annotations/wilson-1865.json plus a tie-point correction pinning the Jaffa Gate GCP exactly.",
    accuracy: `Global georeference RMS ~${fitRmsMeters().toFixed(0)} m; near the gate corridor the tie-point correction brings expected error to ~5-10 m. Tracing precision ~2 px (~1.2 m).`,
    scope:
      "The David Street corridor: Jaffa Gate plaza to the triple bazaars. Blocks, not individual houses — the honest resolution of a 1:2500 survey.",
  },
  features,
};

const out = resolve(root, "data/features/wilson-1865-buildings.json");
writeFileSync(out, JSON.stringify(collection, null, 2) + "\n");
console.log(`wrote ${features.length} features → ${out}`);
