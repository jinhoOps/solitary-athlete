package collector

import (
	"context"
	"encoding/json"
	"errors"
	"math/rand/v2"
	"net/url"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrLease = errors.New("collector lease lost")
var ErrMode = errors.New("collector writer mode is not go")
var ErrDatabase = errors.New("database unavailable")

type Store struct {
	config *pgx.ConnConfig
	mu     sync.Mutex
}

func NewStore(databaseURL string, testOnlyAllowInsecure bool) (*Store, error) {
	cfg, err := pgx.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("invalid database configuration")
	}
	if !testOnlyAllowInsecure {
		u, err := url.Parse(databaseURL)
		if err != nil || u.Query().Get("sslmode") != "verify-full" || cfg.TLSConfig == nil || cfg.TLSConfig.InsecureSkipVerify {
			return nil, errors.New("database requires sslmode=verify-full")
		}
	}
	cfg.DefaultQueryExecMode = pgx.QueryExecModeExec
	cfg.ConnectTimeout = 3 * time.Second
	cfg.RuntimeParams["application_name"] = "mukmuk-go-collector"
	return &Store{config: cfg}, nil
}

// Each operation closes its physical connection before any Discord HTTP call.
func (s *Store) transaction(ctx context.Context, work func(pgx.Tx) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	acquireCtx, cancelAcquire := context.WithTimeout(ctx, 2500*time.Millisecond)
	defer cancelAcquire()
	var c *pgx.Conn
	var err error
	for attempt := 0; attempt < 5; attempt++ {
		c, err = pgx.ConnectConfig(acquireCtx, s.config.Copy())
		if err == nil {
			break
		}
		var problem *pgconn.PgError
		if !errors.As(err, &problem) || problem.Code != "53300" || attempt == 4 {
			return ErrDatabase
		}
		delay := time.Duration(100*(1<<attempt)+rand.IntN(50)) * time.Millisecond
		if sleep(acquireCtx, delay) != nil {
			return ErrDatabase
		}
	}
	if err != nil {
		return ErrDatabase
	}
	defer c.Close(context.Background())
	tx, err := c.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(ctx, "SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'"); err != nil {
		return err
	}
	if err = work(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func channelLock(ctx context.Context, tx pgx.Tx, channel string) error {
	var acquired bool
	if err := tx.QueryRow(ctx, "SELECT pg_try_advisory_xact_lock(hashtext('solitary_athlete.sync'),hashtext($1))", channel).Scan(&acquired); err != nil {
		return err
	}
	if !acquired {
		return errors.New("python collector is running")
	}
	return nil
}
func workoutLock(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'))")
	return err
}
func guard(ctx context.Context, tx pgx.Tx, owner string, fence int64) error {
	var ok int
	err := tx.QueryRow(ctx, `UPDATE solitary_athlete.mukmuk_collector_control SET lease_until=clock_timestamp()+interval '30 seconds' WHERE singleton AND writer_mode='go' AND owner_id=$1::uuid AND fence=$2 AND lease_until>clock_timestamp() RETURNING 1`, owner, fence).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrLease
	}
	return err
}
func (s *Store) Claim(ctx context.Context, owner string) (int64, error) {
	var fence int64
	err := s.transaction(ctx, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `UPDATE solitary_athlete.mukmuk_collector_control SET owner_id=$1::uuid,fence=fence+1,lease_until=clock_timestamp()+interval '30 seconds' WHERE singleton AND writer_mode='go' AND lease_until<=clock_timestamp() RETURNING fence`, owner).Scan(&fence); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collection_runs SET status='failed' WHERE status='running' AND fence<$1`, fence)
		return err
	})
	if errors.Is(err, pgx.ErrNoRows) {
		var mode string
		check := s.transaction(ctx, func(tx pgx.Tx) error {
			return tx.QueryRow(ctx, `SELECT writer_mode FROM solitary_athlete.mukmuk_collector_control WHERE singleton`).Scan(&mode)
		})
		if check != nil {
			return 0, check
		}
		if mode != "go" {
			return 0, ErrMode
		}
		return 0, ErrLease
	}
	return fence, err
}
func (s *Store) Renew(ctx context.Context, owner string, fence int64) error {
	return s.transaction(ctx, func(tx pgx.Tx) error { return guard(ctx, tx, owner, fence) })
}
func (s *Store) Release(ctx context.Context, owner string, fence int64) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collector_control SET owner_id=NULL,lease_until=clock_timestamp() WHERE singleton AND owner_id=$1::uuid AND fence=$2`, owner, fence)
		return err
	})
}
func (s *Store) StartRun(ctx context.Context, owner string, fence int64, run string) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO solitary_athlete.mukmuk_collection_runs(id,fence,status) VALUES($1::uuid,$2,'running')`, run, fence)
		return err
	})
}
func (s *Store) Cursor(ctx context.Context, owner string, fence int64, channel string) (string, error) {
	var cursor *string
	err := s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		err := tx.QueryRow(ctx, `SELECT last_message_id FROM solitary_athlete.sync_state WHERE channel_id=$1`, channel).Scan(&cursor)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	})
	if cursor == nil {
		return "", err
	}
	return *cursor, err
}
func recalc(ctx context.Context, tx pgx.Tx, user string, date time.Time) error {
	if _, err := tx.Exec(ctx, `DELETE FROM solitary_athlete.workout_logs WHERE user_id=$1 AND log_date=$2`, user, date); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO solitary_athlete.workout_logs(user_id,log_date,username,memo,verification_count,has_photo)
 SELECT user_id,log_date,(array_agg(username ORDER BY created_at DESC,message_id::numeric DESC))[1],
 string_agg(CASE WHEN memo='' THEN '사진 인증' ELSE memo END,E'\n' ORDER BY created_at,message_id::numeric),
 count(*)::integer,bool_or(has_photo) FROM solitary_athlete.workout_events WHERE user_id=$1 AND log_date=$2 GROUP BY user_id,log_date`, user, date)
	return err
}
func (s *Store) SaveNew(ctx context.Context, owner string, fence int64, e *Event) error {
	if e == nil {
		return nil
	}
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := channelLock(ctx, tx, e.ChannelID); err != nil {
			return err
		}
		if err := workoutLock(ctx, tx); err != nil {
			return err
		}
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		attachments, err := json.Marshal(e.Attachments)
		if err != nil {
			return err
		}
		var user string
		var date time.Time
		err = tx.QueryRow(ctx, `INSERT INTO solitary_athlete.workout_events(message_id,guild_id,channel_id,user_id,username,created_at,edited_at,memo,has_photo,attachments)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(message_id) DO NOTHING RETURNING user_id,log_date`, e.MessageID, e.GuildID, e.ChannelID, e.UserID, e.Username, e.CreatedAt, e.EditedAt, e.Memo, e.HasPhoto, string(attachments)).Scan(&user, &date)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		return recalc(ctx, tx, user, date)
	})
}
func (s *Store) Finish(ctx context.Context, owner string, fence int64, run, channel, ceiling string, count int) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := channelLock(ctx, tx, channel); err != nil {
			return err
		}
		if err := workoutLock(ctx, tx); err != nil {
			return err
		}
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		var now time.Time
		if err := tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
			return err
		}
		result, err := tx.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collection_runs SET status='completed',completed_at=$3,ceiling_id=NULLIF($4,''),message_count=$5 WHERE id=$1::uuid AND fence=$2 AND status='running'`, run, fence, now, ceiling, count)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return errors.New("run not active")
		}
		var previous *time.Time
		err = tx.QueryRow(ctx, `SELECT last_success_at FROM solitary_athlete.sync_state WHERE channel_id=$1 FOR UPDATE`, channel).Scan(&previous)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if previous != nil && !now.After(*previous) {
			return errors.New("non-monotonic collection")
		}
		var latest *time.Time
		if err = tx.QueryRow(ctx, `SELECT max(collected_at) FROM solitary_athlete.mukmuk_daily_grass_history`).Scan(&latest); err != nil {
			return err
		}
		if latest != nil && !now.After(*latest) {
			return errors.New("non-monotonic observation")
		}
		if _, err = tx.Exec(ctx, `SELECT solitary_athlete.capture_monthly_grass_snapshot($1)`, now); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO solitary_athlete.sync_state(channel_id,last_message_id,last_success_at) VALUES($1,NULLIF($2,''),$3)
  ON CONFLICT(channel_id) DO UPDATE SET last_message_id=CASE WHEN EXCLUDED.last_message_id IS NULL THEN solitary_athlete.sync_state.last_message_id WHEN solitary_athlete.sync_state.last_message_id IS NULL OR EXCLUDED.last_message_id::numeric>solitary_athlete.sync_state.last_message_id::numeric THEN EXCLUDED.last_message_id ELSE solitary_athlete.sync_state.last_message_id END,last_success_at=EXCLUDED.last_success_at`, channel, ceiling, now); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO solitary_athlete.sync_status(singleton,last_success_at) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET last_success_at=EXCLUDED.last_success_at`, now); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO solitary_athlete.mukmuk_collection_effects(run_id,kind,expires_at) VALUES($1::uuid,'identity',$2::timestamptz+interval '30 seconds'),($1::uuid,'board',NULL)`, run, now)
		return err
	})
}
func (s *Store) FailRun(ctx context.Context, owner string, fence int64, run string) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collection_runs SET status='failed' WHERE id=$1::uuid AND fence=$2 AND status='running'`, run, fence)
		return err
	})
}

type PendingReaction struct {
	ID, Channel string
	Photo       bool
}

func (s *Store) Pending(ctx context.Context, owner string, fence int64) ([]PendingReaction, error) {
	var result []PendingReaction
	err := s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT message_id,channel_id,has_photo FROM solitary_athlete.workout_events WHERE reacted_at IS NULL ORDER BY message_id::numeric LIMIT 100`)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p PendingReaction
			if err := rows.Scan(&p.ID, &p.Channel, &p.Photo); err != nil {
				return err
			}
			result = append(result, p)
		}
		return rows.Err()
	})
	return result, err
}
func (s *Store) Reacted(ctx context.Context, owner string, fence int64, id string) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `UPDATE solitary_athlete.workout_events SET reacted_at=clock_timestamp() WHERE message_id=$1 AND reacted_at IS NULL`, id)
		return err
	})
}

