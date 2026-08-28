pgdata := justfile_directory() / ".data/postgres"
chdata := justfile_directory() / ".data/clickhouse"
chpid := justfile_directory() / ".clickhouse.pid"

# start postgres and clickhouse
up: pg-up ch-up

# stop postgres and clickhouse
down: pg-down ch-down

# start postgres, initializing it on first run
pg-up:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{pgdata}}"
    if [ ! -f "{{pgdata}}/PG_VERSION" ]; then
        echo "initializing postgres..."
        initdb -D "{{pgdata}}" -U hackathon --auth=trust >/dev/null
        pg_ctl -D "{{pgdata}}" -l "{{pgdata}}/log.txt" -o "-k /tmp -p 5432" start
        createdb -h /tmp -U hackathon board
    else
        pg_ctl -D "{{pgdata}}" -l "{{pgdata}}/log.txt" -o "-k /tmp -p 5432" start
    fi
    echo "postgres: /tmp:5432 (user hackathon, db board)"

# stop postgres
pg-down:
    pg_ctl -D "{{pgdata}}" stop

# open a psql shell to the postgres db
psql:
    psql -h /tmp -p 5432 -U hackathon -d board

# start clickhouse in the background
ch-up:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{chdata}}"
    clickhouse server -- --path="{{chdata}}" --http_port=8123 --tcp_port=9000 &
    echo $! > "{{chpid}}"
    echo "clickhouse: http 8123 / tcp 9000"

# stop clickhouse
ch-down:
    kill $(cat "{{chpid}}")
    rm -f "{{chpid}}"

# show postgres and clickhouse status
status:
    pg_ctl -D "{{pgdata}}" status || true
    @if [ -f "{{chpid}}" ]; then \
        kill -0 $(cat "{{chpid}}") 2>/dev/null && echo "clickhouse: running (pid $(cat {{chpid}}))" || echo "clickhouse: not running (stale pidfile)"; \
    else \
        echo "clickhouse: not running"; \
    fi
