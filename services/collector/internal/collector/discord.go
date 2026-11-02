package collector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type DiscordError struct {
	Status, Code int
	RetryAfter   time.Duration
}

func (e *DiscordError) Error() string { return fmt.Sprintf("discord request failed (%d)", e.Status) }

type Discord struct {
	token, base string
	http        *http.Client
}

func NewDiscord(token, base string) *Discord {
	if base == "" {
		base = "https://discord.com/api/v10"
	}
	return &Discord{token, strings.TrimRight(base, "/"), &http.Client{Timeout: 10 * time.Second}}
}
func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
func (d *Discord) request(ctx context.Context, method, path string, out any) error {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	for attempt := 0; attempt < 4; attempt++ {
		req, err := http.NewRequestWithContext(ctx, method, d.base+path, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bot "+d.token)
		res, err := d.http.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			if attempt == 3 {
				return errors.New("discord unavailable")
			}
			if err = sleep(ctx, time.Duration(1<<attempt)*time.Second); err != nil {
				return err
			}
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(res.Body, 2<<20))
		_ = res.Body.Close()
		if readErr != nil {
			return errors.New("discord response unavailable")
		}
		if res.StatusCode >= 200 && res.StatusCode < 300 {
			if out != nil {
				if err = json.Unmarshal(body, out); err != nil {
					return errors.New("invalid discord response")
				}
			}
			return nil
		}
		var payload struct {
			Code       int     `json:"code"`
			RetryAfter float64 `json:"retry_after"`
		}
		_ = json.Unmarshal(body, &payload)
		delay := time.Duration(payload.RetryAfter * float64(time.Second))
		if delay <= 0 {
			if n, e := strconv.ParseFloat(res.Header.Get("Retry-After"), 64); e == nil && n > 0 {
				delay = time.Duration(n * float64(time.Second))
			}
		}
		problem := &DiscordError{res.StatusCode, payload.Code, delay}
		if res.StatusCode == 429 {
			if delay <= 0 {
				delay = time.Second
			}
			if delay > 20*time.Second || attempt == 3 {
				return problem
			}
			if err = sleep(ctx, delay); err != nil {
				return err
			}
			continue
		}
		if res.StatusCode >= 500 && attempt < 3 {
			if err = sleep(ctx, time.Duration(1<<attempt)*time.Second); err != nil {
				return err
			}
			continue
		}
		return problem
	}
	return errors.New("discord retry exhausted")
}
func (d *Discord) Get(ctx context.Context, path string, out any) error {
	return d.request(ctx, "GET", path, out)
}
func (d *Discord) Messages(ctx context.Context, channel, before string) ([]Message, error) {
	q := url.Values{"limit": {"100"}}
	if before != "" {
		q.Set("before", before)
	}
	var rows []Message
	err := d.Get(ctx, "/channels/"+url.PathEscape(channel)+"/messages?"+q.Encode(), &rows)
	if err == nil && rows == nil {
		return nil, errors.New("invalid message page")
	}
	return rows, err
}
func (d *Discord) HasNew(ctx context.Context, channel, cursor string) (bool, error) {
	q := url.Values{"limit": {"1"}, "after": {cursor}}
	var rows []Message
	if err := d.Get(ctx, "/channels/"+url.PathEscape(channel)+"/messages?"+q.Encode(), &rows); err != nil {
		return false, err
	}
	if rows == nil {
		return false, errors.New("invalid probe page")
	}
	if len(rows) > 1 {
		return false, errors.New("invalid probe page")
	}
	if len(rows) == 0 {
		return false, nil
	}
	id, err := strconv.ParseUint(rows[0].ID, 10, 64)
	if err != nil {
		return false, errors.New("invalid probe id")
	}
	previous, err := strconv.ParseUint(cursor, 10, 64)
	if err != nil || id <= previous {
		return false, errors.New("non-progressing probe")
	}
	return true, nil
}

func (d *Discord) React(ctx context.Context, channel, id, emoji string) error {
	return d.request(ctx, "PUT", "/channels/"+url.PathEscape(channel)+"/messages/"+url.PathEscape(id)+"/reactions/"+url.PathEscape(emoji)+"/@me", nil)
}
