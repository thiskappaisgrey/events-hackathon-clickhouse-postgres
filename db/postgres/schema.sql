-- Quest Board — transactional schema (Postgres)
-- Source of truth for identity, membership, quests, and signups.
-- Every write here also gets appended to the ClickHouse activity log
-- from the app layer (see db/clickhouse/schema.sql) — Postgres is not
-- queried for dormancy/affinity, ClickHouse is.

create extension if not exists pgcrypto; -- gen_random_uuid()

create table users (
    id            uuid primary key default gen_random_uuid(),
    handle        text not null unique,
    display_name  text not null,
    created_at    timestamptz not null default now()
);

-- A board is either a private friend circle or a public interest board
-- (pitch: "join a public board" if you have no friends yet).
create table boards (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    kind        text not null check (kind in ('circle', 'interest', 'public')),
    created_by  uuid not null references users(id),
    created_at  timestamptz not null default now()
);

create table board_members (
    board_id  uuid not null references boards(id) on delete cascade,
    user_id   uuid not null references users(id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (board_id, user_id)
);

-- A quest is a posted event idea ("studying category theory", "new hike").
create table quests (
    id          uuid primary key default gen_random_uuid(),
    board_id    uuid not null references boards(id) on delete cascade,
    author_id   uuid not null references users(id),
    title       text not null,
    description text,
    category    text not null, -- e.g. 'hiking', 'comedy', 'study' — drives affinity ranking
    capacity    int,           -- null = uncapped
    status      text not null default 'open'
                  check (status in ('open', 'locked', 'completed', 'cancelled')),
    created_at  timestamptz not null default now()
);

-- Yes/no/maybe response to a quest.
create table quest_signups (
    quest_id    uuid not null references quests(id) on delete cascade,
    user_id     uuid not null references users(id) on delete cascade,
    response    text not null check (response in ('yes', 'no', 'maybe')),
    responded_at timestamptz not null default now(),
    primary key (quest_id, user_id)
);

-- Moderator queue: who to reach out to and why. Populated by a job that
-- reads dormancy scores out of ClickHouse and inserts a row here for a
-- human to act on (pitch: "a human moderator would come reach out").
create table nudges (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references users(id),
    reason       text not null, -- e.g. 'dormant_14d', 'no_response_streak'
    status       text not null default 'pending'
                   check (status in ('pending', 'contacted', 'dismissed')),
    created_at   timestamptz not null default now(),
    resolved_at  timestamptz
);

create index on board_members (user_id);
create index on quests (board_id, status);
create index on quest_signups (user_id);
create index on nudges (status, created_at);
