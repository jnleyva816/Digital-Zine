import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";
import { POST as CHECKOUT } from "@/app/api/billing/checkout/route";
import { POST as PORTAL } from "@/app/api/billing/portal/route";
import { POST as WEBHOOK } from "@/app/api/billing/webhook/route";
import { createTestUser, deleteTestUser } from "./helpers";

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stripe")>()),
  getStripeClient: vi.fn(),
}));
const mockedUser = vi.mocked(getAuthenticatedUser);
const mockedStripe = vi.mocked(getStripeClient);

const WEBHOOK_SECRET = "whsec_test_digital_zine";
const realStripe = new Stripe("sk_test_not_used_for_network");

/** A Stripe client whose network calls are stubs; signature checks use the real SDK. */
function fakeStripe() {
  return {
    webhooks: realStripe.webhooks,
    customers: {
      create: vi.fn(async (_params: Stripe.CustomerCreateParams, _options?: Stripe.RequestOptions) => ({
        id: `cus_${randomUUID().slice(0, 8)}`,
      })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (_params: Stripe.Checkout.SessionCreateParams) => ({ url: "https://checkout.stripe.test/session" })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async (_params: Stripe.BillingPortal.SessionCreateParams) => ({ url: "https://billing.stripe.test/portal" })),
      },
    },
    subscriptions: { retrieve: vi.fn<(id: string) => Promise<unknown>>() },
  };
}
let stripe: ReturnType<typeof fakeStripe>;

type User = Awaited<ReturnType<typeof createTestUser>>;
let me: User;

beforeAll(async () => {
  me = await createTestUser();
});

afterAll(async () => {
  await deleteTestUser(me.id);
  await prisma.$disconnect();
});

beforeEach(async () => {
  stripe = fakeStripe();
  mockedStripe.mockReturnValue(stripe as unknown as Stripe);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_monthly");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://zine.test");
  await prisma.user.update({
    where: { id: me.id },
    data: { tier: "free", subscriptionStatus: "inactive", stripeCustomerId: null, stripeSubscriptionId: null },
  });
  me = { ...me, tier: "free", subscriptionStatus: "inactive", stripeCustomerId: null };
  mockedUser.mockImplementation(async () => me);
});

const post = (url: string) => new Request(`http://attacker.example${url}`, { method: "POST" });

