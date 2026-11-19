# Admin operations checklist

## Creating a voting category
1. Insert a row in `categories`.
2. Select `track`: `pageant` or `awards`.
3. Keep `voting_open` false while preparing nominees.
4. Set start/end timestamps and sort order.

## Publishing nominees
1. Use `/admin` to add nominees under the appropriate category and ensure the nominee track matches the category track.
2. Pageant contestant portraits can be uploaded directly in the admin panel; award nominee images can use a public image URL.
3. Set `published` true when approved.

## Opening and closing voting
- Open: set `voting_open = true` for the category.
- Close: set `voting_open = false`.
- The RPC checks open status and optional start/end timestamps on every vote.

## Results
Run this query in the Supabase SQL editor (or build a protected admin reporting screen):
```sql
select c.track, c.name as category, n.name as nominee, count(v.id) as votes
from public.categories c
join public.nominees n on n.category_id = c.id
left join public.votes v on v.nominee_id = n.id
group by c.track, c.name, n.id, n.name
order by c.track, c.name, votes desc;
```

## Ticket administration

Customers purchase tickets at `/tickets`. The ticket manager lives at `/admin/tickets` and has a separate email/password login at `/admin/login`. Apply `supabase/migrations/20261113000000_ticketing_admin.sql` after `supabase/schema.sql`, then apply `supabase/migrations/20261113110000_ticket_checkout.sql`, `supabase/migrations/20261113113200_ticket_pgcrypto_search_path.sql`, `supabase/migrations/20261113121500_rename_zm_to_zim.sql`, and `supabase/migrations/20261113122600_ticket_email_resend.sql`, then assign access via `public.ticket_admin_roles`:

```sql
insert into public.ticket_admin_roles(user_id, role)
values ('AUTH_USER_UUID', 'super_admin');
```

Create each administrator in Supabase Auth with an email and password, then sign in through `/admin/login`. Allowed roles are `super_admin`, `ticket_manager`, and `checkin_staff`. Ticket admin API and database functions verify these roles; hiding a page control is not the security boundary. Keep `TICKET_QR_SIGNING_SECRET` server-only, stable, and at least 32 characters. Never put a Supabase service-role key in a browser environment.

Set the server-only `SUPABASE_SERVICE_ROLE_KEY` for the API routes that upload proof screenshots and issue signed payment QR URLs. Upload WeChat Pay and Alipay images to the private `ticket-payment-proofs` bucket under `payment-qr/`; configure `TICKET_WECHAT_QR_PATH` and `TICKET_ALIPAY_QR_PATH` to the object paths. Customer proofs are stored under `payments/<order UUID>/`. Never expose the service-role key to the browser.

Checkout creates a 30-minute inventory reservation and a one-time order access token; only its hash is stored in the database. The customer uses the same browser session to resume checkout and submit a transaction reference and proof. Orders expire after 30 minutes if payment proof is not submitted.

Payment approval is performed by a locked database function. It records the reviewer and time, issues one ticket per ordered item, writes audit events, and creates pending email jobs. Configure `RESEND_API_KEY` and a verified `TICKET_EMAIL_FROM` sender to email a complete ticket with an inline QR code and a PNG copy after approval. Failed deliveries can be retried, and sent tickets can be resent in Tickets; delivery status and attempts are audited. Tickets can also be printed or saved as PDFs from the browser print dialog.

Check-in staff can validate a QR or ticket number. QR tokens are deterministic HMACs derived from the server-only signing secret; only their SHA-256 hashes are stored in the ticket table. Camera QR scanning needs HTTPS and browser `BarcodeDetector` support; manual ticket lookup is the fallback.
