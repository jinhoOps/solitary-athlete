package collector

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"
)

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

type guardedMessages struct {
	api   *Discord
	store *Store
	owner string
	fence int64
}

func (g guardedMessages) Messages(ctx context.Context, channel, before string) ([]Message, error) {
	if err := g.store.Renew(ctx, g.owner, g.fence); err != nil {
		return nil, err
	}
	return g.api.Messages(ctx, channel, before)
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
	var channel Channel
	if err = c.Discord.Get(ctx, "/channels/"+c.Settings.Channel, &channel); err != nil {
		return err
	}
	if channel.ID != c.Settings.Channel || channel.GuildID != c.Settings.Guild {
		return errors.New("channel guild mismatch")
	}
	if c.botID == "" {
		var me User
		if err = c.Discord.Get(ctx, "/users/@me", &me); err != nil {
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
	if err = verifyBotRead(ctx, c.Discord, c.Settings.Guild, c.botID, channel); err != nil {
		return err
	}
	cursor, e := c.Store.Cursor(ctx, owner, fence, c.Settings.Channel)
	if e != nil {
		return e
	}
	var rows []Message
	ceiling := cursor
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
		rows, ceiling, e = NewMessages(ctx, guardedMessages{c.Discord, c.Store, owner, fence}, c.Settings.Channel, cursor)
		if e != nil {
			return e
		}
	}
	for _, m := range rows {
		event, e := EventFromMessage(m, c.Settings.Guild, c.Settings.Channel)
		if e != nil {
			return e
		}
		if e = c.Store.SaveNew(ctx, owner, fence, event); e != nil {
			return e
		}
	}
	if err = processRefresh(ctx, c.Store, c.Discord, owner, fence, RefreshSettings{c.Settings.Guild, c.Settings.Channel, c.Settings.MemberRole, c.botID}); err != nil {
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
			e = c.Discord.React(ctx, p.Channel, p.ID, flex)
		}
		if e != nil && !isDeleted(e) {
			return e
		}
		if err = c.Store.Reacted(ctx, owner, fence, p.ID); err != nil {
			return err
		}
	}
	if err = c.Store.Finish(ctx, owner, fence, run, c.Settings.Channel, ceiling, len(rows)); err != nil {
		return err
	}
	if time.Since(c.lastPrune) >= time.Hour {
		if c.Store.Prune(ctx, owner, fence) == nil {
			c.lastPrune = time.Now()
		}
	}
	return nil
}
