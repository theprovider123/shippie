// packages/sdk/src/wrapper/qr.ts
/**
 * Dependency-free QR code generator -> SVG string.
 *
 * Ported from Project Nayuki's "QR Code generator library" (TypeScript
 * variant). Original: https://www.nayuki.io/page/qr-code-generator-library
 * Original (c) Project Nayuki, MIT license.
 *
 * This port trims the public API to just `renderQrSvg(text, opts)`,
 * defaults to byte mode + ECC level M, and outputs a minimal SVG with
 * one <rect> per dark module. Everything else is module-local.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface QrOptions {
  /** Final SVG pixel size (square). Default 192. */
  size?: number;
  /** Quiet-zone modules. Default 4. */
  margin?: number;
  /** Dark-module color. Default '#000'. */
  fg?: string;
  /** Light-module / background color. Default '#fff'. */
  bg?: string;
}

/**
 * Encode `text` as a QR code and return an SVG string. Byte mode, ECC
 * level MEDIUM. Version is auto-selected (1..40). Output is deterministic:
 * same input + options always produce the same SVG.
 */
export function renderQrSvg(text: string, opts: QrOptions = {}): string {
  const size = opts.size ?? 192;
  const margin = opts.margin ?? 4;
  const fg = opts.fg ?? '#000';
  const bg = opts.bg ?? '#fff';

  const qr = QrCode.encodeText(text, Ecc.MEDIUM);
  const n = qr.size;
  const dim = n + margin * 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">`,
  );
  parts.push(`<rect width="${dim}" height="${dim}" fill="${bg}"/>`);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.getModule(x, y)) {
        parts.push(
          `<rect x="${x + margin}" y="${y + margin}" width="1" height="1" fill="${fg}"/>`,
        );
      }
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Error correction levels
// ---------------------------------------------------------------------------

class Ecc {
  static readonly LOW = new Ecc(0, 1);
  static readonly MEDIUM = new Ecc(1, 0);
  static readonly QUARTILE = new Ecc(2, 3);
  static readonly HIGH = new Ecc(3, 2);

  private constructor(
    public readonly ordinal: number,
    public readonly formatBits: number,
  ) {}
}

// ---------------------------------------------------------------------------
// QR Code
// ---------------------------------------------------------------------------

class QrCode {
  /** Module grid: true = dark, false = light. */
  private readonly modules: boolean[][];
  /** Function-pattern mask (not data modules). */
  private readonly isFunction: boolean[][];

  static encodeText(text: string, ecl: Ecc): QrCode {
    const bytes = toUtf8Bytes(text);
    const seg = QrSegment.makeBytes(bytes);
    return QrCode.encodeSegments([seg], ecl);
  }

  static encodeSegments(
    segs: QrSegment[],
    ecl: Ecc,
    minVersion = 1,
    maxVersion = 40,
    mask = -1,
  ): QrCode {
    if (
      !(MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= MAX_VERSION) ||
      mask < -1 ||
      mask > 7
    ) {
      throw new RangeError('invalid version/mask');
    }

    let version = minVersion;
    let dataUsedBits = 0;
    for (;;) {
      const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
      const usedBits = QrSegment.getTotalBits(segs, version);
      if (usedBits <= dataCapacityBits) {
        dataUsedBits = usedBits;
        break;
      }
      if (version >= maxVersion) {
        throw new Error('data too long');
      }
      version++;
    }

    // Concatenate segment data into bit buffer
    const bb: number[] = [];
    for (const seg of segs) {
      appendBits(seg.mode.modeBits, 4, bb);
      appendBits(seg.numChars, seg.mode.numCharCountBits(version), bb);
      for (const bit of seg.getData()) bb.push(bit);
    }
    if (bb.length !== dataUsedBits) throw new Error('bit length mismatch');

    // Add terminator + pad to byte boundary
    const dataCapacityBits = QrCode.getNumDataCodewords(version, ecl) * 8;
    appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
    appendBits(0, (8 - (bb.length % 8)) % 8, bb);
    if (bb.length % 8 !== 0) throw new Error('padding error');

    // Pad bytes alternating 0xEC, 0x11
    for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) {
      appendBits(padByte, 8, bb);
    }

