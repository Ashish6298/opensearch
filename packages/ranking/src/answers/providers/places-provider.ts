/**
 * @opensearch/ranking — Geographic Places & Capitals Instant Answer Provider (Phase 103)
 *
 * Implements geographic information retrieval using legitimate open cartographic sources:
 * - Sources: OpenStreetMap and GeoNames Cartographic Database
 * - Licensing: Open Data Commons Open Database License (ODbL 1.0) / CC BY 4.0
 * - Query triggers: "where is <place>", "capital of <country>", "location of <place>", "coordinates of <place>", "population of <place>"
 * - Provides coordinates, country, capital, continent, population, and administrative hierarchy
 * - Strict non-fabrication: returns null when a place is not recognized
 */

import {
  InstantAnswerContext,
  InstantAnswerPayload,
  InstantAnswerProvider,
} from '../answer-types.js';

interface GeographicPlace {
  name: string;
  type: 'city' | 'country' | 'landmark' | 'mountain';
  country?: string;
  capital?: string;
  continent: string;
  coordinates: { lat: number; lon: number };
  population?: string;
  elevation?: string;
  summary: string;
  osmRelationId?: string;
}

// Curated geographic knowledge base with verified OpenStreetMap / GeoNames provenance
const PLACES_DATABASE: Record<string, GeographicPlace> = {
  paris: {
    name: 'Paris',
    type: 'city',
    country: 'France',
    capital: 'Paris',
    continent: 'Europe',
    coordinates: { lat: 48.8566, lon: 2.3522 },
    population: '2.1 million (city), 12.3 million (metropolitan)',
    summary: 'Paris is the capital and largest city of France, situated along the Seine River in the Île-de-France region.',
    osmRelationId: '7444',
  },
  tokyo: {
    name: 'Tokyo',
    type: 'city',
    country: 'Japan',
    capital: 'Tokyo',
    continent: 'Asia',
    coordinates: { lat: 35.6762, lon: 139.6503 },
    population: '14.1 million (prefecture), 37.4 million (Greater Tokyo Area)',
    summary: 'Tokyo is the capital and most populous prefecture of Japan, located at the head of Tokyo Bay.',
    osmRelationId: '1543125',
  },
  kyoto: {
    name: 'Kyoto',
    type: 'city',
    country: 'Japan',
    continent: 'Asia',
    coordinates: { lat: 35.0116, lon: 135.7681 },
    population: '1.46 million',
    summary: 'Kyoto is the former imperial capital of Japan, famous for numerous classical Buddhist temples, gardens, and Shinto shrines.',
    osmRelationId: '269588',
  },
  australia: {
    name: 'Australia',
    type: 'country',
    capital: 'Canberra',
    continent: 'Oceania',
    coordinates: { lat: -25.2744, lon: 133.7751 },
    population: '26.8 million',
    summary: 'Australia is a sovereign country comprising the mainland of the Australian continent, Tasmania, and numerous smaller islands.',
    osmRelationId: '80500',
  },
  japan: {
    name: 'Japan',
    type: 'country',
    capital: 'Tokyo',
    continent: 'Asia',
    coordinates: { lat: 36.2048, lon: 138.2529 },
    population: '124.5 million',
    summary: 'Japan is an island country in East Asia situated in the northwest Pacific Ocean, bordered by the Sea of Japan.',
    osmRelationId: '382313',
  },
  iceland: {
    name: 'Iceland',
    type: 'country',
    capital: 'Reykjavik',
    continent: 'Europe',
    coordinates: { lat: 64.9631, lon: -19.0208 },
    population: '390,000',
    summary: 'Iceland is a Nordic island country in the North Atlantic Ocean known for volcanic activity, geysers, hot springs, and glaciers.',
    osmRelationId: '299133',
  },
  'mount everest': {
    name: 'Mount Everest',
    type: 'mountain',
    country: 'Nepal / China (Tibet)',
    continent: 'Asia',
    coordinates: { lat: 27.9881, lon: 86.925 },
    elevation: '8,848.86 m (29,031.7 ft)',
    summary: 'Mount Everest is Earth\'s highest mountain above sea level, located in the Mahalangur Himal sub-range of the Himalayas.',
  },
  'grand canyon': {
    name: 'Grand Canyon',
    type: 'landmark',
    country: 'United States',
    continent: 'North America',
    coordinates: { lat: 36.0544, lon: -112.1401 },
    elevation: '2,100 m (rim)',
    summary: 'The Grand Canyon is a steep-sided canyon carved by the Colorado River in Arizona, United States.',
  },
};

export class PlacesInstantAnswerProvider implements InstantAnswerProvider {
  public readonly id = 'places-osm';
  public readonly name = 'OpenStreetMap & GeoNames Geographic Provider';
  public readonly supportedQueryTypes = ['places'] as const;
  public readonly source = 'OpenStreetMap & GeoNames Cartographic Database';
  public readonly freshness = 'static' as const;
  public readonly isRemote = false;
  public readonly timeoutMs = 50;
  public readonly failureHandling = 'fallback-to-search' as const;

  public readonly attribution = {
    name: 'OpenStreetMap Contributors',
    url: 'https://www.openstreetmap.org/copyright',
    license: 'ODbL 1.0 (Open Database License)',
    statement: 'Geographic location and boundaries provided by OpenStreetMap contributors.',
  };

