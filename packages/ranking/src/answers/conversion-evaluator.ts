/**
 * @opensearch/ranking — Direct Conversions Engine (Phase 38)
 *
 * Implements direct converters for:
 * 1. Unix Epoch & Timestamp conversions (Seconds/Milliseconds <-> UTC ISO Date)
 * 2. Color Code conversions (HEX <-> RGB <-> HSL) with visual preview metadata
 * 3. Physical & Digital unit conversions (Temperature, Length, Weight, Digital Storage)
 */

export interface EpochConversionResult {
  type: 'epoch';
  title: string;
  epochSeconds: number;
  epochMillis: number;
  utcIso: string;
  utcFormatted: string;
  relativeDescription: string;
}

export interface ColorConversionResult {
  type: 'color';
  title: string;
  hex: string;
  rgb: string;
  hsl: string;
  previewCss: string;
}

export interface UnitConversionResult {
  type: 'unit';
  title: string;
  fromValue: number;
  fromUnit: string;
  toValue: number;
  toUnit: string;
  formattedSummary: string;
}

export type ConversionResult =
  | EpochConversionResult
  | ColorConversionResult
  | UnitConversionResult;

export class ConversionEvaluator {
  evaluate(rawQuery: string): ConversionResult | null {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return null;
    }

    const trimmed = rawQuery.trim();

    // 1. Check Epoch / Timestamp conversion
    const epochRes = this.evaluateEpoch(trimmed);
    if (epochRes) return epochRes;

    // 2. Check Color conversion
    const colorRes = this.evaluateColor(trimmed);
    if (colorRes) return colorRes;

    // 3. Check Unit conversion
    const unitRes = this.evaluateUnit(trimmed);
    if (unitRes) return unitRes;

