/**
 * @opensearch/ranking — World Clock & Timezone Conversion Engine (Phase 50)
 *
 * Implements zero-dependency natural language timezone parsing and calculations:
 * 1. Current time in world cities/countries: `time in tokyo`, `current time london`, `what time is it in new york`
 * 2. Time conversions: `3pm est to ist`, `14:30 pst to gmt`, `9am utc in jst`
 * 3. Standard UTC status: `current utc`, `utc time`
 * 4. Day shift tracking (+1 day, -1 day) and relative offset calculation.
 */

export interface TimezoneConversionResult {
  type: 'timezone';
  title: string;
  primaryTime: string;
  sourceTime?: string;
  targetTime: string;
  sourceTimezone: string;
  targetTimezone: string;
  offsetDifference: string;
  dayShift?: string;
  details: Record<string, string>;
}

export interface CityTimezoneInfo {
  city: string;
  country: string;
  iana: string;
  standardAbbr: string;
  aliases: string[];
}

export const KNOWN_TIMEZONES: Record<string, string> = {
  utc: 'UTC',
  gmt: 'Etc/GMT',
  est: 'America/New_York',
  edt: 'America/New_York',
  cst: 'America/Chicago',
  cdt: 'America/Chicago',
  mst: 'America/Denver',
  mdt: 'America/Denver',
  pst: 'America/Los_Angeles',
  pdt: 'America/Los_Angeles',
  akst: 'America/Anchorage',
  hst: 'Pacific/Honolulu',
  ist: 'Asia/Kolkata',
  jst: 'Asia/Tokyo',
  kst: 'Asia/Seoul',
  cst_china: 'Asia/Shanghai',
  hkt: 'Asia/Hong_Kong',
  sgt: 'Asia/Singapore',
  aest: 'Australia/Sydney',
  aedt: 'Australia/Sydney',
  acst: 'Australia/Adelaide',
  awst: 'Australia/Perth',
  nzst: 'Pacific/Auckland',
  nzdt: 'Pacific/Auckland',
  bst: 'Europe/London',
  cet: 'Europe/Paris',
  cest: 'Europe/Paris',
  eet: 'Europe/Athens',
  eest: 'Europe/Athens',
  msk: 'Europe/Moscow',
  wet: 'Europe/Lisbon',
  brt: 'America/Sao_Paulo',
  art: 'America/Argentina/Buenos_Aires',
  cot: 'America/Bogota',
  clt: 'America/Santiago',
  cat: 'Africa/Harare',
  eat: 'Africa/Nairobi',
  wat: 'Africa/Lagos',
  sast: 'Africa/Johannesburg',
  gst: 'Asia/Dubai',
};

export const CITIES_DATABASE: CityTimezoneInfo[] = [
  { city: 'Tokyo', country: 'Japan', iana: 'Asia/Tokyo', standardAbbr: 'JST', aliases: ['tokyo', 'japan'] },
  { city: 'London', country: 'United Kingdom', iana: 'Europe/London', standardAbbr: 'GMT/BST', aliases: ['london', 'uk', 'england', 'britain'] },
  { city: 'New York', country: 'USA', iana: 'America/New_York', standardAbbr: 'EST/EDT', aliases: ['new york', 'nyc', 'ny'] },
  { city: 'San Francisco', country: 'USA', iana: 'America/Los_Angeles', standardAbbr: 'PST/PDT', aliases: ['san francisco', 'sf', 'california', 'los angeles', 'la', 'seattle'] },
  { city: 'Chicago', country: 'USA', iana: 'America/Chicago', standardAbbr: 'CST/CDT', aliases: ['chicago', 'texas', 'houston', 'dallas'] },
  { city: 'Paris', country: 'France', iana: 'Europe/Paris', standardAbbr: 'CET/CEST', aliases: ['paris', 'france'] },
  { city: 'Berlin', country: 'Germany', iana: 'Europe/Berlin', standardAbbr: 'CET/CEST', aliases: ['berlin', 'germany'] },
  { city: 'New Delhi', country: 'India', iana: 'Asia/Kolkata', standardAbbr: 'IST', aliases: ['new delhi', 'delhi', 'mumbai', 'bangalore', 'bengaluru', 'india'] },
  { city: 'Beijing', country: 'China', iana: 'Asia/Shanghai', standardAbbr: 'CST', aliases: ['beijing', 'shanghai', 'china'] },
  { city: 'Singapore', country: 'Singapore', iana: 'Asia/Singapore', standardAbbr: 'SGT', aliases: ['singapore'] },
  { city: 'Sydney', country: 'Australia', iana: 'Australia/Sydney', standardAbbr: 'AEST/AEDT', aliases: ['sydney', 'melbourne', 'australia'] },
  { city: 'Dubai', country: 'United Arab Emirates', iana: 'Asia/Dubai', standardAbbr: 'GST', aliases: ['dubai', 'uae', 'abu dhabi'] },
  { city: 'Toronto', country: 'Canada', iana: 'America/Toronto', standardAbbr: 'EST/EDT', aliases: ['toronto', 'canada', 'ottawa', 'montreal'] },
  { city: 'Seoul', country: 'South Korea', iana: 'Asia/Seoul', standardAbbr: 'KST', aliases: ['seoul', 'korea', 'south korea'] },
  { city: 'Hong Kong', country: 'Hong Kong', iana: 'Asia/Hong_Kong', standardAbbr: 'HKT', aliases: ['hong kong', 'hk'] },
  { city: 'Moscow', country: 'Russia', iana: 'Europe/Moscow', standardAbbr: 'MSK', aliases: ['moscow', 'russia'] },
  { city: 'Sao Paulo', country: 'Brazil', iana: 'America/Sao_Paulo', standardAbbr: 'BRT', aliases: ['sao paulo', 'brazil'] },
  { city: 'Cairo', country: 'Egypt', iana: 'Africa/Cairo', standardAbbr: 'EET', aliases: ['cairo', 'egypt'] },
  { city: 'Johannesburg', country: 'South Africa', iana: 'Africa/Johannesburg', standardAbbr: 'SAST', aliases: ['johannesburg', 'south africa', 'cape town'] },
  { city: 'Auckland', country: 'New Zealand', iana: 'Pacific/Auckland', standardAbbr: 'NZST/NZDT', aliases: ['auckland', 'new zealand'] },
];