    // Pack bits into bytes
    const dataCodewords: number[] = new Array(bb.length / 8).fill(0);
    for (let i = 0; i < bb.length; i++) {
      const byteIdx = i >>> 3;
      const prev = dataCodewords[byteIdx] ?? 0;
      const bit = bb[i] ?? 0;
      dataCodewords[byteIdx] = prev | (bit << (7 - (i & 7)));
    }

    return new QrCode(version, ecl, dataCodewords, mask);
  }

  public readonly size: number;
  public readonly mask: number;

  private constructor(
    public readonly version: number,
    public readonly errorCorrectionLevel: Ecc,
    dataCodewords: number[],
    mask: number,
  ) {
    if (version < MIN_VERSION || version > MAX_VERSION) throw new RangeError('version');
    if (mask < -1 || mask > 7) throw new RangeError('mask');
    this.size = version * 4 + 17;
    const row: boolean[] = new Array(this.size).fill(false);
    this.modules = [];
    this.isFunction = [];
    for (let i = 0; i < this.size; i++) {
      this.modules.push(row.slice());
      this.isFunction.push(row.slice());
    }

    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);

    let chosen = mask;
    if (chosen === -1) {
      let minPenalty = Infinity;
      for (let i = 0; i < 8; i++) {
        this.applyMask(i);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          chosen = i;
          minPenalty = penalty;
        }
        this.applyMask(i); // undo (XOR is its own inverse)
      }
    }
    if (chosen < 0 || chosen > 7) throw new Error('mask selection failed');
    this.mask = chosen;
    this.applyMask(chosen);
    this.drawFormatBits(chosen);
  }

  getModule(x: number, y: number): boolean {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return false;
    return this.modules[y]?.[x] ?? false;
  }

  // -------------------------------------------------------------------------
  // Drawing functions
  // -------------------------------------------------------------------------

  private setModule(x: number, y: number, dark: boolean): void {
    const row = this.modules[y];
    if (row) row[x] = dark;
  }

  private setFunction(x: number, y: number, dark: boolean): void {
    this.setModule(x, y, dark);
    const row = this.isFunction[y];
    if (row) row[x] = true;
  }

  private drawFunctionPatterns(): void {
    // Timing patterns
    for (let i = 0; i < this.size; i++) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    // Finder + separators
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    // Alignment patterns
    const alignPositions = this.getAlignmentPatternPositions();
    const numAlign = alignPositions.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (
          (i === 0 && j === 0) ||
          (i === 0 && j === numAlign - 1) ||
          (i === numAlign - 1 && j === 0)
        )
          continue;
        const ax = alignPositions[i];
        const ay = alignPositions[j];
        if (ax !== undefined && ay !== undefined) this.drawAlignmentPattern(ax, ay);
      }
    }

    this.drawFormatBits(0); // placeholder, overwritten in ctor
    this.drawVersion();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.setFunction(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private drawFormatBits(mask: number): void {
    const data = (this.errorCorrectionLevel.formatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    if (bits >>> 15 !== 0) throw new Error('format bit overflow');

    // Top-left
    for (let i = 0; i <= 5; i++) this.setFunction(8, i, getBit(bits, i));
    this.setFunction(8, 7, getBit(bits, 6));
    this.setFunction(8, 8, getBit(bits, 7));
    this.setFunction(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, getBit(bits, i));

    // Bottom-left + top-right
    for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, getBit(bits, i));
    this.setFunction(8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    if (bits >>> 18 !== 0) throw new Error('version bit overflow');

    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, bit);
      this.setFunction(b, a, bit);
    }
  }

  private getAlignmentPatternPositions(): number[] {
    if (this.version === 1) return [];
    const numAlign = Math.floor(this.version / 7) + 2;
    const step =
      this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result: number[] = [6];
    for (let pos = this.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  // -------------------------------------------------------------------------
  // Codeword processing
  // -------------------------------------------------------------------------

  private addEccAndInterleave(data: number[]): number[] {
    const ver = this.version;
    const ecl = this.errorCorrectionLevel;
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal]?.[ver] ?? 0;
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal]?.[ver] ?? 0;
    const rawCodewords = Math.floor(QrCode.getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const rsGen = reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += datLen;
      const ecc = reedSolomonComputeRemainder(dat, rsGen);
      if (i < numShortBlocks) dat.push(0); // placeholder to align
      blocks.push(dat.concat(ecc));
    }

    // Interleave
    const result: number[] = [];
    for (let i = 0; i < (blocks[0]?.length ?? 0); i++) {
      for (let j = 0; j < blocks.length; j++) {
        const block = blocks[j];
        if (!block) continue;
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
          const v = block[i];
          if (v !== undefined) result.push(v);
        }
      }
    }
    return result;
  }

  private drawCodewords(data: number[]): void {
    const expected = Math.floor(QrCode.getNumRawDataModules(this.version) / 8);
    if (data.length !== expected) throw new Error('codeword length mismatch');
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!(this.isFunction[y]?.[x] ?? false) && i < data.length * 8) {
            const byte = data[i >>> 3] ?? 0;
            this.setModule(x, y, getBit(byte, 7 - (i & 7)));
            i++;
          }
        }
      }
    }
    if (i !== data.length * 8) throw new Error('codeword placement mismatch');
  }

  private applyMask(mask: number): void {
    if (mask < 0 || mask > 7) throw new RangeError('mask');
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          case 7:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            throw new Error('unreachable');
        }
        const row = this.modules[y];
        const fnRow = this.isFunction[y];
        if (row && fnRow && !fnRow[x] && invert) row[x] = !row[x];
      }
    }
  }

  private getPenaltyScore(): number {
    let result = 0;
    const size = this.size;

    // Rule 1: runs of 5+ same-color modules in rows/columns
    for (let y = 0; y < size; y++) {
      let runColor = false;
      let runLen = 0;
      let runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < size; x++) {
        const cell = this.modules[y]?.[x] ?? false;
        if (cell === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runLen, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = cell;
          runLen = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runLen, runHistory) * PENALTY_N3;
    }
    for (let x = 0; x < size; x++) {
      let runColor = false;
      let runLen = 0;
      let runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < size; y++) {
        const cell = this.modules[y]?.[x] ?? false;
        if (cell === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          this.finderPenaltyAddHistory(runLen, runHistory);
          if (!runColor) result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = cell;
          runLen = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runLen, runHistory) * PENALTY_N3;
    }

    // Rule 2: 2x2 same-color blocks
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.modules[y]?.[x] ?? false;
        if (
          c === (this.modules[y]?.[x + 1] ?? false) &&
          c === (this.modules[y + 1]?.[x] ?? false) &&
          c === (this.modules[y + 1]?.[x + 1] ?? false)
        ) {
          result += PENALTY_N2;
        }
      }
    }

    // Rule 4: dark/light balance
    let dark = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (this.modules[y]?.[x]) dark++;
      }
    }
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;

    return result;
  }

  private finderPenaltyCountPatterns(runHistory: number[]): number {
    const n = runHistory[1] ?? 0;
    const core =
      n > 0 &&
      runHistory[2] === n &&
      runHistory[3] === n * 3 &&
      runHistory[4] === n &&
      runHistory[5] === n;
    return (
      (core && (runHistory[0] ?? 0) >= n * 4 && (runHistory[6] ?? 0) >= n ? 1 : 0) +
      (core && (runHistory[6] ?? 0) >= n * 4 && (runHistory[0] ?? 0) >= n ? 1 : 0)
    );
  }

  private finderPenaltyTerminateAndCount(
    currentRunColor: boolean,
    currentRunLength: number,
    runHistory: number[],
  ): number {
    let len = currentRunLength;
    if (currentRunColor) {
      this.finderPenaltyAddHistory(len, runHistory);
      len = 0;
    }
    len += this.size;
    this.finderPenaltyAddHistory(len, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }

  private finderPenaltyAddHistory(currentRunLength: number, runHistory: number[]): void {
    let len = currentRunLength;
    if (runHistory[0] === 0) len += this.size;
    runHistory.pop();
    runHistory.unshift(len);
  }

  // -------------------------------------------------------------------------
  // Static capacity helpers
  // -------------------------------------------------------------------------

  static getNumRawDataModules(ver: number): number {
    if (ver < MIN_VERSION || ver > MAX_VERSION) throw new RangeError('version');
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  static getNumDataCodewords(ver: number, ecl: Ecc): number {
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal]?.[ver] ?? 0;
    const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal]?.[ver] ?? 0;
    return Math.floor(QrCode.getNumRawDataModules(ver) / 8) - eccPerBlock * numBlocks;
  }
}

