package collector

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
)

type Scan struct {
	Base, Ceiling, Before string
	Complete              bool
	Count                 int
}

func (s *Store) LoadScan(ctx context.Context, owner string, fence int64, cursor string) (*Scan, error) {
	var scan Scan
	var active bool
	err := s.transaction(ctx, func(tx pgx.Tx) error {
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `SELECT active,coalesce(base_cursor,''),coalesce(ceiling_id,''),coalesce(before_id,''),completed,message_count FROM solitary_athlete.mukmuk_collection_scan WHERE singleton FOR UPDATE`).Scan(&active, &scan.Base, &scan.Ceiling, &scan.Before, &scan.Complete, &scan.Count); err != nil {
			return err
		}
		if active && scan.Base != cursor {
			_, err := tx.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collection_scan SET active=false WHERE singleton`)
			active = false
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if !active {
		return nil, nil
	}
	return &scan, nil
}
func (s *Store) BeginScan(ctx context.Context, owner string, fence int64, channel, cursor string) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := channelLock(ctx, tx, channel); err != nil {
			return err
		}
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		result, err := tx.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collection_scan SET active=true,base_cursor=NULLIF($1,''),ceiling_id=NULL,before_id=NULL,completed=false,message_count=0 WHERE singleton AND NOT active`, cursor)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return errors.New("scan already active")
		}
		return nil
	})
}
func (s *Store) SaveScanPage(ctx context.Context, owner string, fence int64, channel string, prior Scan, next Scan) error {
	return s.transaction(ctx, func(tx pgx.Tx) error {
		if err := channelLock(ctx, tx, channel); err != nil {
			return err
		}
		if err := guard(ctx, tx, owner, fence); err != nil {
			return err
		}
		result, err := tx.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collection_scan SET ceiling_id=NULLIF($3,''),before_id=NULLIF($4,''),completed=$5,message_count=$6 WHERE singleton AND active AND NOT completed AND coalesce(base_cursor,'')=$1 AND coalesce(before_id,'')=$2`, prior.Base, prior.Before, next.Ceiling, next.Before, next.Complete, next.Count)
		if err != nil {
			return err
		}
		if result.RowsAffected() != 1 {
			return errors.New("scan checkpoint changed")
		}
		return nil
	})
}
