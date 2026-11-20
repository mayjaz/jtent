# Zim Excellence — China Edition 2027

A premium Next.js event website with separate Miss Zimbabwe China and Zim Excellence Awards voting tracks.

## Included
- Editorial black-and-champagne-gold design system
- Responsive homepage, pageant nominees and awards nominees pages
- Two-track voting interface with category grouping
- Supabase email magic-link authentication
- Server-enforced one-vote-per-category rule
- Voting-window validation in a Postgres RPC
- Row-level security policies and admin role foundation

## Run locally
1. Install Node.js 20+.
2. Run `npm install`.
3. Create a Supabase project.
4. In Supabase SQL Editor, run `supabase/schema.sql`.
5. Copy `.env.example` to `.env.local` and add the Supabase project URL and anon key.
6. In Supabase Authentication > URL Configuration, set your local Site URL to `http://localhost:3000` and add `http://localhost:3000/**` to Redirect URLs.
7. Run `npm run dev`.

## Add your first administrator
1. Register your organiser email through Supabase Auth (you can use the sign-in flow on `/vote`).
2. Find that account's UUID in Supabase Authentication > Users.
3. In SQL Editor, run:
   `update public.profiles set role='admin' where id='YOUR_AUTH_USER_UUID';`

## Add categories and nominees
Use the `/admin` organiser workspace to create categories, add nominees, and edit existing nominee profiles. Pageant contestants can include a contestant number, hometown, age, height, profession, hobbies, motto, About Me, and My Vision; their profiles appear on the pageant page when published.

After running `supabase/schema.sql`, apply `supabase/migrations/20261119100000_pageant_contestant_fields.sql` and `supabase/migrations/20261119110000_contestant_portrait_storage.sql` in the Supabase SQL Editor, in that order. The admin panel uploads pageant portraits to a public Supabase Storage bucket; uploads and deletion are restricted to admins, and files are limited to JPEG, PNG, or WebP up to 5 MB.

The public `/vote` page is currently read-only. Apply `supabase/migrations/20261119120000_close_voting.sql` to close any categories that are currently open.

## Before launch
- Review organiser-only admin access controls and live result reporting.
- Configure Supabase email templates and a verified sender domain.
- Add CAPTCHA / rate limiting and abuse monitoring to the authentication flow.
- Publish clear voting rules, eligibility, privacy policy, and dispute process.
- Decide whether voting is free or paid. If paid, implement payment verification server-side before enabling vote submission.
- Test voting windows, duplicate attempts, account verification, and RLS with non-admin and admin accounts.
- Never expose a Supabase service-role key in browser code.

## Ticket administration
The ticket module is separate from voting. Customers use `/tickets`; authorized staff use `/admin/login` and `/admin/tickets`. It uses the existing Supabase project and never exposes a service-role key to the browser.

1. Apply `supabase/migrations/20261113000000_ticketing_admin.sql` after `supabase/schema.sql`, then apply `supabase/migrations/20261113110000_ticket_checkout.sql`, `supabase/migrations/20261113113200_ticket_pgcrypto_search_path.sql`, `supabase/migrations/20261113121500_rename_zm_to_zim.sql`, and `supabase/migrations/20261113122600_ticket_email_resend.sql`. These migrations create ticket tables, role checks, transactional checkout RPCs, indexes, and the private payment-proof bucket.
2. Set `TICKET_QR_SIGNING_SECRET` in local `.env.local` and Vercel Environment Variables to a cryptographically random secret of at least 32 characters. Keep it server-only and stable; rotating it invalidates issued ticket QR codes.
3. Enable the Email provider in Supabase Auth if needed. Create admin accounts under **Authentication → Users** with an email and password, then assign ticket roles in SQL Editor:
   ```sql
   insert into public.ticket_admin_roles(user_id, role)
   values ('AUTH_USER_UUID', 'super_admin');
   ```
   Supported roles are `super_admin`, `ticket_manager`, and `checkin_staff`. Only Super Admin can change ticket inventory and pricing.
4. Sign in at `/admin/login` with the admin email and password. The login page is separate from the public site navigation and checks `ticket_admin_roles`; the voting `profiles.role` does not grant ticket access.
5. Add the **server-only** `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and Vercel. It is used only by server routes for private storage uploads and signed URLs. Never give it a `NEXT_PUBLIC_` prefix.
6. Upload the personal WeChat Pay and Alipay QR images to the private `ticket-payment-proofs` bucket under `payment-qr/`. Set `TICKET_WECHAT_QR_PATH` and `TICKET_ALIPAY_QR_PATH` to their bucket paths.
7. Configure Resend, verify your sender domain, and set server-only `RESEND_API_KEY` and `TICKET_EMAIL_FROM`. Approved ticket emails show the complete ticket with an inline QR code and include a PNG copy. Failed emails can be retried, and sent tickets can be resent from Tickets.
8. Smoke-test `/tickets`, proof submission, order expiry, payment approval and email retry, plus all three admin roles. Apply both migrations to a non-production project first.

Ticket prices seed at ¥150 (General Admission) and ¥200 (VIP). Allocations start at zero with sales disabled because event capacity was not specified; a Super Admin must configure approved capacity before approving orders.

### Ticketing integration status
- This change provides customer checkout, 30-minute inventory reservations, private payment-proof uploads, protected payment review, idempotent ticket issuance, QR ticket emails via Resend, QR validation, printable tickets, atomic check-in, reporting, and audit records.
- Personal WeChat Pay/Alipay QR images and verified Resend sender credentials are deployment configuration, not included assets. Purchases remain unavailable until the QR images and server-only storage credentials are configured. Email delivery requires the Resend API key and a verified sender.
- Add edge rate limiting before public launch; checkout also limits each order to ten tickets and caps recent pending orders per email.
- Payment screenshots are limited to 4 MB to fit the serverless upload request limit.
- Manual ticket lookup is available on all browsers. Camera scanning uses the browser `BarcodeDetector` API and requires HTTPS; unsupported browsers should use manual lookup.
- PDF delivery uses the browser's print/save-as-PDF dialog. Payment method and category breakdown are based on approved order records.

## Important voting design note
The database enforces one vote per authenticated account per category. This is stronger than browser-only checks, but it is not the same as one vote per human: email aliases or multiple accounts can bypass account-level limits. For a high-stakes public vote, add identity verification, fraud review, and/or verified phone-based eligibility before launch.
