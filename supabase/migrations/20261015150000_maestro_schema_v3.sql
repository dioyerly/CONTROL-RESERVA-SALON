-- =====================================================================
-- MAESTRO · Esquema y operaciones v3
-- *** APLICAR UNA SOLA VEZ EN EL PROYECTO MAESTRO ***
-- Revisión estática únicamente. No probado en PostgreSQL ni en Supabase.
-- Requiere PostgreSQL 15 o superior (ON DELETE SET NULL (columna)).
-- PENDIENTE DE DECISIÓN = regla o criterio no confirmado en el código.
-- =====================================================================

-- Transacción única: si algo falla, no queda un esquema a medias.
begin;

create extension if not exists btree_gist;

-- ---------- 0. Utilidades ----------
-- Equivalente a src/services/phone.ts
create or replace function normalize_phone_ar(raw text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  d text;
  a int;
  cand text;
begin
  d := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
  if d = '' then return ''; end if;
  if left(d, 2) = '00' then d := substr(d, 3); end if;
  if left(d, 2) = '54' then d := substr(d, 3); end if;
  if length(d) = 11 and left(d, 1) = '9' then d := substr(d, 2); end if;
  if left(d, 1) = '0' then d := substr(d, 2); end if;
  if length(d) = 12 then
    foreach a in array array[2, 3, 4] loop
      if substr(d, a + 1, 2) = '15' then
        cand := left(d, a) || substr(d, a + 3);
        if length(cand) = 10 then return cand; end if;
      end if;
    end loop;
  end if;
  return d;
end $$;

create or replace function _min(t time) returns int
language sql stable set search_path = public, pg_temp as $$
  select (extract(hour from t) * 60 + extract(minute from t))::int
$$;

create or replace function _hm(m int) returns time
language sql immutable set search_path = public, pg_temp as $$
  select make_time(m / 60, m % 60, 0)
$$;

create or replace function _ts(d date, m int) returns timestamp
language sql immutable set search_path = public, pg_temp as $$
  select d::timestamp + m * interval '1 minute'
$$;

-- ---------- 1. Negocio ----------
create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  slug text not null unique,
  mode text not null check (mode in ('independent','salon_employees','multi_staff_capacity','multi_location','home_visit')),
  tagline text not null default '',
  description text not null default '',
  address text not null default '',
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  pricing_display_mode text not null default 'approximate'
    check (pricing_display_mode in ('approximate','indicative','consult','hidden')),
  slot_interval_minutes int not null default 30 check (slot_interval_minutes in (15, 30)),
  min_advance_notice_hours int not null default 2 check (min_advance_notice_hours >= 0),
  max_advance_days int not null default 45 check (max_advance_days > 0), -- PENDIENTE DE DECISIÓN: no se verifica al confirmar
  min_buffer_minutes int not null default 10 check (min_buffer_minutes >= 0), -- sin uso en el motor
  cancellation_policy_hours int not null default 24 check (cancellation_policy_hours >= 0), -- sin uso en el motor
  timezone text not null default 'America/Argentina/Buenos_Aires',
  hero_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table business_hours (
  business_id uuid not null references businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (business_id, weekday),
  check (end_time > start_time)
);

create table business_closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  closed_on date not null,
  reason text not null default '',
  unique (business_id, closed_on)
);

-- ---------- 2. Sedes ----------
create table locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  address text not null default '',
  is_main boolean not null default false,
  is_active boolean not null default true,
  unique (business_id, id)
);
create unique index locations_one_main on locations (business_id) where is_main;

create table location_transit (
  business_id uuid not null,
  from_location_id uuid not null,
  to_location_id uuid not null,
  minutes int not null check (minutes >= 0), -- PENDIENTE DE DECISIÓN: el motor usa 30 minutos fijos
  primary key (from_location_id, to_location_id),
  foreign key (business_id, from_location_id) references locations(business_id, id) on delete cascade,
  foreign key (business_id, to_location_id) references locations(business_id, id) on delete cascade,
  check (from_location_id <> to_location_id)
);

-- ---------- 3. Servicios ----------
create table service_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  unique (business_id, id)
);

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid,
  name text not null,
  description text not null default '',
  duration_minutes int not null check (duration_minutes > 0),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0),
  -- 0 = usar la antelación mínima del negocio (igual que `s.minAdvanceHours || config.minAdvanceNoticeHours`)
  min_advance_hours int not null default 0 check (min_advance_hours >= 0),
  price numeric(12,2) check (price is null or price >= 0),
  price_type text not null default 'fixed' check (price_type in ('fixed','starting_at','consult')),
  allow_simultaneous boolean not null default false, -- PENDIENTE DE DECISIÓN: reglas simultáneas no modeladas
  requires_consultation boolean not null default false,
  is_online_booking_enabled boolean not null default true,
  is_active boolean not null default true,
  unique (business_id, id),
  foreign key (business_id, category_id)
    references service_categories(business_id, id) on delete set null (category_id)
);

create table service_locations (
  business_id uuid not null,
  service_id uuid not null,
  location_id uuid not null,
  primary key (service_id, location_id),
  foreign key (business_id, service_id) references services(business_id, id) on delete cascade,
  foreign key (business_id, location_id) references locations(business_id, id) on delete cascade
);

create table service_resource_types (
  business_id uuid not null,
  service_id uuid not null,
  resource_type text not null
    check (resource_type in ('cabina','camilla','puesto_manicura','lavacabezas','estacion_corte')),
  primary key (service_id, resource_type),
  foreign key (business_id, service_id) references services(business_id, id) on delete cascade
);

