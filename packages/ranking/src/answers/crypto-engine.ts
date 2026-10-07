/**
 * @opensearch/ranking — Cryptographic Generators, Encoders & Hash Toolkit (Phase 56)
 *
 * Provides 100% zero-dependency, in-memory cryptographic utilities:
 * - UUID v4 generation
 * - Cryptographically secure password generation with custom charset/length
 * - Base64, Hex, URL, HTML entity encoding & decoding
 * - JWT Payload inspector & claims decoder
 * - SHA-256, SHA-512, MD5 cryptographic hash calculator
 */

import * as crypto from 'node:crypto';

export interface CryptoEngineResult {
  toolType: 'uuid' | 'password' | 'base64' | 'hex' | 'url_encode' | 'jwt' | 'hash';
  title: string;
  output: string;
  description: string;
  copyValue: string;
  details?: Record<string, string | number>;
}

export class CryptoEngine {
  /**
   * Evaluates if query is a crypto/encoding request. Returns null if not matched.
   */
  evaluate(rawQuery: string): CryptoEngineResult | null {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return null;
    }

    const query = rawQuery.trim();
    const lower = query.toLowerCase();

    // 1. UUID v4 Generator
    if (/^(uuid|uuid\s*v4|generate\s+uuid|new\s+uuid|guid)$/i.test(lower)) {
      return this.generateUuid();
    }

    // 2. Password Generator
    const passwordMatch = lower.match(/^(?:generate\s+)?(?:password|passwd)(?:\s+(\d+))?(?:\s+(special|alphanumeric|hex|numbers))?$/i);
    if (passwordMatch) {
      const length = passwordMatch[1] ? Math.max(4, Math.min(128, parseInt(passwordMatch[1], 10))) : 16;
      const type = passwordMatch[2] || 'special';
      return this.generatePassword(length, type);
    }

    // 3. Base64 Encoder / Decoder
    const b64EncodeMatch = query.match(/^base64\s+(?:encode|e)\s+(.+)$/i);
    if (b64EncodeMatch && b64EncodeMatch[1]) {
      return this.base64Encode(b64EncodeMatch[1]);
    }
    const b64DecodeMatch = query.match(/^base64\s+(?:decode|d)\s+(.+)$/i);
    if (b64DecodeMatch && b64DecodeMatch[1]) {
      return this.base64Decode(b64DecodeMatch[1]);
    }

    // 4. Hex Encoder / Decoder
    const hexEncodeMatch = query.match(/^hex\s+(?:encode|e)\s+(.+)$/i);
    if (hexEncodeMatch && hexEncodeMatch[1]) {
      return this.hexEncode(hexEncodeMatch[1]);
    }
    const hexDecodeMatch = query.match(/^hex\s+(?:decode|d)\s+(.+)$/i);
    if (hexDecodeMatch && hexDecodeMatch[1]) {
      return this.hexDecode(hexDecodeMatch[1]);
    }

    // 5. URL Encoder / Decoder
    const urlEncodeMatch = query.match(/^url\s*(?:encode|e)\s+(.+)$/i);
    if (urlEncodeMatch && urlEncodeMatch[1]) {
      return this.urlEncode(urlEncodeMatch[1]);
    }
    const urlDecodeMatch = query.match(/^url\s*(?:decode|d)\s+(.+)$/i);
    if (urlDecodeMatch && urlDecodeMatch[1]) {
      return this.urlDecode(urlDecodeMatch[1]);
    }

