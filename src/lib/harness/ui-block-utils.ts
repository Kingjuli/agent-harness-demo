// Utility helpers for parsing model UI tags and selecting UI blocks.
import { PRODUCT_CATALOG } from "@/lib/data/seeds";
import { AgentTurnResult, Product, SessionState, ToolTrace } from "@/lib/types/domain";

export function hasSuccessfulToolCall(traces: ToolTrace[], toolName: string) {
  return traces.some((trace) => trace.tool === toolName && trace.ok);
}

export function hasCustomerDetailsFormTag(assistantMessage: string) {
  return /<show_customer_details_form\s*\/?>/i.test(assistantMessage);
}

export function extractProductSkusForUi(assistantMessage: string, state: SessionState): string[] {
  const collected: string[] = [];
  const singleMatches = assistantMessage.matchAll(/<show_product\s+sku="([^"]+)"\s*\/?>/gi);
  for (const match of singleMatches) {
    const sku = (match[1] ?? "").trim().toUpperCase();
    if (sku) collected.push(sku);
  }
  const listMatches = assistantMessage.matchAll(/<show_products\s+skus="([^"]+)"\s*\/?>/gi);
  for (const match of listMatches) {
    const values = (match[1] ?? "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    collected.push(...values);
  }
  const inlineSkuMatches = assistantMessage.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+){2,}\b/g) ?? [];
  collected.push(...inlineSkuMatches.map((value) => value.toUpperCase()));

  if (collected.length === 0 && state.selectedProduct?.sku) {
    collected.push(state.selectedProduct.sku.toUpperCase());
  }

  return [...new Set(collected)].slice(0, 6);
}

export function lookupProductsBySku(skus: string[]): Product[] {
  return skus
    .map((sku) => PRODUCT_CATALOG.find((product) => product.sku.toUpperCase() === sku))
    .filter((product): product is Product => Boolean(product))
    .slice(0, 6);
}

export function pickTopConfidenceBlock(
  candidates: Array<{ confidence: number; block: NonNullable<AgentTurnResult["ui"]>[number] }>,
): AgentTurnResult["ui"] {
  if (candidates.length === 0) return undefined;
  const top = candidates.reduce((best, current) => (current.confidence > best.confidence ? current : best));
  return [top.block];
}
