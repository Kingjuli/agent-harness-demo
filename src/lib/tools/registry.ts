import { AnyTool } from "@/lib/tools/contracts";
import { catalogLookupTool } from "@/lib/tools/catalog";
import { cartUpdateTool } from "@/lib/tools/cart";
import { shippingQuoteTool } from "@/lib/tools/shipping";
import { customerDetailsTool } from "@/lib/tools/customer";
import { orderCreateTool } from "@/lib/tools/order";
import { paymentInitiateTool, paymentStatusCheckTool } from "@/lib/tools/payment";
import { escalateTool } from "@/lib/tools/escalation";

export const TOOL_REGISTRY: Record<string, AnyTool> = {
  catalog_lookup: catalogLookupTool,
  cart_update: cartUpdateTool,
  shipping_quote: shippingQuoteTool,
  customer_details_upsert: customerDetailsTool,
  order_create: orderCreateTool,
  payment_initiate: paymentInitiateTool,
  payment_status_check: paymentStatusCheckTool,
  escalate_to_human: escalateTool,
};

export function getTool(name: string): AnyTool {
  const tool = TOOL_REGISTRY[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool;
}