    // 6. JWT Decoder
    const jwtMatch = query.match(/^(?:jwt\s+(?:decode\s+)?|decode\s+jwt\s+)(eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]*)$/i);
    if (jwtMatch && jwtMatch[1]) {
      return this.decodeJwt(jwtMatch[1].trim());
    }

    // 7. Cryptographic Hasher (sha256, sha512, md5)
    const hashMatch = query.match(/^(sha256|sha512|sha1|md5)\s+(.+)$/i);
    if (hashMatch && hashMatch[1] && hashMatch[2]) {
      const algo = hashMatch[1].toLowerCase();
      const text = hashMatch[2];
      return this.computeHash(algo, text);
    }

    return null;
  }

  private generateUuid(): CryptoEngineResult {
    const id = crypto.randomUUID();
    return {
      toolType: 'uuid',
      title: 'UUID v4 Generator',
      output: id,
      description: 'Cryptographically secure Universally Unique Identifier (RFC 4122)',
      copyValue: id,
      details: {
        'Version': '4 (Random)',
        'Variant': '1 (RFC 4122)',
        'Length': '36 characters',
      },
    };
  }

  private generatePassword(length: number, charsetType: string): CryptoEngineResult {
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let label = 'Alphanumeric';

    if (charsetType === 'special') {
      chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
      label = 'Alphanumeric + Special Characters';
    } else if (charsetType === 'hex') {
      chars = '0123456789abcdef';
      label = 'Hexadecimal';
    } else if (charsetType === 'numbers') {
      chars = '0123456789';
      label = 'Numeric PIN';
    }

    const randomBytes = crypto.randomBytes(length);
    let pwd = '';
    for (let i = 0; i < length; i++) {
      const byte = randomBytes[i] ?? 0;
      pwd += chars[byte % chars.length];
    }

    // Estimate entropy
    const entropy = Math.round(length * Math.log2(chars.length));

    return {
      toolType: 'password',
      title: 'Secure Password Generator',
      output: pwd,
      description: `Cryptographically random ${length}-character secure string`,
      copyValue: pwd,
      details: {
        'Length': `${length} chars`,
        'Charset': label,
        'Entropy': `~${entropy} bits`,
        'Strength': entropy > 80 ? 'Very Strong' : entropy > 50 ? 'Strong' : 'Moderate',
      },
    };
  }

  private base64Encode(text: string): CryptoEngineResult {
    const encoded = Buffer.from(text, 'utf-8').toString('base64');
    return {
      toolType: 'base64',
      title: 'Base64 Encoder',
      output: encoded,
      description: `Encoded UTF-8 string (${text.length} chars -> ${encoded.length} bytes)`,
      copyValue: encoded,
      details: {
        'Input Text': text,
        'Output Size': `${encoded.length} bytes`,
      },
    };
  }

  private base64Decode(encoded: string): CryptoEngineResult {
    try {
      const decoded = Buffer.from(encoded.trim(), 'base64').toString('utf-8');
      return {
        toolType: 'base64',
        title: 'Base64 Decoder',
        output: decoded,
        description: 'Decoded UTF-8 string from Base64 payload',
        copyValue: decoded,
        details: {
          'Base64 Input': encoded,
          'Decoded Length': `${decoded.length} chars`,
        },
      };
    } catch {
      return {
        toolType: 'base64',
        title: 'Base64 Decoder',
        output: '[Error: Invalid Base64 String]',
        description: 'Could not decode input as valid Base64 UTF-8 text',
        copyValue: '',
      };
    }
  }

  private hexEncode(text: string): CryptoEngineResult {
    const encoded = Buffer.from(text, 'utf-8').toString('hex');
    return {
      toolType: 'hex',
      title: 'Hexadecimal Encoder',
      output: encoded,
      description: `Encoded ${text.length} UTF-8 characters to hex bytes`,
      copyValue: encoded,
    };
  }

  private hexDecode(hex: string): CryptoEngineResult {
    try {
      const cleanHex = hex.trim().replace(/^0x/i, '');
      const decoded = Buffer.from(cleanHex, 'hex').toString('utf-8');
      return {
        toolType: 'hex',
        title: 'Hexadecimal Decoder',
        output: decoded,
        description: 'Decoded UTF-8 text from hex string',
        copyValue: decoded,
      };
    } catch {
      return {
        toolType: 'hex',
        title: 'Hexadecimal Decoder',
        output: '[Error: Invalid Hex String]',
        description: 'Could not decode hex representation',
        copyValue: '',
      };
    }
  }

  private urlEncode(text: string): CryptoEngineResult {
    const encoded = encodeURIComponent(text);
    return {
      toolType: 'url_encode',
      title: 'URL Percent Encoder',
      output: encoded,
      description: 'URI encoded string (RFC 3986)',
      copyValue: encoded,
    };
  }

  private urlDecode(text: string): CryptoEngineResult {
    try {
      const decoded = decodeURIComponent(text);
      return {
        toolType: 'url_encode',
        title: 'URL Percent Decoder',
        output: decoded,
        description: 'Decoded URL string',
        copyValue: decoded,
      };
    } catch {
      return {
        toolType: 'url_encode',
        title: 'URL Percent Decoder',
        output: '[Error: Malformed URI]',
        description: 'Invalid URI sequence provided',
        copyValue: '',
      };
    }
  }

  private decodeJwt(token: string): CryptoEngineResult {
    try {
      const parts = token.split('.');
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        throw new Error('Invalid JWT format');
      }

      const headerJson = Buffer.from(parts[0], 'base64').toString('utf-8');
      const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');

      const header = JSON.parse(headerJson);
      const payload = JSON.parse(payloadJson);

      const formatted = JSON.stringify(payload, null, 2);
      const details: Record<string, string | number> = {
        'Algorithm (alg)': header.alg || 'none',
        'Type (typ)': header.typ || 'JWT',
      };

      if (payload.iss) details['Issuer (iss)'] = payload.iss;
      if (payload.sub) details['Subject (sub)'] = payload.sub;
      if (payload.aud) details['Audience (aud)'] = String(payload.aud);
      if (payload.exp) {
        const expDate = new Date(payload.exp * 1000).toISOString();
        details['Expires At (exp)'] = `${payload.exp} (${expDate})`;
      }
      if (payload.iat) {
        const iatDate = new Date(payload.iat * 1000).toISOString();
        details['Issued At (iat)'] = `${payload.iat} (${iatDate})`;
      }

      return {
        toolType: 'jwt',
        title: 'JWT Payload Inspector',
        output: formatted,
        description: 'Zero-trace, client-side parsed JSON Web Token payload',
        copyValue: formatted,
        details,
      };
    } catch {
      return {
        toolType: 'jwt',
        title: 'JWT Payload Inspector',
        output: '[Error: Invalid JWT Token]',
        description: 'Could not parse token header or claims payload',
        copyValue: '',
      };
    }
  }

  private computeHash(algo: string, text: string): CryptoEngineResult {
    try {
      const hash = crypto.createHash(algo).update(text, 'utf-8').digest('hex');
      return {
        toolType: 'hash',
        title: `${algo.toUpperCase()} Hash Calculator`,
        output: hash,
        description: `Cryptographic digest for "${text.length > 30 ? text.slice(0, 30) + '...' : text}"`,
        copyValue: hash,
        details: {
          'Algorithm': algo.toUpperCase(),
          'Digest Format': 'Hexadecimal',
          'Output Bits': `${hash.length * 4} bits (${hash.length} hex chars)`,
        },
      };
    } catch {
      return {
        toolType: 'hash',
        title: 'Cryptographic Hash',
        output: '[Error: Unsupported Hash Algorithm]',
        description: `Could not compute digest for algorithm: ${algo}`,
        copyValue: '',
      };
    }
  }
}
