// ============================================================================
// Nilkamal 3D Configurator — Product / Pricing Catalog
// Indicative SKU names & prices, styled after Nilkamal's real furniture lines.
// ============================================================================

export const BRAND = {
  name: 'Nilkamal',
  tagline: "India's Favourite Furniture",
  blue: '#1567C4',
  blueDark: '#0D4A94',
  navy: '#0F2A47',
  sale: '#D6273C',
};

export const SWATCHES = {
  fabric: [
    { id: 'charcoal', name: 'Charcoal Grey', hex: '#54585e', premium: false },
    { id: 'denim', name: 'Denim Blue', hex: '#3e5f82', premium: false },
    { id: 'emerald', name: 'Emerald Green', hex: '#276b55', premium: true },
    { id: 'terracotta', name: 'Terracotta', hex: '#c1603f', premium: false },
    { id: 'mustard', name: 'Mustard Gold', hex: '#cf9c3e', premium: true },
    { id: 'rose', name: 'Dusty Rose', hex: '#c69893', premium: false },
    { id: 'navy', name: 'Midnight Navy', hex: '#2e3a56', premium: true },
    { id: 'ivory', name: 'Classic Ivory', hex: '#ece4d2', premium: false },
  ],
  wood: [
    { id: 'walnut', name: 'Walnut Brown', hex: '#5a3d2b', premium: false },
    { id: 'oak', name: 'Natural Oak', hex: '#ba8a52', premium: false },
    { id: 'maple', name: 'Honey Maple', hex: '#d3a35e', premium: false },
    { id: 'wenge', name: 'Wenge Dark', hex: '#2b1d19', premium: true },
    { id: 'greige', name: 'Smoked Greige', hex: '#6d675f', premium: true },
    { id: 'white', name: 'Arctic White', hex: '#eeeae2', premium: false },
  ],
  metal: [
    { id: 'black', name: 'Matte Black', hex: '#2b2b2b' },
    { id: 'brass', name: 'Brushed Brass', hex: '#a9812f' },
    { id: 'chrome', name: 'Chrome Silver', hex: '#c9cdd1' },
  ],
};

