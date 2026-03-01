/**
 * Strips markdown fences from LLM response text and parses as JSON.
 * Returns the parsed object, or throws on invalid JSON.
 */
export function parseJsonFromLlmResponse(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.substring(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence >= 0) {
      cleaned = cleaned.substring(0, lastFence);
    }
  }
  return JSON.parse(cleaned.trim());
}
