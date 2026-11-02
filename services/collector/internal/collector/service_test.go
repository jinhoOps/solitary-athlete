package collector

import (
	"context"
	"encoding/json"
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