// Every category shares this shape:
// { key, label, navLabel, icon, title, rating, reviews, steps:[...], build() -> scene config }
export const CATALOG = {
  sofa: {
    key: 'sofa',
    navLabel: 'Sofas',
    heroName: 'Nilkamal Boston Modular Sofa',
    sku: 'NK-SOF-BOS',
    rating: 4.4,
    reviews: 812,
    materialTargets: { fabric: ['baked_Material #-2147480571', 'Material.005'] },
    variants: [
      { id: 'boston', name: 'Boston', desc: 'Classic track-arm silhouette', priceAdd: 0 },
      { id: 'cosmo', name: 'Cosmo', desc: 'Low-profile contemporary', priceAdd: 6000 },
    ],
    layouts: [
      {
        id: 'seat2', name: '2-Seater Loveseat', dims: '152 × 86 × 84 cm',
        widthCm: 152, depthCm: 86, heightCm: 84,
        files: { boston: 'sofa1-var1.glb', cosmo: 'sofa2-var1.glb' },
        price: { boston: 32999, cosmo: 38999 },
      },
      {
        id: 'seat3', name: '3-Seater Sofa', dims: '198 × 90 × 84 cm',
        widthCm: 198, depthCm: 90, heightCm: 84,
        files: { boston: 'sofa1-var2.glb', cosmo: 'sofa2-var2.glb' },
        price: { boston: 44999, cosmo: 52999 },
      },
    ],
    swatchGroup: 'fabric',
    modules: [
      { id: 'sidetable', name: 'Add Side Table', price: 4499, kind: 'sidetable' },
      { id: 'ottoman', name: 'Add Ottoman / Extra Seat', price: 7999, kind: 'ottoman' },
    ],
    assetDir: 'sofa',
  },

  bed: {
    key: 'bed',
    navLabel: 'Beds',
    heroName: 'Nilkamal Dream Upholstered Bed',
    sku: 'NK-BED-DRM',
    rating: 4.5,
    reviews: 604,
    materialTargets: { fabric: ['Selesta_2721', 'BED_06'] },
    variants: [
      { id: 'dream', name: 'Dream', desc: 'Channel-tufted headboard', priceAdd: 0, heightCm: 105 },
      { id: 'zen', name: 'Zen', desc: 'Minimal platform silhouette', priceAdd: 9000, heightCm: 85 },
    ],
    sizes: [
      { id: 'single', name: 'Single', dims: '91 × 191 cm', scale: 0.76, priceAdd: -6000, widthCm: 91 },
      { id: 'queen', name: 'Queen', dims: '152 × 203 cm', scale: 1.0, priceAdd: 0, widthCm: 152 },
      { id: 'king', name: 'King', dims: '193 × 203 cm', scale: 1.18, priceAdd: 7000, widthCm: 193 },
    ],
    files: { dream: 'bed1-var1.glb', zen: 'bed2-var1.glb' },
    basePrice: { dream: 27999, zen: 36999 },
    swatchGroup: 'fabric',
    assetDir: 'bed',
  },

  wardrobe: {
    key: 'wardrobe',
    navLabel: 'Wardrobes',
    heroName: 'Nilkamal Aria Wardrobe',
    sku: 'NK-WRD-ARI',
    rating: 4.3,
    reviews: 341,
    variants: [
      {
        id: 'classic', name: 'Classic 2-Door', desc: 'Hinged doors, 2 internal shelves', priceAdd: 0,
        file: 'almirah1-var1.glb', altFile: 'almirah1-var2.glb', basePrice: 21999, heightCm: 180,
        twoTone: false,
        materialTargets: { wood: ['01_-_Default'] },
      },
      {
        id: 'modular', name: 'Modular Sliding', desc: 'Soft-close sliding door system', priceAdd: 0,
        file: 'almirah2-var1.glb', altFile: 'almirah2-var2.glb', basePrice: 58999, heightCm: 220,
        twoTone: true,
        materialTargets: { frame: ['Dark Brown'], door: ['Light Brown'] },
      },
    ],
    widths: [
      { id: 'compact', name: 'Compact', dims: '120 cm wide', scaleX: 0.86, priceAdd: -3000, widthCm: 120 },
      { id: 'standard', name: 'Standard', dims: '150 cm wide', scaleX: 1.0, priceAdd: 0, widthCm: 150 },
      { id: 'wide', name: 'Wide', dims: '180 cm wide', scaleX: 1.16, priceAdd: 5500, widthCm: 180 },
    ],
    swatchGroup: 'wood',
    assetDir: 'wardrobe',
  },

  dining: {
    key: 'dining',
    navLabel: 'Dining',
    heroName: 'Nilkamal Ovalis Dining Set',
    sku: 'NK-DIN-OVL',
    rating: 4.6,
    reviews: 258,
    materialTargets: { wood: ['Table', 'ovalTable_mat2'], fabric: ['Chair', 'pillow'] },
    variants: [
      {
        id: 'ovalis', name: 'Ovalis', desc: '6-seat oval dining table', priceAdd: 0,
        file: 'table1-var1.glb', altFile: 'table1-var2.glb', basePrice: 47999,
        chairNodes: ['Chair6_Seat_0', 'Chair6_Seat_1', 'Chair6_Seat_2', 'Chair6_Seat_3', 'Chair6_Seat_4', 'Chair6_Seat_5'],
        chairPrice: 2999, minChairs: 0, seatOptions: [4, 6],
        widthCm: 180, heightCm: 76,
      },
      {
        id: 'bistro', name: 'Bistro', desc: '4-seat round dining table', priceAdd: -20000,
        file: 'table2-var1.glb', altFile: 'table2-var2.glb', basePrice: 27999,
        chairNodes: ['SM_Chair', 'SM_Chair1', 'SM_Chair2', 'SM_Chair3'],
        chairPrice: 2499, minChairs: 0, seatOptions: [2, 4],
        widthCm: 90, heightCm: 75,
      },
    ],
    swatchGroup: 'wood',
    assetDir: 'dining',
  },

  accent: {
    key: 'accent',
    navLabel: 'Accents',
    heroName: 'Nilkamal Orbit Side Table',
    sku: 'NK-ACC-ORB',
    rating: 4.2,
    reviews: 97,
    procedural: true,
    variants: [
      { id: 'round', name: 'Round Top', desc: 'Hairpin leg accent table', priceAdd: 0 },
      { id: 'square', name: 'Square Top', desc: 'Boxed metal frame table', priceAdd: 700 },
    ],
    sizes: [
      { id: 'small', name: 'Small', dims: '40 × 40 × 45 cm', scale: 0.85, priceAdd: 0, widthCm: 40, heightCm: 45 },
      { id: 'large', name: 'Large', dims: '55 × 55 × 52 cm', scale: 1.15, priceAdd: 800, widthCm: 55, heightCm: 52 },
    ],
    basePrice: 3999,
    swatchGroup: 'wood',
    metalSwatchGroup: 'metal',
    assetDir: null,
  },
};

export const CATEGORY_ORDER = ['sofa', 'bed', 'wardrobe', 'dining', 'accent'];

export function formatINR(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export function emiEstimate(n) {
  return Math.round(n / 24);
}
