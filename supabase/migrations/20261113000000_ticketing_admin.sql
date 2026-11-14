create extension if not exists pgcrypto;

create table if not exists public.ticket_admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'ticket_manager', 'checkin_staff')),
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('GENERAL', 'VIP')),
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  allocation integer not null check (allocation >= 0),
  sales_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.ticket_types(code, name, price, allocation, sales_available)
values ('GENERAL', 'General Admission', 150, 0, false), ('VIP', 'VIP', 200, 0, false)
on conflict (code) do nothing;

create table if not exists public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('ZIM27-' || upper(encode(gen_random_bytes(6), 'hex'))),
  customer_name text not null,
  email text not null,
  phone text not null,
  payment_method text not null check (payment_method in ('WECHAT_PAY', 'ALIPAY')),
  payment_status text not null default 'PENDING_PAYMENT'
    check (payment_status in ('PENDING_PAYMENT', 'PAYMENT_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REFUNDED', 'CANCELLED')),
  transaction_reference text,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ticket_orders(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  unique(order_id, ticket_type_id)
);

create table if not exists public.ticket_payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ticket_orders(id) on delete cascade,
  transaction_reference text not null,
  proof_path text not null,
  submitted_amount numeric(10,2),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  decision text check (decision in ('APPROVED', 'REJECTED'))
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('TKT-' || upper(encode(gen_random_bytes(8), 'hex'))),
  order_id uuid not null references public.ticket_orders(id),
  order_item_id uuid not null references public.ticket_order_items(id),
  ticket_type_id uuid not null references public.ticket_types(id),
  attendee_name text not null,
  qr_token_hash text unique,
  issued_at timestamptz not null default now(),
  email_status text not null default 'PENDING' check (email_status in ('PENDING', 'SENT', 'FAILED')),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  cancellation_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.ticket_check_ins (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id),
  checked_in_by uuid not null references auth.users(id),
  checked_in_at timestamptz not null default now()
);

create table if not exists public.ticket_email_jobs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ticket_id)
);

create table if not exists public.ticket_activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_orders_created_idx on public.ticket_orders(created_at desc);
create index if not exists ticket_orders_status_idx on public.ticket_orders(payment_status, created_at desc);
create index if not exists ticket_orders_email_idx on public.ticket_orders(email);
create index if not exists ticket_order_items_order_idx on public.ticket_order_items(order_id);
create index if not exists ticket_payment_submissions_order_idx on public.ticket_payment_submissions(order_id, submitted_at desc);
create index if not exists tickets_order_idx on public.tickets(order_id);
create index if not exists tickets_type_idx on public.tickets(ticket_type_id);
create index if not exists ticket_activity_created_idx on public.ticket_activity_logs(created_at desc);

create or replace function public.ticket_admin_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.ticket_admin_roles where user_id = auth.uid(); $$;

create or replace function public.ticket_can_manage()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.ticket_admin_role() in ('super_admin', 'ticket_manager'), false); $$;

create or replace function public.ticket_can_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.ticket_admin_role() = 'super_admin', false); $$;

