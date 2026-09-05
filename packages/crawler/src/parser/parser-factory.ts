/**
 * @opensearch/crawler — HTML Parser Factory (Phase 7)
 *
 * Factory function creating an instance of HtmlParser with configurable options.
 */

import { HtmlParser, HtmlParserOptions } from './parser-types.js';
import { DefaultHtmlParser } from './html-parser.js';

/**
 * Creates a configured HTML parser instance.
 */
export function createHtmlParser(options?: HtmlParserOptions): HtmlParser {
  return new DefaultHtmlParser(options);
}