-- ---------- 4. Profesionales ----------
create table professionals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  role text not null default '',
  email text,
  color text not null default '#B69A70',
  can_manage_own_breaks boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, id)
);

create table professional_locations (
  business_id uuid not null,
  professional_id uuid not null,
  location_id uuid not null,
  primary key (professional_id, location_id),
  foreign key (business_id, professional_id) references professionals(business_id, id) on delete cascade,
  foreign key (business_id, location_id) references locations(business_id, id) on delete cascade
);

create table professional_services (
  business_id uuid not null,
  professional_id uuid not null,
  service_id uuid not null,
  primary key (professional_id, service_id),
  foreign key (business_id, professional_id) references professionals(business_id, id) on delete cascade,
  foreign key (business_id, service_id) references services(business_id, id) on delete cascade
);

create table professional_hours (
  business_id uuid not null,
  professional_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  primary key (professional_id, weekday),
  foreign key (business_id, professional_id) references professionals(business_id, id) on delete cascade,
  check (end_time > start_time)
);

-- ---------- 5. Recursos (una fila por unidad física) ----------
create table resource_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  location_id uuid not null,
  name text not null,
  resource_type text not null
    check (resource_type in ('cabina','camilla','puesto_manicura','lavacabezas','estacion_corte')),
  is_active boolean not null default true,
  unique (location_id, name),
  unique (business_id, id),
  foreign key (business_id, location_id) references locations(business_id, id) on delete cascade
);
create index resource_units_lookup on resource_units (business_id, location_id, resource_type);

-- ---------- 6. Descansos (negocio o profesional) ----------
create table schedule_breaks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  professional_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  title text not null default 'Descanso',
  check (end_time > start_time),
  foreign key (business_id, professional_id) references professionals(business_id, id) on delete cascade
);

-- ---------- 7. Bloqueos de agenda ----------
create table agenda_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  professional_id uuid,
  location_id uuid, -- PENDIENTE DE DECISIÓN: el motor no filtra bloqueos por sede
  date date not null,
  start_time time not null,
  end_time time not null,
  reason text not null default '',
  type text not null check (type in ('break','vacation','maintenance','personal')),
  busy tsrange generated always as (
    tsrange(date::timestamp + start_time, date::timestamp + end_time, '[)')
  ) stored,
  check (end_time > start_time),
  foreign key (business_id, professional_id) references professionals(business_id, id) on delete cascade,
  foreign key (business_id, location_id) references locations(business_id, id) on delete cascade
);
create index agenda_blocks_lookup on agenda_blocks (business_id, date);

-- ---------- 8. Reservas ----------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  booking_code text not null unique, -- PENDIENTE DE DECISIÓN: formato del código
  location_id uuid not null,
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','in_progress','completed','cancelled','no_show')),
  customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_phone text not null,
  customer_phone_norm text generated always as (normalize_phone_ar(customer_phone)) stored,
  customer_notes text,
  date date not null,
  start_time time not null,
  end_time time not null,
  during tsrange generated always as (
    tsrange(date::timestamp + start_time, date::timestamp + end_time, '[)')
  ) stored,
  estimated_price numeric(12,2),
  price_note text,
  created_via text not null default 'public' check (created_via in ('public','owner','employee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  check (end_time > start_time),
  foreign key (business_id, location_id) references locations(business_id, id),
  -- Un cliente, un turno activo a la vez. Solo "cancelled" libera el horario (igual que el motor).
  exclude using gist (
    business_id with =,
    customer_phone_norm with =,
    during with &&
  ) where (status <> 'cancelled')
);
create index appointments_by_day on appointments (business_id, date);

-- Datos privados: solo el dueño
create table appointment_private (
  appointment_id uuid primary key,
  business_id uuid not null,
  customer_email text,
  internal_notes text,
  foreign key (business_id, appointment_id)
    references appointments(business_id, id) on delete cascade
);

create table appointment_segments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  appointment_id uuid not null,
  service_id uuid not null,
  professional_id uuid not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  buffer_after_minutes int not null default 0 check (buffer_after_minutes >= 0),
  status text not null default 'scheduled' check (status in ('scheduled','in_service','completed')),
  active boolean not null default true,
  busy tsrange generated always as (
    tsrange(
      date::timestamp + start_time,
      date::timestamp + end_time + buffer_after_minutes * interval '1 minute',
      '[)')
  ) stored,
  check (end_time > start_time),
  unique (business_id, id),
  foreign key (business_id, appointment_id) references appointments(business_id, id) on delete cascade,
  foreign key (business_id, service_id) references services(business_id, id),
  foreign key (business_id, professional_id) references professionals(business_id, id),
  exclude using gist (professional_id with =, busy with &&) where (active)
);
create index segments_by_appointment on appointment_segments (appointment_id);
create index segments_by_day on appointment_segments (business_id, date);
create index segments_by_professional_day on appointment_segments (professional_id, date);

create table appointment_segment_units (
  business_id uuid not null,
  segment_id uuid not null,
  unit_id uuid not null,
  active boolean not null,   -- copiado del segmento por disparador
  busy tsrange not null,     -- copiado del segmento por disparador
  primary key (segment_id, unit_id),
  foreign key (business_id, segment_id) references appointment_segments(business_id, id) on delete cascade,
  foreign key (business_id, unit_id) references resource_units(business_id, id),
  exclude using gist (unit_id with =, busy with &&) where (active)
);
create index segment_units_by_unit on appointment_segment_units (unit_id);

-- ---------- 9. Funciones de permisos ----------
create or replace function is_business_owner(b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from businesses where id = b and owner_id = auth.uid());
$$;

create or replace function is_own_professional(p uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from professionals where id = p and user_id = auth.uid());
$$;

