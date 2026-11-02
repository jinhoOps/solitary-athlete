package collector

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"
)

var ErrMessageContent = errors.New("message content intent unavailable")

type Settings struct{ Guild, Channel, MemberRole, CheckEmoji, FlexEmoji string }
type Collector struct {
	Store     *Store
	Discord   *Discord
	Settings  Settings
	botID     string
	lastPrune time.Time
}

func newID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	s := hex.EncodeToString(b[:])
	return s[:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:], nil
}

type guardedAPI struct {
	api   *Discord
	store *Store
	owner string
	fence int64
}

func (g guardedAPI) Get(ctx context.Context, path string, out any) error {
	if err := g.store.Renew(ctx, g.owner, g.fence); err != nil {
		return err
	}
	return g.api.Get(ctx, path, out)
}
func verifyContentIntent(ctx context.Context, api refreshAPI) error {
	var application struct {
		ID    string  `json:"id"`
		Flags *uint64 `json:"flags"`
	}
	if err := api.Get(ctx, "/applications/@me", &application); err != nil {
		return err
	}
	if !numeric(application.ID) || application.Flags == nil || (*application.Flags&((1<<18)|(1<<19))) == 0 {
		return ErrMessageContent
	}
	return nil
}

func (c *Collector) Run(ctx context.Context) (err error) {
	if c.Store == nil || c.Discord == nil || !numeric(c.Settings.Guild) || !numeric(c.Settings.Channel) {
		return errors.New("invalid collector settings")
	}
	owner, e := newID()
	if e != nil {
		return e
	}
	run, e := newID()
	if e != nil {
		return e
	}
	fence, e := c.Store.Claim(ctx, owner)
	if e != nil {
		return e
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		if err != nil {
			_ = c.Store.FailRun(cleanup, owner, fence, run)
		}
		_ = c.Store.Release(cleanup, owner, fence)
	}()
	if err = c.Store.StartRun(ctx, owner, fence, run); err != nil {
		return err
	}
	api := guardedAPI{c.Discord, c.Store, owner, fence}
	var channel Channel
	if err = api.Get(ctx, "/channels/"+c.Settings.Channel, &channel); err != nil {
		return err
	}
	if channel.ID != c.Settings.Channel || channel.GuildID != c.Settings.Guild {
		return errors.New("channel guild mismatch")
	}
	if c.botID == "" {
		var me User
		if err = api.Get(ctx, "/users/@me", &me); err != nil {
			return err
		}
		if !numeric(me.ID) {
			return errors.New("invalid bot id")
		}
		c.botID = me.ID
	}
	if err = c.Store.Renew(ctx, owner, fence); err != nil {
		return err
	}
	if err = verifyBotRead(ctx, api, c.Settings.Guild, c.botID, channel); err != nil {
		return err
	}
	if err = verifyContentIntent(ctx, api); err != nil {
		return err
	}
	cursor, e := c.Store.Cursor(ctx, owner, fence, c.Settings.Channel)
	if e != nil {
		return e
	}
	scan, e := c.Store.LoadScan(ctx, owner, fence, cursor)
	if e != nil {
		return e
	}
	if scan == nil {
		hasNew := true
		if cursor != "" {
			if err = c.Store.Renew(ctx, owner, fence); err != nil {
				return err
			}
			hasNew, e = c.Discord.HasNew(ctx, c.Settings.Channel, cursor)
			if e != nil {
				return e
			}
		}
		if hasNew {
			if err = c.Store.BeginScan(ctx, owner, fence, c.Settings.Channel, cursor); err != nil {
				return err
			}
			scan = &Scan{Base: cursor}
		}
	}
	ceiling, count := cursor, 0
	if scan != nil {
		result, e := c.scanMessages(ctx, api, owner, fence, *scan)
		if e != nil {
			return e
		}
		ceiling, count = result.Ceiling, result.Count
	}
	if err = processRefresh(ctx, c.Store, api, owner, fence, RefreshSettings{c.Settings.Guild, c.Settings.Channel, c.Settings.MemberRole, c.botID}); err != nil {
		return err
	}
	pending, e := c.Store.Pending(ctx, owner, fence)
	if e != nil {
		return e
	}
	check, flex := c.Settings.CheckEmoji, c.Settings.FlexEmoji
	if check == "" {
		check = "✅"
	}
	if flex == "" {
		flex = "💪"
	}
	for _, p := range pending {
		if err = c.Store.Renew(ctx, owner, fence); err != nil {
			return err
		}
		e = c.Discord.React(ctx, p.Channel, p.ID, check)
		if e == nil && p.Photo {
			if err = c.Store.Renew(ctx, owner, fence); err != nil {
				return err
			}
			e = c.Discord.React(ctx, p.Channel, p.ID, flex)
		}
		if e != nil && !isDeleted(e) {
			return e
		}
		if err = c.Store.Reacted(ctx, owner, fence, p.ID); err != nil {
			return err
		}
	}
	if err = c.Store.Finish(ctx, owner, fence, run, c.Settings.Channel, ceiling, count); err != nil {
		return err
	}
	if time.Since(c.lastPrune) >= time.Hour {
		if c.Store.Prune(ctx, owner, fence) == nil {
			c.lastPrune = time.Now()
		}
	}
	return nil
}