create or replace function public.ticket_dashboard_data()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'total_orders', (select count(*) from public.ticket_orders),
    'total_tickets_sold', (select coalesce(sum(i.quantity), 0) from public.ticket_order_items i join public.ticket_orders o on o.id=i.order_id where o.payment_status='APPROVED'),
    'general_sold', (select count(*) from public.tickets t join public.ticket_types ty on ty.id=t.ticket_type_id where ty.code='GENERAL' and t.cancelled_at is null),
    'vip_sold', (select count(*) from public.tickets t join public.ticket_types ty on ty.id=t.ticket_type_id where ty.code='VIP' and t.cancelled_at is null),
    'revenue', (select coalesce(sum(total_amount), 0) from public.ticket_orders where payment_status='APPROVED'),
    'pending_verifications', (select count(*) from public.ticket_orders where payment_status in ('PAYMENT_SUBMITTED','UNDER_REVIEW')),
    'rejected_payments', (select count(*) from public.ticket_orders where payment_status='REJECTED'),
    'tickets_issued', (select count(*) from public.tickets where cancelled_at is null),
    'checked_in', (select count(*) from public.ticket_check_ins),
    'recent_orders', coalesce((select jsonb_agg(x) from (
      select o.id, o.order_number, o.customer_name, o.email, o.payment_status, o.total_amount, o.created_at,
        coalesce((select jsonb_agg(jsonb_build_object('name',ty.name,'quantity',i.quantity)) from public.ticket_order_items i join public.ticket_types ty on ty.id=i.ticket_type_id where i.order_id=o.id),'[]'::jsonb) items
      from public.ticket_orders o order by o.created_at desc limit 8
    ) x), '[]'::jsonb),
    'pending_orders', coalesce((select jsonb_agg(x) from (
      select o.id, o.order_number, o.customer_name, o.email, o.phone, o.payment_method, o.transaction_reference, o.payment_status, o.total_amount, o.created_at,
        (select s.transaction_reference from public.ticket_payment_submissions s where s.order_id=o.id order by s.submitted_at desc limit 1) submission_reference,
        (select s.proof_path from public.ticket_payment_submissions s where s.order_id=o.id order by s.submitted_at desc limit 1) proof_path,
        coalesce((select jsonb_agg(jsonb_build_object('name',ty.name,'code',ty.code,'quantity',i.quantity,'unit_price',i.unit_price))
          from public.ticket_order_items i join public.ticket_types ty on ty.id=i.ticket_type_id where i.order_id=o.id),'[]'::jsonb) items
      from public.ticket_orders o where o.payment_status in ('PAYMENT_SUBMITTED','UNDER_REVIEW')
      order by o.created_at asc limit 8
    ) x), '[]'::jsonb),
    'sales_by_day', coalesce((select jsonb_agg(x) from (
      select d.sales_date as day,
        (select count(*) from public.tickets t join public.ticket_orders o on o.id=t.order_id where o.created_at::date=d.sales_date and t.cancelled_at is null) tickets,
        (select coalesce(sum(total_amount),0) from public.ticket_orders o where o.created_at::date=d.sales_date and o.payment_status='APPROVED') revenue
      from (select distinct created_at::date as sales_date from public.ticket_orders where created_at >= now() - interval '13 days') d order by d.sales_date
    ) x), '[]'::jsonb),
    'revenue_by_category', coalesce((select jsonb_agg(jsonb_build_object('name',r.name,'code',r.code,'revenue',r.revenue,'tickets',r.tickets) order by r.code)
      from (
        select ty.name,ty.code,
          coalesce(sum(case when o.id is not null then i.quantity*i.unit_price else 0 end),0) revenue,
          coalesce(sum(case when o.id is not null then i.quantity else 0 end),0) tickets
        from public.ticket_types ty
        left join public.ticket_order_items i on i.ticket_type_id=ty.id
        left join public.ticket_orders o on o.id=i.order_id and o.payment_status='APPROVED'
        group by ty.id,ty.name,ty.code
      ) r), '[]'::jsonb),
    'payment_methods', coalesce((select jsonb_agg(jsonb_build_object('method',pm.method,'orders',pm.orders,'revenue',pm.revenue) order by pm.method)
      from (
        select payment_method method,count(*) orders,sum(total_amount) revenue
        from public.ticket_orders where payment_status='APPROVED' group by payment_method
      ) pm), '[]'::jsonb),
    'inventory', coalesce((select jsonb_agg(jsonb_build_object('id',ty.id,'code',ty.code,'name',ty.name,'price',ty.price,'allocation',ty.allocation,'sales_available',ty.sales_available,
      'sold',(select count(*) from public.tickets t where t.ticket_type_id=ty.id and t.cancelled_at is null))) from public.ticket_types ty), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.ticket_admin_orders(p_search text default '', p_status text default '', p_method text default '', p_category text default '')
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into result from (
    select jsonb_build_object(
      'id',o.id,'order_number',o.order_number,'customer_name',o.customer_name,'email',o.email,'phone',o.phone,
      'payment_method',o.payment_method,'payment_status',o.payment_status,'transaction_reference',o.transaction_reference,
      'total_amount',o.total_amount,'created_at',o.created_at,
      'items',coalesce((select jsonb_agg(jsonb_build_object('name',ty.name,'code',ty.code,'quantity',i.quantity,'unit_price',i.unit_price))
        from public.ticket_order_items i join public.ticket_types ty on ty.id=i.ticket_type_id where i.order_id=o.id),'[]'::jsonb),
      'proof_path',(select s.proof_path from public.ticket_payment_submissions s where s.order_id=o.id order by s.submitted_at desc limit 1),
      'submission_reference',(select s.transaction_reference from public.ticket_payment_submissions s where s.order_id=o.id order by s.submitted_at desc limit 1),
      'review_note',(select s.review_note from public.ticket_payment_submissions s where s.order_id=o.id order by s.submitted_at desc limit 1),
      'tickets_issued',(select count(*) from public.tickets t where t.order_id=o.id and t.cancelled_at is null)
    ) x
    from public.ticket_orders o
    where (coalesce(p_search,'')='' or o.order_number ilike '%'||p_search||'%' or o.customer_name ilike '%'||p_search||'%' or o.email ilike '%'||p_search||'%' or o.phone ilike '%'||p_search||'%')
      and (coalesce(p_status,'')='' or o.payment_status=p_status)
      and (coalesce(p_method,'')='' or o.payment_method=p_method)
      and (coalesce(p_category,'')='' or exists(select 1 from public.ticket_order_items i join public.ticket_types ty on ty.id=i.ticket_type_id where i.order_id=o.id and ty.code=p_category))
  ) x;
  return result;
end $$;

create or replace function public.ticket_review_payment(p_order_id uuid, p_approve boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_order public.ticket_orders%rowtype; v_submission public.ticket_payment_submissions%rowtype; v_item record; v_ticket_id uuid; v_count integer := 0; v_ids jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select * into v_order from public.ticket_orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.payment_status='APPROVED' then
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from public.tickets where order_id=p_order_id and cancelled_at is null;
    return jsonb_build_object('status','already_approved','issued',jsonb_array_length(v_ids),'ticket_ids',v_ids);
  end if;
  if v_order.payment_status not in ('PAYMENT_SUBMITTED','UNDER_REVIEW') then raise exception 'Order is not awaiting payment verification'; end if;
  select * into v_submission from public.ticket_payment_submissions where order_id=p_order_id order by submitted_at desc limit 1 for update;
  if not found then raise exception 'No payment submission exists for this order'; end if;
  if p_approve then
    if v_submission.submitted_amount is not null and v_submission.submitted_amount <> v_order.total_amount then raise exception 'Submitted amount does not match the order total'; end if;
    for v_item in select * from public.ticket_order_items where order_id=p_order_id order by ticket_type_id loop
      if (select count(*) from public.tickets where order_item_id=v_item.id and cancelled_at is null) < v_item.quantity then
        perform 1 from public.ticket_types where id=v_item.ticket_type_id for update;
        if not (select sales_available from public.ticket_types where id=v_item.ticket_type_id) then
          raise exception 'Ticket sales are disabled for %', (select name from public.ticket_types where id=v_item.ticket_type_id);
        end if;
        if (select count(*) from public.tickets where ticket_type_id=v_item.ticket_type_id and cancelled_at is null)
          + v_item.quantity - (select count(*) from public.tickets where order_item_id=v_item.id and cancelled_at is null)
          > (select allocation from public.ticket_types where id=v_item.ticket_type_id) then
          raise exception 'Ticket allocation is exhausted for %', (select name from public.ticket_types where id=v_item.ticket_type_id);
        end if;
        for i in 1..(v_item.quantity - (select count(*)::integer from public.tickets where order_item_id=v_item.id and cancelled_at is null)) loop
          insert into public.tickets(order_id,order_item_id,ticket_type_id,attendee_name)
          values(p_order_id,v_item.id,v_item.ticket_type_id,v_order.customer_name) returning id into v_ticket_id;
          insert into public.ticket_email_jobs(ticket_id) values(v_ticket_id) on conflict(ticket_id) do nothing;
          v_count := v_count + 1;
        end loop;
      end if;
    end loop;
    update public.ticket_orders set payment_status='APPROVED',updated_at=now() where id=p_order_id;
    update public.ticket_payment_submissions set decision='APPROVED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note where id=v_submission.id;
  else
    update public.ticket_orders set payment_status='REJECTED',updated_at=now() where id=p_order_id;
    update public.ticket_payment_submissions set decision='REJECTED',reviewed_by=auth.uid(),reviewed_at=now(),review_note=p_note where id=v_submission.id;
  end if;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),case when p_approve then 'PAYMENT_APPROVED' else 'PAYMENT_REJECTED' end,'order',p_order_id,jsonb_build_object('note',p_note,'tickets_issued',v_count));
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from public.tickets where order_id=p_order_id and cancelled_at is null;
  return jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'issued',v_count,'ticket_ids',v_ids);