create or replace function is_business_member(b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select is_business_owner(b) or exists (
    select 1 from professionals p where p.business_id = b and p.user_id = auth.uid());
$$;

-- ---------- 10. Motor de disponibilidad (SQL) ----------
-- ¿Puede este profesional atender [p_s, p_e) minutos en esa fecha?
-- Equivale a isProfessionalAvailable (AE 46-120). El buffer de los turnos existentes cuenta (decisión).
create or replace function _prof_free(p_business uuid, p_prof uuid, p_location uuid,
                                      p_date date, p_s int, p_e int)
returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_dow int := extract(dow from p_date)::int;
  v_hours record;
  v_win tsrange := tsrange(_ts(p_date, p_s), _ts(p_date, p_e), '[)');
begin
  select ph.start_time, ph.end_time into v_hours
    from professional_hours ph
   where ph.business_id = p_business and ph.professional_id = p_prof and ph.weekday = v_dow;
  if not found then return false; end if;
  if p_s < _min(v_hours.start_time) or p_e > _min(v_hours.end_time) then return false; end if;

  -- Descansos del profesional. PENDIENTE DE DECISIÓN: descansos del negocio (el motor no los verifica).
  if exists (
    select 1 from schedule_breaks sb
     where sb.business_id = p_business and sb.professional_id = p_prof and sb.weekday = v_dow
       and tsrange(_ts(p_date, _min(sb.start_time)), _ts(p_date, _min(sb.end_time)), '[)') && v_win
  ) then return false; end if;

  -- Bloqueos: del profesional o de todo el negocio (el motor ignora la sede)
  if exists (
    select 1 from agenda_blocks ab
     where ab.business_id = p_business and ab.date = p_date
       and (ab.professional_id is null or ab.professional_id = p_prof)
       and ab.busy && v_win
  ) then return false; end if;

  -- Segmentos activos del profesional (busy incluye el buffer)
  if exists (
    select 1 from appointment_segments s
     where s.business_id = p_business and s.professional_id = p_prof
       and s.active and s.date = p_date and s.busy && v_win
  ) then return false; end if;

  -- Traslado entre sedes distintas: 30 minutos fijos. PENDIENTE DE DECISIÓN: location_transit.
  if exists (
    select 1 from appointment_segments s
      join appointments a on a.id = s.appointment_id
     where s.business_id = p_business and s.professional_id = p_prof
       and s.active and s.date = p_date and a.location_id <> p_location
       and tsrange(_ts(p_date, _min(s.start_time) - 30), _ts(p_date, _min(s.end_time) + 30), '[)') && v_win
  ) then return false; end if;

  return true;
end $$;

-- Planifica una secuencia de servicios que empieza en p_start.
-- Equivale a calculateAvailableSlotsForServices (flujo secuencial, AE 235-460)
-- y a verifyAndConfirmBooking (AE 594-665). Devuelve null si no es posible.
-- p_public = true aplica las reglas del cálculo público (cierres, horario del negocio,
-- antelación mínima, servicio en línea y en la sede).
-- p_public = false aplica solo las reglas de profesional (lo que valida el portal del empleado).
create or replace function _plan_sequence(
  p_business uuid, p_location uuid, p_date date, p_start time,
  p_services uuid[], p_pref uuid, p_public boolean
) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_biz businesses%rowtype;
  v_dow int := extract(dow from p_date)::int;
  v_n int := coalesce(array_length(p_services, 1), 0);
  v_start int := _min(p_start);
  v_open int := 0;
  v_close int := 1440;
  v_now_min int;
  v_min_adv int := 0;
  v_hours record;
  v_ptr int;
  v_seg_end int;
  v_i int;
  v_svc services%rowtype;
  v_next uuid;
  v_buffer int := 0;
  v_pref_can boolean;
  v_prof record;
  v_chosen uuid;
  v_chosen_name text;
  v_units jsonb;
  v_unit uuid;
  v_req text;
  v_planned uuid[] := '{}';
  v_segments jsonb := '[]'::jsonb;
begin
  if v_n = 0 then return null; end if;
  select * into v_biz from businesses where id = p_business;
  if not found then return null; end if;
  if not exists (select 1 from locations l
                  where l.business_id = p_business and l.id = p_location and l.is_active) then
    return null;
  end if;

  if p_public then
    if exists (select 1 from business_closures c
                where c.business_id = p_business and c.closed_on = p_date) then
      return null;
    end if;
    select bh.start_time, bh.end_time into v_hours from business_hours bh
     where bh.business_id = p_business and bh.weekday = v_dow;
    if not found then return null; end if;
    v_open := _min(v_hours.start_time);
    v_close := _min(v_hours.end_time);
    if v_start < v_open or v_start >= v_close
       or (v_start - v_open) % v_biz.slot_interval_minutes <> 0 then
      return null;
    end if;
    -- Antelación mínima calculada con la zona horaria del negocio (no la del navegador)
    if (now() at time zone v_biz.timezone)::date = p_date then
      select max(coalesce(nullif(s.min_advance_hours, 0), v_biz.min_advance_notice_hours))
        into v_min_adv
        from services s
       where s.business_id = p_business and s.id = any(p_services);
      v_now_min := _min(((now() at time zone v_biz.timezone))::time);
      if v_start < v_now_min + coalesce(v_min_adv, 0) * 60 then return null; end if;
    end if;
  end if;

  v_ptr := v_start;
  for v_i in 1..v_n loop
    select * into v_svc from services s
     where s.id = p_services[v_i] and s.business_id = p_business and s.is_active;
    if not found then return null; end if;
    if p_public then
      if not v_svc.is_online_booking_enabled then return null; end if;
      -- Filtro de sede del servicio: hoy aplicado en la interfaz (CBF 181-183)
      if not exists (select 1 from service_locations sl
                      where sl.business_id = p_business and sl.service_id = v_svc.id
                        and sl.location_id = p_location) then
        return null;
      end if;
    end if;

    v_seg_end := v_ptr + v_svc.duration_minutes;
    if p_public and v_seg_end > v_close then return null; end if;

    v_next := case when v_i < v_n then p_services[v_i + 1] else null end;
    v_pref_can := p_pref is not null and exists (
      select 1 from professional_services ps
       where ps.business_id = p_business and ps.service_id = v_svc.id
         and ps.professional_id = p_pref);

    v_chosen := null;
    for v_prof in
      select p.id, p.name from professionals p
       where p.business_id = p_business and p.is_active
         and exists (select 1 from professional_services ps
                      where ps.business_id = p_business and ps.service_id = v_svc.id
                        and ps.professional_id = p.id)
         and exists (select 1 from professional_locations pl
                      where pl.business_id = p_business and pl.location_id = p_location
                        and pl.professional_id = p.id)
         and (not v_pref_can or p.id = p_pref)
       order by p.created_at, p.id   -- PENDIENTE DE DECISIÓN: el motor usa el orden del arreglo
    loop
      -- Buffer del servicio nuevo: 0 si el siguiente servicio lo hace el mismo profesional (AE 412-414)
      v_buffer := case when v_next is not null and exists (
                         select 1 from professional_services ps
                          where ps.business_id = p_business and ps.service_id = v_next
                            and ps.professional_id = v_prof.id)
                       then 0 else v_svc.buffer_minutes end;
      if _prof_free(p_business, v_prof.id, p_location, p_date, v_ptr, v_seg_end + v_buffer) then
        v_chosen := v_prof.id;
        v_chosen_name := v_prof.name;
        exit;
      end if;
    end loop;
    if v_chosen is null then return null; end if;

    -- Recursos por tipo, en la misma sede. Ventana = inicio..fin + buffer del servicio (AE 428-438)
    v_units := '[]'::jsonb;
    for v_req in
      select st.resource_type from service_resource_types st
       where st.business_id = p_business and st.service_id = v_svc.id
       order by st.resource_type
    loop
      v_unit := null;
      select u.id into v_unit from resource_units u
       where u.business_id = p_business and u.location_id = p_location
         and u.resource_type = v_req and u.is_active
         and not (u.id = any(v_planned))
         and not exists (
           select 1 from appointment_segment_units su
            where su.unit_id = u.id and su.active
              and su.busy && tsrange(_ts(p_date, v_ptr),
                                     _ts(p_date, v_seg_end + v_svc.buffer_minutes), '[)'))
       order by u.name, u.id
       limit 1;
      -- PENDIENTE DE DECISIÓN: el motor recurre a recursos de otras sedes si la sede no tiene ninguno
      if v_unit is null then return null; end if;
      v_planned := v_planned || v_unit;
      v_units := v_units || jsonb_build_array(v_unit::text);
    end loop;

    v_segments := v_segments || jsonb_build_array(jsonb_build_object(
      'service_id', v_svc.id,
      'service_name', v_svc.name,
      'professional_id', v_chosen,
      'professional_name', v_chosen_name,
      'start', v_ptr,
      'end', v_seg_end,
      'buffer_after', v_buffer,
      'unit_ids', v_units));
    v_ptr := v_seg_end;
  end loop;

  return jsonb_build_object('start', v_start, 'end', v_ptr, 'segments', v_segments);
end $$;

-- ---------- 11. Persistencia (se usa dentro de la transacción de la función que la llama) ----------
create or replace function _insert_segments(p_business uuid, p_appt uuid, p_date date, p_plan jsonb)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_seg jsonb;
  v_seg_id uuid;
  v_unit text;
begin
  for v_seg in select x.value from jsonb_array_elements(p_plan->'segments') as x(value) loop
    insert into appointment_segments (business_id, appointment_id, service_id, professional_id, date,
                                      start_time, end_time, buffer_after_minutes, status, active)
    values (p_business, p_appt,
            (v_seg->>'service_id')::uuid, (v_seg->>'professional_id')::uuid, p_date,
            _hm((v_seg->>'start')::int), _hm((v_seg->>'end')::int),
            (v_seg->>'buffer_after')::int, 'scheduled', true)
    returning id into v_seg_id;

    for v_unit in select x.value #>> '{}' from jsonb_array_elements(v_seg->'unit_ids') as x(value) loop
      insert into appointment_segment_units (business_id, segment_id, unit_id)
      values (p_business, v_seg_id, v_unit::uuid);
    end loop;
  end loop;
end $$;

create or replace function _persist_plan(
  p_business uuid, p_location uuid, p_date date, p_plan jsonb,
  p_name text, p_phone text, p_email text, p_notes text, p_via text
) returns table (out_appointment_id uuid, out_booking_code text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_code text;
  v_try int := 0;
  v_price numeric(12,2);
begin
  select coalesce(sum(s.price), 0) into v_price
    from services s
   where s.business_id = p_business
     and s.id in (select (x.value->>'service_id')::uuid
                    from jsonb_array_elements(p_plan->'segments') as x(value));

  loop
    v_try := v_try + 1;
    v_code := 'MAE-' || (1000 + floor(random() * 9000))::int::text;
    begin
      insert into appointments (business_id, booking_code, location_id, status,
                                customer_name, customer_phone, customer_notes,
                                date, start_time, end_time, estimated_price, created_via)
      values (p_business, v_code, p_location, 'confirmed',
              btrim(p_name), btrim(p_phone), nullif(btrim(coalesce(p_notes, '')), ''),
              p_date, _hm((p_plan->>'start')::int), _hm((p_plan->>'end')::int),
              v_price, p_via)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_try >= 20 then
        raise exception 'No se pudo generar el código de reserva. Intentá nuevamente.' using errcode = 'P0001';
      end if;
    end;
  end loop;

  insert into appointment_private (appointment_id, business_id, customer_email)
  values (v_id, p_business, nullif(btrim(coalesce(p_email, '')), ''));

  perform _insert_segments(p_business, v_id, p_date, p_plan);

  return query select v_id, v_code;
end $$;

-- ---------- 12. Disparadores ----------
-- Un turno cancelado libera sus segmentos (y, por el disparador de unidades, sus recursos)
create or replace function sync_segments_active() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update appointment_segments
     set active = (new.status <> 'cancelled')
   where appointment_id = new.id
     and active is distinct from (new.status <> 'cancelled');
  return new;
end $$;
create trigger appointments_status_to_segments
  after update of status on appointments
  for each row execute function sync_segments_active();

-- Solo la función de reagendado puede cambiar fecha u horario
create or replace function guard_appointment_times() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.date, new.start_time, new.end_time) is distinct from (old.date, old.start_time, old.end_time)
     and coalesce(current_setting('maestro.reschedule', true), '') <> 'on' then
    raise exception 'Para cambiar fecha u horario usá la función de reagendado.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger appointments_guard_times
  before update of date, start_time, end_time on appointments
  for each row execute function guard_appointment_times();

-- Segmento contra bloqueos. Security definer: la comprobación no depende de lo que RLS deje ver al autor.
-- El rango se calcula de forma explícita: las columnas generadas no están disponibles en un BEFORE.
create or replace function check_segment_vs_blocks() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_busy tsrange;
begin
  if not new.active then return new; end if;
  v_busy := tsrange(new.date::timestamp + new.start_time,
                    new.date::timestamp + new.end_time + new.buffer_after_minutes * interval '1 minute',
                    '[)');
  if exists (
    select 1 from agenda_blocks b
     where b.business_id = new.business_id
       and b.busy && v_busy
       and (b.professional_id is null or b.professional_id = new.professional_id)
  ) then
    raise exception 'El horario se superpone con un bloqueo de agenda' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger segments_vs_blocks
  before insert or update on appointment_segments
  for each row execute function check_segment_vs_blocks();

-- Bloqueo nuevo contra segmentos activos. Security definer por el mismo motivo.
create or replace function check_block_vs_segments() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_busy tsrange;
begin
  v_busy := tsrange(new.date::timestamp + new.start_time,
                    new.date::timestamp + new.end_time, '[)');
  if exists (
    select 1 from appointment_segments s
     where s.business_id = new.business_id and s.active and s.busy && v_busy
       and (new.professional_id is null or s.professional_id = new.professional_id)
  ) then
    raise exception 'Ya hay turnos en ese horario' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger blocks_vs_segments
  before insert or update on agenda_blocks
  for each row execute function check_block_vs_segments();

-- Unidades: se completan al insertarse y siguen al segmento
create or replace function fill_segment_unit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select s.active, s.busy into new.active, new.busy
    from appointment_segments s where s.id = new.segment_id;
  return new;
end $$;
create trigger segment_units_fill
  before insert on appointment_segment_units
  for each row execute function fill_segment_unit();

create or replace function sync_segment_units() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update appointment_segment_units
     set active = new.active, busy = new.busy
   where segment_id = new.id;
  return new;
end $$;
create trigger segments_sync_units
  after update of active, date, start_time, end_time, buffer_after_minutes on appointment_segments
  for each row execute function sync_segment_units();

-- ---------- 13. Operaciones públicas ----------

-- Catálogo público: sin horarios de profesionales, descansos, bloqueos ni datos personales
create or replace function public_catalog(p_business uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'business', (select jsonb_build_object(
        'id', b.id, 'name', b.name, 'slug', b.slug, 'mode', b.mode, 'tagline', b.tagline,
        'description', b.description, 'address', b.address, 'phone', b.phone,
        'whatsapp', b.whatsapp, 'email', b.email,
        'pricing_display_mode', b.pricing_display_mode,
        'slot_interval_minutes', b.slot_interval_minutes,
        'min_advance_notice_hours', b.min_advance_notice_hours,
        'max_advance_days', b.max_advance_days)
      from businesses b where b.id = p_business),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object(
        'weekday', h.weekday, 'start', h.start_time, 'end', h.end_time)), '[]'::jsonb)
      from business_hours h where h.business_id = p_business),
    'closures', (select coalesce(jsonb_agg(c.closed_on order by c.closed_on), '[]'::jsonb)
      from business_closures c where c.business_id = p_business and c.closed_on >= current_date - 1),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', l.id, 'name', l.name, 'address', l.address, 'is_main', l.is_main)
        order by l.is_main desc, l.name), '[]'::jsonb)
      from locations l where l.business_id = p_business and l.is_active),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'sort_order', c.sort_order) order by c.sort_order), '[]'::jsonb)
      from service_categories c where c.business_id = p_business),
    'services', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'category_id', s.category_id, 'name', s.name, 'description', s.description,
        'duration_minutes', s.duration_minutes, 'buffer_minutes', s.buffer_minutes,
        'price', s.price, 'price_type', s.price_type,
        'requires_consultation', s.requires_consultation,
        'location_ids', (select coalesce(jsonb_agg(sl.location_id), '[]'::jsonb)
                           from service_locations sl where sl.service_id = s.id),
        'professional_ids', (select coalesce(jsonb_agg(ps.professional_id), '[]'::jsonb)
                               from professional_services ps
                               join professionals p on p.id = ps.professional_id
                              where ps.service_id = s.id and p.is_active))
        order by s.name), '[]'::jsonb)
      from services s
     where s.business_id = p_business and s.is_active and s.is_online_booking_enabled),
    'professionals', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'role', p.role, 'color', p.color,
        'location_ids', (select coalesce(jsonb_agg(pl.location_id), '[]'::jsonb)
                           from professional_locations pl where pl.professional_id = p.id))
        order by p.name), '[]'::jsonb)
      from professionals p where p.business_id = p_business and p.is_active)
  );