export class TimezoneEvaluator {
  private readonly cityMap = new Map<string, CityTimezoneInfo>();

  constructor() {
    for (const entry of CITIES_DATABASE) {
      for (const alias of entry.aliases) {
        this.cityMap.set(alias.toLowerCase().trim(), entry);
      }
      this.cityMap.set(entry.city.toLowerCase().trim(), entry);
    }
  }

  /**
   * Evaluates natural language timezone and world clock queries.
   */
  evaluate(rawQuery: string, now: Date = new Date()): TimezoneConversionResult | null {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return null;
    }

    const query = rawQuery.toLowerCase().trim().replace(/[?!]+$/, '');
    if (!query) {
      return null;
    }

    // 1. Current UTC time: `current utc`, `utc time`, `time in utc`
    if (query === 'current utc' || query === 'utc time' || query === 'time in utc' || query === 'what time is it in utc') {
      return this.formatCurrentUtc(now);
    }

    // 2. Direct World Clock: `time in <city/country>`, `what time is it in <city>`, `current time <city>`
    const cityMatch = query.match(/^(?:what\s+time\s+is\s+it\s+in|current\s+time\s+in|current\s+time|time\s+in|time)\s+([a-z\s]+)$/i);
    if (cityMatch && cityMatch[1]) {
      const target = cityMatch[1].trim();
      const cityInfo = this.cityMap.get(target);
      if (cityInfo) {
        return this.formatCityTime(cityInfo, now);
      }
    }

