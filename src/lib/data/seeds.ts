import { DemoUser, Product } from "@/lib/types/domain";

export const DEMO_USERS: DemoUser[] = [
  {
    id: "u_amina",
    name: "Amina Wanjiku",
    email: "amina@example.com",
    defaultAddress: "Westlands, Nairobi",
  },
  {
    id: "u_brian",
    name: "Brian Otieno",
    email: "brian@example.com",
    defaultAddress: "Kilimani, Nairobi",
  },
  {
    id: "u_sarah",
    name: "Sarah Njeri",
    email: "sarah@example.com",
    defaultAddress: "Lavington, Nairobi",
  },
];

export const PRODUCT_CATALOG: Product[] = [
  { sku: "HD-BLK-M", name: "Classic Hoodie", category: "hoodie", color: "black", size: "M", priceCents: 4200, stock: 12 },
  { sku: "HD-BLU-M", name: "Classic Hoodie", category: "hoodie", color: "blue", size: "M", priceCents: 4200, stock: 9 },
  { sku: "HD-RED-L", name: "Classic Hoodie", category: "hoodie", color: "red", size: "L", priceCents: 4200, stock: 5 },
  { sku: "TS-WHT-S", name: "Everyday Tee", category: "tshirt", color: "white", size: "S", priceCents: 1800, stock: 15 },
  { sku: "TS-BLK-M", name: "Everyday Tee", category: "tshirt", color: "black", size: "M", priceCents: 1800, stock: 10 },
  { sku: "TS-GRN-L", name: "Everyday Tee", category: "tshirt", color: "green", size: "L", priceCents: 1800, stock: 8 },
  { sku: "JK-NVY-M", name: "Bomber Jacket", category: "jacket", color: "navy", size: "M", priceCents: 6800, stock: 4 },
  { sku: "JK-BRN-L", name: "Bomber Jacket", category: "jacket", color: "brown", size: "L", priceCents: 6800, stock: 3 },
  { sku: "DR-BLK-S", name: "Flow Dress", category: "dress", color: "black", size: "S", priceCents: 5100, stock: 6 },
  { sku: "DR-PNK-M", name: "Flow Dress", category: "dress", color: "pink", size: "M", priceCents: 5100, stock: 7 },
  { sku: "DR-BLU-L", name: "Flow Dress", category: "dress", color: "blue", size: "L", priceCents: 5100, stock: 2 },
  { sku: "HD-GRY-XL", name: "Classic Hoodie", category: "hoodie", color: "gray", size: "XL", priceCents: 4200, stock: 7 },
];
