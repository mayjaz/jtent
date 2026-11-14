create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter function public.ticket_create_order(text,text,text,integer,integer,text,jsonb)
  set search_path = extensions, public;
alter function public.ticket_authorize_order(text,text)
  set search_path = extensions, public;
alter function public.ticket_submit_payment(text,text,text,text)
  set search_path = extensions, public;
alter function public.ticket_check_in(text,text)
  set search_path = extensions, public;