end $$;

create or replace function public.ticket_set_qr_hash(p_ticket_id uuid, p_hash text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid QR token hash'; end if;
  update public.tickets set qr_token_hash=p_hash
  where id=p_ticket_id and order_id in (select id from public.ticket_orders where payment_status='APPROVED')
    and (qr_token_hash is null or qr_token_hash=p_hash);
  if not found then raise exception 'Ticket is unavailable or has a different QR token'; end if;
end $$;

create or replace function public.ticket_detail(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select jsonb_build_object('id',t.id,'ticket_number',t.ticket_number,'order_number',o.order_number,'attendee_name',t.attendee_name,'category',ty.name,
    'event_name','ZIM Excellence China Edition 2027','event_date','23 January 2027','venue','BaiFuYi Hotel, Beijing',
    'issued_at',t.issued_at,'email_status',t.email_status,'cancelled_at',t.cancelled_at,'checked_in_at',t.checked_in_at)
  into result from public.tickets t join public.ticket_orders o on o.id=t.order_id join public.ticket_types ty on ty.id=t.ticket_type_id where t.id=p_ticket_id;
  if result is null then raise exception 'Ticket not found'; end if;
  return result;
end $$;

create or replace function public.ticket_admin_list()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'ticket_number',t.ticket_number,'order_number',o.order_number,'attendee_name',t.attendee_name,'category',ty.name,'category_code',ty.code,'issued_at',t.issued_at,'email_status',t.email_status,'checked_in_at',t.checked_in_at,'cancelled_at',t.cancelled_at) order by t.issued_at desc),'[]'::jsonb)
  into result from public.tickets t join public.ticket_orders o on o.id=t.order_id join public.ticket_types ty on ty.id=t.ticket_type_id;
  return result;
