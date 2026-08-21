import {
  FINPA_PAYSTACK_PLANS,
  initializePaystackCheckout,
  processVerifiedPaystackPurchase,
  verifyFinpaRouterSecret,
  verifyPaystackWebhookSignature,
} from "./payments";
import { listPins } from "./database";
import { memoryResetForTests } from "./memoryStore";

beforeEach(() => {
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.FINPA_PUBLIC_BASE_URL;
  delete process.env.FINPA_PAYSTACK_ROUTER_SECRET;
  memoryResetForTests();
});

test("FINPA Paystack plans map approved NGN and USD amounts in subunits", () => {
  expect(FINPA_PAYSTACK_PLANS.monthly_ngn.amountSubunits).toBe(200000);
  expect(FINPA_PAYSTACK_PLANS.annual_ngn.amountSubunits).toBe(1500000);
  expect(FINPA_PAYSTACK_PLANS.launch_annual_ngn.amountSubunits).toBe(1200000);
  expect(FINPA_PAYSTACK_PLANS.monthly_usd.amountSubunits).toBe(499);
  expect(FINPA_PAYSTACK_PLANS.annual_usd.amountSubunits).toBe(3900);
  expect(FINPA_PAYSTACK_PLANS.launch_annual_usd.amountSubunits).toBe(2900);
});

test("initializePaystackCheckout validates plan server-side and sends exact Paystack payload", async () => {
  let payload: unknown;
  const checkout = await initializePaystackCheckout(
    {
      planId: "launch_annual_usd",
      buyerEmail: "buyer@example.com",
      buyerName: "Buyer One",
      buyerPhone: "+234****5678",
    },
    async (request) => {
      payload = request;
      return {
        authorization_url: "https://checkout.paystack.com/mock",
        access_code: "access_mock",
        reference: request.reference,
      };
    },
  );

  expect(checkout.currency).toBe("USD");
  expect(checkout.amountSubunits).toBe(2900);
  expect(checkout.reference).toMatch(/^finpa_launch_annual_usd_/);
  expect(payload).toEqual({
    email: "buyer@example.com",
    amount: 2900,
    currency: "USD",
    reference: checkout.reference,
    callback_url: undefined,
    metadata: {
      product: "finpa",
      plan_id: "launch_annual_usd",
      period: "annual",
      duration_days: 365,
      buyer_name: "Buyer One",
      buyer_phone: "+234****5678",
    },
  });
});

test("verified Paystack purchase creates one sold PIN visible in admin inventory", async () => {
  const sale = await processVerifiedPaystackPurchase("finpa_ref_001", async () => ({
    status: "success",
    reference: "finpa_ref_001",
    amount: 200000,
    currency: "NGN",
    customer: { email: "buyer@example.com" },
    metadata: {
      product: "finpa",
      plan_id: "monthly_ngn",
      buyer_name: "Buyer One",
      buyer_phone: "+234****5678",
    },
  }));

  expect(sale.pin_code).toMatch(/^FINPA-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(sale.plan_id).toBe("monthly_ngn");
  expect(sale.period).toBe("monthly");
  expect(sale.source).toBe("paystack");
  expect(sale.buyer_email).toBe("buyer@example.com");
  expect(sale.email_status).toBe("pending");

  const pins = await listPins("all", 20, "buyer@example.com", "all");
  expect(pins.length).toBe(1);
  expect(pins[0].code).toBe(sale.pin_code);
  expect(pins[0].source).toBe("paystack");
  expect(pins[0].buyer_email).toBe("buyer@example.com");
  expect(pins[0].paystack_reference).toBe("finpa_ref_001");
  expect(pins[0].amount_paid).toBe(200000);
  expect(pins[0].currency).toBe("NGN");
});

test("verified Paystack purchase is idempotent by reference", async () => {
  const verifier = async () => ({
    status: "success" as const,
    reference: "finpa_ref_dupe",
    amount: 1500000,
    currency: "NGN" as const,
    customer: { email: "buyer@example.com" },
    metadata: { product: "finpa", plan_id: "annual_ngn" },
  });

  const first = await processVerifiedPaystackPurchase("finpa_ref_dupe", verifier);
  const second = await processVerifiedPaystackPurchase("finpa_ref_dupe", verifier);

  expect(second.pin_code).toBe(first.pin_code);
  const pins = await listPins("all", 20, "finpa_ref_dupe", "all");
  expect(pins.length).toBe(1);
});

test("unverified or mismatched Paystack transaction never issues a PIN", async () => {
  await expect(
    processVerifiedPaystackPurchase("finpa_ref_bad", async () => ({
      status: "success",
      reference: "finpa_ref_bad",
      amount: 999,
      currency: "NGN",
      customer: { email: "buyer@example.com" },
      metadata: { product: "finpa", plan_id: "monthly_ngn" },
    })),
  ).rejects.toThrow(/amount or currency mismatch/i);

  const pins = await listPins("all", 20, "", "all");
  expect(pins.length).toBe(0);
});

test("verifyPaystackWebhookSignature validates sha512 HMAC without exposing the secret", () => {
  process.env.PAYSTACK_SECRET_KEY = "redacted_test_secret";
  const body = Buffer.from(JSON.stringify({ event: "charge.success" }));
  const signature = verifyPaystackWebhookSignature.signForTest(body, process.env.PAYSTACK_SECRET_KEY);
  expect(verifyPaystackWebhookSignature(body, signature)).toBe(true);
  expect(verifyPaystackWebhookSignature(body, "bad")).toBe(false);
});

test("FINPA router secret validates trusted Apps Script forwarding without accepting unsigned public requests", () => {
  delete process.env.FINPA_PAYSTACK_ROUTER_SECRET;
  expect(verifyFinpaRouterSecret("anything")).toBe(false);

  process.env.FINPA_PAYSTACK_ROUTER_SECRET = "redacted_router_secret";
  expect(verifyFinpaRouterSecret("redacted_router_secret")).toBe(true);
  expect(verifyFinpaRouterSecret("bad")).toBe(false);
  expect(verifyFinpaRouterSecret(undefined)).toBe(false);
});
