package collector

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func fixtureStore(t *testing.T) (*Store, *pgx.Conn) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("isolated PostgreSQL required")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	_, err = conn.Exec(ctx, `TRUNCATE solitary_athlete.mukmuk_collection_scan,solitary_athlete.mukmuk_board_publication,solitary_athlete.mukmuk_collection_effects,solitary_athlete.mukmuk_collection_runs,solitary_athlete.mukmuk_identity_changes,solitary_athlete.mukmuk_account_reviews,solitary_athlete.mukmuk_account_link_actions,solitary_athlete.mukmuk_account_link_requests,solitary_athlete.mukmuk_person_accounts,solitary_athlete.mukmuk_people,solitary_athlete.mukmuk_daily_grass_history,solitary_athlete.mukmuk_monthly_grass_snapshots,solitary_athlete.workout_events,solitary_athlete.workout_logs,solitary_athlete.sync_state,solitary_athlete.sync_status,solitary_athlete.workout_refresh_jobs; INSERT INTO solitary_athlete.mukmuk_board_publication DEFAULT VALUES; INSERT INTO solitary_athlete.mukmuk_collection_scan DEFAULT VALUES; UPDATE solitary_athlete.mukmuk_identity_state SET enabled=false,revision=0,source_revision=0; UPDATE solitary_athlete.mukmuk_collector_control SET writer_mode='go',owner_id=NULL,lease_until='-infinity',fence=0`)
	if err != nil {
		t.Fatal(err)
	}
	workerURL := os.Getenv("TEST_WORKER_DATABASE_URL")
	if workerURL == "" {
		workerURL = url
	}
	s, err := NewStore(workerURL, true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(ctx) })
	return s, conn
}
func TestStoragePreservesExistingMessageAndFencesOldWriter(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	fence, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if fence == 0 {
		t.Fatal("no fence")
	}
	m := fixtureMessage("100")
	e, err := EventFromMessage(m, "1559802401802952706", "1559804769327910932")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.SaveNew(ctx, owner, fence, e); err != nil {
		t.Fatal(err)
	}
	e.Memo = "changed without refresh"
	if err = s.SaveNew(ctx, owner, fence, e); err != nil {
		t.Fatal(err)
	}
	var memo string
	if err = db.QueryRow(ctx, "SELECT memo FROM solitary_athlete.workout_logs").Scan(&memo); err != nil || memo != "run" {
		t.Fatalf("memo=%q error=%v", memo, err)
	}
	_, err = db.Exec(ctx, "UPDATE solitary_athlete.mukmuk_collector_control SET lease_until=clock_timestamp()-interval '1 second'")
	if err != nil {
		t.Fatal(err)
	}
	f2, err := s.Claim(ctx, "22222222-2222-4222-8222-222222222222")
	if err != nil || f2 <= fence {
		t.Fatalf("takeover=%d err=%v", f2, err)
	}
	if err = s.SaveNew(ctx, owner, fence, e); err == nil {
		t.Fatal("stale writer saved event")
	}
}
func TestFinishPublishesCursorSnapshotAndEffectsTogether(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	run := "33333333-3333-4333-8333-333333333333"
	if err = s.StartRun(ctx, owner, f, run); err != nil {
		t.Fatal(err)
	}
	if err = s.BeginScan(ctx, owner, f, "1559804769327910932", ""); err != nil {
		t.Fatal(err)
	}
	if err = s.SaveScanPage(ctx, owner, f, "1559804769327910932", Scan{}, Scan{Ceiling: "100", Complete: true, Count: 1}); err != nil {
		t.Fatal(err)
	}
	if err = s.Finish(ctx, owner, f, run, "1559804769327910932", "100", 1); err != nil {
		t.Fatal(err)
	}
	var count int
	var cursor string
	err = db.QueryRow(ctx, `SELECT s.last_message_id,(SELECT count(*) FROM solitary_athlete.mukmuk_collection_effects WHERE run_id=$1) FROM solitary_athlete.sync_state s`, run).Scan(&cursor, &count)
	if err != nil || cursor != "100" || count != 2 {
		t.Fatalf("cursor=%s count=%d err=%v", cursor, count, err)
	}
	if err = s.Finish(ctx, owner, f, run, "1559804769327910932", "101", 1); err == nil {
		t.Fatal("duplicate completion accepted")
	}
}
func TestReactionQueueIsStoredAfterEventAndAcknowledgedOnce(t *testing.T) {
	ctx := context.Background()
	s, _ := fixtureStore(t)
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
	pending, err := s.Pending(ctx, owner, f)
	if err != nil || len(pending) != 1 || pending[0].ID != "100" {
		t.Fatalf("pending=%v err=%v", pending, err)
	}
	if err = s.Reacted(ctx, owner, f, "100"); err != nil {
		t.Fatal(err)
	}
	pending, err = s.Pending(ctx, owner, f)
	if err != nil || len(pending) != 0 {
		t.Fatalf("pending=%v err=%v", pending, err)
	}
}
func TestRefreshAtomicallyUpdatesSourceAggregateAndProgress(t *testing.T) {
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
	_, err = db.Exec(ctx, `SELECT * FROM solitary_athlete.enqueue_workout_refresh('900','42','42','1559802401802952706','1559804769327910932')`)
	if err != nil {
		t.Fatal(err)
	}
	job, err := s.ClaimRefresh(ctx, owner, f)
	if err != nil || job == nil {
		t.Fatalf("claim %v %v", job, err)
	}
	e.Memo = "edited"
	if err = s.ApplyRefresh(ctx, owner, f, *job, "100", e); err != nil {
		t.Fatal(err)
	}
	var memo string
	var checked int
	err = db.QueryRow(ctx, `SELECT l.memo,j.checked FROM solitary_athlete.workout_logs l CROSS JOIN solitary_athlete.workout_refresh_jobs j WHERE j.id='900'`).Scan(&memo, &checked)
	if err != nil || memo != "edited" || checked != 1 {
		t.Fatalf("memo=%s checked=%d err=%v", memo, checked, err)
	}
	if err = s.ApplyRefresh(ctx, owner, f, *job, "100", e); err != nil {
		t.Fatal(err)
	}
	if err = s.FinishRefresh(ctx, owner, f, *job); err != nil {
		t.Fatal(err)
	}
	if err = s.ApplyRefresh(ctx, owner, f, *job, "100", nil); err == nil {
		t.Fatal("completed refresh accepted")
	}
}
func TestPhotoBackfillDoesNotReplaceConcurrentMetadata(t *testing.T) {
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
	e.HasPhoto = true
	if err = s.SaveNew(ctx, owner, f, e); err != nil {
		t.Fatal(err)
	}
	events, err := s.PhotoEvents(ctx, owner, f, "")
	if err != nil || len(events) != 1 {
		t.Fatalf("events=%v err=%v", events, err)
	}
	_, err = db.Exec(ctx, `UPDATE solitary_athlete.workout_events SET attachments='[{"attachment_id":"999"}]'::jsonb WHERE message_id='100'`)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.BackfillPhoto(ctx, owner, f, "100", []Image{{ID: "123"}}); err != nil {
		t.Fatal(err)
	}
	var id string
	err = db.QueryRow(ctx, `SELECT attachments->0->>'attachment_id' FROM solitary_athlete.workout_events WHERE message_id='100'`).Scan(&id)
	if err != nil || id != "999" {
		t.Fatalf("id=%s err=%v", id, err)
	}
}
func TestGoWriterDoesNotOverlapLegacyPythonLock(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('solitary_athlete.sync'),hashtext($1))`, "1559804769327910932")
	if err != nil {
		t.Fatal(err)
	}
	e, err := EventFromMessage(fixtureMessage("100"), "1559802401802952706", "1559804769327910932")
	if err != nil {
		t.Fatal(err)
	}
	if err = s.SaveNew(ctx, owner, f, e); err == nil {
		t.Fatal("wrote while python held channel lock")
	}
	if err = tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if err = s.SaveNew(ctx, owner, f, e); err != nil {
		t.Fatal(err)
	}
}
func TestFinishDoesNotPublishWhenLatestObservationIsInFuture(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	run := "33333333-3333-4333-8333-333333333333"
	if err = s.StartRun(ctx, owner, f, run); err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `SELECT solitary_athlete.capture_monthly_grass_snapshot(clock_timestamp()+interval '1 day')`)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.BeginScan(ctx, owner, f, "1559804769327910932", ""); err != nil {
		t.Fatal(err)
	}
	if err = s.SaveScanPage(ctx, owner, f, "1559804769327910932", Scan{}, Scan{Ceiling: "100", Complete: true}); err != nil {
		t.Fatal(err)
	}
	if err = s.Finish(ctx, owner, f, run, "1559804769327910932", "100", 0); err == nil {
		t.Fatal("future snapshot accepted")
	}
	var n int
	err = db.QueryRow(ctx, `SELECT count(*) FROM solitary_athlete.sync_status`).Scan(&n)
	if err != nil || n != 0 {
		t.Fatalf("status rows=%d err=%v", n, err)
	}
}
func TestClaimMarksAbandonedRunsFailed(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	run := "33333333-3333-4333-8333-333333333333"
	if err = s.StartRun(ctx, owner, f, run); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collector_control SET lease_until=clock_timestamp()-interval '1 second'`); err != nil {
		t.Fatal(err)
	}
	if _, err = s.Claim(ctx, "22222222-2222-4222-8222-222222222222"); err != nil {
		t.Fatal(err)
	}
	var status string
	if err = db.QueryRow(ctx, `SELECT status FROM solitary_athlete.mukmuk_collection_runs WHERE id=$1`, run).Scan(&status); err != nil || status != "failed" {
		t.Fatalf("status=%s err=%v", status, err)
	}
}
func TestClaimDistinguishesBusyFromDisabledMode(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	if _, err := s.Claim(ctx, owner); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Claim(ctx, "22222222-2222-4222-8222-222222222222"); !errors.Is(err, ErrLease) {
		t.Fatalf("busy: %v", err)
	}
	if _, err := db.Exec(ctx, `UPDATE solitary_athlete.mukmuk_collector_control SET writer_mode='python',lease_until='-infinity'`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Claim(ctx, owner); !errors.Is(err, ErrMode) {
		t.Fatalf("wrong mode: %v", err)
	}
}
func TestProductionDatabaseRequiresVerifiedTLS(t *testing.T) {
	if _, err := NewStore("postgresql://worker:secret@example.com/db?sslmode=require", false); err == nil {
		t.Fatal("unverified TLS accepted")
	}
	if _, err := NewStore("postgresql://worker:secret@example.com/db?sslmode=disable", false); err == nil {
		t.Fatal("plaintext accepted")
	}
	if _, err := NewStore("postgresql://worker:secret@example.com/db?sslmode=verify-full", false); err != nil {
		t.Fatal(err)
	}
}
func TestPruneRemovesOnlyOldFinishedRunsWithoutTouchingHistory(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	old := "33333333-3333-4333-8333-333333333333"
	pending := "44444444-4444-4444-8444-444444444444"
	_, err = db.Exec(ctx, `INSERT INTO solitary_athlete.mukmuk_collection_runs(id,fence,status,started_at,completed_at) VALUES($1,1,'completed',now()-interval '40 days',now()-interval '40 days'),($2,1,'completed',now()-interval '40 days',now()-interval '40 days')`, old, pending)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(ctx, `INSERT INTO solitary_athlete.mukmuk_collection_effects(run_id,kind,status,expires_at) VALUES($1,'identity','done',now()-interval '40 days'),($1,'board','done',NULL),($2,'identity','done',now()-interval '40 days'),($2,'board','queued',NULL)`, old, pending)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Prune(ctx, owner, f); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = db.QueryRow(ctx, `SELECT count(*) FROM solitary_athlete.mukmuk_collection_runs`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("remaining=%d err=%v", count, err)
	}
}
func TestOnlyOneConcurrentCollectorClaimsTheWriterLease(t *testing.T) {
	ctx := context.Background()
	s, _ := fixtureStore(t)
	s2, err := NewStore(os.Getenv("TEST_WORKER_DATABASE_URL"), true)
	if os.Getenv("TEST_WORKER_DATABASE_URL") == "" {
		s2, err = NewStore(os.Getenv("TEST_DATABASE_URL"), true)
	}
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	start := make(chan struct{})
	for i, store := range []*Store{s, s2} {
		go func(i int, store *Store) {
			<-start
			_, err := store.Claim(ctx, fmt.Sprintf("%08d-1111-4111-8111-111111111111", i+1))
			results <- err
		}(i, store)
	}
	close(start)
	first, second := <-results, <-results
	if !((first == nil && errors.Is(second, ErrLease)) || (second == nil && errors.Is(first, ErrLease))) {
		t.Fatalf("results %v %v", first, second)
	}
}
func TestCollectorBookkeepingIsNotReadableByPublicRoles(t *testing.T) {
	ctx := context.Background()
	_, db := fixtureStore(t)
	var exposed bool
	err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM unnest(ARRAY['mukmuk_collector_control','mukmuk_collection_scan','mukmuk_collection_runs','mukmuk_collection_effects','mukmuk_board_publication']) AS t(name) CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) AS r(role) WHERE has_table_privilege(r.role,'solitary_athlete.'||t.name,'SELECT'))`).Scan(&exposed)
	if err != nil || exposed {
		t.Fatalf("public access=%v err=%v", exposed, err)
	}
}
func TestConnectionLimitRetriesOnlyBeforeWorkBegins(t *testing.T) {
	ctx := context.Background()
	s, _ := fixtureStore(t)
	url := os.Getenv("TEST_WORKER_DATABASE_URL")
	if url == "" {
		t.Skip("worker role required")
	}
	var holders []*pgx.Conn
	for i := 0; i < 3; i++ {
		c, err := pgx.Connect(ctx, url)
		if err != nil {
			t.Fatal(err)
		}
		holders = append(holders, c)
	}
	released := make(chan struct{})
	go func() { time.Sleep(150 * time.Millisecond); holders[0].Close(context.Background()); close(released) }()
	defer func() {
		<-released
		for _, c := range holders {
			c.Close(ctx)
		}
	}()
	if _, err := s.Claim(ctx, "11111111-1111-4111-8111-111111111111"); err != nil {
		t.Fatalf("did not recover after connection returned: %v", err)
	}
}
func TestMultipleDailyEventsAggregateAndRefreshCanRemovePhoto(t *testing.T) {
	ctx := context.Background()
	s, db := fixtureStore(t)
	owner := "11111111-1111-4111-8111-111111111111"
	f, err := s.Claim(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	first, _ := EventFromMessage(fixtureMessage("100"), "1559802401802952706", "1559804769327910932")
	second, _ := EventFromMessage(fixtureMessage("101"), first.GuildID, first.ChannelID)
	second.Memo = "photo"
	second.HasPhoto = true
	if err = s.SaveNew(ctx, owner, f, first); err != nil {
		t.Fatal(err)
	}
	if err = s.SaveNew(ctx, owner, f, second); err != nil {
		t.Fatal(err)
	}
	if err = s.SaveNew(ctx, owner, f, second); err != nil {
		t.Fatal(err)
	}
	var count int
	var hasPhoto bool
	var memo, date string
	err = db.QueryRow(ctx, `SELECT verification_count,has_photo,memo,log_date::text FROM solitary_athlete.workout_logs`).Scan(&count, &hasPhoto, &memo, &date)
	if err != nil || count != 2 || !hasPhoto || memo != "run\nphoto" || date != "2026-10-14" {
		t.Fatalf("count=%d photo=%t memo=%q date=%s err=%v", count, hasPhoto, memo, date, err)
	}
	if _, err = db.Exec(ctx, `SELECT * FROM solitary_athlete.enqueue_workout_refresh('900','42','42','1559802401802952706','1559804769327910932')`); err != nil {
		t.Fatal(err)
	}
	job, err := s.ClaimRefresh(ctx, owner, f)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.ApplyRefresh(ctx, owner, f, *job, "100", first); err != nil {
		t.Fatal(err)
	}
	second.HasPhoto = false
	if err = s.ApplyRefresh(ctx, owner, f, *job, "101", second); err != nil {
		t.Fatal(err)
	}
	err = db.QueryRow(ctx, `SELECT verification_count,has_photo FROM solitary_athlete.workout_logs`).Scan(&count, &hasPhoto)
	if err != nil || count != 2 || hasPhoto {
		t.Fatalf("count=%d photo=%t err=%v", count, hasPhoto, err)
	}
}
func TestVerifiedTLSConnectionToPostgres(t *testing.T) {
	address := os.Getenv("TEST_TLS_DATABASE_URL")
	if address == "" {
		t.Skip("TLS PostgreSQL fixture required")
	}
	s, err := NewStore(address, false)
	if err != nil {
		t.Fatal(err)
	}
	var n int
	err = s.transaction(context.Background(), func(tx pgx.Tx) error { return tx.QueryRow(context.Background(), "SELECT 1").Scan(&n) })
	if err != nil || n != 1 {
		t.Fatalf("verified connection failed: result=%d err=%v", n, err)
	}
	parsed, err := url.Parse(address)
	if err != nil {
		t.Fatal(err)
	}
	values := parsed.Query()
	values.Del("sslrootcert")
	parsed.RawQuery = values.Encode()
	t.Setenv("PGSSLROOTCERT", "")
	untrusted, err := NewStore(parsed.String(), false)
	if err != nil {
		t.Fatal(err)
	}
	if err = untrusted.transaction(context.Background(), func(tx pgx.Tx) error { return tx.QueryRow(context.Background(), "SELECT 1").Scan(&n) }); err == nil {
		t.Fatal("untrusted certificate accepted")
	}
}
