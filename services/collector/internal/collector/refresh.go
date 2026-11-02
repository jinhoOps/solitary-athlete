package collector

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"
)

const (
	admin       uint64 = 8
	manageGuild uint64 = 32
	readChannel uint64 = 1024 | 65536
)

type Role struct {
	ID          string `json:"id"`
	Permissions string `json:"permissions"`
}
type GuildMember struct {
	User  *User    `json:"user"`
	Roles []string `json:"roles"`
}
type Overwrite struct {
	ID    string `json:"id"`
	Type  int    `json:"type"`
	Allow string `json:"allow"`
	Deny  string `json:"deny"`
}
type Channel struct {
	ID         string      `json:"id"`
	GuildID    string      `json:"guild_id"`
	Overwrites []Overwrite `json:"permission_overwrites"`
}
type Guild struct {
	ID      string `json:"id"`
	OwnerID string `json:"owner_id"`
}

func basePermissions(m GuildMember, roles []Role, guild, owner string) uint64 {
	if m.User == nil {
		return 0
	}
	if m.User.ID == owner {
		return ^uint64(0)
	}
	ids := map[string]bool{guild: true}
	for _, id := range m.Roles {
		ids[id] = true
	}
	var p uint64
	for _, r := range roles {
		if ids[r.ID] {
			n, err := strconv.ParseUint(r.Permissions, 10, 64)
			if err != nil {
				return 0
			}
			p |= n
		}
	}
	return p
}
func canRefresh(m GuildMember, target, memberRole string, roles []Role, owner, guild string) bool {
	if m.User == nil {
		return false
	}
	p := basePermissions(m, roles, guild, owner)
	if p&(admin|manageGuild) != 0 {
		return true
	}
	for _, role := range m.Roles {
		if memberRole != "" && role == memberRole && m.User.ID == target {
			return true
		}
	}
	return false
}
func channelPermissions(m GuildMember, roles []Role, c Channel, owner string) uint64 {
	p := basePermissions(m, roles, c.GuildID, owner)
	if p&admin != 0 {
		return ^uint64(0)
	}
	if m.User == nil {
		return 0
	}
	apply := func(deny, allow string) bool {
		d, e := strconv.ParseUint(deny, 10, 64)
		if e != nil {
			return false
		}
		a, e := strconv.ParseUint(allow, 10, 64)
		if e != nil {
			return false
		}
		p = (p &^ d) | a
		return true
	}
	for _, o := range c.Overwrites {
		if o.ID == c.GuildID && o.Type == 0 && !apply(o.Deny, o.Allow) {
			return 0
		}
	}
	var deny, allow uint64
	for _, o := range c.Overwrites {
		if o.Type == 0 {
			for _, id := range m.Roles {
				if o.ID == id {
					d, e := strconv.ParseUint(o.Deny, 10, 64)
					if e != nil {
						return 0
					}
					a, e := strconv.ParseUint(o.Allow, 10, 64)
					if e != nil {
						return 0
					}
					deny |= d
					allow |= a
				}
			}
		}
	}
	p = (p &^ deny) | allow
	for _, o := range c.Overwrites {
		if o.Type == 1 && o.ID == m.User.ID && !apply(o.Deny, o.Allow) {
			return 0
		}
	}
	return p
}
func isDeleted(err error) bool {
	var e *DiscordError
	return errors.As(err, &e) && e.Status == 404 && e.Code == 10008
}

type refreshAPI interface {
	Get(context.Context, string, any) error
}
type RefreshSettings struct{ Guild, Channel, MemberRole, BotID string }

func verifyBotRead(ctx context.Context, api refreshAPI, guildID, botID string, channel Channel) error {
	if channel.GuildID != guildID || channel.Overwrites == nil {
		return errors.New("channel_permission")
	}
	var guild Guild
	var roles []Role
	var bot GuildMember
	for _, q := range []struct {
		path string
		dst  any
	}{
		{"/guilds/" + guildID, &guild}, {"/guilds/" + guildID + "/roles", &roles}, {"/guilds/" + guildID + "/members/" + botID, &bot},
	} {
		if err := api.Get(ctx, q.path, q.dst); err != nil {
			return err
		}
	}
	if guild.ID != guildID || guild.OwnerID == "" || bot.User == nil || bot.User.ID != botID || bot.Roles == nil || roles == nil {
		return errors.New("channel_permission")
	}
	found := false
	for _, role := range roles {
		if role.ID == guildID {
			found = true
		}
		if !numeric(role.ID) {
			return errors.New("channel_permission")
		}
		if _, err := strconv.ParseUint(role.Permissions, 10, 64); err != nil {
			return errors.New("channel_permission")
		}
	}
	if !found || channelPermissions(bot, roles, channel, guild.OwnerID)&readChannel != readChannel {
		return errors.New("channel_permission")
	}
	return nil
}