end $$;

create or replace function public.ticket_check_in(p_token text default null, p_ticket_number text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_ticket public.tickets%rowtype; v_name text; v_category text;
begin
  if not (public.ticket_can_manage() or public.ticket_admin_role()='checkin_staff') then raise exception 'Not authorized'; end if;
  if p_token is not null and p_token<>'' then
    select * into v_ticket from public.tickets where qr_token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  elsif p_ticket_number is not null and p_ticket_number<>'' then
    select * into v_ticket from public.tickets where ticket_number=upper(trim(p_ticket_number)) for update;
  else raise exception 'Scan a QR code or enter a ticket number'; end if;
  if not found then return jsonb_build_object('status','INVALID'); end if;
  select attendee_name,ty.name into v_name,v_category from public.ticket_types ty where ty.id=v_ticket.ticket_type_id;
  if v_ticket.cancelled_at is not null then return jsonb_build_object('status','CANCELLED','ticket_number',v_ticket.ticket_number,'attendee_name',v_name,'category',v_category); end if;
  if v_ticket.checked_in_at is not null then return jsonb_build_object('status','ALREADY CHECKED IN','ticket_number',v_ticket.ticket_number,'attendee_name',v_name,'category',v_category,'checked_in_at',v_ticket.checked_in_at); end if;
  update public.tickets set checked_in_at=now(),checked_in_by=auth.uid() where id=v_ticket.id and checked_in_at is null;
  if not found then return jsonb_build_object('status','ALREADY CHECKED IN','ticket_number',v_ticket.ticket_number,'attendee_name',v_name,'category',v_category); end if;
  insert into public.ticket_check_ins(ticket_id,checked_in_by) values(v_ticket.id,auth.uid()) on conflict(ticket_id) do nothing;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'TICKET_CHECKED_IN','ticket',v_ticket.id);
  return jsonb_build_object('status','VALID','ticket_number',v_ticket.ticket_number,'attendee_name',v_name,'category',v_category,'checked_in_at',now());
end $$;

create or replace function public.ticket_set_inventory(p_type_id uuid, p_price numeric, p_allocation integer, p_available boolean)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.ticket_can_admin() then raise exception 'Super Admin access required'; end if;
  if p_price < 0 or p_price::text in ('NaN','Infinity','-Infinity')
    or p_allocation < (select count(*) from public.tickets where ticket_type_id=p_type_id and cancelled_at is null)
    or (p_available and p_allocation <= (select count(*) from public.tickets where ticket_type_id=p_type_id and cancelled_at is null)) then
    raise exception 'Price or allocation is invalid; allocation cannot be below tickets already sold, and sales need remaining capacity';
  end if;
  update public.ticket_types set price=p_price,allocation=p_allocation,sales_available=p_available,updated_at=now() where id=p_type_id;
  if not found then raise exception 'Ticket type not found'; end if;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'INVENTORY_UPDATED','ticket_type',p_type_id,jsonb_build_object('price',p_price,'allocation',p_allocation,'sales_available',p_available));
