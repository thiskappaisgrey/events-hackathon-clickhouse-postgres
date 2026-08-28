-- Quest Board — activity log (ClickHouse)
-- Every view, signup response, and quest post gets appended here from the
-- app layer. This is what dormancy detection and affinity ranking query
-- against — Postgres is never read for either.

create table if not exists activity_log
(
    event_time  DateTime64(3) default now64(),
    event_type  Enum8('quest_viewed' = 1, 'quest_posted' = 2, 'signup' = 3),
    user_id     UUID,
    board_id    UUID,
    quest_id    UUID,
    category    LowCardinality(String),
    response    LowCardinality(String) default '' -- 'yes' | 'no' | 'maybe', only set when event_type = 'signup'
)
engine = MergeTree
order by (user_id, event_time);

-- ---------------------------------------------------------------------
-- Dormancy detection: per user, days since last activity on a board.
-- ClickHouse has no cross-db join to Postgres — the app fetches the
-- board's member id list from Postgres first, passes it in as `user_id
-- in (...)`, then feeds the result into the `nudges` table in Postgres.
-- ---------------------------------------------------------------------
-- select
--     user_id,
--     board_id,
--     max(event_time) as last_seen,
--     dateDiff('day', max(event_time), now()) as days_dormant
-- from activity_log
-- where board_id = {board_id: UUID}
-- group by user_id, board_id
-- having days_dormant >= 14;

-- ---------------------------------------------------------------------
-- Affinity ranking: per user, per category, how often a view turns into
-- a 'yes'. Used to rank "likely yeses" when a new quest is posted.
-- ---------------------------------------------------------------------
-- select
--     user_id,
--     category,
--     countIf(event_type = 'signup' and response = 'yes') as yes_count,
--     countIf(event_type = 'quest_viewed') as view_count,
--     yes_count / greatest(view_count, 1) as affinity_score
-- from activity_log
-- group by user_id, category
-- order by affinity_score desc;