describe("POST /api/billing/checkout", () => {
  it("returns 401 when signed out", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await CHECKOUT(post("/api/billing/checkout"))).status).toBe(401);
  });

  it("explains that billing is not configured when Stripe keys are missing", async () => {
    mockedStripe.mockReturnValue(null);
    const res = await CHECKOUT(post("/api/billing/checkout"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ configured: false, error: expect.stringMatching(/not set up/i) });
  });

  it("creates one Stripe customer per user and a subscription Checkout Session", async () => {
    const res = await CHECKOUT(post("/api/billing/checkout"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, url: "https://checkout.stripe.test/session" });

    expect(stripe.customers.create).toHaveBeenCalledTimes(1);
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: me.email, metadata: { userId: me.id } }),
      { idempotencyKey: `customer-create-${me.id}` }
    );
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(stored.stripeCustomerId).toMatch(/^cus_/);

    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params).toMatchObject({
      mode: "subscription",
      customer: stored.stripeCustomerId,
      client_reference_id: me.id,
      line_items: [{ price: "price_pro_monthly", quantity: 1 }],
      success_url: "https://zine.test/billing?checkout=success",
      cancel_url: "https://zine.test/billing?checkout=cancelled",
    });
    expect(params).not.toHaveProperty("payment_method_types");
  });

  it("sends no tax settings when automatic tax is off", async () => {
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "");
    await CHECKOUT(post("/api/billing/checkout"));
    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params).not.toHaveProperty("automatic_tax");
    expect(params).not.toHaveProperty("customer_update");
  });

  it("turns on Stripe Tax and collects the billing address when STRIPE_AUTOMATIC_TAX=true", async () => {
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "true");
    await CHECKOUT(post("/api/billing/checkout"));
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      customer_update: { address: "auto", name: "auto" },
    });
  });

  it("prices the inline fallback as $15 plus tax", async () => {
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
    vi.stubEnv("STRIPE_AUTOMATIC_TAX", "true");
    await CHECKOUT(post("/api/billing/checkout"));
    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.line_items?.[0]?.price_data).toMatchObject({
      currency: "usd",
      unit_amount: 1500,
      recurring: { interval: "month" },
      tax_behavior: "exclusive",
    });
  });

  it("reuses the stored customer", async () => {
    await prisma.user.update({ where: { id: me.id }, data: { stripeCustomerId: "cus_existing" } });
    me = { ...me, stripeCustomerId: "cus_existing" };
    await CHECKOUT(post("/api/billing/checkout"));
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({ customer: "cus_existing" });
  });

  it("refuses a second subscription for a Pro user", async () => {
    me = { ...me, tier: "pro", subscriptionStatus: "active" };
    const res = await CHECKOUT(post("/api/billing/checkout"));
    expect(res.status).toBe(409);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("never starts a checkout for an admin, even one viewing as Free", async () => {
    me = { ...me, role: "admin", tier: "free", viewingAsFree: true };
    const res = await CHECKOUT(post("/api/billing/checkout"));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/admin/i) });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("never builds return URLs from the request host", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const res = await CHECKOUT(post("/api/billing/checkout"));
    expect(res.status).toBe(503);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/portal", () => {
  it("returns 401 when signed out", async () => {
    mockedUser.mockResolvedValue(null);
    expect((await PORTAL(post("/api/billing/portal"))).status).toBe(401);
  });

  it("explains that billing is not configured when Stripe keys are missing", async () => {
    mockedStripe.mockReturnValue(null);
    const res = await PORTAL(post("/api/billing/portal"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ configured: false });
  });

  it("returns 409 when the user has never subscribed", async () => {
    const res = await PORTAL(post("/api/billing/portal"));
    expect(res.status).toBe(409);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("opens the Customer Portal for the user's own customer", async () => {
    me = { ...me, tier: "pro", stripeCustomerId: "cus_mine" };
    const res = await PORTAL(post("/api/billing/portal"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ configured: true, url: "https://billing.stripe.test/portal" });
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_mine",
      return_url: "https://zine.test/billing",
    });
  });
});

