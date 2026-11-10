/**
 * Campus buildings for the illustrated map.
 * Edit names / hours / positions to match the real SUP'COM campus.
 * `box` describes an isometric prism: back corner (x,y), width a, depth b, height h (in SVG units, 390×660 canvas).
 */
export type CampusCategory = 'amphis' | 'labs' | 'library' | 'cafeteria' | 'administration';

export interface CampusPlace {
  id: string;
  name: string;
  subtitle: string;
  category: CampusCategory;
  walkMin: number;
  hours: string;
  box: { x: number; y: number; a: number; b: number; h: number };
  label: { x: number; y: number };
  lat: number;
  lng: number;
}

// Approximate centre of SUP'COM (Cité Technologique des Communications, El Ghazala). Adjust if needed.
export const SUPCOM_COORDS = { lat: 36.8925, lng: 10.1875 };

export const CAMPUS_PLACES: CampusPlace[] = [
  { id: 'admin', name: 'Administration', subtitle: 'Scolarité · Direction', category: 'administration', walkMin: 3, hours: 'Open until 16:30', box: { x: 110, y: 190, a: 70, b: 50, h: 70 }, label: { x: 109, y: 96 }, lat: 36.8929, lng: 10.1871 },
  { id: 'amphis', name: 'Amphithéâtres A & B', subtitle: 'Lecture halls', category: 'amphis', walkMin: 2, hours: 'Open until 19:00', box: { x: 290, y: 170, a: 70, b: 70, h: 30 }, label: { x: 287, y: 152 }, lat: 36.8931, lng: 10.188 },
  { id: 'library', name: 'Bibliothèque – Library', subtitle: 'Reading rooms · 2 floors', category: 'library', walkMin: 2, hours: 'Open until 18:00', box: { x: 200, y: 330, a: 90, b: 60, h: 40 }, label: { x: 213, y: 270 }, lat: 36.8923, lng: 10.1876 },
  { id: 'cafeteria', name: 'Cafétéria', subtitle: 'Food & coffee', category: 'cafeteria', walkMin: 4, hours: 'Open until 17:00', box: { x: 90, y: 420, a: 60, b: 45, h: 28 }, label: { x: 91, y: 421 }, lat: 36.892, lng: 10.1868 },
  { id: 'labs', name: 'Labs Télécom', subtitle: 'TP rooms · Networks · RF', category: 'labs', walkMin: 3, hours: 'Open until 18:30', box: { x: 300, y: 470, a: 60, b: 50, h: 50 }, label: { x: 308, y: 447 }, lat: 36.8918, lng: 10.1883 },
];

export const CAMPUS_CATEGORIES: { value: CampusCategory; label: string }[] = [
  { value: 'amphis', label: 'Amphis' },
  { value: 'labs', label: 'Labs' },
  { value: 'library', label: 'Library' },
  { value: 'cafeteria', label: 'Cafeteria' },
  { value: 'administration', label: 'Administration' },
];