// Prune only old completed operational bookkeeping, never workout or observation data.
func (s *Store) Prune(ctx context.Context, owner string, fence int64) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT r.id::text FROM solitary_athlete.mukmuk_collection_runs r
 WHERE r.status IN ('completed','failed') AND coalesce(r.completed_at,r.started_at)<clock_timestamp()-interval '30 days'
 AND NOT EXISTS(SELECT 1 FROM solitary_athlete.mukmuk_board_publication p WHERE p.run_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM solitary_athlete.mukmuk_collection_effects e WHERE e.run_id=r.id AND e.status NOT IN ('done','expired') AND NOT(e.kind='identity' AND e.expires_at<=clock_timestamp()))
 ORDER BY r.started_at LIMIT 200 FOR UPDATE OF r SKIP LOCKED`)
		if err != nil {
			return err
		}
		var ids []string
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				rows.Close()
				return err
			}
			ids = append(ids, id)
		}
		err = rows.Err()
		rows.Close()
		if err != nil || len(ids) == 0 {
			return err
		}
		if _, err = tx.Exec(ctx, `DELETE FROM solitary_athlete.mukmuk_collection_effects WHERE run_id::text=ANY($1)`, ids); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `DELETE FROM solitary_athlete.mukmuk_collection_runs WHERE id::text=ANY($1)`, ids)
		return err
	})
}
