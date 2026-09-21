/**
 * @opensearch/ranking — Safe Mathematical Expression Evaluator (Phase 38)
 *
 * Implements a deterministic, zero-dependency recursive descent AST parser & evaluator
 * for mathematical expressions, percentage calculations, and arithmetic functions.
 * Strictly avoids `eval()` and `Function()` constructors for total security.
 */

export interface MathEvaluationResult {
  expression: string;
  result: number;
  formattedResult: string;
  displaySummary: string;
}

type TokenType = 'NUMBER' | 'OP' | 'LPAREN' | 'RPAREN' | 'IDENT' | 'PERCENT_OF';

interface Token {
  type: TokenType;
  value: string;
}

export class MathEvaluator {
  private static readonly CONSTANTS: Record<string, number> = {
    pi: Math.PI,
    e: Math.E,
  };

  private static readonly FUNCTIONS: Record<string, (x: number) => number> = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    log: Math.log10,
    ln: Math.log,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
  };

  /**
   * Evaluates a raw query string. Returns null if query is not a valid mathematical expression.
   */
  evaluate(query: string): MathEvaluationResult | null {
    if (!query || typeof query !== 'string') {
      return null;
    }

    let clean = query.trim().toLowerCase();

    // Strip leading conversational phrases like 'calc', 'calculate', 'what is', 'solve'
    clean = clean.replace(/^(?:calc(?:ulate)?|what(?:\s+is|\s*'?s)?|solve)\s+/i, '').trim();

    // Check percentage pattern: "X% of Y" or "X percent of Y"
    const percentMatch =
      /^([0-9.]+)\s*%\s+of\s+([0-9.]+)$/i.exec(clean) ||
      /^([0-9.]+)\s*percent\s+(?:of\s+)?([0-9.]+)$/i.exec(clean);
    if (percentMatch && percentMatch[1] && percentMatch[2]) {
      const p = parseFloat(percentMatch[1]);
      const total = parseFloat(percentMatch[2]);
      if (!isNaN(p) && !isNaN(total)) {
        const val = (p / 100) * total;
        return {
          expression: `${p}% of ${total}`,
          result: val,
          formattedResult: this.formatNumber(val),
          displaySummary: `${p}% of ${this.formatNumber(total)} = ${this.formatNumber(val)}`,
        };
      }
    }

    // Must contain at least one digit or math function/constant to be evaluated
    if (!/[0-9]/.test(clean) && !/\b(pi|e|sqrt|sin|cos|tan)\b/i.test(clean)) {
      return null;
    }

    // Must contain at least one math operator or function
    if (!/[+\-*/^%()]/.test(clean) && !/\b(sqrt|abs|round|floor|ceil|log|ln|sin|cos|tan)\b/i.test(clean)) {
      return null;
    }

    // Tokenize
    const tokens = this.tokenize(clean);
    if (!tokens || tokens.length === 0) {
      return null;
    }

    try {
      const parser = new ExpressionParser(tokens);
      const result = parser.parse();

      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
        return null;
      }

      const formatted = this.formatNumber(result);
      return {
        expression: clean,
        result,
        formattedResult: formatted,
        displaySummary: `${clean} = ${formatted}`,
      };
    } catch {
      return null;
    }
  }

  private tokenize(text: string): Token[] | null {
    const tokens: Token[] = [];
    let i = 0;

    while (i < text.length) {
      const char = text[i]!;

      // Skip whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // Numbers (integers or decimals)
      if (/[0-9.]/.test(char)) {
        let numStr = '';
        let hasDot = false;
        while (i < text.length && /[0-9.]/.test(text[i]!)) {
          if (text[i] === '.') {
            if (hasDot) return null;
            hasDot = true;
          }
          numStr += text[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: numStr });
        continue;
      }

      // Identifiers (functions or constants e.g. sqrt, pi, sin)
      if (/[a-z]/i.test(char)) {
        let ident = '';
        while (i < text.length && /[a-z0-9]/i.test(text[i]!)) {
          ident += text[i]!.toLowerCase();
          i++;
        }
        if (ident in MathEvaluator.FUNCTIONS || ident in MathEvaluator.CONSTANTS) {
          tokens.push({ type: 'IDENT', value: ident });
          continue;
        }
        return null; // Unknown identifier, not a valid math expression
      }

      // Operators & Parentheses
      if (char === '(') {
        tokens.push({ type: 'LPAREN', value: '(' });
        i++;
      } else if (char === ')') {
        tokens.push({ type: 'RPAREN', value: ')' });
        i++;
      } else if (['+', '-', '*', '/', '^', '%'].includes(char)) {
        // Support ** as power
        if (char === '*' && text[i + 1] === '*') {
          tokens.push({ type: 'OP', value: '^' });
          i += 2;
        } else {
          tokens.push({ type: 'OP', value: char });
          i++;
        }
      } else {
        // Disallowed character
        return null;
      }
    }

    return tokens;
  }

  private formatNumber(val: number): string {
    if (Number.isInteger(val)) {
      return val.toLocaleString('en-US');
    }
    // Limit to 6 decimal places and strip trailing zeros
    const rounded = Number(val.toFixed(6));
    return rounded.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }
}

class ExpressionParser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    const res = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error('Unexpected extra tokens');
    }
    return res;
  }

  // Precedence level 1: Addition & Subtraction
  private parseExpression(): number {
    let left = this.parseTerm();

    while (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos];
      if (tok && tok.type === 'OP' && (tok.value === '+' || tok.value === '-')) {
        this.pos++;
        const right = this.parseTerm();
        left = tok.value === '+' ? left + right : left - right;
      } else {
        break;
      }
    }

    return left;
  }

  // Precedence level 2: Multiplication, Division & Modulo
  private parseTerm(): number {
    let left = this.parseFactor();

    while (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos];
      if (tok && tok.type === 'OP' && (tok.value === '*' || tok.value === '/' || tok.value === '%')) {
        this.pos++;
        const right = this.parseFactor();
        if (tok.value === '*') {
          left = left * right;
        } else if (tok.value === '/') {
          if (right === 0) throw new Error('Division by zero');
          left = left / right;
        } else if (tok.value === '%') {
          if (right === 0) throw new Error('Modulo by zero');
          left = left % right;
        }
      } else {
        break;
      }
    }

    return left;
  }

  // Precedence level 3: Exponentiation (right-associative)
  private parseFactor(): number {
    let base = this.parseUnary();

    if (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos];
      if (tok && tok.type === 'OP' && tok.value === '^') {
        this.pos++;
        const exp = this.parseFactor(); // right-associative
        base = Math.pow(base, exp);
      }
    }

    return base;
  }

  // Unary operators (+ or -)
  private parseUnary(): number {
    const tok = this.tokens[this.pos];
    if (tok && tok.type === 'OP' && (tok.value === '+' || tok.value === '-')) {
      this.pos++;
      const val = this.parsePrimary();
      return tok.value === '-' ? -val : val;
    }
    return this.parsePrimary();
  }

  // Primary values: Numbers, Parentheses, Functions, Constants
  private parsePrimary(): number {
    const tok = this.tokens[this.pos];
    if (!tok) {
      throw new Error('Unexpected end of input');
    }

    if (tok.type === 'NUMBER') {
      this.pos++;
      const num = parseFloat(tok.value);
      if (isNaN(num)) throw new Error('Invalid number');
      return num;
    }

    if (tok.type === 'LPAREN') {
      this.pos++;
      const inner = this.parseExpression();
      const closeTok = this.tokens[this.pos];
      if (!closeTok || closeTok.type !== 'RPAREN') {
        throw new Error('Missing closing parenthesis');
      }
      this.pos++;
      return inner;
    }

    if (tok.type === 'IDENT') {
      const name = tok.value.toLowerCase();
      this.pos++;

      // Check constant (pi, e)
      if (name in MathEvaluator['CONSTANTS']) {
        return MathEvaluator['CONSTANTS'][name]!;
      }

      // Check function (sqrt, abs, etc.)
      const fn = MathEvaluator['FUNCTIONS'][name];
      if (fn) {
        const nextTok = this.tokens[this.pos];
        if (nextTok && nextTok.type === 'LPAREN') {
          this.pos++;
          const arg = this.parseExpression();
          const closeTok = this.tokens[this.pos];
          if (!closeTok || closeTok.type !== 'RPAREN') {
            throw new Error('Missing closing parenthesis for function');
          }
          this.pos++;
          return fn(arg);
        } else {
          // If no parens e.g. sqrt 144
          const arg = this.parseUnary();
          return fn(arg);
        }
      }
    }

    throw new Error(`Unexpected token: ${tok.value}`);
  }
}
