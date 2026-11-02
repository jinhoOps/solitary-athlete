package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestRefreshPermissionsRespectRolesAndChannelOverrides(t *testing.T) {
	roles := []Role{{ID: "1", Permissions: "0"}, {ID: "2", Permissions: "66560"}, {ID: "3", Permissions: "32"}}
	user := GuildMember{User: &User{ID: "5"}, Roles: []string{"2"}}
	channel := Channel{GuildID: "1", Overwrites: []Overwrite{{ID: "1", Type: 0, Deny: "1024", Allow: "0"}}}
	if !canRefresh(user, "5", "2", roles, "9", "1") || canRefresh(user, "6", "2", roles, "9", "1") {
		t.Fatal("member scope")
	}
	if channelPermissions(user, roles, channel, "9")&66560 == 66560 {
		t.Fatal("channel denial ignored")
	}
	user.Roles = append(user.Roles, "3")
	if !canRefresh(user, "6", "2", roles, "9", "1") {
		t.Fatal("manager denied")
	}
}
func TestOnlyUnknownMessageConfirmsDeletion(t *testing.T) {
	if !isDeleted(&DiscordError{Status: 404, Code: 10008}) || isDeleted(&DiscordError{Status: 404, Code: 10003}) || isDeleted(&DiscordError{Status: 403, Code: 10008}) {
		t.Fatal("ambiguous failure counted as deletion")
	}
}

type refreshFixture struct {
	message         any
	failure         error
	permissionCalls int
}

func (f *refreshFixture) Get(_ context.Context, path string, dst any) error {
	var value any
	switch {
	case strings.HasSuffix(path, "/roles"):
		value = []Role{{ID: "1559802401802952706", Permissions: "0"}, {ID: "50", Permissions: "0"}, {ID: "51", Permissions: "66560"}}
	case strings.HasSuffix(path, "/members/42"):
		value = GuildMember{User: &User{ID: "42"}, Roles: []string{"50"}}
		f.permissionCalls++
	case strings.HasSuffix(path, "/members/99"):
		value = GuildMember{User: &User{ID: "99"}, Roles: []string{"51"}}
	case path == "/guilds/1559802401802952706":
		value = Guild{ID: "1559802401802952706", OwnerID: "1"}
	case path == "/channels/1559804769327910932":
		value = Channel{ID: "1559804769327910932", GuildID: "1559802401802952706", Overwrites: []Overwrite{}}
	case strings.HasSuffix(path, "/messages/100"):
		if f.failure != nil {
			return f.failure
		}
		value = f.message
	default:
		return fmt.Errorf("unexpected path")
	}
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, dst)
}
func TestRefreshDefersIncompleteResponseAndOnlyDeletesConfirmedMissingMessage(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	e, err := EventFromMessage(fixtureMessage("100"), "1559802401802952706", "1559804769327910932")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.SaveNew(ctx, owner, f, e); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `SELECT * FROM solitary_athlete.enqueue_workout_refresh('900','42','42','1559802401802952706','1559804769327910932')`); err != nil {
		t.Fatal(err)
	}
	api := &refreshFixture{message: map[string]any{"id": "100", "author": map[string]string{"id": "42"}}}
	settings := RefreshSettings{"1559802401802952706", "1559804769327910932", "50", "99"}
	if err = processRefresh(ctx, s, api, owner, f, settings); err != nil {
		t.Fatal(err)
	}
	var n, checked int
	var code string
	if err = db.QueryRow(ctx, `SELECT (SELECT count(*) FROM solitary_athlete.workout_events),checked,error_code FROM solitary_athlete.workout_refresh_jobs`).Scan(&n, &checked, &code); err != nil || n != 1 || checked != 0 || code != "invalid_source_response" {
		t.Fatalf("n=%d checked=%d code=%s err=%v", n, checked, code, err)
	}
	if _, err = db.Exec(ctx, `UPDATE solitary_athlete.workout_refresh_jobs SET next_attempt_at=now()`); err != nil {
		t.Fatal(err)
	}
	api.failure = &DiscordError{Status: 404, Code: 10008}
	api.permissionCalls = 0
	if err = processRefresh(ctx, s, api, owner, f, settings); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(ctx, `SELECT (SELECT count(*) FROM solitary_athlete.workout_events),checked FROM solitary_athlete.workout_refresh_jobs`).Scan(&n, &checked); err != nil || n != 0 || checked != 1 || api.permissionCalls < 2 {
		t.Fatalf("n=%d checked=%d calls=%d err=%v", n, checked, api.permissionCalls, err)
	}
}
func TestRefreshDefersEmptyContentWithoutDeletingRecordedWorkout(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	e, _ := EventFromMessage(fixtureMessage("100"), "1559802401802952706", "1559804769327910932")
	if err = s.SaveNew(ctx, owner, f, e); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `SELECT * FROM solitary_athlete.enqueue_workout_refresh('900','42','42','1559802401802952706','1559804769327910932')`); err != nil {
		t.Fatal(err)
	}
	empty := fixtureMessage("100")
	blank := ""
	empty.Content = &blank
	api := &refreshFixture{message: empty}
	settings := RefreshSettings{"1559802401802952706", "1559804769327910932", "50", "99"}
	if err = processRefresh(ctx, s, api, owner, f, settings); err != nil {
		t.Fatal(err)
	}
	var n, checked int
	err = db.QueryRow(ctx, `SELECT (SELECT count(*) FROM solitary_athlete.workout_events),checked FROM solitary_athlete.workout_refresh_jobs`).Scan(&n, &checked)
	if err != nil || n != 1 || checked != 0 {
		t.Fatalf("deleted or advanced: n=%d checked=%d err=%v", n, checked, err)
	}
}
