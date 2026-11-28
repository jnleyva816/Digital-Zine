import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/billing/stripe";
import { POST as WEBHOOK } from "@/app/api/billing/webhook/route";
import { createTestUser, deleteTestUser } from "./helpers";

// DIG-15: what the webhook does when money is at risk. The owner decided on 20 Nov 2026:
// a full refund of the latest payment cancels Pro at once; a dispute and an early fraud warning
// only alert the owner. Every case also reports to Sentry.
vi.mock("@/lib/billing/stripe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/stripe")>()),
  getStripeClient: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));
const mockedStripe = vi.mocked(getStripeClient);
const alert = vi.mocked(Sentry.captureMessage);

const WEBHOOK_SECRET = "whsec_test_digital_zine";
const realStripe = new Stripe("sk_test_not_used_for_network");

const CUSTOMER = "cus_risk";
const SUB = "sub_risk";
const INVOICE = "in_latest";
const PAYMENT_INTENT = "pi_latest";
const CHARGE = "ch_latest";

interface Scene {
  /** The subscription's status as Stripe reports it. */
  status?: Stripe.Subscription.Status;
  /** The subscription's most recent invoice. */
  latestInvoice?: string;
  /** The invoice the refunded or disputed charge paid for, or null when it paid for none. */
  chargeInvoice?: string | null;
}

/** A Stripe client whose reads follow one scene: a charge that paid an invoice on one subscription. */
function fakeStripe(scene: Scene = {}) {
  let status = scene.status ?? "active";
  const subscription = () => ({
    id: SUB,
    object: "subscription",
    status,
    customer: CUSTOMER,
    latest_invoice: scene.latestInvoice ?? INVOICE,
    created: 1,
  });
  const chargeInvoice = scene.chargeInvoice === undefined ? INVOICE : scene.chargeInvoice;
  return {
    webhooks: realStripe.webhooks,
    subscriptions: {
      retrieve: vi.fn(async () => subscription()),
      list: vi.fn(async () => ({ data: [subscription()] })),
      cancel: vi.fn(async () => {
        status = "canceled";
        return subscription();
      }),
    },
    // A charge reaches its invoice through the payment intent (Stripe's current API has no `invoice` on a charge).
    invoicePayments: {
      list: vi.fn(async () => ({ data: chargeInvoice ? [{ invoice: chargeInvoice, payment: { type: "payment_intent", payment_intent: PAYMENT_INTENT } }] : [] })),
    },
    invoices: {
      retrieve: vi.fn(async (id: string) => ({ id, parent: { subscription_details: { subscription: SUB } } })),
    },
    charges: { retrieve: vi.fn(async () => charge()) },
  };
}
let stripe: ReturnType<typeof fakeStripe>;

function charge(overrides: Record<string, unknown> = {}) {
  return {
    id: CHARGE,
    object: "charge",
    amount: 1500,
    amount_refunded: 1500,
    refunded: true,
    currency: "usd",
    customer: CUSTOMER,
    payment_intent: PAYMENT_INTENT,
    ...overrides,
  };
}

function signed(type: string, object: unknown) {
  const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: "event", type, data: { object } });
  const header = realStripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return new Request("http://test.local/api/billing/webhook", { method: "POST", headers: { "stripe-signature": header }, body: payload });
}
const refund = (overrides: Record<string, unknown> = {}) => WEBHOOK(signed("charge.refunded", charge(overrides)));
const dispute = (overrides: Record<string, unknown> = {}) =>
  WEBHOOK(signed("charge.dispute.created", { id: "dp_1", object: "dispute", amount: 1500, currency: "usd", reason: "fraudulent", status: "needs_response", charge: CHARGE, ...overrides }));
const fraudWarning = (overrides: Record<string, unknown> = {}) =>
  WEBHOOK(signed("radar.early_fraud_warning.created", { id: "issfr_1", object: "radar.early_fraud_warning", fraud_type: "unauthorized_use_of_card", actionable: true, charge: CHARGE, ...overrides }));

let me: Awaited<ReturnType<typeof createTestUser>>;
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
  await prisma.user.update({
    where: { id: me.id },
    data: { tier: "pro", subscriptionStatus: "active", stripeCustomerId: CUSTOMER, stripeSubscriptionId: SUB },
  });
});

const stored = () => prisma.user.findUniqueOrThrow({ where: { id: me.id } });
const staysPro = async () => expect(await stored()).toMatchObject({ tier: "pro", subscriptionStatus: "active" });

