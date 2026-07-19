import { createServerFn } from "@tanstack/react-start";
import Stripe from "stripe";
import { PAYMENT_CONFIG } from "@/lib/payment-config";
import { supabaseAdmin as supabase } from "@/integrations/supabase/client.server";

// Using a lazy init for stripe to prevent it from complaining if keys are missing at build time
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("Stripe is not configured on the server.");
  return new Stripe(key, {
    apiVersion: "2026-06-24.dahlia",
  });
}

export const createPaymentIntent = createServerFn({ method: "POST" })
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const stripe = getStripe();

    // 1. Check if user already has a Stripe customer ID in their profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", userId)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      // 2. Create a new Stripe Customer
      const customer = await stripe.customers.create({
        email: profile?.email || undefined,
        metadata: { userId },
      });
      customerId = customer.id;

      // 3. Save customer ID to profile
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId } as any)
        .eq("id", userId);
    }

    // 4. Create the Payment Intent for SEPA Direct Debit
    const paymentIntent = await stripe.paymentIntents.create({
      amount: PAYMENT_CONFIG.price * 100, // Stripe expects cents
      currency: PAYMENT_CONFIG.currency.toLowerCase(),
      customer: customerId,
      payment_method_types: ["sepa_debit"],
      setup_future_usage: "off_session",
      metadata: { userId },
    });

    return { clientSecret: paymentIntent.client_secret };
  });

export const fulfillProUpgrade = createServerFn({ method: "POST" })
  .validator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    // Update the user's profile to is_pro = true
    const { error } = await supabase
      .from("profiles")
      .update({ is_pro: true })
      .eq("id", userId);

    if (error) {
      throw new Error("Failed to upgrade profile: " + error.message);
    }

    // Also log the successful payment submission
    await supabase.from("payment_submissions").insert({
      user_id: userId,
      reference: "stripe_sepa_direct_debit_" + Date.now(),
      amount: PAYMENT_CONFIG.price,
      currency: PAYMENT_CONFIG.currency,
      status: "approved",
    });

    return { success: true };
  });
