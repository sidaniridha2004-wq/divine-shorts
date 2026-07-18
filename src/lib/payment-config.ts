// ─────────────────────────────────────────────────────────────────────────
// EDIT THIS FILE to set your bank details, price, and admin email.
// The values below are placeholders — replace with your real information.
// After editing ADMIN_EMAIL, the first user who signs up with that email is
// automatically promoted to admin.
// ─────────────────────────────────────────────────────────────────────────

export const PAYMENT_CONFIG = {
  price: 9.99,
  currency: "EUR",
  currencySymbol: "€",
  bank: {
    accountHolder: "Your Name Here",
    iban: "DE00 0000 0000 0000 0000 00",
    bic: "XXXXDEXXX",
    bankName: "Your Bank Name",
    country: "Germany",
  },
  // The FIRST user to sign up with this email is auto-promoted to admin.
  // If you already signed up before setting this, promote yourself manually
  // by inserting a row into public.user_roles (user_id, role='admin').
  adminEmail: "admin@example.com",
};

export function generateReference(userId: string): string {
  const short = userId.replace(/-/g, "").slice(0, 8).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `QR-${short}-${rnd}`;
}
