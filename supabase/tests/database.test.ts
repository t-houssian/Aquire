import { PGlite } from '@electric-sql/pglite';

// Executes the actual migration and access/concurrency regression checks against
// embedded PostgreSQL. Hosted Auth and the Supabase gateway still require an
// integration test against a local or hosted Supabase project.
Deno.test(
  'PostgreSQL migration, browser access isolation, lobby lifecycle, and version checks',
  async () => {
    const db = new PGlite();
    try {
      await db.exec('create role anon; create role authenticated; create role service_role;');
      const migrations = [];
      for await (const file of Deno.readDir(new URL('../migrations/', import.meta.url))) {
        if (file.isFile && file.name.endsWith('.sql')) migrations.push(file.name);
      }
      for (const filename of migrations.sort()) {
        await db.exec(
          await Deno.readTextFile(new URL(`../migrations/${filename}`, import.meta.url)),
        );
      }
      const checks = await Deno.readTextFile(new URL('./database.sql', import.meta.url));
      await db.exec(checks);
    } finally {
      await db.close();
    }
  },
);

Deno.test(
  '2008 migration preserves historical games and rejects their use by new clients',
  async () => {
    const db = new PGlite();
    try {
      await db.exec('create role anon; create role authenticated; create role service_role;');
      await db.exec(
        await Deno.readTextFile(
          new URL('../migrations/20260917000000_acquire_rooms.sql', import.meta.url),
        ),
      );
      await db.exec(`
      select public.acquire_create_room('00000000-0000-4000-8000-000000000001', 'Legacy host', 'LEG234', 'tycoon');
      select public.acquire_join_room('00000000-0000-4000-8000-000000000002', 'Legacy guest', 'LEG234');
      select public.acquire_commit_room('00000000-0000-4000-8000-000000000001', 'LEG234', 1,
        '{"version":1,"mode":"tycoon","legacy":"must remain intact"}'::jsonb,
        (select players from private.acquire_rooms where code='LEG234'), 'playing');
    `);
      await db.exec(
        await Deno.readTextFile(
          new URL('../migrations/20260917010000_acquire_2008_rules.sql', import.meta.url),
        ),
      );
      for (const migration of ['20260929120000_end_room.sql', '20260929130000_end_room_ruleset_guard.sql']) {
        await db.exec(await Deno.readTextFile(new URL(`../migrations/${migration}`, import.meta.url)));
      }
      await db.exec(`do $$
      declare r private.acquire_rooms;
      begin
        select * into r from private.acquire_rooms where code = 'LEG234';
        if r.ruleset <> '2023' or r.mode <> 'tycoon' or r.version <> 2
          or r.game <> '{"version":1,"mode":"tycoon","legacy":"must remain intact"}'::jsonb then
          raise exception 'Migration changed historical game data';
        end if;
        begin
          perform public.acquire_get_room(r.host_id, r.code);
          raise exception 'Historical game could be loaded';
        exception when others then if sqlerrm <> 'OLD_RULESET' then raise; end if; end;
        begin
          perform public.acquire_join_room(r.host_id, 'Host', r.code);
          raise exception 'Historical game could be rejoined';
        exception when others then if sqlerrm <> 'OLD_RULESET' then raise; end if; end;
        begin
          perform public.acquire_commit_room(r.host_id, r.code, r.version,
            '{"version":2,"ruleset":"2008","mode":"classic"}'::jsonb, r.players, 'playing');
          raise exception 'Historical game could be overwritten';
        exception when others then if sqlerrm <> 'OLD_RULESET' then raise; end if; end;
        begin
          perform public.acquire_end_room(r.host_id, r.code);
          raise exception 'Historical game could be removed';
        exception when others then if sqlerrm <> 'OLD_RULESET' then raise; end if; end;
      end $$;`);
    } finally {
      await db.close();
    }
  },
);
