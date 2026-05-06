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
  { sku: "HD-BLK-M", name: "Essential Pullover Hoodie", category: "hoodie", color: "black", size: "M", priceCents: 4200, stock: 12 },
  { sku: "HD-BLU-M", name: "Ocean Fleece Hoodie", category: "hoodie", color: "blue", size: "M", priceCents: 4550, stock: 9 },
  { sku: "HD-RED-L", name: "Crimson Street Hoodie", category: "hoodie", color: "red", size: "L", priceCents: 4890, stock: 5 },
  { sku: "HD-GRY-XL", name: "Cloud Knit Hoodie", category: "hoodie", color: "gray", size: "XL", priceCents: 4390, stock: 7 },
  { sku: "HD-SND-S", name: "Sandstone Lounge Hoodie", category: "hoodie", color: "sand", size: "S", priceCents: 4680, stock: 8 },

  { sku: "TS-WHT-S", name: "Studio Crew Tee", category: "tshirt", color: "white", size: "S", priceCents: 1800, stock: 15 },
  { sku: "TS-BLK-M", name: "Midnight Soft Tee", category: "tshirt", color: "black", size: "M", priceCents: 1950, stock: 10 },
  { sku: "TS-GRN-L", name: "Verdant Relaxed Tee", category: "tshirt", color: "green", size: "L", priceCents: 2050, stock: 8 },
  { sku: "TS-NVY-XL", name: "Harbor Classic Tee", category: "tshirt", color: "navy", size: "XL", priceCents: 2150, stock: 11 },
  { sku: "TS-RST-M", name: "Rust Everyday Tee", category: "tshirt", color: "rust", size: "M", priceCents: 2250, stock: 6 },

  { sku: "JK-NVY-M", name: "Aero Bomber", category: "jacket", color: "navy", size: "M", priceCents: 6800, stock: 4 },
  { sku: "JK-BRN-L", name: "Walnut Utility Jacket", category: "jacket", color: "brown", size: "L", priceCents: 7250, stock: 3 },
  { sku: "JK-OLV-M", name: "Olive Field Jacket", category: "jacket", color: "olive", size: "M", priceCents: 7480, stock: 5 },
  { sku: "JK-CHR-S", name: "Slate City Bomber", category: "jacket", color: "charcoal", size: "S", priceCents: 6990, stock: 4 },

  { sku: "DR-BLK-S", name: "Noir Slip Dress", category: "dress", color: "black", size: "S", priceCents: 5100, stock: 6 },
  { sku: "DR-PNK-M", name: "Rosy Wrap Dress", category: "dress", color: "pink", size: "M", priceCents: 5450, stock: 7 },
  { sku: "DR-BLU-L", name: "Azure Pleat Dress", category: "dress", color: "blue", size: "L", priceCents: 5720, stock: 2 },
  { sku: "DR-EMR-S", name: "Emerald Belt Dress", category: "dress", color: "emerald", size: "S", priceCents: 5350, stock: 5 },
  { sku: "DR-CRM-M", name: "Cream Midi Dress", category: "dress", color: "cream", size: "M", priceCents: 5590, stock: 4 },

  { sku: "TS-CRP-WHT-S", name: "Cropped Rib Tee", category: "tshirt", color: "white", size: "S", priceCents: 2390, stock: 9 },
  { sku: "TS-CRP-LIL-M", name: "Lilac Boxy Crop Tee", category: "tshirt", color: "lilac", size: "M", priceCents: 2490, stock: 7 },
  { sku: "JK-LGT-BLU-M", name: "Skyline Denim Jacket", category: "jacket", color: "light blue", size: "M", priceCents: 7600, stock: 3 },
  { sku: "HD-ZIP-BLK-L", name: "Metro Zip Hoodie", category: "hoodie", color: "black", size: "L", priceCents: 4700, stock: 6 },
  { sku: "DR-MAXI-RSE-L", name: "Rose Maxi Dress", category: "dress", color: "rose", size: "L", priceCents: 5900, stock: 3 },
];
