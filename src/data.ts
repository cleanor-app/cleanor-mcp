// Proprietary Cleanor Labs research data, embedded for zero-cost lookups.
// Source studies: cleanor.app/research. Keep numbers in sync with the CSVs in
// public/papers/ (the source of truth).

export const ATTRIBUTION = {
  brand: 'Data by Cleanor Labs (cleanor.app) — free browser tools + original storage research',
};

// --- Photo/video storage capacity (photo-storage-capacity-2026 study) --------
// Advertised GB -> actually-usable GB (OS + filesystem overhead), from the study.
const USABLE_TIERS: Record<number, number> = { 64: 50, 128: 112, 256: 228, 512: 466 };

export function usableGb(advertisedGb: number): number {
  if (USABLE_TIERS[advertisedGb]) return USABLE_TIERS[advertisedGb];
  // Fit for arbitrary sizes: ~0.9x minus a fixed OS floor, matching the tiers.
  return Math.max(1, Math.round(advertisedGb * 0.91 - 6));
}

// MB per item (photos) / per minute (video).
export const PHOTO_ITEMS: Record<string, { label: string; mb: number }> = {
  heic: { label: 'HEIC 12 MP (iPhone default)', mb: 3 },
  jpeg: { label: 'JPEG 12 MP', mb: 5 },
  heif48: { label: 'HEIF 48 MP (iPhone Pro)', mb: 25 },
  proraw: { label: 'ProRAW 48 MP', mb: 75 },
};
export const VIDEO_ITEMS: Record<string, { label: string; mbPerMin: number }> = {
  '1080p': { label: '1080p 30fps', mbPerMin: 60 },
  '4k': { label: '4K 30fps', mbPerMin: 170 },
  '4k60': { label: '4K 60fps', mbPerMin: 400 },
  prores: { label: 'ProRes 4K', mbPerMin: 6000 },
};

export const STORAGE_STUDY = {
  slug: 'how-many-photos-fit-in-your-phone-storage-capacity',
  source: 'https://cleanor.app/blog/how-many-photos-fit-in-your-phone-storage-capacity',
  tryIt: 'https://cleanor.app/research?utm_source=mcp',
};

// --- Image format savings (next-gen-image-formats-2026, 24-image Kodak corpus)
// Percent smaller than JPEG at matched perceptual quality (negative = smaller).
export const FORMAT_SAVINGS = {
  web: { label: 'typical web quality (SSIM 0.95)', webp: -21.7, avif: -36.9, jxl: -18.4 },
  high: { label: 'high quality (SSIM 0.98)', webp: -6.1, avif: -17.9, jxl: -6.7 },
  corpus: '24-image Kodak lossless suite',
  slug: 'next-gen-image-formats-2026-avif-webp-jpeg-xl-benchmark',
  source:
    'https://cleanor.app/blog/next-gen-image-formats-2026-avif-webp-jpeg-xl-benchmark',
};

// --- HEIC conversion tax (heic-conversion-tax-2026, 96 controlled encodes) ----
// Converting an iPhone HEIC to another format at matched quality makes it BIGGER.
export const HEIC_TAX = {
  toJpgMedianX: 2.5, // median size multiplier at visually-matched quality (~q60)
  toPngMedianX: 5.5,
  note: 'Converting an iPhone HEIC to a quality-matched JPG makes it ~2.5x bigger, and to PNG ~5.5x, for no visible quality gain.',
  slug: 'heic-to-jpg-png-conversion-file-size-tax',
  source: 'https://cleanor.app/blog/heic-to-jpg-png-conversion-file-size-tax',
};