    return null;
  }

  // ── Epoch / Timestamp Converter ──────────────────────────────────────────

  private evaluateEpoch(query: string): EpochConversionResult | null {
    const epochMatch = /^(?:epoch|timestamp|unix(?:\s+time)?)\s*(?:to\s+(?:date|utc|time))?\s*([0-9]+|now)?$/i.exec(query);
    if (!epochMatch) {
      // Also check standalone 10-digit (seconds) or 13-digit (millis) timestamp queries
      const standaloneNum = /^(1[0-9]{9}|1[0-9]{12})$/.exec(query);
      if (standaloneNum && standaloneNum[1]) {
        return this.formatEpoch(parseInt(standaloneNum[1], 10));
      }
      return null;
    }

    const rawVal = epochMatch[1];
    if (!rawVal || rawVal.toLowerCase() === 'now') {
      return this.formatEpoch(Math.floor(Date.now() / 1000));
    }

    const parsedNum = parseInt(rawVal, 10);
    if (isNaN(parsedNum) || parsedNum < 0) {
      return null;
    }

    return this.formatEpoch(parsedNum);
  }

  private formatEpoch(num: number): EpochConversionResult {
    // If > 1e11, assume milliseconds
    const isMillis = num > 1e11;
    const epochSec = isMillis ? Math.floor(num / 1000) : num;
    const epochMs = isMillis ? num : num * 1000;

    const date = new Date(epochMs);
    const utcIso = date.toISOString();
    const utcFormatted = date.toUTCString();

    const diffSec = Math.floor((Date.now() - epochMs) / 1000);
    let relative = '';
    if (Math.abs(diffSec) < 60) {
      relative = 'Just now';
    } else if (diffSec > 0) {
      const days = Math.floor(diffSec / 86400);
      relative = days > 0 ? `${days} day${days > 1 ? 's' : ''} ago` : `${Math.floor(diffSec / 3600)}h ago`;
    } else {
      const days = Math.floor(Math.abs(diffSec) / 86400);
      relative = days > 0 ? `in ${days} day${days > 1 ? 's' : ''}` : `in ${Math.floor(Math.abs(diffSec) / 3600)}h`;
    }

    return {
      type: 'epoch',
      title: 'Unix Timestamp Converter',
      epochSeconds: epochSec,
      epochMillis: epochMs,
      utcIso,
      utcFormatted,
      relativeDescription: relative,
    };
  }

  // ── Color Converter ──────────────────────────────────────────────────────

  private evaluateColor(query: string): ColorConversionResult | null {
    const clean = query.trim();

    // Hex pattern: #38bdf8 or #fff or 0x38bdf8
    const hexMatch = /^(?:color\s+)?#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(clean);
    if (hexMatch && hexMatch[1]) {
      let hex = hexMatch[1];
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      hex = '#' + hex.toLowerCase();

      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);

      const [h, s, l] = this.rgbToHsl(r, g, b);

      return {
        type: 'color',
        title: 'Color Converter',
        hex,
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: `hsl(${h}, ${s}%, ${l}%)`,
        previewCss: hex,
      };
    }

    // RGB pattern: rgb(56, 189, 248) or rgb 56 189 248
    const rgbMatch = /^rgb\(?\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)?$/i.exec(clean);
    if (rgbMatch && rgbMatch[1] && rgbMatch[2] && rgbMatch[3]) {
      const r = Math.min(255, parseInt(rgbMatch[1], 10));
      const g = Math.min(255, parseInt(rgbMatch[2], 10));
      const b = Math.min(255, parseInt(rgbMatch[3], 10));

      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
      const [h, s, l] = this.rgbToHsl(r, g, b);

      return {
        type: 'color',
        title: 'Color Converter',
        hex,
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: `hsl(${h}, ${s}%, ${l}%)`,
        previewCss: hex,
      };
    }

    return null;
  }

  private rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  // ── Unit Converter ───────────────────────────────────────────────────────

  private evaluateUnit(query: string): UnitConversionResult | null {
    // Pattern: "100 km to miles", "50 celsius to fahrenheit", "10 gb to mb", "75 kg in lbs"
    const unitMatch = /^([0-9.]+)\s*([a-z°]+)\s+(?:to|in|as)\s+([a-z°]+)$/i.exec(query.trim());
    if (!unitMatch || !unitMatch[1] || !unitMatch[2] || !unitMatch[3]) {
      return null;
    }

    const val = parseFloat(unitMatch[1]);
    const fromUnit = unitMatch[2].toLowerCase().replace(/s$/, '').replace(/°/, '');
    const toUnit = unitMatch[3].toLowerCase().replace(/s$/, '').replace(/°/, '');

    if (isNaN(val)) return null;

    // Temperature
    if (['c', 'celsius'].includes(fromUnit) && ['f', 'fahrenheit'].includes(toUnit)) {
      const res = (val * 9) / 5 + 32;
      return {
        type: 'unit',
        title: 'Temperature Conversion',
        fromValue: val,
        fromUnit: '°C',
        toValue: Number(res.toFixed(2)),
        toUnit: '°F',
        formattedSummary: `${val}°C = ${res.toFixed(2)}°F`,
      };
    }
    if (['f', 'fahrenheit'].includes(fromUnit) && ['c', 'celsius'].includes(toUnit)) {
      const res = ((val - 32) * 5) / 9;
      return {
        type: 'unit',
        title: 'Temperature Conversion',
        fromValue: val,
        fromUnit: '°F',
        toValue: Number(res.toFixed(2)),
        toUnit: '°C',
        formattedSummary: `${val}°F = ${res.toFixed(2)}°C`,
      };
    }

    // Length
    const lengthRatios: Record<string, number> = {
      m: 1, meter: 1,
      km: 1000, kilometer: 1000,
      cm: 0.01, centimeter: 0.01,
      mm: 0.001, millimeter: 0.001,
      mi: 1609.34, mile: 1609.34,
      ft: 0.3048, foot: 0.3048, feet: 0.3048,
      in: 0.0254, inch: 0.0254,
      yd: 0.9144, yard: 0.9144,
    };
    if (fromUnit in lengthRatios && toUnit in lengthRatios) {
      const inMeters = val * lengthRatios[fromUnit]!;
      const result = inMeters / lengthRatios[toUnit]!;
      const rounded = Number(result.toFixed(4));
      return {
        type: 'unit',
        title: 'Length Conversion',
        fromValue: val,
        fromUnit,
        toValue: rounded,
        toUnit,
        formattedSummary: `${val} ${fromUnit} = ${rounded.toLocaleString('en-US')} ${toUnit}`,
      };
    }

    // Weight
    const weightRatios: Record<string, number> = {
      kg: 1000, kilogram: 1000,
      g: 1, gram: 1,
      mg: 0.001, milligram: 0.001,
      lb: 453.592, pound: 453.592,
      oz: 28.3495, ounce: 28.3495,
    };
    if (fromUnit in weightRatios && toUnit in weightRatios) {
      const inGrams = val * weightRatios[fromUnit]!;
      const result = inGrams / weightRatios[toUnit]!;
      const rounded = Number(result.toFixed(4));
      return {
        type: 'unit',
        title: 'Weight Conversion',
        fromValue: val,
        fromUnit,
        toValue: rounded,
        toUnit,
        formattedSummary: `${val} ${fromUnit} = ${rounded.toLocaleString('en-US')} ${toUnit}`,
      };
    }

    // Digital Storage
    const dataRatios: Record<string, number> = {
      b: 1, byte: 1,
      kb: 1024, kilobyte: 1024,
      mb: 1024 * 1024, megabyte: 1024 * 1024,
      gb: 1024 * 1024 * 1024, gigabyte: 1024 * 1024 * 1024,
      tb: 1024 * 1024 * 1024 * 1024, terabyte: 1024 * 1024 * 1024 * 1024,
    };
    if (fromUnit in dataRatios && toUnit in dataRatios) {
      const inBytes = val * dataRatios[fromUnit]!;
      const result = inBytes / dataRatios[toUnit]!;
      const rounded = Number(result.toFixed(4));
      return {
        type: 'unit',
        title: 'Data Storage Conversion',
        fromValue: val,
        fromUnit: fromUnit.toUpperCase(),
        toValue: rounded,
        toUnit: toUnit.toUpperCase(),
        formattedSummary: `${val} ${fromUnit.toUpperCase()} = ${rounded.toLocaleString('en-US')} ${toUnit.toUpperCase()}`,
      };
    }

    return null;
  }
}
