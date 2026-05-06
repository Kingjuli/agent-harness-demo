// Catalog lookup tool and schema definitions.
import { z } from "zod";
import { PRODUCT_CATALOG } from "@/lib/data/seeds";
import { ToolDefinition } from "@/lib/tools/contracts";

export const catalogLookupInput = z.object({
  category: z.string().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
});

export const catalogLookupOutput = z.object({
  matches: z.array(
    z.object({
      sku: z.string(),
      name: z.string(),
      category: z.string(),
      color: z.string(),
      size: z.string(),
      priceCents: z.number(),
      stock: z.number(),
    }),
  ),
});

export const catalogLookupTool: ToolDefinition<typeof catalogLookupInput, typeof catalogLookupOutput> = {
  name: "catalog_lookup",
  description: "Find products from catalog using category, color, and size.",
  inputSchema: catalogLookupInput,
  outputSchema: catalogLookupOutput,
  async execute(input) {
    const matches = PRODUCT_CATALOG.filter((p) => {
      const categoryOk = input.category ? p.category.toLowerCase() === input.category.toLowerCase() : true;
      const colorOk = input.color ? p.color.toLowerCase() === input.color.toLowerCase() : true;
      const sizeOk = input.size ? p.size.toLowerCase() === input.size.toLowerCase() : true;
      return categoryOk && colorOk && sizeOk;
    });

    return { matches };
  },
};
