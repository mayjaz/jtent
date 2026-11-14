alter table public.ticket_orders
  alter column order_number set default ('ZIM27-' || upper(encode(extensions.gen_random_bytes(6), 'hex')));

create or replace function public.ticket_detail(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;
  select jsonb_build_object(
    'id',t.id,
    'ticket_number',t.ticket_number,
    'order_number',o.order_number,
    'attendee_name',t.attendee_name,
    'category',ty.name,
    'email',o.email,
    'event_name','ZIM Excellence China Edition 2027',
    'event_date','23 January 2027',
    'venue','BaiFuYi Hotel, Beijing',
    'issued_at',t.issued_at,
    'email_status',t.email_status,
    'cancelled_at',t.cancelled_at,
    'checked_in_at',t.checked_in_at
  )
  into result
  from public.tickets t
  join public.ticket_orders o on o.id=t.order_id
  join public.ticket_types ty on ty.id=t.ticket_type_id
  where t.id=p_ticket_id;
  if result is null then raise exception 'Ticket not found'; end if;
  return result;
end $$;