$$;

-- Disponibilidad pública: recorre los inicios posibles con la misma regla que la reserva
create or replace function public_availability(
  p_business uuid, p_location uuid, p_date date, p_services uuid[], p_pref uuid default null
) returns table (r_start time, r_end time, r_segments jsonb)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_biz businesses%rowtype;
  v_hours record;
  v_t int;
  v_plan jsonb;
begin
  select * into v_biz from businesses where id = p_business;
  if not found then return; end if;
  select bh.start_time, bh.end_time into v_hours from business_hours bh
   where bh.business_id = p_business and bh.weekday = extract(dow from p_date)::int;
  if not found then return; end if;

  for v_t in _min(v_hours.start_time) .. _min(v_hours.end_time) - 1
             by v_biz.slot_interval_minutes loop
    v_plan := _plan_sequence(p_business, p_location, p_date, _hm(v_t), p_services, p_pref, true);
    if v_plan is not null then
      return query select _hm((v_plan->>'start')::int),
                          _hm((v_plan->>'end')::int),
                          (select coalesce(jsonb_agg(x.value - 'unit_ids' - 'buffer_after'), '[]'::jsonb)
                             from jsonb_array_elements(v_plan->'segments') as x(value));
    end if;
  end loop;
  return;
end $$;

-- Crear una reserva pública (atómica, con bloqueo por negocio)
create or replace function create_public_booking(
  p_business uuid, p_location uuid, p_date date, p_start time, p_services uuid[], p_pref uuid,
  p_name text, p_phone text, p_email text default null, p_notes text default null
) returns table (r_code text, r_date date, r_start time, r_end time)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_norm text := normalize_phone_ar(p_phone);
  v_plan jsonb;
  v_id uuid;
  v_code text;
  v_s int;
  v_e int;