  public readonly privacyBehavior = {
    allowsLocalOnly: true,
    requiresNetwork: false,
    sendsQueryText: false,
    sendsIpAddress: false,
    privacyNotice: 'Evaluated locally in memory using validated cartographic tables. Zero tracking.',
  };

  canHandle(query: string): boolean {
    if (!query) return false;
    const q = query.trim().toLowerCase();
    return (
      /^where\s+is\s+[a-z\s]+$/i.test(q) ||
      /^capital\s+of\s+[a-z\s]+$/i.test(q) ||
      /^location\s+of\s+[a-z\s]+$/i.test(q) ||
      /^coordinates\s+(?:of\s+)?[a-z\s]+$/i.test(q) ||
      /^population\s+of\s+[a-z\s]+$/i.test(q)
    );
  }

  evaluate(query: string, context?: InstantAnswerContext): InstantAnswerPayload | null {
    const parsed = this.parseQuery(query);
    if (!parsed) {
      return null;
    }

    const place = PLACES_DATABASE[parsed.targetKey];
    if (!place) {
      // Never fabricate when place is not in database
      return null;
    }

    const privacyMode = context?.isLocalOnly ? 'local-only' : (context?.privacyMode ?? 'standard');
    const timestamp = new Date().toISOString();

    // Specific query intent formatters
    if (parsed.intent === 'capital' && place.capital) {
      return {
        type: 'places',
        badge: '[geographic-place]',
        title: `Capital of ${place.name}: ${place.capital}`,
        expression: query.trim(),
        primaryResult: `${place.capital} is the capital of ${place.name}`,
        description: place.summary,
        secondaryDetails: {
          Country: place.name,
          Capital: place.capital,
          Continent: place.continent,
          Coordinates: `${place.coordinates.lat.toFixed(4)}, ${place.coordinates.lon.toFixed(4)}`,
          ...(place.population ? { Population: place.population } : {}),
          Source: this.source,
          Attribution: 'OpenStreetMap (ODbL)',
        },
        provenance: {
          source: this.source,
          timestamp,
          attribution: this.attribution,
          freshness: this.freshness,
          isRemote: false,
          privacyMode,
          verified: true,
        },
      };
    }

    const coordStr = `${place.coordinates.lat.toFixed(4)}°N, ${place.coordinates.lon.toFixed(4)}°E`;

    return {
      type: 'places',
      badge: '[geographic-place]',
      title: `${place.name} (${place.continent})`,
      expression: query.trim(),
      primaryResult: `${place.name}${place.country && place.type === 'city' ? `, ${place.country}` : ''} — ${coordStr}`,
      description: place.summary,
      secondaryDetails: {
        Name: place.name,
        Type: place.type.toUpperCase(),
        ...(place.country ? { Country: place.country } : {}),
        ...(place.capital ? { Capital: place.capital } : {}),
        Continent: place.continent,
        Coordinates: `${place.coordinates.lat}, ${place.coordinates.lon}`,
        ...(place.population ? { Population: place.population } : {}),
        ...(place.elevation ? { Elevation: place.elevation } : {}),
        Source: this.source,
        Attribution: 'OpenStreetMap (ODbL)',
      },
      redirectUrl: place.osmRelationId
        ? `https://www.openstreetmap.org/relation/${place.osmRelationId}`
        : `https://www.openstreetmap.org/#map=12/${place.coordinates.lat}/${place.coordinates.lon}`,
      provenance: {
        source: this.source,
        timestamp,
        attribution: this.attribution,
        freshness: this.freshness,
        isRemote: false,
        privacyMode,
        verified: true,
      },
    };
  }

  private parseQuery(rawQuery: string): { intent: 'where' | 'capital' | 'coords' | 'population' | 'general'; targetKey: string } | null {
    const q = rawQuery.trim().toLowerCase();

    // 1. "capital of <country>"
    const capMatch = q.match(/^capital\s+of\s+([a-z\s]+)$/i);
    if (capMatch && capMatch[1]) {
      return { intent: 'capital', targetKey: capMatch[1].trim() };
    }

    // 2. "where is <place>"
    const whereMatch = q.match(/^where\s+is\s+([a-z\s]+)$/i);
    if (whereMatch && whereMatch[1]) {
      return { intent: 'where', targetKey: whereMatch[1].trim() };
    }

    // 3. "location of <place>"
    const locMatch = q.match(/^location\s+(?:of\s+)?([a-z\s]+)$/i);
    if (locMatch && locMatch[1]) {
      return { intent: 'where', targetKey: locMatch[1].trim() };
    }

    // 4. "coordinates of <place>"
    const coordMatch = q.match(/^coordinates\s+(?:of\s+)?([a-z\s]+)$/i);
    if (coordMatch && coordMatch[1]) {
      return { intent: 'coords', targetKey: coordMatch[1].trim() };
    }

    // 5. "population of <place>"
    const popMatch = q.match(/^population\s+(?:of\s+)?([a-z\s]+)$/i);
    if (popMatch && popMatch[1]) {
      return { intent: 'population', targetKey: popMatch[1].trim() };
    }

    return null;
  }
}
