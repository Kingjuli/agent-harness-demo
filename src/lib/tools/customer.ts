import { z } from "zod";
import { ToolDefinition } from "@/lib/tools/contracts";

export const customerDetailsInput = z.object({
  name: z.string().min(2).optional(),
  email: z.email().optional(),
  phone: z.string().min(7).optional(),
  address: z.string().min(3).optional(),
});

export const customerDetailsOutput = z.object({
  customer: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
  missingFields: z.array(z.string()),
});

export const customerDetailsTool: ToolDefinition<typeof customerDetailsInput, typeof customerDetailsOutput> = {
  name: "customer_details_upsert",
  description: "Collect and update customer details needed for checkout.",
  inputSchema: customerDetailsInput,
  outputSchema: customerDetailsOutput,
  async execute(input, ctx) {
    const customer = {
      ...ctx.state.customer,
      ...input,
    };

    const missingFields = ["name", "email", "phone", "address"].filter((field) => !customer[field as keyof typeof customer]);

    return { customer, missingFields };
  },
};