begin
  if btrim(coalesce(p_name, '')) = '' or v_norm = '' then
    raise exception 'Ingresá nombre y teléfono.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business::text, 0));

  v_plan := _plan_sequence(p_business, p_location, p_date, p_start, p_services, p_pref, true);
  if v_plan is null then
    raise exception 'El horario ya no está disponible. Elegí otro.' using errcode = 'P0001';
  end if;
  v_s := (v_plan->>'start')::int;
  v_e := (v_plan->>'end')::int;

  if exists (
    select 1 from appointments a
     where a.business_id = p_business and a.status <> 'cancelled'
       and a.customer_phone_norm = v_norm and a.date = p_date
       and a.during && tsrange(_ts(p_date, v_s), _ts(p_date, v_e), '[)')
  ) then
    raise exception 'Ya posees una cita registrada en este mismo horario.' using errcode = 'P0001';
  end if;

  begin
    select pr.out_appointment_id, pr.out_booking_code into v_id, v_code
      from _persist_plan(p_business, p_location, p_date, v_plan,
                         p_name, p_phone, p_email, p_notes, 'public') pr;
  exception when exclusion_violation then
    raise exception 'El horario ya no está disponible. Elegí otro.' using errcode = 'P0001';
  end;

  return query select v_code, p_date, _hm(v_s), _hm(v_e);