describe("charge.refunded", () => {
  it("cancels the subscription at once and drops the creator to Free when the latest payment is refunded in full", async () => {
    const res = await refund();
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    // No proration or invoice options: a refund is already the money side of it.
    expect(stripe.subscriptions.cancel).toHaveBeenCalledWith(SUB);
    expect(await stored()).toMatchObject({ tier: "free", subscriptionStatus: "canceled" });
  });

  it("follows the charge to its subscription through the payment intent and the invoice", async () => {
    await refund();
    expect(stripe.invoicePayments.list).toHaveBeenCalledWith(
      expect.objectContaining({ payment: { type: "payment_intent", payment_intent: PAYMENT_INTENT } })
    );
    expect(stripe.invoices.retrieve).toHaveBeenCalledWith(INVOICE);
  });

  it("tells the owner what it did", async () => {
    await refund();
    expect(alert).toHaveBeenCalledWith(
      "Stripe refund",
      expect.objectContaining({
        level: "warning",
        tags: { area: "stripe-risk", event: "refund" },
        extra: expect.objectContaining({ chargeId: CHARGE, userId: me.id, subscriptionId: SUB, action: "cancelled the subscription" }),
      })
    );
  });

  it("leaves a partial refund alone, and still tells the owner", async () => {
    const res = await refund({ refunded: false, amount_refunded: 500 });
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    await staysPro();
    expect(alert).toHaveBeenCalledWith("Stripe refund", expect.objectContaining({ extra: expect.objectContaining({ action: "none: a partial refund" }) }));
  });

  it("leaves a full refund of an older payment alone: only the latest payment ends the plan", async () => {
    stripe = fakeStripe({ latestInvoice: "in_newer", chargeInvoice: "in_older" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    await refund();
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    await staysPro();
    expect(alert).toHaveBeenCalledWith("Stripe refund", expect.objectContaining({ extra: expect.objectContaining({ action: "none: not the latest payment" }) }));
  });

  it("leaves a refunded charge that paid for no subscription alone", async () => {
    stripe = fakeStripe({ chargeInvoice: null });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    expect((await refund()).status).toBe(200);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    await staysPro();
    expect(alert).toHaveBeenCalledWith("Stripe refund", expect.objectContaining({ extra: expect.objectContaining({ action: "none: not a subscription payment" }) }));
  });

  it("does nothing for a customer no account is linked to, and does not trust metadata to find one", async () => {
    expect((await refund({ customer: "cus_stranger", metadata: { userId: me.id } })).status).toBe(200);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    await staysPro();
    expect(alert).toHaveBeenCalledWith("Stripe refund", expect.objectContaining({ extra: expect.objectContaining({ userId: null, action: "none: no account for this customer" }) }));
  });

  it("does not cancel a subscription that has already ended, so a repeated event is harmless", async () => {
    stripe = fakeStripe({ status: "canceled" });
    mockedStripe.mockReturnValue(stripe as unknown as Stripe);
    expect((await refund()).status).toBe(200);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(await stored()).toMatchObject({ tier: "free", subscriptionStatus: "canceled" });
  });

  it("is safe to deliver twice: the second delivery cancels nothing more", async () => {
    await refund();
    await refund();
    expect(stripe.subscriptions.cancel).toHaveBeenCalledTimes(1);
    expect(await stored()).toMatchObject({ tier: "free" });
  });

  it("answers 500 when Stripe cannot cancel, so Stripe delivers the event again, and changes nothing", async () => {
    stripe.subscriptions.cancel.mockRejectedValueOnce(new Error("Stripe is down"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await refund()).status).toBe(500);
    await staysPro();
    logged.mockRestore();

    expect((await refund()).status).toBe(200);
    expect(await stored()).toMatchObject({ tier: "free" });
  });
});

describe("charge.dispute.created", () => {
  it("keeps the creator on Pro and tells the owner, with enough to act on and no personal details", async () => {
    const res = await dispute();
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    await staysPro();

    expect(alert).toHaveBeenCalledTimes(1);
    const [message, options] = alert.mock.calls[0] as [string, { level: string; tags: unknown; extra: Record<string, unknown> }];
    expect(message).toBe("Stripe dispute opened");
    expect(options.level).toBe("error");
    expect(options.tags).toEqual({ area: "stripe-risk", event: "dispute" });
    expect(options.extra).toMatchObject({ disputeId: "dp_1", chargeId: CHARGE, amount: 1500, currency: "usd", reason: "fraudulent", userId: me.id, action: "none: kept Pro" });
    expect(JSON.stringify(alert.mock.calls)).not.toContain(me.email);
  });

  it("still tells the owner when no account is linked to the customer", async () => {
    stripe.charges.retrieve.mockResolvedValue(charge({ customer: "cus_stranger" }));
    expect((await dispute()).status).toBe(200);
    expect(alert).toHaveBeenCalledWith("Stripe dispute opened", expect.objectContaining({ extra: expect.objectContaining({ userId: null }) }));
  });

  it("still tells the owner when the charge cannot be read", async () => {
    stripe.charges.retrieve.mockRejectedValue(new Error("No such charge"));
    expect((await dispute()).status).toBe(200);
    expect(alert).toHaveBeenCalledWith("Stripe dispute opened", expect.objectContaining({ extra: expect.objectContaining({ userId: null, chargeId: CHARGE }) }));
  });
});

describe("radar.early_fraud_warning.created", () => {
  it("only tells the owner: the creator keeps Pro and nothing is cancelled", async () => {
    const res = await fraudWarning();
    expect(res.status).toBe(200);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    await staysPro();

    expect(alert).toHaveBeenCalledTimes(1);
    const [message, options] = alert.mock.calls[0] as [string, { level: string; tags: unknown; extra: Record<string, unknown> }];
    expect(message).toBe("Stripe early fraud warning");
    expect(options.level).toBe("warning");
    expect(options.tags).toEqual({ area: "stripe-risk", event: "fraud-warning" });
    expect(options.extra).toMatchObject({ warningId: "issfr_1", chargeId: CHARGE, fraudType: "unauthorized_use_of_card", actionable: true, userId: me.id, action: "none: alert only" });
    expect(JSON.stringify(alert.mock.calls)).not.toContain(me.email);
  });

  it("accepts a charge given as an expanded object", async () => {
    expect((await fraudWarning({ charge: charge() })).status).toBe(200);
    expect(alert).toHaveBeenCalledWith("Stripe early fraud warning", expect.objectContaining({ extra: expect.objectContaining({ chargeId: CHARGE, userId: me.id }) }));
  });
});

describe("the webhook itself", () => {
  it("still refuses an event that is not signed by Stripe", async () => {
    const forged = await WEBHOOK(
      new Request("http://test.local/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=bad" },
        body: JSON.stringify({ type: "charge.refunded", data: { object: charge() } }),
      })
    );
    expect(forged.status).toBe(400);
    expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    await staysPro();
  });
});
