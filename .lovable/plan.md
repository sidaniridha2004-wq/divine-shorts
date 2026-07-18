# IBAN Payment + Pro Unlock

## What users experience

1. Free users can use the wizard, but export adds a "QuranReels" watermark and is capped at 720p.
2. On the Export step (and via a new "Upgrade" button in the header), a **Get Pro** page opens showing:
   - Price (default €9.99 — editable)
   - Bank details: Account holder, IBAN, BIC/SWIFT, Bank name (all placeholders — you edit in `src/lib/payment-config.ts`)
   - A unique **payment reference** (e.g. `QR-<userid8>-<random4>`) they must include in the transfer
   - Copy buttons for every field
   - Upload area for the transfer receipt (image or PDF, ≤ 5 MB)
   - After upload → "Your payment is pending review. You'll get Pro access once we confirm the transfer (usually within 24h)."
3. Once you approve them, watermark disappears and 1080p unlocks. A **Pro** badge shows in the header.

## Admin experience (you)

A new `/admin` page (only visible to users with the `admin` role):
- Table of all payment submissions: user email, reference, submitted date, status, receipt preview
- Buttons per row: **Approve** (grants Pro), **Reject** (with optional note), **View receipt**
- After the first admin exists, you can promote more admins from this page.

## Data model (Lovable Cloud)

- `app_role` enum: `admin`, `user`
- `user_roles(user_id, role)` — separate table, secured via `has_role()` SECURITY DEFINER function (never store role on profiles)
- `profiles(id, email, is_pro boolean, pro_since timestamptz)` — auto-created on signup via trigger
- `payment_submissions(id, user_id, reference, amount, currency, receipt_path, status: pending|approved|rejected, admin_note, created_at, reviewed_at, reviewed_by)`
- Storage bucket `payment-receipts` (private). RLS: users can upload/read their own; admins can read all.
- RLS everywhere; explicit GRANTs on all public tables.

## Auth

- Email/password + Google (Lovable Cloud defaults)
- `/auth` route with sign-in / sign-up tabs
- The wizard stays usable without auth; only the "Get Pro" and "Export without watermark" paths require an account.

## Gating

- `useProStatus()` hook reads `profiles.is_pro` for the signed-in user (React Query).
- `PreviewCanvas` draws the "QuranReels" watermark unless `isPro` is true.
- Export step: `resolution` selector locks 1080p behind Pro; free users get 720p only.

## First-admin bootstrap

The first user to sign up whose email matches `ADMIN_EMAIL` (config value you set in `src/lib/payment-config.ts`) is auto-promoted to admin by a Postgres trigger. Once you're in `/admin`, you can promote others.

## Files added / changed

- `src/lib/payment-config.ts` — **you edit this**: IBAN, account holder, BIC, bank name, price, currency, admin email
- `src/lib/pro-status.ts` — `useProStatus` hook
- `src/routes/auth.tsx` — sign-in / sign-up
- `src/routes/pro.tsx` — Get Pro page (bank details, reference, receipt upload)
- `src/routes/admin.tsx` — admin dashboard (role-gated)
- `src/components/UserMenu.tsx` — header account chip (sign in / Pro badge / admin link / sign out)
- Landing + wizard headers get the account chip
- `Step5Export.tsx` — 1080p locked for free users, watermark note
- `PreviewCanvas.tsx` — watermark for free users
- Migrations: enums, tables, RLS, GRANTs, storage bucket, triggers

## Out of scope (say the word if you want any of these)

- Automatic bank feed reconciliation (would need a bank API — IBAN alone can't auto-verify)
- Subscriptions / renewals
- Refund flow
- Email notifications on approval (can add via Resend if you want)