end $$;

-- Consulta de una reserva: código + teléfono. Respuesta vacía y genérica si no coinciden.
create or replace function find_public_booking(p_business uuid, p_code text, p_phone text)
returns table (r_code text, r_status text, r_date date, r_start time, r_end time,
               r_location text, r_total numeric, r_notes text, r_segments jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.booking_code, a.status, a.date, a.start_time, a.end_time, l.name,
         a.estimated_price, a.customer_notes,
         (select jsonb_agg(jsonb_build_object(
                   'service', sv.name, 'professional', pf.name,
                   'start', s.start_time, 'end', s.end_time) order by s.start_time)
            from appointment_segments s
            join services sv on sv.id = s.service_id
            join professionals pf on pf.id = s.professional_id
           where s.appointment_id = a.id)
    from appointments a
    join locations l on l.id = a.location_id
   where a.business_id = p_business
     and upper(a.booking_code) = upper(btrim(p_code))
     and normalize_phone_ar(p_phone) <> ''
     and a.customer_phone_norm = normalize_phone_ar(p_phone);
$$;

-- Cancelación pública (solo reservas confirmadas, como hoy en CustomerSelfService)
create or replace function cancel_public_booking(p_business uuid, p_code text, p_phone text)
returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  a appointments%rowtype;
begin
  select * into a from appointments x
   where x.business_id = p_business
     and upper(x.booking_code) = upper(btrim(p_code))
     and normalize_phone_ar(p_phone) <> ''
     and x.customer_phone_norm = normalize_phone_ar(p_phone)
   for update;
  if not found then
    raise exception 'No encontramos una reserva con ese código y teléfono.' using errcode = 'P0002';
  end if;
  if a.status <> 'confirmed' then
    raise exception 'Esta reserva ya no se puede cancelar.' using errcode = 'P0001';
  end if;
  update appointments set status = 'cancelled', updated_at = now() where id = a.id;
  return a.booking_code;
end $$;

-- Reagendado público: mismos servicios y sede. Si el nuevo horario falla, la reserva original queda intacta.
create or replace function reschedule_public_booking(
  p_business uuid, p_code text, p_phone text, p_date date, p_start time
) returns table (r_code text, r_date date, r_start time, r_end time)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  a appointments%rowtype;
  v_services uuid[];
  v_plan jsonb;
  v_s int;
  v_e int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business::text, 0));

  select * into a from appointments x
   where x.business_id = p_business
     and upper(x.booking_code) = upper(btrim(p_code))
     and normalize_phone_ar(p_phone) <> ''
     and x.customer_phone_norm = normalize_phone_ar(p_phone)
   for update;
  if not found then
    raise exception 'No encontramos una reserva con ese código y teléfono.' using errcode = 'P0002';
  end if;
  if a.status <> 'confirmed' then
    raise exception 'Esta reserva ya no se puede reprogramar.' using errcode = 'P0001';
  end if;

  select array_agg(s.service_id order by s.start_time) into v_services
    from appointment_segments s where s.appointment_id = a.id;

  -- Liberar la ocupación actual para validar el nuevo horario contra el resto
  delete from appointment_segments where appointment_id = a.id;

  v_plan := _plan_sequence(p_business, a.location_id, p_date, p_start, v_services, null, true);
  if v_plan is null then
    raise exception 'El nuevo horario ya no está disponible. Tu reserva original sigue intacta.'
      using errcode = 'P0001';
  end if;
  v_s := (v_plan->>'start')::int;
  v_e := (v_plan->>'end')::int;

  if exists (
    select 1 from appointments o
     where o.business_id = p_business and o.id <> a.id and o.status <> 'cancelled'
       and o.customer_phone_norm = a.customer_phone_norm and o.date = p_date
       and o.during && tsrange(_ts(p_date, v_s), _ts(p_date, v_e), '[)')
  ) then
    raise exception 'Ya posees una cita registrada en este mismo horario.' using errcode = 'P0001';
  end if;

  perform set_config('maestro.reschedule', 'on', true);
  begin
    update appointments
       set date = p_date, start_time = _hm(v_s), end_time = _hm(v_e), updated_at = now()
     where id = a.id;
    perform _insert_segments(p_business, a.id, p_date, v_plan);
  exception when exclusion_violation then
    raise exception 'El nuevo horario ya no está disponible. Tu reserva original sigue intacta.'
      using errcode = 'P0001';
  end;

  return query select a.booking_code, p_date, _hm(v_s), _hm(v_e);
