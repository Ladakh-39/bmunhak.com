drop extension if exists "pg_net";


  create table "public"."board_comments" (
    "id" bigint generated always as identity not null,
    "post_id" bigint not null,
    "author_id" uuid not null,
    "author_display" text,
    "body" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "is_deleted" boolean not null default false,
    "deleted_at" timestamp with time zone,
    "parent_id" bigint
      );


alter table "public"."board_comments" enable row level security;


  create table "public"."board_post_likes" (
    "post_id" bigint not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."board_post_likes" enable row level security;


  create table "public"."board_post_scraps" (
    "post_id" bigint not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."board_post_scraps" enable row level security;


  create table "public"."board_posts" (
    "id" bigint generated always as identity not null,
    "section_slug" text not null,
    "author_id" uuid not null,
    "author_display" text,
    "title" text not null,
    "body" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "view_count" integer not null default 0,
    "like_count" integer not null default 0,
    "comment_count" integer not null default 0,
    "last_commented_at" timestamp with time zone,
    "active_at" timestamp with time zone not null default now(),
    "is_deleted" boolean not null default false,
    "deleted_at" timestamp with time zone
      );


alter table "public"."board_posts" enable row level security;


  create table "public"."board_sections" (
    "slug" text not null,
    "name" text not null,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."board_sections" enable row level security;


  create table "public"."my_memos" (
    "id" bigint generated always as identity not null,
    "user_id" uuid not null,
    "title" text not null default ''::text,
    "body" text not null default ''::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."my_memos" enable row level security;


  create table "public"."profiles" (
    "user_id" uuid not null,
    "nickname" text,
    "avatar_path" text,
    "role" text default 'user'::text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."profiles" enable row level security;


  create table "public"."room_access_grants" (
    "user_id" uuid not null,
    "is_active" boolean not null default true,
    "reason" text,
    "granted_by" uuid,
    "granted_at" timestamp with time zone not null default now()
      );


alter table "public"."room_access_grants" enable row level security;

CREATE UNIQUE INDEX board_comments_pkey ON public.board_comments USING btree (id);

CREATE UNIQUE INDEX board_post_likes_pkey ON public.board_post_likes USING btree (post_id, user_id);

CREATE UNIQUE INDEX board_post_scraps_pkey ON public.board_post_scraps USING btree (post_id, user_id);

CREATE UNIQUE INDEX board_posts_pkey ON public.board_posts USING btree (id);

CREATE UNIQUE INDEX board_sections_pkey ON public.board_sections USING btree (slug);

CREATE INDEX idx_board_comments_author ON public.board_comments USING btree (author_id);

CREATE INDEX idx_board_comments_is_deleted ON public.board_comments USING btree (is_deleted);

CREATE INDEX idx_board_comments_parent_id ON public.board_comments USING btree (parent_id);

CREATE INDEX idx_board_comments_post_created ON public.board_comments USING btree (post_id, created_at);

CREATE INDEX idx_board_post_likes_user ON public.board_post_likes USING btree (user_id);

CREATE INDEX idx_board_post_scraps_user ON public.board_post_scraps USING btree (user_id);

CREATE INDEX idx_board_posts_author ON public.board_posts USING btree (author_id);

CREATE INDEX idx_board_posts_author_display_lc ON public.board_posts USING btree (lower(author_display));

CREATE INDEX idx_board_posts_created ON public.board_posts USING btree (created_at DESC);

CREATE INDEX idx_board_posts_is_deleted ON public.board_posts USING btree (is_deleted);

CREATE INDEX idx_board_posts_section_active ON public.board_posts USING btree (section_slug, active_at DESC);

CREATE INDEX idx_board_posts_title_lc ON public.board_posts USING btree (lower(title));

CREATE INDEX idx_my_memos_user_created ON public.my_memos USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX my_memos_pkey ON public.my_memos USING btree (id);

CREATE UNIQUE INDEX profiles_nickname_lower_unique ON public.profiles USING btree (lower(nickname)) WHERE ((nickname IS NOT NULL) AND (nickname <> ''::text));

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (user_id);

CREATE UNIQUE INDEX room_access_grants_pkey ON public.room_access_grants USING btree (user_id);

alter table "public"."board_comments" add constraint "board_comments_pkey" PRIMARY KEY using index "board_comments_pkey";

alter table "public"."board_post_likes" add constraint "board_post_likes_pkey" PRIMARY KEY using index "board_post_likes_pkey";

alter table "public"."board_post_scraps" add constraint "board_post_scraps_pkey" PRIMARY KEY using index "board_post_scraps_pkey";

alter table "public"."board_posts" add constraint "board_posts_pkey" PRIMARY KEY using index "board_posts_pkey";

alter table "public"."board_sections" add constraint "board_sections_pkey" PRIMARY KEY using index "board_sections_pkey";

alter table "public"."my_memos" add constraint "my_memos_pkey" PRIMARY KEY using index "my_memos_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."room_access_grants" add constraint "room_access_grants_pkey" PRIMARY KEY using index "room_access_grants_pkey";

alter table "public"."board_comments" add constraint "board_comments_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."board_comments" validate constraint "board_comments_author_id_fkey";

alter table "public"."board_comments" add constraint "board_comments_body_check" CHECK ((char_length(body) >= 1)) not valid;

alter table "public"."board_comments" validate constraint "board_comments_body_check";

alter table "public"."board_comments" add constraint "board_comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.board_comments(id) ON DELETE SET NULL not valid;

alter table "public"."board_comments" validate constraint "board_comments_parent_id_fkey";

alter table "public"."board_comments" add constraint "board_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.board_posts(id) ON DELETE CASCADE not valid;

alter table "public"."board_comments" validate constraint "board_comments_post_id_fkey";

alter table "public"."board_post_likes" add constraint "board_post_likes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.board_posts(id) ON DELETE CASCADE not valid;

alter table "public"."board_post_likes" validate constraint "board_post_likes_post_id_fkey";

alter table "public"."board_post_likes" add constraint "board_post_likes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."board_post_likes" validate constraint "board_post_likes_user_id_fkey";

alter table "public"."board_post_scraps" add constraint "board_post_scraps_post_id_fkey" FOREIGN KEY (post_id) REFERENCES public.board_posts(id) ON DELETE CASCADE not valid;

alter table "public"."board_post_scraps" validate constraint "board_post_scraps_post_id_fkey";

alter table "public"."board_post_scraps" add constraint "board_post_scraps_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."board_post_scraps" validate constraint "board_post_scraps_user_id_fkey";

alter table "public"."board_posts" add constraint "board_posts_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE RESTRICT not valid;

alter table "public"."board_posts" validate constraint "board_posts_author_id_fkey";

alter table "public"."board_posts" add constraint "board_posts_body_check" CHECK ((char_length(body) >= 1)) not valid;

alter table "public"."board_posts" validate constraint "board_posts_body_check";

alter table "public"."board_posts" add constraint "board_posts_section_slug_fkey" FOREIGN KEY (section_slug) REFERENCES public.board_sections(slug) ON UPDATE CASCADE not valid;

alter table "public"."board_posts" validate constraint "board_posts_section_slug_fkey";

alter table "public"."board_posts" add constraint "board_posts_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120))) not valid;

alter table "public"."board_posts" validate constraint "board_posts_title_check";

alter table "public"."my_memos" add constraint "my_memos_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."my_memos" validate constraint "my_memos_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_user_id_fkey";

alter table "public"."room_access_grants" add constraint "room_access_grants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."room_access_grants" validate constraint "room_access_grants_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.board_increment_view(p_post_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.board_posts
  set view_count = view_count + 1
  where id = p_post_id
    and is_deleted = false;
end $function$
;

create or replace view "public"."board_posts_active" as  SELECT bp.id,
    bp.section_slug,
    bp.author_id,
    bp.author_display,
    bp.title,
    bp.body,
    bp.created_at,
    bp.updated_at,
    bp.view_count,
    bp.like_count,
    bp.comment_count,
    bp.last_commented_at,
    bp.active_at,
    bp.is_deleted,
    bp.deleted_at,
    seq.board_seq
   FROM (public.board_posts bp
     JOIN ( SELECT board_posts.id,
            row_number() OVER (PARTITION BY board_posts.section_slug ORDER BY board_posts.created_at, board_posts.id) AS board_seq
           FROM public.board_posts) seq ON ((seq.id = bp.id)))
  WHERE (bp.is_deleted = false);


CREATE OR REPLACE FUNCTION public.board_recalc_post_comment_stats(p_post_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cnt int;
  v_last timestamptz;
begin
  select count(*), max(created_at)
    into v_cnt, v_last
  from public.board_comments
  where post_id = p_post_id
    and is_deleted = false;

  update public.board_posts
  set comment_count = coalesce(v_cnt, 0),
      last_commented_at = v_last,
      active_at = coalesce(v_last, created_at),
      updated_at = now()
  where id = p_post_id
    and is_deleted = false;
end $function$
;

CREATE OR REPLACE FUNCTION public.can_access_room_board()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    auth.uid() is not null
    and (
      exists (
        select 1
        from public.room_access_grants g
        where g.user_id = auth.uid()
          and g.is_active = true
      )
      or coalesce(public.is_board_admin(auth.uid()), false)
    );
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_room_daily_post_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      kst_day_start timestamptz;
      kst_day_end timestamptz;
      today_count bigint;
    BEGIN
      IF NEW.section_slug IS DISTINCT FROM 'room' THEN
        RETURN NEW;
      END IF;
      IF NEW.author_id IS NULL THEN
        RETURN NEW;
      END IF;
      IF coalesce(NEW.is_deleted, false) = true THEN
        RETURN NEW;
      END IF;

      kst_day_start := date_trunc('day', timezone('Asia/Seoul', now())) AT TIME ZONE 'Asia/Seoul';
      kst_day_end := kst_day_start + interval '1 day';

      SELECT count(*)
      INTO today_count
      FROM public.board_posts AS bp
      WHERE bp.section_slug = 'room'
        AND bp.author_id = NEW.author_id
        AND coalesce(bp.is_deleted, false) = false
        AND bp.created_at >= kst_day_start
        AND bp.created_at < kst_day_end;

      IF today_count >= 5 THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'room_daily_limit_exceeded',
          DETAIL = 'room posts are limited to 5 per day (Asia/Seoul)';
      END IF;

      RETURN NEW;
    END;
    $function$
;

CREATE OR REPLACE FUNCTION public.get_post_comments_secure(p_post_id bigint)
 RETURNS TABLE(id bigint, post_id bigint, body text, created_at timestamp with time zone, parent_id bigint, image_path text, like_count integer, author_display text, nickname text, avatar_path text, can_delete boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_section_slug text;
begin
  select p.section_slug
    into v_section_slug
  from public.board_posts p
  where p.id = p_post_id
    and p.is_deleted = false
  limit 1;

  if v_section_slug is null then
    return;
  end if;

  if v_section_slug = 'room' and not public.can_access_room_board() then
    raise exception 'ROOM_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.post_id,
    c.body,
    c.created_at,
    nullif((to_jsonb(c)->>'parent_id'), '')::bigint as parent_id,
    nullif((to_jsonb(c)->>'image_path'), '')::text as image_path,
    coalesce(nullif((to_jsonb(c)->>'like_count'), '')::integer, 0) as like_count,
    coalesce(c.author_display, '') as author_display,
    coalesce(pr.nickname, '') as nickname,
    coalesce(pr.avatar_path, '') as avatar_path,
    (
      auth.uid() is not null
      and (
        c.author_id = auth.uid()
        or coalesce(public.is_board_admin(auth.uid()), false)
      )
    ) as can_delete
  from public.board_comments c
  left join public.profiles pr
    on pr.user_id = c.author_id
  where c.post_id = p_post_id
    and c.is_deleted = false
  order by c.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_room_threads_secure(p_limit integer DEFAULT 20)
 RETURNS TABLE(id bigint, section_slug text, author_id uuid, author_display text, title text, body text, created_at timestamp with time zone, like_count integer, comment_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_access_room_board() then
    raise exception 'ROOM_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.section_slug,
    p.author_id,
    p.author_display,
    p.title,
    p.body,
    p.created_at,
    coalesce(nullif((to_jsonb(p)->>'like_count'), '')::integer, 0) as like_count,
    coalesce(nullif((to_jsonb(p)->>'comment_count'), '')::integer, 0) as comment_count
  from public.board_posts p
  where p.section_slug = 'room'
    and p.is_deleted = false
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_board_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select false;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_board_comments_recalc()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'DELETE') then
    perform public.board_recalc_post_comment_stats(old.post_id);
    return old;
  else
    perform public.board_recalc_post_comment_stats(new.post_id);
    return new;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_board_likes_counter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT') then
    update public.board_posts
    set like_count = like_count + 1,
        updated_at = now()
    where id = new.post_id
      and is_deleted = false;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.board_posts
    set like_count = greatest(like_count - 1, 0),
        updated_at = now()
    where id = old.post_id
      and is_deleted = false;
    return old;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;

grant delete on table "public"."board_comments" to "anon";

grant insert on table "public"."board_comments" to "anon";

grant references on table "public"."board_comments" to "anon";

grant select on table "public"."board_comments" to "anon";

grant trigger on table "public"."board_comments" to "anon";

grant truncate on table "public"."board_comments" to "anon";

grant update on table "public"."board_comments" to "anon";

grant delete on table "public"."board_comments" to "authenticated";

grant insert on table "public"."board_comments" to "authenticated";

grant references on table "public"."board_comments" to "authenticated";

grant select on table "public"."board_comments" to "authenticated";

grant trigger on table "public"."board_comments" to "authenticated";

grant truncate on table "public"."board_comments" to "authenticated";

grant update on table "public"."board_comments" to "authenticated";

grant delete on table "public"."board_comments" to "service_role";

grant insert on table "public"."board_comments" to "service_role";

grant references on table "public"."board_comments" to "service_role";

grant select on table "public"."board_comments" to "service_role";

grant trigger on table "public"."board_comments" to "service_role";

grant truncate on table "public"."board_comments" to "service_role";

grant update on table "public"."board_comments" to "service_role";

grant delete on table "public"."board_post_likes" to "anon";

grant insert on table "public"."board_post_likes" to "anon";

grant references on table "public"."board_post_likes" to "anon";

grant select on table "public"."board_post_likes" to "anon";

grant trigger on table "public"."board_post_likes" to "anon";

grant truncate on table "public"."board_post_likes" to "anon";

grant update on table "public"."board_post_likes" to "anon";

grant delete on table "public"."board_post_likes" to "authenticated";

grant insert on table "public"."board_post_likes" to "authenticated";

grant references on table "public"."board_post_likes" to "authenticated";

grant select on table "public"."board_post_likes" to "authenticated";

grant trigger on table "public"."board_post_likes" to "authenticated";

grant truncate on table "public"."board_post_likes" to "authenticated";

grant update on table "public"."board_post_likes" to "authenticated";

grant delete on table "public"."board_post_likes" to "service_role";

grant insert on table "public"."board_post_likes" to "service_role";

grant references on table "public"."board_post_likes" to "service_role";

grant select on table "public"."board_post_likes" to "service_role";

grant trigger on table "public"."board_post_likes" to "service_role";

grant truncate on table "public"."board_post_likes" to "service_role";

grant update on table "public"."board_post_likes" to "service_role";

grant delete on table "public"."board_post_scraps" to "anon";

grant insert on table "public"."board_post_scraps" to "anon";

grant references on table "public"."board_post_scraps" to "anon";

grant select on table "public"."board_post_scraps" to "anon";

grant trigger on table "public"."board_post_scraps" to "anon";

grant truncate on table "public"."board_post_scraps" to "anon";

grant update on table "public"."board_post_scraps" to "anon";

grant delete on table "public"."board_post_scraps" to "authenticated";

grant insert on table "public"."board_post_scraps" to "authenticated";

grant references on table "public"."board_post_scraps" to "authenticated";

grant select on table "public"."board_post_scraps" to "authenticated";

grant trigger on table "public"."board_post_scraps" to "authenticated";

grant truncate on table "public"."board_post_scraps" to "authenticated";

grant update on table "public"."board_post_scraps" to "authenticated";

grant delete on table "public"."board_post_scraps" to "service_role";

grant insert on table "public"."board_post_scraps" to "service_role";

grant references on table "public"."board_post_scraps" to "service_role";

grant select on table "public"."board_post_scraps" to "service_role";

grant trigger on table "public"."board_post_scraps" to "service_role";

grant truncate on table "public"."board_post_scraps" to "service_role";

grant update on table "public"."board_post_scraps" to "service_role";

grant delete on table "public"."board_posts" to "anon";

grant insert on table "public"."board_posts" to "anon";

grant references on table "public"."board_posts" to "anon";

grant select on table "public"."board_posts" to "anon";

grant trigger on table "public"."board_posts" to "anon";

grant truncate on table "public"."board_posts" to "anon";

grant update on table "public"."board_posts" to "anon";

grant delete on table "public"."board_posts" to "authenticated";

grant insert on table "public"."board_posts" to "authenticated";

grant references on table "public"."board_posts" to "authenticated";

grant select on table "public"."board_posts" to "authenticated";

grant trigger on table "public"."board_posts" to "authenticated";

grant truncate on table "public"."board_posts" to "authenticated";

grant update on table "public"."board_posts" to "authenticated";

grant delete on table "public"."board_posts" to "service_role";

grant insert on table "public"."board_posts" to "service_role";

grant references on table "public"."board_posts" to "service_role";

grant select on table "public"."board_posts" to "service_role";

grant trigger on table "public"."board_posts" to "service_role";

grant truncate on table "public"."board_posts" to "service_role";

grant update on table "public"."board_posts" to "service_role";

grant delete on table "public"."board_sections" to "anon";

grant insert on table "public"."board_sections" to "anon";

grant references on table "public"."board_sections" to "anon";

grant select on table "public"."board_sections" to "anon";

grant trigger on table "public"."board_sections" to "anon";

grant truncate on table "public"."board_sections" to "anon";

grant update on table "public"."board_sections" to "anon";

grant delete on table "public"."board_sections" to "authenticated";

grant insert on table "public"."board_sections" to "authenticated";

grant references on table "public"."board_sections" to "authenticated";

grant select on table "public"."board_sections" to "authenticated";

grant trigger on table "public"."board_sections" to "authenticated";

grant truncate on table "public"."board_sections" to "authenticated";

grant update on table "public"."board_sections" to "authenticated";

grant delete on table "public"."board_sections" to "service_role";

grant insert on table "public"."board_sections" to "service_role";

grant references on table "public"."board_sections" to "service_role";

grant select on table "public"."board_sections" to "service_role";

grant trigger on table "public"."board_sections" to "service_role";

grant truncate on table "public"."board_sections" to "service_role";

grant update on table "public"."board_sections" to "service_role";

grant delete on table "public"."my_memos" to "anon";

grant insert on table "public"."my_memos" to "anon";

grant references on table "public"."my_memos" to "anon";

grant select on table "public"."my_memos" to "anon";

grant trigger on table "public"."my_memos" to "anon";

grant truncate on table "public"."my_memos" to "anon";

grant update on table "public"."my_memos" to "anon";

grant delete on table "public"."my_memos" to "authenticated";

grant insert on table "public"."my_memos" to "authenticated";

grant references on table "public"."my_memos" to "authenticated";

grant select on table "public"."my_memos" to "authenticated";

grant trigger on table "public"."my_memos" to "authenticated";

grant truncate on table "public"."my_memos" to "authenticated";

grant update on table "public"."my_memos" to "authenticated";

grant delete on table "public"."my_memos" to "service_role";

grant insert on table "public"."my_memos" to "service_role";

grant references on table "public"."my_memos" to "service_role";

grant select on table "public"."my_memos" to "service_role";

grant trigger on table "public"."my_memos" to "service_role";

grant truncate on table "public"."my_memos" to "service_role";

grant update on table "public"."my_memos" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."room_access_grants" to "anon";

grant insert on table "public"."room_access_grants" to "anon";

grant references on table "public"."room_access_grants" to "anon";

grant select on table "public"."room_access_grants" to "anon";

grant trigger on table "public"."room_access_grants" to "anon";

grant truncate on table "public"."room_access_grants" to "anon";

grant update on table "public"."room_access_grants" to "anon";

grant delete on table "public"."room_access_grants" to "authenticated";

grant insert on table "public"."room_access_grants" to "authenticated";

grant references on table "public"."room_access_grants" to "authenticated";

grant select on table "public"."room_access_grants" to "authenticated";

grant trigger on table "public"."room_access_grants" to "authenticated";

grant truncate on table "public"."room_access_grants" to "authenticated";

grant update on table "public"."room_access_grants" to "authenticated";

grant delete on table "public"."room_access_grants" to "service_role";

grant insert on table "public"."room_access_grants" to "service_role";

grant references on table "public"."room_access_grants" to "service_role";

grant select on table "public"."room_access_grants" to "service_role";

grant trigger on table "public"."room_access_grants" to "service_role";

grant truncate on table "public"."room_access_grants" to "service_role";

grant update on table "public"."room_access_grants" to "service_role";


  create policy "board_comments_select_non_room_public"
  on "public"."board_comments"
  as permissive
  for select
  to public
using (((is_deleted = false) AND (EXISTS ( SELECT 1
   FROM public.board_posts p
  WHERE ((p.id = board_comments.post_id) AND (p.is_deleted = false) AND (p.section_slug <> 'room'::text))))));



  create policy "board_comments_select_room_guarded"
  on "public"."board_comments"
  as permissive
  for select
  to public
using (((is_deleted = false) AND (EXISTS ( SELECT 1
   FROM public.board_posts p
  WHERE ((p.id = board_comments.post_id) AND (p.is_deleted = false) AND (p.section_slug = 'room'::text)))) AND public.can_access_room_board()));



  create policy "comments_insert_owner"
  on "public"."board_comments"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = author_id));



  create policy "comments_update_owner"
  on "public"."board_comments"
  as permissive
  for update
  to authenticated
using ((auth.uid() = author_id))
with check ((auth.uid() = author_id));



  create policy "likes_delete_own"
  on "public"."board_post_likes"
  as permissive
  for delete
  to authenticated
using ((auth.uid() = user_id));



  create policy "likes_insert_own"
  on "public"."board_post_likes"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "likes_select_own"
  on "public"."board_post_likes"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "scraps_delete_own"
  on "public"."board_post_scraps"
  as permissive
  for delete
  to authenticated
using ((auth.uid() = user_id));



  create policy "scraps_insert_own"
  on "public"."board_post_scraps"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "scraps_select_own"
  on "public"."board_post_scraps"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "board_posts_select_non_room_public"
  on "public"."board_posts"
  as permissive
  for select
  to public
using (((is_deleted = false) AND (section_slug <> 'room'::text)));



  create policy "board_posts_select_room_guarded"
  on "public"."board_posts"
  as permissive
  for select
  to public
using (((is_deleted = false) AND (section_slug = 'room'::text) AND public.can_access_room_board()));



  create policy "posts_insert_owner"
  on "public"."board_posts"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = author_id));



  create policy "posts_update_owner"
  on "public"."board_posts"
  as permissive
  for update
  to authenticated
using ((auth.uid() = author_id))
with check ((auth.uid() = author_id));



  create policy "sections_select_all"
  on "public"."board_sections"
  as permissive
  for select
  to public
using (true);



  create policy "memos_delete_own"
  on "public"."my_memos"
  as permissive
  for delete
  to authenticated
using ((auth.uid() = user_id));



  create policy "memos_insert_own"
  on "public"."my_memos"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "memos_select_own"
  on "public"."my_memos"
  as permissive
  for select
  to authenticated
using ((auth.uid() = user_id));



  create policy "memos_update_own"
  on "public"."my_memos"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "profiles_insert_own"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "profiles_select_all"
  on "public"."profiles"
  as permissive
  for select
  to public
using (true);



  create policy "profiles_update_own"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "room_access_grants_select_own"
  on "public"."room_access_grants"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));


CREATE TRIGGER trg_comments_recalc_del AFTER DELETE ON public.board_comments FOR EACH ROW EXECUTE FUNCTION public.tg_board_comments_recalc();

CREATE TRIGGER trg_comments_recalc_ins AFTER INSERT ON public.board_comments FOR EACH ROW EXECUTE FUNCTION public.tg_board_comments_recalc();

CREATE TRIGGER trg_comments_recalc_upd AFTER UPDATE ON public.board_comments FOR EACH ROW EXECUTE FUNCTION public.tg_board_comments_recalc();

CREATE TRIGGER trg_comments_updated_at BEFORE UPDATE ON public.board_comments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_likes_counter_del AFTER DELETE ON public.board_post_likes FOR EACH ROW EXECUTE FUNCTION public.tg_board_likes_counter();

CREATE TRIGGER trg_likes_counter_ins AFTER INSERT ON public.board_post_likes FOR EACH ROW EXECUTE FUNCTION public.tg_board_likes_counter();

CREATE TRIGGER trg_board_posts_room_daily_limit BEFORE INSERT ON public.board_posts FOR EACH ROW EXECUTE FUNCTION public.enforce_room_daily_post_limit();

CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON public.board_posts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_memos_updated_at BEFORE UPDATE ON public.my_memos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


