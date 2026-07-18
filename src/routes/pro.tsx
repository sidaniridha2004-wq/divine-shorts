import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/pro-status";
import { PAYMENT_CONFIG } from "@/lib/payment-config";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Crown, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";

import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  IbanElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { createPaymentIntent, fulfillProUpgrade } from "@/lib/stripe";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "pk_test_placeholder");

export const Route = createFileRoute("/pro")({
  head: () => ({
    meta: [
      { title: "Upgrade to Pro — QuranReels" },
      { name: "description", content: "Unlock 1080p HD exports and remove the watermark. Secure automatic payment." },
    ],
  }),
  component: ProPage,
});

function ProPage() {
  const { userId, email, isPro, loading: sessionLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!sessionLoading && !userId) navigate({ to: "/auth" });
  }, [sessionLoading, userId, navigate]);

  if (sessionLoading || !userId) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <span className="text-xs text-muted-foreground">{email}</span>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 py-10">
        {isPro ? (
          <div className="rounded-2xl border border-gold/40 bg-card p-8 text-center">
            <Crown className="mx-auto mb-3 h-12 w-12 text-gold" />
            <h1 className="font-display text-3xl font-bold">You're a Pro member</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enjoy 1080p HD exports and watermark-free videos. Thank you for supporting QuranReels.
            </p>
            <Link to="/create" className="mt-6 inline-block">
              <Button className="bg-accent text-accent-foreground">Start creating</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8 text-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gold/10 px-3 py-1 text-xs text-gold">
                <Crown className="h-3 w-3" /> One-time payment · Lifetime Pro
              </div>
              <h1 className="font-display text-4xl font-bold">Upgrade to Pro</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Pay {PAYMENT_CONFIG.currencySymbol}{PAYMENT_CONFIG.price} once — remove the watermark and unlock 1080p HD exports forever.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
              <Elements stripe={stripePromise} options={{ fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" }] }}>
                <CheckoutForm userId={userId} email={email || ""} />
              </Elements>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CheckoutForm({ userId, email }: { userId: string; email: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !name.trim()) return;

    setLoading(true);

    try {
      // 1. Ask the server to create a PaymentIntent for this user
      const { clientSecret } = await createPaymentIntent({ data: userId });
      if (!clientSecret) throw new Error("Failed to initialize payment");

      // 2. Confirm the SEPA payment on the client
      const ibanElement = elements.getElement(IbanElement);
      if (!ibanElement) throw new Error("IBAN element not found");

      const { error, paymentIntent } = await stripe.confirmSepaDebitPayment(clientSecret, {
        payment_method: {
          sepa_debit: ibanElement,
          billing_details: {
            name,
            email,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // SEPA Direct Debit usually returns 'processing' immediately.
      // We grant access instantly based on this 'processing' status.
      if (paymentIntent.status === "processing" || paymentIntent.status === "succeeded") {
        await fulfillProUpgrade({ data: userId });
        toast.success("Payment successful! You are now a PRO.");
        setTimeout(() => window.location.reload(), 1500); // Reload to reflect PRO status
      } else {
        toast.error(`Payment status: ${paymentIntent.status}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Payment failed");
    } finally {
      setLoading(false);
    }
  };

  const ELEMENT_OPTIONS = {
    supportedCountries: ['SEPA'],
    style: {
      base: {
        fontSize: '15px',
        color: '#ffffff',
        fontFamily: 'Inter, sans-serif',
        '::placeholder': {
          color: '#888888',
        },
      },
      invalid: {
        color: '#ef4444',
      },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Full Name (Account Holder)
        </label>
        <input
          required
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          className="w-full rounded-md border border-border bg-background/50 px-3 py-3 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          IBAN
        </label>
        <div className="rounded-md border border-border bg-background/50 px-3 py-3 shadow-inner">
          <IbanElement options={ELEMENT_OPTIONS} />
        </div>
      </div>

      <div className="rounded-lg bg-accent/10 p-4 text-xs text-muted-foreground">
        By providing your IBAN and confirming this payment, you are authorizing QuranReels and Stripe, our payment service provider, to send instructions to your bank to debit your account.
      </div>

      <Button
        type="submit"
        disabled={!stripe || loading}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 py-6 text-base font-semibold"
      >
        {loading ? (
          <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing...</>
        ) : (
          `Pay ${PAYMENT_CONFIG.currencySymbol}${PAYMENT_CONFIG.price} & Upgrade`
        )}
      </Button>
    </form>
  );
}