end $$;

-- ---------- 14. Operaciones internas (dueño y empleado) ----------

-- Turno creado por el profesional autenticado (empleado) o por el dueño del negocio
create or replace function create_internal_appointment(
  p_professional uuid, p_location uuid, p_date date, p_start time, p_service uuid,
  p_name text, p_phone text, p_email text default null, p_notes text default null
) returns table (r_code text, r_date date, r_start time, r_end time)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_business uuid;
  v_via text;
  v_norm text := normalize_phone_ar(p_phone);
  v_plan jsonb;
  v_id uuid;
  v_code text;
  v_s int;
  v_e int;
begin
  select pr.business_id into v_business from professionals pr where pr.id = p_professional;
  if v_business is null then
    raise exception 'Profesional no válido.' using errcode = '22023';
  end if;
  if is_own_professional(p_professional) then
    v_via := 'employee';
  elsif is_business_owner(v_business) then
    v_via := 'owner';
  else
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if btrim(coalesce(p_name, '')) = '' or v_norm = '' then
    raise exception 'Ingresá nombre y teléfono.' using errcode = '22023';
  end if;
  if not exists (select 1 from professional_services ps
                  where ps.business_id = v_business and ps.professional_id = p_professional
                    and ps.service_id = p_service) then
    raise exception 'Este servicio no está habilitado para el profesional.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business::text, 0));

  v_plan := _plan_sequence(v_business, p_location, p_date, p_start,
                           array[p_service], p_professional, false);
  if v_plan is null then
    raise exception 'Ese horario no está disponible.' using errcode = 'P0001';
  end if;
  v_s := (v_plan->>'start')::int;
  v_e := (v_plan->>'end')::int;

  if exists (
    select 1 from appointments a
     where a.business_id = v_business and a.status <> 'cancelled'
       and a.customer_phone_norm = v_norm and a.date = p_date
       and a.during && tsrange(_ts(p_date, v_s), _ts(p_date, v_e), '[)')
  ) then
    raise exception 'Ya posees una cita registrada en este mismo horario.' using errcode = 'P0001';
  end if;

  begin
    select pr.out_appointment_id, pr.out_booking_code into v_id, v_code
      from _persist_plan(v_business, p_location, p_date, v_plan,
                         p_name, p_phone, p_email, p_notes, v_via) pr;
  exception when exclusion_violation then
    raise exception 'Ese horario no está disponible.' using errcode = 'P0001';
  end;

  return query select v_code, p_date, _hm(v_s), _hm(v_e);
end $$;

