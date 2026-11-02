package collector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRunCollectsOnceAndSecondRunRequestsOnlyNewMessages(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	guild := "1559802401802952706"
	channel := "1559804769327910932"
	gets, reactions, probes := 0, 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/channels/"+channel:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": channel, "guild_id": guild, "permission_overwrites": []any{}})
		case r.URL.Path == "/applications/@me":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "42", "flags": 1 << 19})
		case r.URL.Path == "/users/@me":
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "42"})
		case r.URL.Path == "/guilds/"+guild:
			_ = json.NewEncoder(w).Encode(Guild{ID: guild, OwnerID: "1"})
		case r.URL.Path == "/guilds/"+guild+"/roles":
			_ = json.NewEncoder(w).Encode([]Role{{ID: guild, Permissions: "66560"}})
		case r.URL.Path == "/guilds/"+guild+"/members/42":
			_ = json.NewEncoder(w).Encode(GuildMember{User: &User{ID: "42"}, Roles: []string{}})
		case r.Method == "GET" && r.URL.Path == "/channels/"+channel+"/messages":
			gets++
			if r.URL.Query().Get("after") == "100" && r.URL.Query().Get("limit") == "1" {
				probes++
				_ = json.NewEncoder(w).Encode([]Message{})
			} else {
				_ = json.NewEncoder(w).Encode([]Message{fixtureMessage("100")})
			}
		case r.Method == "PUT" && strings.Contains(r.URL.Path, "/reactions/"):
			reactions++
			w.WriteHeader(204)
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.String())
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	service := Collector{Store: store, Discord: NewDiscord("fixture", server.URL), Settings: Settings{Guild: guild, Channel: channel}}
	if err := service.Run(ctx); err != nil {
		t.Fatal(err)
	}
	if err := service.Run(ctx); err != nil {
		t.Fatal(err)
	}
	var count, completed int
	err := db.QueryRow(ctx, `SELECT (SELECT count(*) FROM solitary_athlete.workout_events),(SELECT count(*) FROM solitary_athlete.mukmuk_collection_runs WHERE status='completed')`).Scan(&count, &completed)
	if err != nil || count != 1 || completed != 2 || gets != 2 || reactions != 1 || probes != 1 {
		t.Fatalf("count=%d completed=%d gets=%d reactions=%d err=%v", count, completed, gets, reactions, err)
	}
}
func TestCannotTreatMissingReadPermissionAsSuccessfulEmptyCollection(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	guild := "1559802401802952706"
	channel := "1559804769327910932"
	messageRequests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/channels/" + channel:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": channel, "guild_id": guild, "permission_overwrites": []any{}})
		case "/applications/@me":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "42", "flags": 1 << 19})
		case "/users/@me":
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "42"})
		case "/guilds/" + guild:
			_ = json.NewEncoder(w).Encode(Guild{ID: guild, OwnerID: "1"})
		case "/guilds/" + guild + "/roles":
			_ = json.NewEncoder(w).Encode([]Role{{ID: guild, Permissions: "0"}})
		case "/guilds/" + guild + "/members/42":
			_ = json.NewEncoder(w).Encode(GuildMember{User: &User{ID: "42"}, Roles: []string{}})
		case "/channels/" + channel + "/messages":
			messageRequests++
			_ = json.NewEncoder(w).Encode([]Message{})
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	service := Collector{Store: store, Discord: NewDiscord("fixture", server.URL), Settings: Settings{Guild: guild, Channel: channel}}
	if err := service.Run(ctx); err == nil {
		t.Fatal("collection succeeded without history access")
	}
	var n int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM solitary_athlete.sync_status`).Scan(&n); err != nil || n != 0 || messageRequests != 0 {
		t.Fatalf("status=%d calls=%d err=%v", n, messageRequests, err)
	}
}
func TestFailedPageNeverPublishesCursorOrSuccess(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	guild := "1559802401802952706"
	channel := "1559804769327910932"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/channels/" + channel:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": channel, "guild_id": guild, "permission_overwrites": []any{}})
		case "/applications/@me":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "42", "flags": 1 << 19})
		case "/users/@me":
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "42"})
		case "/guilds/" + guild:
			_ = json.NewEncoder(w).Encode(Guild{ID: guild, OwnerID: "1"})
		case "/guilds/" + guild + "/roles":
			_ = json.NewEncoder(w).Encode([]Role{{ID: guild, Permissions: "66560"}})
		case "/guilds/" + guild + "/members/42":
			_ = json.NewEncoder(w).Encode(GuildMember{User: &User{ID: "42"}, Roles: []string{}})
		case "/channels/" + channel + "/messages":
			if r.URL.Query().Get("before") != "" {
				w.WriteHeader(403)
				return
			}
			items := make([]Message, 100)
			for i := range items {
				items[i] = fixtureMessage(fmt.Sprint(300 - i))
			}
			_ = json.NewEncoder(w).Encode(items)
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	service := Collector{Store: store, Discord: NewDiscord("fixture", server.URL), Settings: Settings{Guild: guild, Channel: channel}}
	if err := service.Run(ctx); err == nil {
		t.Fatal("page failure reported success")
	}
	var count int
	var status string
	err := db.QueryRow(ctx, `SELECT (SELECT count(*) FROM solitary_athlete.sync_status),(SELECT status FROM solitary_athlete.mukmuk_collection_runs LIMIT 1)`).Scan(&count, &status)
	if err != nil || count != 0 || status != "failed" {
		t.Fatalf("status=%s count=%d err=%v", status, count, err)
	}
}
func TestMissingMessageContentIntentDoesNotAdvanceCursor(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	guild := "1559802401802952706"
	channel := "1559804769327910932"
	messages := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/channels/" + channel:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": channel, "guild_id": guild, "permission_overwrites": []any{}})
		case "/users/@me":
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "42"})
		case "/applications/@me":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "42", "flags": 0})
		case "/guilds/" + guild:
			_ = json.NewEncoder(w).Encode(Guild{ID: guild, OwnerID: "1"})
		case "/guilds/" + guild + "/roles":
			_ = json.NewEncoder(w).Encode([]Role{{ID: guild, Permissions: "66560"}})
		case "/guilds/" + guild + "/members/42":
			_ = json.NewEncoder(w).Encode(GuildMember{User: &User{ID: "42"}, Roles: []string{}})
		case "/channels/" + channel + "/messages":
			messages++
			_ = json.NewEncoder(w).Encode([]Message{})
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	service := Collector{Store: store, Discord: NewDiscord("fixture", server.URL), Settings: Settings{Guild: guild, Channel: channel}}
	if err := service.Run(ctx); err == nil {
		t.Fatal("accepted missing message-content intent")
	}
	var n int
	err := db.QueryRow(ctx, `SELECT count(*) FROM solitary_athlete.sync_status`).Scan(&n)
	if err != nil || n != 0 || messages != 0 {
		t.Fatalf("status=%d messages=%d err=%v", n, messages, err)
	}
}
func TestInterruptedBacklogResumesAfterLastSavedPage(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	guild := "1559802401802952706"
	channel := "1559804769327910932"
	firstPages, secondPages := 0, 0
	failSecond := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/channels/" + channel:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": channel, "guild_id": guild, "permission_overwrites": []any{}})
		case "/users/@me":
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "42"})
		case "/applications/@me":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "42", "flags": 1 << 19})
		case "/guilds/" + guild:
			_ = json.NewEncoder(w).Encode(Guild{ID: guild, OwnerID: "1"})
		case "/guilds/" + guild + "/roles":
			_ = json.NewEncoder(w).Encode([]Role{{ID: guild, Permissions: "66560"}})
		case "/guilds/" + guild + "/members/42":
			_ = json.NewEncoder(w).Encode(GuildMember{User: &User{ID: "42"}, Roles: []string{}})
		case "/channels/" + channel + "/messages":
			if r.URL.Query().Get("before") == "" {
				firstPages++
				items := make([]Message, 100)
				for i := range items {
					items[i] = fixtureMessage(fmt.Sprint(300 - i))
				}
				_ = json.NewEncoder(w).Encode(items)
				return
			}
			secondPages++
			if failSecond {
				w.WriteHeader(403)
				return
			}
			_ = json.NewEncoder(w).Encode([]Message{fixtureMessage("200"), fixtureMessage("199")})
		case "/channels/" + channel + "/messages/300/reactions/%E2%9C%85/@me":
			w.WriteHeader(204)
		default:
			if r.Method == "PUT" && strings.Contains(r.URL.Path, "/reactions/") {
				w.WriteHeader(204)
			} else {
				w.WriteHeader(404)
			}
		}
	}))
	defer server.Close()
	service := Collector{Store: store, Discord: NewDiscord("fixture", server.URL), Settings: Settings{Guild: guild, Channel: channel}}
	if err := service.Run(ctx); err == nil {
		t.Fatal("first run must fail")
	}
	var n int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM solitary_athlete.sync_status`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("premature success %d %v", n, err)
	}
	failSecond = false
	if err := service.Run(ctx); err != nil {
		t.Fatal(err)
	}
	if firstPages != 1 || secondPages != 2 {
		t.Fatalf("did not resume: first=%d second=%d", firstPages, secondPages)
	}
	var cursor string
	if err := db.QueryRow(ctx, `SELECT last_message_id FROM solitary_athlete.sync_state`).Scan(&cursor); err != nil || cursor != "300" {
		t.Fatalf("cursor=%s err=%v", cursor, err)
	}
}
func TestEmptyInitialScanDoesNotHideLaterMessages(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	guild := "1559802401802952706"
	channel := "1559804769327910932"
	empty := true
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/channels/" + channel:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": channel, "guild_id": guild, "permission_overwrites": []any{}})
		case "/users/@me":
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "42"})
		case "/applications/@me":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "42", "flags": 1 << 19})
		case "/guilds/" + guild:
			_ = json.NewEncoder(w).Encode(Guild{ID: guild, OwnerID: "1"})
		case "/guilds/" + guild + "/roles":
			_ = json.NewEncoder(w).Encode([]Role{{ID: guild, Permissions: "66560"}})
		case "/guilds/" + guild + "/members/42":
			_ = json.NewEncoder(w).Encode(GuildMember{User: &User{ID: "42"}, Roles: []string{}})
		case "/channels/" + channel + "/messages":
			if empty {
				_ = json.NewEncoder(w).Encode([]Message{})
			} else {
				_ = json.NewEncoder(w).Encode([]Message{fixtureMessage("100")})
			}
		default:
			if r.Method == "PUT" {
				w.WriteHeader(204)
			} else {
				w.WriteHeader(404)
			}
		}
	}))
	defer server.Close()
	c := Collector{Store: store, Discord: NewDiscord("fixture", server.URL), Settings: Settings{Guild: guild, Channel: channel}}
	if err := c.Run(ctx); err != nil {
		t.Fatal(err)
	}
	empty = false
	if err := c.Run(ctx); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM solitary_athlete.workout_events`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("events=%d err=%v", n, err)
	}
}
func TestPhotoReactionDoesNotContinueAfterLeaseExpires(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	guild := "1559802401802952706"
	channel := "1559804769327910932"
	reactionCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/channels/" + channel:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": channel, "guild_id": guild, "permission_overwrites": []any{}})
		case "/users/@me":
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "42"})
		case "/applications/@me":
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "42", "flags": 1 << 19})
		case "/guilds/" + guild:
			_ = json.NewEncoder(w).Encode(Guild{ID: guild, OwnerID: "1"})
		case "/guilds/" + guild + "/roles":
			_ = json.NewEncoder(w).Encode([]Role{{ID: guild, Permissions: "66560"}})
		case "/guilds/" + guild + "/members/42":
			_ = json.NewEncoder(w).Encode(GuildMember{User: &User{ID: "42"}, Roles: []string{}})
		case "/channels/" + channel + "/messages":
			m := fixtureMessage("100")
			a := []Attachment{{ID: "55", Filename: "x.png", ContentType: "image/png"}}
			m.Attachments = &a
			_ = json.NewEncoder(w).Encode([]Message{m})
		default:
			if r.Method == "PUT" {
				reactionCalls++
				if reactionCalls == 1 {
					_, _ = db.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collector_control SET lease_until=clock_timestamp()-interval '1 second'`)
				}
				w.WriteHeader(204)
			} else {
				w.WriteHeader(404)
			}
		}
	}))
	defer server.Close()
	c := Collector{Store: store, Discord: NewDiscord("fixture", server.URL), Settings: Settings{Guild: guild, Channel: channel}}
	if err := c.Run(ctx); err == nil {
		t.Fatal("expired lease accepted")
	}
	if reactionCalls != 1 {
		t.Fatalf("reaction calls after expiry=%d", reactionCalls)
	}
}
func TestRevokedMessageContentDuringScanDoesNotAdvanceCheckpoint(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	guild := "1559802401802952706"
	channel := "1559804769327910932"
	checks := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/channels/" + channel:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": channel, "guild_id": guild, "permission_overwrites": []any{}})
		case "/users/@me":
			_ = json.NewEncoder(w).Encode(map[string]string{"id": "42"})
		case "/applications/@me":
			checks++
			flags := 1 << 19
			if checks >= 3 {
				flags = 0
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "42", "flags": flags})
		case "/guilds/" + guild:
			_ = json.NewEncoder(w).Encode(Guild{ID: guild, OwnerID: "1"})
		case "/guilds/" + guild + "/roles":
			_ = json.NewEncoder(w).Encode([]Role{{ID: guild, Permissions: "66560"}})
		case "/guilds/" + guild + "/members/42":
			_ = json.NewEncoder(w).Encode(GuildMember{User: &User{ID: "42"}, Roles: []string{}})
		case "/channels/" + channel + "/messages":
			_ = json.NewEncoder(w).Encode([]Message{fixtureMessage("100")})
		default:
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	c := Collector{Store: store, Discord: NewDiscord("fixture", server.URL), Settings: Settings{Guild: guild, Channel: channel}}
	if err := c.Run(ctx); !errors.Is(err, ErrMessageContent) {
		t.Fatalf("expected content failure, got %v", err)
	}
	var n, progress int
	err := db.QueryRow(ctx, `SELECT (SELECT count(*) FROM solitary_athlete.sync_status),(SELECT message_count FROM solitary_athlete.mukmuk_collection_scan)`).Scan(&n, &progress)
	if err != nil || n != 0 || progress != 0 {
		t.Fatalf("status=%d progress=%d err=%v", n, progress, err)
	}
}
func TestGuardedHTTPRejectsNextRequestAfterLeaseExpiry(t *testing.T) {
	ctx := context.Background()
	store, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := store.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		_, _ = db.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collector_control SET lease_until=clock_timestamp()-interval '1 second'`)
		_, _ = w.Write([]byte(`{}`))
	}))
	defer server.Close()
	api := guardedAPI{NewDiscord("fixture", server.URL), store, owner, f}
	var result map[string]any
	if err = api.Get(ctx, "/first", &result); err != nil {
		t.Fatal(err)
	}
	if err = api.Get(ctx, "/second", &result); !errors.Is(err, ErrLease) || calls != 1 {
		t.Fatalf("err=%v calls=%d", err, calls)
	}
}
