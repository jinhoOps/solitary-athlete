package collector

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

type PhotoEvent struct{ ID, Channel, User string }

func (s *Store) PhotoEvents(ctx context.Context, owner string, fence int64, after string) ([]PhotoEvent, error) {
	var result []PhotoEvent
	err := s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `SELECT message_id,channel_id,user_id FROM solitary_athlete.workout_events WHERE has_photo AND attachments='[]'::jsonb AND ($1='' OR message_id::numeric>NULLIF($1,'')::numeric) ORDER BY message_id::numeric LIMIT 100`, after)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var row PhotoEvent
			if err := rows.Scan(&row.ID, &row.Channel, &row.User); err != nil {
				return err
			}
			result = append(result, row)
		}
		return rows.Err()
	})
	return result, err
}
func (s *Store) BackfillPhoto(ctx context.Context, owner string, fence int64, id string, images []Image) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		var channel string
		if err := tx.QueryRow(ctx, `SELECT channel_id FROM solitary_athlete.workout_events WHERE message_id=$1`, id).Scan(&channel); err != nil {
			return err
		}
		if err := channelLock(ctx, tx, channel); err != nil {
			return err
		}
		if err := workoutLock(ctx, tx); err != nil {
			return err
		}
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		if images == nil {
			images = []Image{}
		}
		data, err := json.Marshal(images)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE solitary_athlete.workout_events SET attachments=$2::jsonb WHERE message_id=$1 AND has_photo AND attachments='[]'::jsonb`, id, string(data))
		return err
	})
}
func (c *Collector) BackfillPhotos(ctx context.Context) (err error) {
	owner, e := newID()
	if e != nil {
		return e
	}
	f, e := c.Store.Claim(ctx, owner)
	if e != nil {
		return e
	}
	defer func() { _ = c.Store.Release(context.Background(), owner, f) }()
	api := guardedAPI{c.Discord, c.Store, owner, f}
	if err = verifyContentIntent(ctx, api); err != nil {
		return err
	}
	after := ""
	for {
		rows, e := c.Store.PhotoEvents(ctx, owner, f, after)
		if e != nil {
			return e
		}
		if len(rows) == 0 {
			return nil
		}
		for _, row := range rows {
			if row.Channel != c.Settings.Channel {
				return errors.New("photo channel mismatch")
			}
			if err = c.Store.Renew(ctx, owner, f); err != nil {
				return err
			}
			var msg Message
			e = api.Get(ctx, "/channels/"+row.Channel+"/messages/"+row.ID, &msg)
			var images []Image
			if e != nil {
				if !isDeleted(e) {
					return e
				}
			} else {
				if msg.ID != row.ID || msg.Author == nil || msg.Author.ID != row.User {
					return errors.New("photo author mismatch")
				}
				event, e := EventFromMessage(msg, c.Settings.Guild, c.Settings.Channel)
				if e != nil {
					return e
				}
				if event != nil {
					images = event.Attachments
				}
			}
			if err = c.Store.BackfillPhoto(ctx, owner, f, row.ID, images); err != nil {
				return err
			}
			after = row.ID
		}
	}
}
