import * as cheerio from "cheerio";
import type { Thing } from "schema-dts";

export interface SchemaValidationError {
  raw: string;
  error: string;
}

export interface SchemaValidationResult {
  /** Whether any ld+json script tags were found */
  structuredDataPresent: boolean;
  /** Count of valid schema objects */
  validCount: number;
  /** Errors for schemas that could not be parsed or validated */
  invalidSchemas: SchemaValidationError[];
}

function isThing(value: unknown): value is Thing {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as any)["@type"] === "string" &&
    ("@context" in (value as any))
  );
}

/**
 * Parse HTML for <script type="application/ld+json"> blocks and validate them.
 *
 * Schemas are considered valid if they can be parsed as JSON and contain
 * `@context` and `@type` properties. Any parsing or validation errors are
 * collected and returned.
 */
export function validateSchemas(html: string): SchemaValidationResult {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  const invalidSchemas: SchemaValidationError[] = [];
  let validCount = 0;

  scripts.each((_, el) => {
    const text = $(el).contents().text();
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (isThing(item)) {
          validCount++;
        } else {
          invalidSchemas.push({
            raw: JSON.stringify(item),
            error: "Missing @context or @type",
          });
        }
      }
    } catch (e) {
      invalidSchemas.push({ raw: text, error: (e as Error).message });
    }
  });

  return {
    structuredDataPresent: scripts.length > 0,
    validCount,
    invalidSchemas,
  };
}