    // 3. Time conversion: `<time> <tz1> to <tz2>` or `<time> <tz1> in <tz2>` (e.g. `3pm est to ist`, `14:30 pst to gmt`)
    const convMatch = query.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}:\d{2})\s+([a-z]+)\s+(?:to|in|into)\s+([a-z\s]+)$/i);
    if (convMatch && convMatch[1] && convMatch[2] && convMatch[3]) {
      const timeStr = convMatch[1].trim();
      const fromTzKey = convMatch[2].trim().toLowerCase();
      const toTarget = convMatch[3].trim().toLowerCase();

      const fromIana = this.resolveTimezone(fromTzKey);
      const toIana = this.resolveTimezone(toTarget);

      if (fromIana && toIana) {
        return this.convertTime(timeStr, fromIana, toIana, fromTzKey.toUpperCase(), toTarget.toUpperCase(), now);
      }
    }

    return null;
  }

  private resolveTimezone(identifier: string): string | null {
    const key = identifier.toLowerCase().trim();
    if (KNOWN_TIMEZONES[key]) {
      return KNOWN_TIMEZONES[key] ?? null;
    }
    const city = this.cityMap.get(key);
    if (city) {
      return city.iana;
    }
    return null;
  }

  private formatCurrentUtc(now: Date): TimezoneConversionResult {
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const dateStr = now.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    return {
      type: 'timezone',
      title: 'Coordinated Universal Time (UTC)',
      primaryTime: `${timeStr} UTC`,
      targetTime: timeStr,
      sourceTimezone: 'UTC',
      targetTimezone: 'UTC',
      offsetDifference: 'UTC+00:00',
      details: {
        'Timezone': 'Coordinated Universal Time (UTC)',
        'Date': dateStr,
        'ISO 8601': now.toISOString(),
      },
    };
  }

  private formatCityTime(city: CityTimezoneInfo, now: Date): TimezoneConversionResult {
    const timeStr = now.toLocaleTimeString('en-US', { timeZone: city.iana, hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = now.toLocaleDateString('en-US', { timeZone: city.iana, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const fullTimeStr = now.toLocaleTimeString('en-US', { timeZone: city.iana, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    return {
      type: 'timezone',
      title: `Current Time in ${city.city}, ${city.country}`,
      primaryTime: `${timeStr} (${city.standardAbbr})`,
      targetTime: timeStr,
      sourceTimezone: 'Local / System',
      targetTimezone: `${city.city} (${city.iana})`,
      offsetDifference: city.standardAbbr,
      details: {
        'Location': `${city.city}, ${city.country}`,
        'Local Time': fullTimeStr,
        'Local Date': dateStr,
        'IANA Identifier': city.iana,
        'Standard Abbreviation': city.standardAbbr,
      },
    };
  }

  private convertTime(
    timeStr: string,
    fromIana: string,
    toIana: string,
    fromLabel: string,
    toLabel: string,
    referenceDate: Date,
  ): TimezoneConversionResult | null {
    const parsedTime = this.parseTimeInput(timeStr);
    if (!parsedTime) {
      return null;
    }

    try {
      // Build ISO reference string in fromIana
      const year = referenceDate.getUTCFullYear();
      const month = String(referenceDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(referenceDate.getUTCDate()).padStart(2, '0');
      const hourStr = String(parsedTime.hours).padStart(2, '0');
      const minStr = String(parsedTime.minutes).padStart(2, '0');

      // Create date object and format across timezones
      const dateInFrom = new Date(`${year}-${month}-${day}T${hourStr}:${minStr}:00Z`);

      const sourceFormatted = dateInFrom.toLocaleTimeString('en-US', { timeZone: fromIana, hour: '2-digit', minute: '2-digit', hour12: true });
      const targetFormatted = dateInFrom.toLocaleTimeString('en-US', { timeZone: toIana, hour: '2-digit', minute: '2-digit', hour12: true });

      const sourceDay = dateInFrom.toLocaleDateString('en-US', { timeZone: fromIana, weekday: 'short' });
      const targetDay = dateInFrom.toLocaleDateString('en-US', { timeZone: toIana, weekday: 'short' });

      let dayShift = '';
      if (sourceDay !== targetDay) {
        dayShift = `(${targetDay})`;
      }

      const primary = `${targetFormatted} ${toLabel} ${dayShift}`.trim();

      return {
        type: 'timezone',
        title: `${timeStr.toUpperCase()} ${fromLabel} to ${toLabel}`,
        primaryTime: primary,
        sourceTime: `${sourceFormatted} ${fromLabel}`,
        targetTime: `${targetFormatted} ${toLabel}`,
        sourceTimezone: fromIana,
        targetTimezone: toIana,
        offsetDifference: `${fromLabel} ➔ ${toLabel}`,
        dayShift: dayShift || undefined,
        details: {
          'Source Time': `${sourceFormatted} (${fromLabel})`,
          'Converted Time': `${targetFormatted} (${toLabel})`,
          'Source Timezone': fromIana,
          'Target Timezone': toIana,
          'Day Shift': dayShift ? `Day shift to ${targetDay}` : 'Same day',
        },
      };
    } catch {
      return null;
    }
  }

  private parseTimeInput(timeStr: string): { hours: number; minutes: number } | null {
    const clean = timeStr.toLowerCase().trim();

    // Match e.g. 3pm, 3:30pm, 11am, 15:45
    const match = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!match || !match[1]) {
      return null;
    }

    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridian = match[3];

    if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes > 59) {
      return null;
    }

    if (meridian === 'pm' && hours < 12) {
      hours += 12;
    } else if (meridian === 'am' && hours === 12) {
      hours = 0;
    }

    if (hours < 0 || hours > 23) {
      return null;
    }

    return { hours, minutes };
  }
}

/**
 * Factory helper for TimezoneEvaluator.
 */
export function createTimezoneEvaluator(): TimezoneEvaluator {
  return new TimezoneEvaluator();
}
