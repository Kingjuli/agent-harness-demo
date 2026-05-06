export type Role = "user" | "assistant" | "system";

export type WorkflowStep =
  | "browsing"
  | "collecting_preferences"
  | "collecting_customer_details"
  | "reviewing_order"
  | "payment_pending"
  | "payment_completed"
  | "escalated";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  defaultAddress: string;
}

export interface Product {
  sku: string;
  name: string;
  category: "hoodie" | "tshirt" | "jacket" | "dress";
  color: string;
  size: "XS" | "S" | "M" | "L" | "XL";
  priceCents: number;
  stock: number;
}

export interface CartItem {
  sku: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Cart {
  items: CartItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  currency: "USD";
}

export interface CustomerProfile {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface Order {
  orderRef: string;
  status: "draft" | "created" | "paid";
  cart: Cart;
  customer: CustomerProfile;
}

export interface Payment {
  paymentRef: string;
  orderRef: string;
  amountCents: number;
  method: "card" | "mpesa" | "paypal";
  status: "pending" | "success" | "failed";
}

export interface EscalationTicket {
  id: string;
  reason: string;
  createdAt: string;
}

export type HarnessEventStage = "observe" | "plan" | "tool" | "guardrail" | "recovery" | "response" | "state";

export type HarnessStepStatus = "pending" | "running" | "done" | "blocked" | "skipped";

export type HarnessMode = "Talking" | "Planning" | "Executing" | "Blocked" | "Recovering" | "Complete";

export interface HarnessPlanStep {
  id: string;
  label: string;
  tool?: string;
  reason: string;
  status: HarnessStepStatus;
}

export interface HarnessEvent {
  stage: HarnessEventStage;
  title: string;
  detail: string;
  ok: boolean;
  at: string;
}

export type AgentIntentKind =
  | "human_escalation"
  | "catalog_question"
  | "product_recommendation"
  | "cart_mutation"
  | "customer_details"
  | "order_preparation"
  | "payment_confirmation"
  | "payment_status_monitoring"
  | "checkout_progression";

export interface AgentIntentBoundary {
  kind: AgentIntentKind;
  requiresTool: boolean;
  checkoutMutation: boolean;
  reason: string;
}

export interface HarnessState {
  goal: string;
  currentMode?: HarnessMode;
  loopCount: number;
  lastIntent: string;
  lastPlan: HarnessPlanStep[];
  observations: string[];
  guardrailFindings: string[];
  recoveryNotes: string[];
}

export interface AgentMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  userId: string;
  currentStep: WorkflowStep;
  status: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  isActive: boolean;
}

export interface ConversationDetail {
  sessionId: string;
  userId: string;
  currentStep: WorkflowStep;
  status: string;
  state: SessionState;
  messages: AgentMessage[];
}

export interface SessionState {
  sessionId: string;
  userId: string;
  workflowStep: WorkflowStep;
  harness: HarnessState;
  preferences: {
    category?: string;
    color?: string;
    size?: string;
    quantity?: number;
  };
  selectedProduct?: Product;
  cart: Cart;
  customer: CustomerProfile;
  order?: Order;
  payment?: Payment;
  confidence: number;
  requiresHuman: boolean;
}

export interface ToolTrace {
  tool: string;
  input: unknown;
  output: unknown;
  ok: boolean;
  reason?: string;
}

export interface AgentTurnResult {
  assistantMessage: string;
  updatedState: SessionState;
  toolTrace: ToolTrace[];
  harnessEvents: HarnessEvent[];
  status: "ok" | "needs_input" | "escalated" | "error";
}
