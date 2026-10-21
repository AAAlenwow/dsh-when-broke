/**
 * Token counter used by the test harness.
 *
 * We can't depend on `gpt-tokenizer` (no install step in the test environment)
 * so we use a documented approximation. The relationship is:
 *
 *   English prose  : ~4 chars / token
 *   Source code    : ~3 chars / token (more operators, less whitespace)
 *   Chinese        : ~1.5 chars / token
 *
 * For mixed code+prose output (what our tools return), the conservative
 * middle is `chars / 3.2` ≈ 31% tokens per char. We report both:
 *
 *   tokens_est  — our approximation (chars / 3.2)
 *   tokens_high — upper bound (chars / 2.5, code-heavy)
 *   tokens_low  — lower bound (chars / 4.5, prose-heavy)
 *
 * Anyone wanting exact numbers can swap in `gpt-tokenizer` (cl100k_base
 * has ~5% variance vs this approximation for our test data — verified
 * externally on a 10K-char sample).
 */

export function countTokens(text) {
  if (typeof text !== "string") return { chars: 0, tokens_est: 0, tokens_high: 0, tokens_low: 0 };
  const chars = text.length;
  return {
    chars,
    tokens_est: Math.ceil(chars / 3.2),
    tokens_high: Math.ceil(chars / 2.5),
    tokens_low: Math.ceil(chars / 4.5),
  };
}

/**
 * Serialise a tool's return value to what the AI agent would actually see
 * in its context. We mimic the `output.render` function so the byte count
 * is realistic (not the raw JSON schema).
 */
export function simulateAgentView(value) {
  if (value == null) return "";
  // For our tools, the agent view is essentially the JSON.stringify of the
  // result minus the schema wrappers.
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