describe("POST /api/billing/webhook", () => {
  function signed(event: { type: string; data: { object: unknown } }) {
    const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: "event", ...event });
    const header = realStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return new Request("http://test.local/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": header },
      body: payload,
    });
  }

  function subscription(status: Stripe.Subscription.Status, customer = "cus_hook", metadata: Record<string, string> = {}) {
    return { id: "sub_hook", object: "subscription", status, customer, metadata };
  }

  async function linkCustomer(customer = "cus_hook") {
    await prisma.user.update({ where: { id: me.id }, data: { stripeCustomerId: customer } });
  }

  const stored = () => prisma.user.findUniqueOrThrow({ where: { id: me.id } });

  it("returns 503 when the webhook secret is not configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await WEBHOOK(signed({ type: "customer.subscription.updated", data: { object: subscription("active") } }));
    expect(res.status).toBe(503);
  });

  it("rejects a missing or forged signature and changes nothing", async () => {
    await linkCustomer();
    const body = JSON.stringify({ type: "customer.subscription.updated", data: { object: subscription("active") } });
    const missing = await WEBHOOK(new Request("http://test.local/x", { method: "POST", body }));
    expect(missing.status).toBe(400);
    const forged = await WEBHOOK(
      new Request("http://test.local/x", { method: "POST", headers: { "stripe-signature": "t=1,v1=deadbeef" }, body })
    );
    expect(forged.status).toBe(400);
    expect((await stored()).tier).toBe("free");
  });

  it("upgrades the user who completed Checkout, using the subscription's live status", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(subscription("active", "cus_new"));
    const res = await WEBHOOK(
      signed({
        type: "checkout.session.completed",
        data: {
          object: {
            object: "checkout.session",
            mode: "subscription",
            payment_status: "paid",
            client_reference_id: me.id,
            customer: "cus_new",
            subscription: "sub_hook",
          },
        },
      })
    );
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_hook");
    expect(await stored()).toMatchObject({
      tier: "pro",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_new",
      stripeSubscriptionId: "sub_hook",
    });
  });

  it("does not upgrade on a Checkout that is not paid yet", async () => {
    stripe.subscriptions.retrieve.mockResolvedValue(subscription("incomplete", "cus_new"));
    await WEBHOOK(
      signed({
        type: "checkout.session.completed",
        data: {
          object: {
            object: "checkout.session",
            mode: "subscription",
            payment_status: "unpaid",
            client_reference_id: me.id,
            customer: "cus_new",
            subscription: "sub_hook",
          },
        },
      })
    );
    expect((await stored()).tier).toBe("free");
  });

  it("keeps Pro while a renewal is past due, then drops to Free when Stripe gives up", async () => {
    await linkCustomer();
    stripe.subscriptions.retrieve.mockResolvedValue(subscription("past_due"));
    await WEBHOOK(signed({ type: "customer.subscription.updated", data: { object: subscription("past_due") } }));
    expect(await stored()).toMatchObject({ tier: "pro", subscriptionStatus: "past_due" });

    stripe.subscriptions.retrieve.mockResolvedValue(subscription("unpaid"));
    await WEBHOOK(signed({ type: "customer.subscription.updated", data: { object: subscription("unpaid") } }));
    expect(await stored()).toMatchObject({ tier: "free", subscriptionStatus: "unpaid" });
  });

  it("trusts Stripe's current state over an out-of-order event", async () => {
    await linkCustomer();
    // A stale "active" update arrives after the subscription was canceled.
    stripe.subscriptions.retrieve.mockResolvedValue(subscription("canceled"));
    await WEBHOOK(signed({ type: "customer.subscription.updated", data: { object: subscription("active") } }));
    expect(await stored()).toMatchObject({ tier: "free", subscriptionStatus: "canceled" });
  });

  it("downgrades on cancellation", async () => {
    await linkCustomer();
    await prisma.user.update({ where: { id: me.id }, data: { tier: "pro", subscriptionStatus: "active" } });
    stripe.subscriptions.retrieve.mockResolvedValue(subscription("canceled"));
    await WEBHOOK(signed({ type: "customer.subscription.deleted", data: { object: subscription("canceled") } }));
    expect(await stored()).toMatchObject({ tier: "free", subscriptionStatus: "canceled" });
  });

  it("syncs from invoice payment events", async () => {
    await linkCustomer();
    stripe.subscriptions.retrieve.mockResolvedValue(subscription("past_due"));
    const invoice = {
      object: "invoice",
      customer: "cus_hook",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_hook" } },
    };
    await WEBHOOK(signed({ type: "invoice.payment_failed", data: { object: invoice } }));
    expect(await stored()).toMatchObject({ tier: "pro", subscriptionStatus: "past_due" });
  });

  it("ignores events for customers it does not know, and never trusts metadata over the customer link", async () => {
    await linkCustomer("cus_someone_else");
    stripe.subscriptions.retrieve.mockResolvedValue(subscription("active", "cus_unknown", { userId: me.id }));
    const res = await WEBHOOK(
      signed({ type: "customer.subscription.updated", data: { object: subscription("active", "cus_unknown", { userId: me.id }) } })
    );
    expect(res.status).toBe(200);
    expect((await stored()).tier).toBe("free");
  });

  it("asks Stripe to retry when the subscription cannot be fetched", async () => {
    await linkCustomer();
    stripe.subscriptions.retrieve.mockRejectedValue(new Error("Stripe is down"));
    const res = await WEBHOOK(signed({ type: "customer.subscription.updated", data: { object: subscription("active") } }));
    expect(res.status).toBe(500);
  });

  it("acknowledges events it does not handle", async () => {
    const res = await WEBHOOK(signed({ type: "customer.created", data: { object: { object: "customer" } } }));
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });
});
