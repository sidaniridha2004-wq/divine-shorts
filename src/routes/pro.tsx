import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/pro-status";
import { PAYMENT_CONFIG, generateReference } from "@/lib/payment-config";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, Crown, Upload, CheckCircle2, Clock, XCircle, Loader2, ArrowLeft } from "lucide-react";

type Submission = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  receipt_path: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
};

export const Route = createFileRoute("/pro")({
  head: () => ({
    meta: [
      { title: "Upgrade to Pro — QuranReels" },
      { name: "description", content: "Unlock 1080p HD exports and remove the watermark. One-time payment via bank transfer." },
    ],
  }),
  component: ProPage,
});

function ProPage() {
  const { userId, email, isPro, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [reference, setReference] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!sessionLoading && !userId) navigate({ to: "/auth" });
  }, [sessionLoading, userId, navigate]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("payment_submissions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setSubmissions((data as Submission[]) || []);
        if (data?.length && data[0].status === "pending") {
          setReference(data[0].reference);
        } else {
          setReference(generateReference(userId));
        }
      });
  }, [userId]);

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${userId}/${reference}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-receipts")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const pending = submissions?.find((s) => s.status === "pending" && s.reference === reference);
      if (pending) {
        const { error } = await supabase
          .from("payment_submissions")
          .update({ receipt_path: path })
          .eq("id", pending.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payment_submissions").insert({
          user_id: userId,
          reference,
          amount: PAYMENT_CONFIG.price,
          currency: PAYMENT_CONFIG.currency,
          receipt_path: path,
          status: "pending",
        });
        if (error) throw error;
      }

      toast.success("Receipt uploaded — we'll review within 24h");
      const { data } = await supabase
        .from("payment_submissions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      setSubmissions((data as Submission[]) || []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

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

      <div className="mx-auto max-w-4xl px-4 py-10">
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
              <h1 className="font-display text-4xl font-bold">Upgrade to QuranReels Pro</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Pay {PAYMENT_CONFIG.currencySymbol}{PAYMENT_CONFIG.price} once — remove the watermark and unlock 1080p HD exports forever.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 text-sm font-semibold">Step 1 · Bank transfer</div>
                <p className="mb-4 text-xs text-muted-foreground">
                  Send exactly <span className="font-semibold text-foreground">{PAYMENT_CONFIG.currencySymbol}{PAYMENT_CONFIG.price} {PAYMENT_CONFIG.currency}</span> to the account below. You <span className="font-semibold text-foreground">must</span> include the reference — that's how we match your payment to your account.
                </p>
                <div className="space-y-3">
                  <Field label="Account holder" value={PAYMENT_CONFIG.bank.accountHolder} onCopy={copy} />
                  <Field label="IBAN" value={PAYMENT_CONFIG.bank.iban} onCopy={copy} mono />
                  <Field label="BIC / SWIFT" value={PAYMENT_CONFIG.bank.bic} onCopy={copy} mono />
                  <Field label="Bank" value={`${PAYMENT_CONFIG.bank.bankName}, ${PAYMENT_CONFIG.bank.country}`} onCopy={copy} />
                  <Field label="Amount" value={`${PAYMENT_CONFIG.currencySymbol}${PAYMENT_CONFIG.price} ${PAYMENT_CONFIG.currency}`} onCopy={copy} />
                  <Field label="Payment reference" value={reference} onCopy={copy} mono highlight />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 text-sm font-semibold">Step 2 · Upload your receipt</div>
                <p className="mb-4 text-xs text-muted-foreground">
                  After you send the transfer, upload a screenshot or PDF of your bank confirmation. We'll approve within 24 hours and your account switches to Pro automatically.
                </p>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 hover:border-accent">
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  ) : (
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{uploading ? "Uploading…" : "Choose file"}</span>
                  <span className="text-[10px] text-muted-foreground">Image or PDF · max 5 MB</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>

                {submissions && submissions.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">Your submissions</div>
                    {submissions.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-md border border-border bg-background/40 p-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono">{s.reference}</div>
                          <div className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</div>
                          {s.admin_note && <div className="mt-1 text-[10px] text-muted-foreground">Note: {s.admin_note}</div>}
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Note:</strong> Bank transfers can take 1–3 business days to clear. Once we confirm your payment in our bank statement AND match it with your uploaded receipt, we'll flip your account to Pro. You'll see the Pro crown in the header.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onCopy,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  onCopy: (text: string, label: string) => void;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className={`mt-1 flex items-center gap-2 rounded-md border px-3 py-2 ${highlight ? "border-gold/40 bg-gold/5" : "border-border bg-background/40"}`}>
        <span className={`min-w-0 flex-1 truncate text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
        <button
          type="button"
          onClick={() => onCopy(value, label)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Copy ${label}`}
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Submission["status"] }) {
  if (status === "approved")
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
  if (status === "rejected")
    return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive"><XCircle className="h-3 w-3" /> Rejected</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-500"><Clock className="h-3 w-3" /> Pending</span>;
}