// ---------------------------------------------------------------------------
// Segment + mode
// ---------------------------------------------------------------------------

class Mode {
  static readonly NUMERIC = new Mode(0x1, [10, 12, 14]);
  static readonly ALPHANUMERIC = new Mode(0x2, [9, 11, 13]);
  static readonly BYTE = new Mode(0x4, [8, 16, 16]);
  static readonly KANJI = new Mode(0x8, [8, 10, 12]);
  static readonly ECI = new Mode(0x7, [0, 0, 0]);

  private constructor(
    public readonly modeBits: number,
    private readonly numBitsCharCount: [number, number, number],
  ) {}

  numCharCountBits(ver: number): number {
    if (ver >= 1 && ver <= 9) return this.numBitsCharCount[0];
    if (ver >= 10 && ver <= 26) return this.numBitsCharCount[1];
    if (ver >= 27 && ver <= 40) return this.numBitsCharCount[2];
    throw new RangeError('version');
  }
}

class QrSegment {
  static makeBytes(data: readonly number[]): QrSegment {
    const bb: number[] = [];
    for (const b of data) appendBits(b, 8, bb);
    return new QrSegment(Mode.BYTE, data.length, bb);
  }

  static getTotalBits(segs: readonly QrSegment[], ver: number): number {
    let result = 0;
    for (const seg of segs) {
      const ccbits = seg.mode.numCharCountBits(ver);
      if (seg.numChars >= 1 << ccbits) return Infinity;
      result += 4 + ccbits + seg.bitData.length;
    }
    return result;
  }

