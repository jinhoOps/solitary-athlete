package collector

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type RefreshJob struct {
	ID, Requester, Target, Guild, Channel, Upper, Cursor string
	Version                                              int
}

func (s *Store) ClaimRefresh(ctx context.Context, owner string, fence int64) (*RefreshJob, error) {
	var j RefreshJob
	err := s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `WITH due AS (SELECT id FROM solitary_athlete.workout_refresh_jobs WHERE status IN ('queued','running') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY processed_at,id::numeric FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE solitary_athlete.workout_refresh_jobs j SET status='running',lease_until=clock_timestamp()+interval '45 seconds',version=version+1,processed_at=clock_timestamp() FROM due WHERE j.id=due.id RETURNING j.id,j.requester_id,j.target_id,j.guild_id,j.channel_id,j.upper_id,j.cursor_id,j.version`).Scan(&j.ID, &j.Requester, &j.Target, &j.Guild, &j.Channel, &j.Upper, &j.Cursor, &j.Version)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}
func refreshOwned(ctx context.Context, tx pgx.Tx, j RefreshJob) (string, error) {
	var cursor string
	err := tx.QueryRow(ctx, `SELECT cursor_id FROM solitary_athlete.workout_refresh_jobs WHERE id=$1 AND version=$2 AND status='running' AND lease_until>clock_timestamp() FOR UPDATE`, j.ID, j.Version).Scan(&cursor)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errors.New("refresh lease lost")
	}
	return cursor, err
}
func (s *Store) RefreshEvents(ctx context.Context, owner string, fence int64, j RefreshJob) ([]string, error) {
	var result []string
	err := s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		cursor, err := refreshOwned(ctx, tx, j)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT message_id FROM solitary_athlete.workout_events WHERE user_id=$1 AND guild_id=$2 AND channel_id=$3 AND message_id::numeric>$4::numeric AND message_id::numeric<=$5::numeric ORDER BY message_id::numeric LIMIT 20`, j.Target, j.Guild, j.Channel, cursor, j.Upper)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			if err = rows.Scan(&id); err != nil {
				return err
			}
			result = append(result, id)
		}
		return rows.Err()
	})
	return result, err
}
func (s *Store) ApplyRefresh(ctx context.Context, owner string, fence int64, j RefreshJob, id string, e *Event) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := channelLock(ctx, tx, j.Channel); err != nil {
			return err
		}
		if err := workoutLock(ctx, tx); err != nil {
			return err
		}
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		cursor, err := refreshOwned(ctx, tx, j)
		if err != nil {
			return err
		}
		var ahead bool
		if err = tx.QueryRow(ctx, `SELECT $1::numeric>$2::numeric AND $1::numeric<=$3::numeric`, id, cursor, j.Upper).Scan(&ahead); err != nil {
			return err
		}
		if !ahead {
			if id == cursor {
				return nil
			}
			return errors.New("refresh scope mismatch")
		}
		var user string
		var date time.Time
		err = tx.QueryRow(ctx, `SELECT user_id,log_date FROM solitary_athlete.workout_events WHERE message_id=$1 AND guild_id=$2 AND channel_id=$3 FOR UPDATE`, id, j.Guild, j.Channel).Scan(&user, &date)
		if err != nil || user != j.Target {
			return errors.New("refresh scope mismatch")
		}
		if e == nil {
			if _, err = tx.Exec(ctx, `DELETE FROM solitary_athlete.workout_events WHERE message_id=$1`, id); err != nil {
				return err
			}
		} else {
			if e.MessageID != id || e.UserID != j.Target || e.GuildID != j.Guild || e.ChannelID != j.Channel {
				return errors.New("refresh scope mismatch")
			}
			attachments, err := json.Marshal(e.Attachments)
			if err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `UPDATE solitary_athlete.workout_events SET username=$2,edited_at=$3,memo=$4,has_photo=$5,attachments=$6::jsonb,updated_at=now() WHERE message_id=$1`, id, e.Username, e.EditedAt, e.Memo, e.HasPhoto, string(attachments)); err != nil {
				return err
			}
		}
		if err = recalc(ctx, tx, user, date); err != nil {
			return err
		}
		removed := 0
		if e == nil {
			removed = 1
		}
		_, err = tx.Exec(ctx, `UPDATE solitary_athlete.workout_refresh_jobs SET cursor_id=$2,checked=checked+1,removed=removed+$3,failures=0,error_code=NULL WHERE id=$1`, j.ID, id, removed)
		return err
	})
}
func (s *Store) FinishRefresh(ctx context.Context, owner string, fence int64, j RefreshJob) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		cursor, err := refreshOwned(ctx, tx, j)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE solitary_athlete.workout_refresh_jobs SET status=CASE WHEN EXISTS(SELECT 1 FROM solitary_athlete.workout_events WHERE user_id=$2 AND guild_id=$3 AND channel_id=$4 AND message_id::numeric>$5::numeric AND message_id::numeric<=$6::numeric) THEN 'queued' ELSE 'done' END,lease_until=NULL,next_attempt_at=now(),processed_at=now(),error_code=NULL WHERE id=$1`, j.ID, j.Target, j.Guild, j.Channel, cursor, j.Upper)
		return err
	})
}
func (s *Store) DeferRefresh(ctx context.Context, owner string, fence int64, j RefreshJob, code string, delay time.Duration, fatal, failed bool) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		if _, err := refreshOwned(ctx, tx, j); err != nil {
			return err
		}
		increment := 0
		if failed {
			increment = 1
		}
		_, err := tx.Exec(ctx, `UPDATE solitary_athlete.workout_refresh_jobs SET status=CASE WHEN $2 OR failures+$3>=10 THEN 'failed' ELSE 'queued' END,failures=failures+$3,error_code=$4,lease_until=NULL,processed_at=now(),next_attempt_at=now()+($5::double precision*interval '1 second') WHERE id=$1`, j.ID, fatal, increment, code, delay.Seconds())
		return err
	})
}