end $$;

create or replace function public.ticket_admin_activity()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'action',l.action,'entity_type',l.entity_type,'entity_id',l.entity_id,'details',l.details,'created_at',l.created_at,'actor',coalesce(p.display_name,u.email,'Admin')) order by l.created_at desc),'[]'::jsonb)
  into result from (select * from public.ticket_activity_logs order by created_at desc limit 200) l left join auth.users u on u.id=l.actor_id left join public.profiles p on p.id=l.actor_id;
  return result;
end $$;

create or replace function public.ticket_retry_email(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  update public.ticket_email_jobs set status='PENDING',attempts=attempts+1,last_error=null,updated_at=now() where ticket_id=p_ticket_id and status in ('FAILED','PENDING');
  if not found then raise exception 'No retryable email job exists'; end if;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'TICKET_EMAIL_RETRY_QUEUED','ticket',p_ticket_id);
  return jsonb_build_object('status','queued');
end $$;

create or replace function public.ticket_cancel_ticket(p_ticket_id uuid, p_reason text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'A cancellation reason is required'; end if;
  update public.tickets set cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=trim(p_reason) where id=p_ticket_id and cancelled_at is null;
  if not found then raise exception 'Ticket not found or already cancelled'; end if;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'TICKET_CANCELLED','ticket',p_ticket_id,jsonb_build_object('reason',trim(p_reason)));
end $$;

do $$
declare t text;
begin
  foreach t in array array['ticket_admin_roles','ticket_types','ticket_orders','ticket_order_items','ticket_payment_submissions','tickets','ticket_check_ins','ticket_email_jobs','ticket_activity_logs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
  end loop;
end $$;

revoke all on function public.ticket_admin_role() from public, anon;
revoke all on function public.ticket_can_manage() from public, anon;
revoke all on function public.ticket_can_admin() from public, anon;
revoke all on function public.ticket_dashboard_data() from public, anon;
revoke all on function public.ticket_admin_orders(text,text,text,text) from public, anon;
revoke all on function public.ticket_review_payment(uuid,boolean,text) from public, anon;
revoke all on function public.ticket_admin_list() from public, anon;
revoke all on function public.ticket_check_in(text,text) from public, anon;
revoke all on function public.ticket_set_inventory(uuid,numeric,integer,boolean) from public, anon;
revoke all on function public.ticket_admin_activity() from public, anon;
revoke all on function public.ticket_retry_email(uuid) from public, anon;
revoke all on function public.ticket_cancel_ticket(uuid,text) from public, anon;
revoke all on function public.ticket_set_qr_hash(uuid,text) from public, anon;
revoke all on function public.ticket_detail(uuid) from public, anon;
grant execute on function public.ticket_admin_role() to authenticated;
grant execute on function public.ticket_can_manage() to authenticated;
grant execute on function public.ticket_can_admin() to authenticated;
grant execute on function public.ticket_dashboard_data() to authenticated;
grant execute on function public.ticket_admin_orders(text,text,text,text) to authenticated;
grant execute on function public.ticket_review_payment(uuid,boolean,text) to authenticated;
grant execute on function public.ticket_admin_list() to authenticated;
grant execute on function public.ticket_check_in(text,text) to authenticated;
grant execute on function public.ticket_set_inventory(uuid,numeric,integer,boolean) to authenticated;
grant execute on function public.ticket_admin_activity() to authenticated;
grant execute on function public.ticket_retry_email(uuid) to authenticated;
grant execute on function public.ticket_cancel_ticket(uuid,text) to authenticated;
grant execute on function public.ticket_set_qr_hash(uuid,text) to authenticated;
grant execute on function public.ticket_detail(uuid) to authenticated;

insert into storage.buckets(id,name,public) values('ticket-payment-proofs','ticket-payment-proofs',false) on conflict(id) do nothing;
drop policy if exists "Ticket admins read payment proofs" on storage.objects;
create policy "Ticket admins read payment proofs" on storage.objects for select to authenticated
using (bucket_id='ticket-payment-proofs' and public.ticket_can_manage());

-- Promote existing Auth users here after applying the migration:
-- insert into public.ticket_admin_roles(user_id, role) values ('AUTH_USER_UUID', 'super_admin');