  private constructor(
    public readonly mode: Mode,
    public readonly numChars: number,
    private readonly bitData: number[],
  ) {
    if (numChars < 0) throw new RangeError('numChars');
  }

  getData(): number[] {
    return this.bitData.slice();
  }
}

// ---------------------------------------------------------------------------
// Reed-Solomon over GF(2^8) with polynomial 0x11d
// ---------------------------------------------------------------------------

function reedSolomonComputeDivisor(degree: number): number[] {
  if (degree < 1 || degree > 255) throw new RangeError('degree');
  const result: number[] = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      const cur = result[j] ?? 0;
      const next = result[j + 1] ?? 0;
      result[j] = reedSolomonMultiply(cur, root);
      if (j + 1 < result.length) result[j] = (result[j] ?? 0) ^ next;
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result: number[] = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    for (let i = 0; i < divisor.length; i++) {
      const cur = result[i] ?? 0;
      const d = divisor[i] ?? 0;
      result[i] = cur ^ reedSolomonMultiply(d, factor);
    }
  }
  return result;
}

function reedSolomonMultiply(x: number, y: number): number {
  if (x >>> 8 !== 0 || y >>> 8 !== 0) throw new RangeError('byte overflow');
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  if (z >>> 8 !== 0) throw new Error('result overflow');
  return z;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function appendBits(val: number, len: number, bb: number[]): void {
  if (len < 0 || len > 31 || val >>> len !== 0) throw new RangeError('appendBits');
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
}

function getBit(x: number, i: number): boolean {
  return ((x >>> i) & 1) !== 0;
}

function toUtf8Bytes(str: string): number[] {
  // Prefer TextEncoder when available (browser, Bun, Node >= 11); otherwise fall
  // back to a manual UTF-8 encoder so the module works in any JS runtime.
  if (typeof TextEncoder !== 'undefined') {
    return Array.from(new TextEncoder().encode(str));
  }
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_VERSION = 1;
const MAX_VERSION = 40;
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

// Index by [ecl.ordinal][version]; version 0 slot is unused.
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  // L
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // M
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // Q
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // H
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  // L
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // M
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // Q
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // H
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];
