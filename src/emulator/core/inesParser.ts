export interface RomMetadata {
  name: string;
  sizeBytes: number;
  prgRomBanks: number;
  chrRomBanks: number;
  prgRomSizeKb: number;
  chrRomSizeKb: number;
  mapperId: number;
  mapperName: string;
  mirroring: 'horizontal' | 'vertical' | 'four-screen';
  hasBatteryRam: boolean;
  hasTrainer: boolean;
  hash: string;
  /** Cryptographic SHA-256 hex digest (64 chars) matching Android MessageDigest("SHA-256"). */
  sha256: string;
}

const MAPPER_NAMES: Record<number, string> = {
  0: 'NROM',
  1: 'MMC1 (SxROM)',
  2: 'UxROM',
  3: 'CNROM',
  4: 'MMC3 (TxROM)',
  5: 'MMC5',
  7: 'AxROM',
  9: 'MMC2',
  11: 'Color Dreams',
  34: 'BNROM / NINA-001',
  66: 'GxROM',
};

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Pure synchronous FIPS 180-4 SHA-256 hex digest.
 * Works identically in insecure HTTP previews, Web Workers, Node tests, and Android MessageDigest.
 */
export function computeSha256Hex(bytes: Uint8Array): string {
  const len = bytes.length;
  const bitLenHi = Math.floor((len * 8) / 0x100000000);
  const bitLenLo = (len * 8) >>> 0;
  const paddedLen = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((v) => v.toString(16).padStart(8, '0'))
    .join('');
}

export function computeFastHash(bytes: Uint8Array): string {
  let hash = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeStringHash32(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function parseInesHeader(bytes: Uint8Array, name = 'Untitled.nes'): RomMetadata {
  if (bytes.length < 16) {
    throw new Error('Invalid .nes file: ROM is smaller than the 16-byte iNES header.');
  }
  // Magic bytes "NES\x1A"
  if (
    bytes[0] !== 0x4e ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0x53 ||
    bytes[3] !== 0x1a
  ) {
    throw new Error('Invalid .nes file: missing iNES header magic signature (NES\\x1A).');
  }

  const prgRomBanks = bytes[4];
  const chrRomBanks = bytes[5];
  const flags6 = bytes[6];
  const flags7 = bytes[7];

  if (prgRomBanks === 0) {
    throw new Error('Invalid .nes file: PRG-ROM bank count cannot be 0.');
  }

  const hasTrainer = (flags6 & 0x04) !== 0;
  const hasBatteryRam = (flags6 & 0x02) !== 0;
  const fourScreen = (flags6 & 0x08) !== 0;
  const mirroring: RomMetadata['mirroring'] = fourScreen
    ? 'four-screen'
    : (flags6 & 0x01) !== 0
      ? 'vertical'
      : 'horizontal';

  const mapperLower = (flags6 >> 4) & 0x0f;
  const mapperUpper = flags7 & 0xf0;
  const mapperId = mapperUpper | mapperLower;

  const expectedMinSize = 16 + (hasTrainer ? 512 : 0) + prgRomBanks * 16384;
  if (bytes.length < expectedMinSize) {
    throw new Error(
      `Corrupted .nes file: expected at least ${expectedMinSize} bytes, received ${bytes.length} bytes.`
    );
  }

  return {
    name,
    sizeBytes: bytes.length,
    prgRomBanks,
    chrRomBanks,
    prgRomSizeKb: prgRomBanks * 16,
    chrRomSizeKb: chrRomBanks * 8,
    mapperId,
    mapperName: MAPPER_NAMES[mapperId] ?? `Mapper #${mapperId}`,
    mirroring,
    hasBatteryRam,
    hasTrainer,
    hash: computeFastHash(bytes),
    sha256: computeSha256Hex(bytes),
  };
}

export function uint8ArrayToBinaryString(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return chunks.join('');
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const binary = uint8ArrayToBinaryString(bytes);
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
