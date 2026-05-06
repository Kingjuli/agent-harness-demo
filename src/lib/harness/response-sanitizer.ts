// Sanitizes assistant text before rendering to end users.
const META_LINE_PATTERNS = [
  /^\s*(so\s+)?final message[:\-]/i,
  /^\s*let'?s\s+/i,
  /^\s*we\s+(must|should|can)\s+/i,
  /^\s*but earlier\b/i,
  /^\s*craft\b/i,
  /^\s*internal\b/i,
  /^\s*reasoning\b/i,
];

const UI_TAG_PATTERNS = [
  /<show_customer_details_form\s*\/?>/gi,
  /<show_product\s+sku="[^"]+"\s*\/?>/gi,
  /<show_products\s+skus="[^"]+"\s*\/?>/gi,
];

export function sanitizeCustomerResponse(message: string) {
  const withoutTags = UI_TAG_PATTERNS.reduce((text, pattern) => text.replace(pattern, ""), message);

  const cleaned = withoutTags
    .split("\n")
    .filter((line) => !META_LINE_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) {
    return "I can help with that. Tell me what you want to browse, add to cart, or check out next.";
  }

  return cleaned;
}
