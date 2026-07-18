import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/pro-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Loader2, ExternalLink, Shield } from "lucide-react";

type Row = {
  id: string;
  user_id: string;
  reference: string;
  amount: number;
  currency: string;
  receipt_path: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
  profiles?: { email: string | null } | null;
};

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — QuranReels Pro" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { userId, isAdmin, loading } = useSession();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!userId) navigate({ to: "/auth" });
    else if (!isAdmin) navigate({ to: "/" });
  }, [loading, userId, isAdmin, navigate]);

  const load = async () => {
    let q = supabase
      .from("payment_submissions")
      .select("*")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      return;
    }
    const subs = (data as Omit<Row, "profiles">[]) || [];
    const ids = Array.from(new Set(subs.map((s) => s.user_id)));
    let emailMap: Record<string, string | null> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", ids);
      emailMap = Object.fromEntries((profs || []).map((p: any) => [p.id, p.email]));
    }
    setRows(subs.map((s) => ({ ...s, profiles: { email: emailMap[s.user_id] ?? null } })));
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, filter]);

  const viewReceipt = async (path: string | null) => {
    if (!path) {
      toast.error("No receipt uploaded");
      return;
    }
    const { data, error } = await supabase.storage
      .from("payment-receipts")
      .createSignedUrl(path, 60 * 5);
    if (error || !data?.signedUrl) {
      toast.error(error?.message || "Could not open receipt");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const approve = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("approve_payment", { _submission_id: id, _note: notes[id] || undefined });
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Approved · Pro granted");
      load();
    }
  };

  const reject = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.rpc("reject_payment", { _submission_id: id, _note: notes[id] || undefined });
    setBusy(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Rejected");
      load();
    }
  };

  if (loading || !isAdmin) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="inline-flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-accent" /> Admin
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-6 font-display text-3xl font-bold">Payment submissions</h1>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                filter === f ? "border-accent bg-accent/20" : "border-border bg-card"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {rows === null ? (
          <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No submissions in this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.status} />
                      <span className="text-sm font-medium">{r.profiles?.email || r.user_id.slice(0, 8)}</span>
                      <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-mono text-muted-foreground">{r.reference}</span>
                      <span className="font-semibold">{r.amount} {r.currency}</span>
                      {r.receipt_path ? (
                        <button
                          onClick={() => viewReceipt(r.receipt_path)}
                          className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> View receipt
                        </button>
                      ) : (
                        <span className="text-muted-foreground">No receipt yet</span>
                      )}
                    </div>
                    {r.admin_note && (
                      <div className="mt-2 rounded bg-muted/40 p-2 text-xs">
                        <span className="font-semibold">Note:</span> {r.admin_note}
                      </div>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex flex-col gap-2 md:min-w-[280px]">
                      <Input
                        placeholder="Optional note (visible to user)"
                        value={notes[r.id] || ""}
                        onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => approve(r.id)}
                          disabled={busy === r.id}
                          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="mr-1 h-4 w-4" /> Approve</>}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reject(r.id)}
                          disabled={busy === r.id}
                          className="flex-1"
                        >
                          <XCircle className="mr-1 h-4 w-4" /> Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Row["status"] }) {
  if (status === "approved")
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
  if (status === "rejected")
    return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive"><XCircle className="h-3 w-3" /> Rejected</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500"><Clock className="h-3 w-3" /> Pending</span>;
}
