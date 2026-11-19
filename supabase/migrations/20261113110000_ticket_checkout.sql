alter table public.ticket_orders
  add column if not exists customer_access_token_hash text;
alter table public.ticket_order_items
  add column if not exists attendee_names jsonb not null default '[]'::jsonb;

create unique index if not exists ticket_orders_access_token_hash_idx
  on public.ticket_orders(customer_access_token_hash)
  where customer_access_token_hash is not null;

create or replace function public.ticket_public_catalog()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ty.id,'code',ty.code,'name',ty.name,'price',ty.price,'allocation',ty.allocation,
    'sold',coalesce((select count(*) from public.tickets t where t.ticket_type_id=ty.id and t.cancelled_at is null),0),
    'reserved',coalesce((select sum(i.quantity) from public.ticket_order_items i join public.ticket_orders o on o.id=i.order_id
      where i.ticket_type_id=ty.id and (
        (o.payment_status='PENDING_PAYMENT' and o.created_at > now() - interval '30 minutes')
        or o.payment_status in ('PAYMENT_SUBMITTED','UNDER_REVIEW')
      )),0),
    'sales_available',ty.sales_available
  ) order by ty.code),'[]'::jsonb) into result
  from public.ticket_types ty;
  return result;
end $$;

create or replace function public.ticket_admin_inventory_reservations()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',ty.id,'reserved',coalesce(r.reserved,0)) order by ty.code),'[]'::jsonb)
  into result
  from public.ticket_types ty
  left join (
    select i.ticket_type_id,sum(i.quantity) reserved
    from public.ticket_order_items i join public.ticket_orders o on o.id=i.order_id
    where (o.payment_status='PENDING_PAYMENT' and o.created_at > now() - interval '30 minutes')
      or o.payment_status in ('PAYMENT_SUBMITTED','UNDER_REVIEW')
    group by i.ticket_type_id
  ) r on r.ticket_type_id=ty.id;
  return result;
end $$;

