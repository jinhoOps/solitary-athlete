package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func fixtureMessage(id string) Message {
	var m Message
	_ = json.Unmarshal([]byte(fmt.Sprintf(`{"id":"%s","type":0,"timestamp":"2026-10-13T15:30:00Z","content":"run","author":{"id":"42","username":"u"},"attachments":[]}`, id)), &m)
	return m
}

func TestDiscordRespectsRetryAfterAndReturnsErrorCode(t *testing.T) {
	count := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		if r.Header.Get("Authorization") != "Bot test" {
			t.Error("missing bot auth")
		}
		if count == 1 {
			w.WriteHeader(429)
			_, _ = w.Write([]byte(`{"retry_after":0.001}`))
			return
		}
		w.WriteHeader(404)
		_, _ = w.Write([]byte(`{"code":10008}`))
	}))
	defer s.Close()
	client := NewDiscord("test", s.URL)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	var out Message
	err := client.Get(ctx, "/x", &out)
	e, ok := err.(*DiscordError)
	if !ok || e.Status != 404 || e.Code != 10008 || count != 2 {
		t.Fatalf("calls=%d err=%v", count, err)
	}
}
func TestNullMessagePageIsNotAcceptedAsEmpty(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`null`)) }))
	defer server.Close()
	api := NewDiscord("fixture", server.URL)
	if _, err := api.Messages(context.Background(), "1", ""); err == nil {
		t.Fatal("null page accepted")
	}
	if _, err := api.HasNew(context.Background(), "1", "10"); err == nil {
		t.Fatal("null probe accepted")
	}
}