func verifyRefresh(ctx context.Context, api refreshAPI, j RefreshJob, s RefreshSettings) error {
	if j.Guild != s.Guild || j.Channel != s.Channel {
		return errors.New("job_scope")
	}
	var guild Guild
	var roles []Role
	var requester, bot GuildMember
	var channel Channel
	for _, q := range []struct {
		path string
		dst  any
	}{{"/guilds/" + s.Guild, &guild}, {"/guilds/" + s.Guild + "/roles", &roles}, {"/guilds/" + s.Guild + "/members/" + j.Requester, &requester}, {"/guilds/" + s.Guild + "/members/" + s.BotID, &bot}, {"/channels/" + s.Channel, &channel}} {
		if err := api.Get(ctx, q.path, q.dst); err != nil {
			return err
		}
	}
	if guild.ID != s.Guild || guild.OwnerID == "" || channel.ID != s.Channel || channel.GuildID != s.Guild || requester.User == nil || requester.User.ID != j.Requester || bot.User == nil || bot.User.ID != s.BotID || roles == nil || requester.Roles == nil || bot.Roles == nil || channel.Overwrites == nil {
		return errors.New("member_scope")
	}
	foundEveryone := false
	for _, role := range roles {
		if role.ID == s.Guild {
			foundEveryone = true
		}
		if !numeric(role.ID) {
			return errors.New("member_scope")
		}
		if _, err := strconv.ParseUint(role.Permissions, 10, 64); err != nil {
			return errors.New("member_scope")
		}
	}
	if !foundEveryone {
		return errors.New("member_scope")
	}
	if !canRefresh(requester, j.Target, s.MemberRole, roles, guild.OwnerID, s.Guild) {
		return errors.New("requester_permission")
	}
	if channelPermissions(bot, roles, channel, guild.OwnerID)&readChannel != readChannel {
		return errors.New("channel_permission")
	}
	return nil
}
func processRefresh(ctx context.Context, store *Store, api refreshAPI, owner string, fence int64, s RefreshSettings) error {
	j, err := store.ClaimRefresh(ctx, owner, fence)
	if err != nil || j == nil {
		return err
	}
	work, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	run := func() error {
		if err := verifyRefresh(work, api, *j, s); err != nil {
			return err
		}
		ids, err := store.RefreshEvents(work, owner, fence, *j)
		if err != nil {
			return err
		}
		for _, id := range ids {
			if err := store.Renew(work, owner, fence); err != nil {
				return err
			}
			var msg Message
			err := api.Get(work, fmt.Sprintf("/channels/%s/messages/%s", j.Channel, id), &msg)
			var e *Event
			if err != nil {
				if !isDeleted(err) {
					return err
				}
			} else {
				if msg.ID != id || msg.Author == nil || msg.Author.ID != j.Target {
					return errors.New("message_scope")
				}
				e, err = EventFromMessage(msg, j.Guild, j.Channel)
				if err != nil {
					return err
				}
				// A redacted or no-longer-qualifying HTTP 200 is not proof of deletion.
				if e == nil {
					return errors.New("ambiguous_source_response")
				}
			}
			if e == nil {
				if err = verifyRefresh(work, api, *j, s); err != nil {
					return err
				}
			}
			if err = store.ApplyRefresh(work, owner, fence, *j, id, e); err != nil {
				return err
			}
		}
		return store.FinishRefresh(work, owner, fence, *j)
	}
	if err = run(); err == nil {
		return nil
	}
	if errors.Is(err, ErrLease) {
		return err
	}
	code := "invalid_source_response"
	delay := time.Second
	fatal, failed := false, true
	var d *DiscordError
	if errors.As(err, &d) {
		code = fmt.Sprint(d.Status)
		delay = d.RetryAfter
		if delay < time.Second {
			delay = time.Second
		}
		fatal = d.Status == 401 || d.Status == 403 || (d.Status == 404 && d.Code != 10008)
		failed = d.Status != 429
	} else if errors.Is(err, context.DeadlineExceeded) {
		code = "budget"
		delay = 0
		failed = false
	} else if s := err.Error(); s == "job_scope" || s == "member_scope" || s == "requester_permission" || s == "channel_permission" || s == "message_scope" {
		code = s
		fatal = true
		delay = 0
	}
	if e := store.DeferRefresh(ctx, owner, fence, *j, code, delay, fatal, failed); e != nil {
		return e
	}
	return nil
}