create or replace function public.ticket_create_order(
  p_customer_name text,
  p_email text,
  p_phone text,
  p_general_quantity integer,
  p_vip_quantity integer,
  p_payment_method text,
  p_attendees jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_general public.ticket_types%rowtype;
  v_vip public.ticket_types%rowtype;
  v_order public.ticket_orders%rowtype;
  v_general_sold integer;
  v_vip_sold integer;
  v_general_reserved integer;
  v_vip_reserved integer;
  v_total numeric(10,2);
  v_access_token text;
  v_recent_orders integer;
  v_general_attendees integer;
  v_vip_attendees integer;
begin
  if length(trim(coalesce(p_customer_name,''))) not between 1 and 120 then raise exception 'Enter your name (up to 120 characters)'; end if;
  if length(trim(coalesce(p_email,''))) not between 3 and 254 or trim(p_email) !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if length(trim(coalesce(p_phone,''))) not between 7 and 25 or trim(p_phone) !~ '^[+0-9][0-9 ()-]{6,24}$' then raise exception 'Enter a valid phone number'; end if;
  if p_general_quantity is null or p_vip_quantity is null
    or p_general_quantity not between 0 and 10 or p_vip_quantity not between 0 and 10
    or coalesce(p_general_quantity,0) + coalesce(p_vip_quantity,0) not between 1 and 10 then
    raise exception 'Choose between 1 and 10 tickets per order';
  end if;
  if p_payment_method is null or p_payment_method not in ('WECHAT_PAY','ALIPAY') then raise exception 'Choose WeChat Pay or Alipay'; end if;
  if p_attendees is null or jsonb_typeof(p_attendees) <> 'array'
    or jsonb_array_length(p_attendees) <> p_general_quantity+p_vip_quantity then
    raise exception 'Provide an attendee name for each ticket';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_attendees) as attendees(value)
    where jsonb_typeof(value) <> 'object'
      or value->>'category' not in ('GENERAL','VIP')
      or length(trim(coalesce(value->>'name',''))) not between 1 and 120
  ) then raise exception 'Each ticket needs a valid attendee name and category'; end if;
  select count(*) filter(where attendee->>'category'='GENERAL')::integer,
    count(*) filter(where attendee->>'category'='VIP')::integer
    into v_general_attendees,v_vip_attendees
  from jsonb_array_elements(p_attendees) as attendees(attendee);
  if v_general_attendees <> p_general_quantity or v_vip_attendees <> p_vip_quantity then
    raise exception 'Attendee names must match the selected ticket quantities';
  end if;

  select count(*) into v_recent_orders from public.ticket_orders
  where lower(email)=lower(trim(p_email)) and created_at > now() - interval '1 hour'
    and payment_status in ('PENDING_PAYMENT','PAYMENT_SUBMITTED','UNDER_REVIEW');
  if v_recent_orders >= 5 then raise exception 'Too many recent orders for this email address; please try again later'; end if;

  perform 1 from public.ticket_types where code in ('GENERAL','VIP') order by code for update;
  select * into v_general from public.ticket_types where code='GENERAL';
  select * into v_vip from public.ticket_types where code='VIP';
  if v_general.id is null or v_vip.id is null then raise exception 'Ticket inventory is not configured'; end if;

  select count(*)::integer into v_general_sold from public.tickets where ticket_type_id=v_general.id and cancelled_at is null;
  select count(*)::integer into v_vip_sold from public.tickets where ticket_type_id=v_vip.id and cancelled_at is null;
  select coalesce(sum(i.quantity),0)::integer into v_general_reserved
  from public.ticket_order_items i join public.ticket_orders o on o.id=i.order_id
  where i.ticket_type_id=v_general.id and (
    (o.payment_status='PENDING_PAYMENT' and o.created_at > now() - interval '30 minutes')
    or o.payment_status in ('PAYMENT_SUBMITTED','UNDER_REVIEW')
  );
  select coalesce(sum(i.quantity),0)::integer into v_vip_reserved
  from public.ticket_order_items i join public.ticket_orders o on o.id=i.order_id
  where i.ticket_type_id=v_vip.id and (
    (o.payment_status='PENDING_PAYMENT' and o.created_at > now() - interval '30 minutes')
    or o.payment_status in ('PAYMENT_SUBMITTED','UNDER_REVIEW')
  );

  if p_general_quantity > 0 and (not v_general.sales_available or v_general.allocation-v_general_sold-v_general_reserved < p_general_quantity) then
    raise exception 'General Admission tickets are unavailable or sold out';
  end if;
  if p_vip_quantity > 0 and (not v_vip.sales_available or v_vip.allocation-v_vip_sold-v_vip_reserved < p_vip_quantity) then
    raise exception 'VIP tickets are unavailable or sold out';
  end if;

  v_total := p_general_quantity * v_general.price + p_vip_quantity * v_vip.price;
  v_access_token := encode(gen_random_bytes(32),'hex');
  insert into public.ticket_orders(customer_name,email,phone,payment_method,total_amount,customer_access_token_hash)
  values(trim(p_customer_name),lower(trim(p_email)),trim(p_phone),p_payment_method,v_total,encode(digest(v_access_token,'sha256'),'hex'))
  returning * into v_order;

  if p_general_quantity > 0 then
    insert into public.ticket_order_items(order_id,ticket_type_id,quantity,unit_price,attendee_names)
    select v_order.id,v_general.id,p_general_quantity,v_general.price,
      coalesce(jsonb_agg(to_jsonb(trim(attendee->>'name')) order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(p_attendees) with ordinality as attendees(attendee,ordinal)
    where attendee->>'category'='GENERAL';
  end if;
  if p_vip_quantity > 0 then
    insert into public.ticket_order_items(order_id,ticket_type_id,quantity,unit_price,attendee_names)
    select v_order.id,v_vip.id,p_vip_quantity,v_vip.price,
      coalesce(jsonb_agg(to_jsonb(trim(attendee->>'name')) order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(p_attendees) with ordinality as attendees(attendee,ordinal)
    where attendee->>'category'='VIP';
  end if;

  return jsonb_build_object(
    'order_id',v_order.id,'order_number',v_order.order_number,'access_token',v_access_token,
    'customer_name',v_order.customer_name,'email',v_order.email,'payment_method',v_order.payment_method,
    'payment_status',v_order.payment_status,'total_amount',v_order.total_amount,'created_at',v_order.created_at,
    'expires_at',v_order.created_at + interval '30 minutes',
    'items',
      (case when p_general_quantity > 0 then jsonb_build_array(jsonb_build_object('name',v_general.name,'code',v_general.code,'quantity',p_general_quantity,'unit_price',v_general.price)) else '[]'::jsonb end)
      || (case when p_vip_quantity > 0 then jsonb_build_array(jsonb_build_object('name',v_vip.name,'code',v_vip.code,'quantity',p_vip_quantity,'unit_price',v_vip.price)) else '[]'::jsonb end)
  );
end $$;

create or replace function public.ticket_review_payment(p_order_id uuid, p_approve boolean, p_note text)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_order public.ticket_orders%rowtype;
  v_submission public.ticket_payment_submissions%rowtype;
  v_item record;
  v_ticket_id uuid;
  v_count integer := 0;
  v_ids jsonb;
  v_existing integer;
  v_index integer;
  v_attendee_name text;
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
      select count(*)::integer into v_existing from public.tickets where order_item_id=v_item.id and cancelled_at is null;
      if v_existing < v_item.quantity then
        perform 1 from public.ticket_types where id=v_item.ticket_type_id for update;
        if (select count(*) from public.tickets where ticket_type_id=v_item.ticket_type_id and cancelled_at is null)
          + v_item.quantity-v_existing > (select allocation from public.ticket_types where id=v_item.ticket_type_id) then
          raise exception 'Ticket allocation is exhausted for %', (select name from public.ticket_types where id=v_item.ticket_type_id);
        end if;
        for v_index in v_existing..(v_item.quantity-1) loop
          v_attendee_name := coalesce(nullif(trim(v_item.attendee_names->>v_index),''),v_order.customer_name);
          insert into public.tickets(order_id,order_item_id,ticket_type_id,attendee_name)
          values(p_order_id,v_item.id,v_item.ticket_type_id,v_attendee_name) returning id into v_ticket_id;
          insert into public.ticket_email_jobs(ticket_id) values(v_ticket_id) on conflict(ticket_id) do nothing;
          v_count := v_count+1;
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

create or replace function public.ticket_authorize_order(p_order_number text, p_access_token text)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_order public.ticket_orders%rowtype; result jsonb;
begin
  if coalesce(p_access_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'Order reference or access code is invalid'; end if;
  select * into v_order from public.ticket_orders
  where order_number=p_order_number and customer_access_token_hash=encode(digest(p_access_token,'sha256'),'hex');
  if not found then raise exception 'Order reference or access code is invalid'; end if;

  select jsonb_build_object(
    'order_id',v_order.id,'order_number',v_order.order_number,'customer_name',v_order.customer_name,
    'email',v_order.email,'phone',v_order.phone,'payment_method',v_order.payment_method,
    'payment_status',v_order.payment_status,'transaction_reference',v_order.transaction_reference,
    'total_amount',v_order.total_amount,'created_at',v_order.created_at,
    'expires_at',v_order.created_at + interval '30 minutes',
    'items',coalesce((select jsonb_agg(jsonb_build_object('name',ty.name,'code',ty.code,'quantity',i.quantity,'unit_price',i.unit_price))
      from public.ticket_order_items i join public.ticket_types ty on ty.id=i.ticket_type_id where i.order_id=v_order.id),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.ticket_submit_payment(
  p_order_number text,
  p_access_token text,
  p_transaction_reference text,
  p_proof_path text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_order public.ticket_orders%rowtype;
begin
  if coalesce(p_access_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'Order reference or access code is invalid'; end if;
  select * into v_order from public.ticket_orders
  where order_number=p_order_number and customer_access_token_hash=encode(digest(p_access_token,'sha256'),'hex')
  for update;
  if not found then raise exception 'Order reference or access code is invalid'; end if;
  if v_order.payment_status <> 'PENDING_PAYMENT' or v_order.created_at <= now() - interval '30 minutes' then
    raise exception 'This order is no longer accepting payment proof';
  end if;
  if length(trim(coalesce(p_transaction_reference,''))) not between 1 and 120 then raise exception 'Enter the payment transaction reference'; end if;
  if p_proof_path is null or left(p_proof_path,length('payments/'||v_order.id||'/')) <> 'payments/'||v_order.id||'/' then
    raise exception 'Invalid payment proof';
  end if;

  insert into public.ticket_payment_submissions(order_id,transaction_reference,proof_path,submitted_amount)
  values(v_order.id,trim(p_transaction_reference),p_proof_path,v_order.total_amount);
  update public.ticket_orders set transaction_reference=trim(p_transaction_reference),payment_status='PAYMENT_SUBMITTED',updated_at=now()
  where id=v_order.id;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id,details)
  values(null,'PAYMENT_PROOF_SUBMITTED','order',v_order.id,jsonb_build_object('payment_method',v_order.payment_method));
  return jsonb_build_object('order_number',v_order.order_number,'payment_status','PAYMENT_SUBMITTED');
end $$;

create or replace function public.ticket_email_job_complete(p_ticket_id uuid, p_success boolean, p_error text default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  update public.ticket_email_jobs
  set status=case when p_success then 'SENT' else 'FAILED' end,
      attempts=attempts+1,
      last_error=case when p_success then null else left(coalesce(p_error,'Delivery failed'),1000) end,
      updated_at=now()
  where ticket_id=p_ticket_id;
  if not found then raise exception 'Email job not found'; end if;
  update public.tickets set email_status=case when p_success then 'SENT' else 'FAILED' end where id=p_ticket_id;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),case when p_success then 'TICKET_EMAIL_SENT' else 'TICKET_EMAIL_FAILED' end,'ticket',p_ticket_id,
    case when p_success then '{}'::jsonb else jsonb_build_object('error',left(coalesce(p_error,'Delivery failed'),1000)) end);
  return jsonb_build_object('status',case when p_success then 'SENT' else 'FAILED' end);
end $$;

create or replace function public.ticket_retry_email(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  update public.ticket_email_jobs j set status='PENDING',last_error=null,updated_at=now()
  from public.tickets t
  where j.ticket_id=p_ticket_id and j.status='FAILED' and t.id=j.ticket_id and t.cancelled_at is null;
  if not found then raise exception 'No failed email job exists for this ticket'; end if;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id)
  values(auth.uid(),'TICKET_EMAIL_RETRY_QUEUED','ticket',p_ticket_id);
  return jsonb_build_object('status','queued');
end $$;

create or replace function public.ticket_set_inventory(p_type_id uuid, p_price numeric, p_allocation integer, p_available boolean)
returns void language plpgsql security definer set search_path=public
as $$
declare v_sold integer; v_reserved integer;
begin
  if not public.ticket_can_admin() then raise exception 'Super Admin access required'; end if;
  perform 1 from public.ticket_types where id=p_type_id for update;
  if not found then raise exception 'Ticket type not found'; end if;
  select count(*)::integer into v_sold from public.tickets where ticket_type_id=p_type_id and cancelled_at is null;
  select coalesce(sum(i.quantity),0)::integer into v_reserved
  from public.ticket_order_items i join public.ticket_orders o on o.id=i.order_id
  where i.ticket_type_id=p_type_id and (
    (o.payment_status='PENDING_PAYMENT' and o.created_at > now() - interval '30 minutes')
    or o.payment_status in ('PAYMENT_SUBMITTED','UNDER_REVIEW')
  );
  if p_price < 0 or p_price::text in ('NaN','Infinity','-Infinity')
    or p_allocation < v_sold+v_reserved
    or (p_available and p_allocation <= v_sold+v_reserved) then
    raise exception 'Price or allocation is invalid; allocation must cover sold and reserved tickets';
  end if;
  update public.ticket_types set price=p_price,allocation=p_allocation,sales_available=p_available,updated_at=now() where id=p_type_id;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'INVENTORY_UPDATED','ticket_type',p_type_id,jsonb_build_object('price',p_price,'allocation',p_allocation,'sales_available',p_available));
end $$;

create or replace function public.ticket_detail(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select jsonb_build_object('id',t.id,'ticket_number',t.ticket_number,'order_number',o.order_number,'attendee_name',t.attendee_name,'category',ty.name,
    'email',o.email,'event_name','ZIM Excellence China Edition 2027','event_date','23 January 2027','venue','BaiFuYi Hotel, Beijing',
    'issued_at',t.issued_at,'email_status',t.email_status,'cancelled_at',t.cancelled_at,'checked_in_at',t.checked_in_at)
  into result from public.tickets t join public.ticket_orders o on o.id=t.order_id join public.ticket_types ty on ty.id=t.ticket_type_id where t.id=p_ticket_id;
  if result is null then raise exception 'Ticket not found'; end if;
  return result;
end $$;

revoke all on function public.ticket_public_catalog() from public;
revoke all on function public.ticket_admin_inventory_reservations() from public, anon;
revoke all on function public.ticket_create_order(text,text,text,integer,integer,text,jsonb) from public;
revoke all on function public.ticket_authorize_order(text,text) from public;
revoke all on function public.ticket_submit_payment(text,text,text,text) from public;
revoke all on function public.ticket_email_job_complete(uuid,boolean,text) from public, anon;
revoke all on function public.ticket_retry_email(uuid) from public, anon;
revoke all on function public.ticket_set_inventory(uuid,numeric,integer,boolean) from public, anon;
revoke all on function public.ticket_detail(uuid) from public, anon;
grant execute on function public.ticket_public_catalog() to anon, authenticated;
grant execute on function public.ticket_admin_inventory_reservations() to authenticated;
grant execute on function public.ticket_create_order(text,text,text,integer,integer,text,jsonb) to anon, authenticated;
grant execute on function public.ticket_authorize_order(text,text) to anon, authenticated;
grant execute on function public.ticket_submit_payment(text,text,text,text) to anon, authenticated;
grant execute on function public.ticket_email_job_complete(uuid,boolean,text) to authenticated;
grant execute on function public.ticket_retry_email(uuid) to authenticated;
grant execute on function public.ticket_set_inventory(uuid,numeric,integer,boolean) to authenticated;
grant execute on function public.ticket_detail(uuid) to authenticated;
