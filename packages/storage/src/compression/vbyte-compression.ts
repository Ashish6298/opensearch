/**
 * @opensearch/storage — Variable-Byte (VByte) & Delta Posting List Compression (Phase 53)
 *
 * Implements lossless, high-performance bit-packed compression for inverted index posting lists:
 * 1. Delta (Gap) Encoding:
 *    Transforms sorted integer sequences (e.g. Doc IDs `[10, 15, 22]`) into incremental deltas `[10, 5, 7]`.
 * 2. Variable-Byte (VByte / Varint) Encoding:
 *    Packs variable-length positive integers into 7-bit continuation byte sequences.
 *    Small integers (0-127) take 1 byte; integers up to 16,383 take 2 bytes.
 * 3. Posting List Serialization:
 *    Serializes Doc IDs, Term Frequencies, and Field Positions into compact binary `Uint8Array`.
 */

export interface CompactPostingRecord {
  docId: number;
  termFrequency: number;
  positions: number[];
}

export class VByteCompressor {
  /**
   * Encodes an array of unsigned integers into a Variable-Byte byte array.
   */
  static encodeVarints(numbers: number[]): Uint8Array {
    const bytes: number[] = [];

    for (const num of numbers) {
      let val = Math.max(0, Math.floor(num));
      while (val >= 128) {
        bytes.push((val & 0x7f) | 0x80);
        val = Math.floor(val / 128);
      }
      bytes.push(val & 0x7f);
    }

    return new Uint8Array(bytes);
  }

  /**
   * Decodes a Variable-Byte byte array back into an array of unsigned integers.
   */
  static decodeVarints(bytes: Uint8Array): number[] {
    const numbers: number[] = [];
    let current = 0;
    let shift = 0;

    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte === undefined) continue;

      current += (byte & 0x7f) * Math.pow(2, shift);
      if ((byte & 0x80) === 0) {
        numbers.push(current);
        current = 0;
        shift = 0;
      } else {
        shift += 7;
      }
    }

    return numbers;
  }

  /**
   * Converts sorted sequence of positive numbers into delta gap sequence.
   * `[10, 15, 22]` -> `[10, 5, 7]`
   */
  static deltaEncode(sortedNumbers: number[]): number[] {
    if (sortedNumbers.length === 0) return [];
    const deltas: number[] = [sortedNumbers[0] ?? 0];
    for (let i = 1; i < sortedNumbers.length; i++) {
      const current = sortedNumbers[i] ?? 0;
      const prev = sortedNumbers[i - 1] ?? 0;
      deltas.push(Math.max(0, current - prev));
    }
    return deltas;
  }

  /**
   * Reconstructs original sorted sequence from delta gaps.
   * `[10, 5, 7]` -> `[10, 15, 22]`
   */
  static deltaDecode(deltas: number[]): number[] {
    if (deltas.length === 0) return [];
    const original: number[] = [deltas[0] ?? 0];
    for (let i = 1; i < deltas.length; i++) {
      const delta = deltas[i] ?? 0;
      const last = original[i - 1] ?? 0;
      original.push(last + delta);
    }
    return original;
  }

  /**
   * Encodes a list of posting records (docId, tf, positions) into a compact binary buffer.
   */
  static compressPostingList(records: CompactPostingRecord[]): Uint8Array {
    if (records.length === 0) {
      return new Uint8Array(0);
    }

    // Sort records by docId
    const sorted = [...records].sort((a, b) => a.docId - b.docId);

    const docIds = sorted.map(r => r.docId);
    const deltaDocIds = this.deltaEncode(docIds);

    const sequence: number[] = [];
    sequence.push(sorted.length); // Total postings count

    for (let i = 0; i < sorted.length; i++) {
      const rec = sorted[i];
      if (!rec) continue;

      sequence.push(deltaDocIds[i] ?? 0);
      sequence.push(rec.termFrequency);

      // Encode positions with delta gaps
      const pos = [...rec.positions].sort((a, b) => a - b);
      sequence.push(pos.length);
      const deltaPos = this.deltaEncode(pos);
      sequence.push(...deltaPos);
    }

    return this.encodeVarints(sequence);
  }

  /**
   * Decodes a compressed posting list buffer back into structured records.
   */
  static decompressPostingList(bytes: Uint8Array): CompactPostingRecord[] {
    if (bytes.length === 0) {
      return [];
    }

    const sequence = this.decodeVarints(bytes);
    if (sequence.length === 0) {
      return [];
    }

    const count = sequence[0] ?? 0;
    const records: CompactPostingRecord[] = [];
    let ptr = 1;

    let lastDocId = 0;

    for (let i = 0; i < count && ptr < sequence.length; i++) {
      const deltaDocId = sequence[ptr++] ?? 0;
      const docId = i === 0 ? deltaDocId : lastDocId + deltaDocId;
      lastDocId = docId;

      const termFrequency = sequence[ptr++] ?? 1;
      const posCount = sequence[ptr++] ?? 0;

      const deltaPositions: number[] = [];
      for (let p = 0; p < posCount && ptr < sequence.length; p++) {
        deltaPositions.push(sequence[ptr++] ?? 0);
      }

      const positions = this.deltaDecode(deltaPositions);

      records.push({
        docId,
        termFrequency,
        positions,
      });
    }

    return records;
  }
}

/**
 * Helper calculation checking compression ratio on raw datasets.
 */
export function calculateCompressionRatio(rawBytes: number, compressedBytes: number): number {
  if (rawBytes <= 0) return 0;
  return Math.max(0, 1 - compressedBytes / rawBytes);
}