-- Cambio de estado de un segmento por su profesional. Si todos los segmentos están
-- completados, el turno pasa a completed (igual que EmployeePortal 115-116).
create or replace function set_segment_status(p_segment uuid, p_status text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_app uuid;
  v_prof uuid;
  v_all_done boolean;
begin
  select s.professional_id into v_prof from appointment_segments s where s.id = p_segment;
  if v_prof is null or not is_own_professional(v_prof) then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_status not in ('scheduled','in_service','completed') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;

  update appointment_segments set status = p_status
   where id = p_segment
  returning appointment_id into v_app;

  select bool_and(s.status = 'completed') into v_all_done
    from appointment_segments s where s.appointment_id = v_app;
  if v_all_done then
    update appointments set status = 'completed', updated_at = now()
     where id = v_app and status <> 'cancelled';
  end if;
end $$;

-- ---------- 15. RLS ----------
-- Tablas con acceso completo del dueño y lectura de miembros del negocio
do $$
declare t text;
begin
  foreach t in array array[
    'business_hours','business_closures','locations','location_transit','service_categories',
    'services','service_locations','service_resource_types','professionals','professional_locations',
    'professional_services','professional_hours','resource_units','schedule_breaks','agenda_blocks']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all to authenticated
                    using (is_business_owner(business_id))
                    with check (is_business_owner(business_id))', t);
    execute format('create policy member_read on %I for select to authenticated
                    using (is_business_member(business_id))', t);
  end loop;
end $$;

-- Turnos, segmentos y unidades: el dueño completo; el empleado solo lee lo suyo
alter table appointments enable row level security;
create policy owner_all on appointments for all to authenticated
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy employee_read on appointments for select to authenticated
  using (exists (select 1 from appointment_segments s
                  where s.appointment_id = appointments.id and is_own_professional(s.professional_id)));

alter table appointment_segments enable row level security;
create policy owner_all on appointment_segments for all to authenticated
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));
create policy employee_read on appointment_segments for select to authenticated
  using (is_own_professional(professional_id));

alter table appointment_segment_units enable row level security;
create policy owner_all on appointment_segment_units for all to authenticated
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Datos privados: solo el dueño; el empleado no tiene acceso
alter table appointment_private enable row level security;
create policy owner_all on appointment_private for all to authenticated
  using (is_business_owner(business_id)) with check (is_business_owner(business_id));

-- Empleado: crea y elimina solo sus propias pausas
create policy employee_own_breaks on agenda_blocks for all to authenticated
  using (is_own_professional(professional_id))
  with check (is_own_professional(professional_id) and type = 'break');

-- Negocio: el dueño lo gestiona; los miembros lo leen
alter table businesses enable row level security;
create policy owner_business on businesses for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy member_read on businesses for select to authenticated
  using (is_business_member(id));

-- anon no tiene políticas de tabla: todo el acceso público pasa por funciones.

-- ---------- 16. Permisos explícitos ----------
revoke all on all tables in schema public from anon, authenticated;
-- Solo las funciones de Maestro (no todo el esquema public).
revoke execute on function normalize_phone_ar(text) from public;
revoke execute on function _min(time) from public;
revoke execute on function _hm(int) from public;
revoke execute on function _ts(date, int) from public;
revoke execute on function is_business_owner(uuid) from public;
revoke execute on function is_own_professional(uuid) from public;
revoke execute on function is_business_member(uuid) from public;
revoke execute on function _prof_free(uuid, uuid, uuid, date, int, int) from public;
revoke execute on function _plan_sequence(uuid, uuid, date, time, uuid[], uuid, boolean) from public;
revoke execute on function _insert_segments(uuid, uuid, date, jsonb) from public;
revoke execute on function _persist_plan(uuid, uuid, date, jsonb, text, text, text, text, text) from public;
revoke execute on function sync_segments_active() from public;
revoke execute on function guard_appointment_times() from public;
revoke execute on function check_segment_vs_blocks() from public;
revoke execute on function check_block_vs_segments() from public;
revoke execute on function fill_segment_unit() from public;
revoke execute on function sync_segment_units() from public;
revoke execute on function public_catalog(uuid) from public;
revoke execute on function public_availability(uuid, uuid, date, uuid[], uuid) from public;
revoke execute on function create_public_booking(uuid, uuid, date, time, uuid[], uuid, text, text, text, text) from public;
revoke execute on function find_public_booking(uuid, text, text) from public;
revoke execute on function cancel_public_booking(uuid, text, text) from public;
revoke execute on function reschedule_public_booking(uuid, text, text, date, time) from public;
revoke execute on function create_internal_appointment(uuid, uuid, date, time, uuid, text, text, text, text) from public;
revoke execute on function set_segment_status(uuid, text) from public;

grant select, insert, update, delete on all tables in schema public to authenticated;  -- RLS filtra las filas

-- normalize_phone_ar la usa la columna generada en escrituras directas
grant execute on function normalize_phone_ar(text) to anon, authenticated;

grant execute on function is_business_owner(uuid)     to authenticated;
grant execute on function is_own_professional(uuid)   to authenticated;
grant execute on function is_business_member(uuid)    to authenticated;
grant execute on function create_internal_appointment(uuid, uuid, date, time, uuid, text, text, text, text) to authenticated;
grant execute on function set_segment_status(uuid, text) to authenticated;

grant execute on function public_catalog(uuid)                                    to anon, authenticated;
grant execute on function public_availability(uuid, uuid, date, uuid[], uuid)     to anon, authenticated;
grant execute on function create_public_booking(uuid, uuid, date, time, uuid[], uuid, text, text, text, text) to anon, authenticated;
grant execute on function find_public_booking(uuid, text, text)                   to anon, authenticated;
grant execute on function cancel_public_booking(uuid, text, text)                 to anon, authenticated;
grant execute on function reschedule_public_booking(uuid, text, text, date, time) to anon, authenticated;

-- Helpers internos (_plan_sequence, _prof_free, _persist_plan, _insert_segments, _min, _hm, _ts):
-- sin EXECUTE para anon ni authenticated. Solo los llaman las funciones security definer.

commit;
