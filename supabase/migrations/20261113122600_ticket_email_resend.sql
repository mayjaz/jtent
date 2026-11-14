create or replace function public.ticket_retry_email(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_previous_status text;
begin
  if not public.ticket_can_manage() then raise exception 'Not authorized'; end if;

  select j.status into v_previous_status
  from public.ticket_email_jobs j
  join public.tickets t on t.id=j.ticket_id
  where j.ticket_id=p_ticket_id and t.cancelled_at is null
  for update of j;
  if not found then raise exception 'No active email job exists for this ticket'; end if;
  if v_previous_status not in ('FAILED','SENT') then raise exception 'Email is not available to retry or resend'; end if;

  update public.ticket_email_jobs
  set status='PENDING',last_error=null,updated_at=now()
  where ticket_id=p_ticket_id;
  insert into public.ticket_activity_logs(actor_id,action,entity_type,entity_id)
  values(auth.uid(),
    case when v_previous_status='SENT' then 'TICKET_EMAIL_RESEND_QUEUED' else 'TICKET_EMAIL_RETRY_QUEUED' end,
    'ticket',p_ticket_id);
  return jsonb_build_object('status','queued','previous_status',v_previous_status);
end $$;

revoke all on function public.ticket_retry_email(uuid) from public, anon;
grant execute on function public.ticket_retry_email(uuid) to authenticated;
