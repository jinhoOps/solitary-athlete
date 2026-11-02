package collector

import (
	"encoding/json"
	"testing"
	"time"
)

func TestEventFromMessagePreservesImagesAndKSTDate(t *testing.T) {
	raw := `{"id":"120","type":0,"timestamp":"2026-10-13T15:30:00Z","edited_timestamp":null,"content":"  달리기  ","author":{"id":"42","username":"name"},"member":{"nick":"별명"},"attachments":[{"id":"55","filename":"proof.png","content_type":"image/png","width":800,"height":600},{"id":"56","filename":"note.txt","content_type":"text/plain"}]}`
	var msg Message
	if err := json.Unmarshal([]byte(raw), &msg); err != nil {
		t.Fatal(err)
	}
	e, err := EventFromMessage(msg, "g", "c")
	if err != nil || e == nil {
		t.Fatalf("event=%v err=%v", e, err)
	}
	if e.Username != "별명" || e.Memo != "달리기" || !e.HasPhoto || len(e.Attachments) != 1 || e.Attachments[0].ID != "55" {
		t.Fatalf("unexpected event: %+v", e)
	}
	kst := time.FixedZone("KST", 9*3600)
	if e.CreatedAt.In(kst).Format("2006-01-02") != "2026-10-14" {
		t.Fatal(e.CreatedAt)
	}
}

func TestEventFromMessageRejectsInvalidAndIgnoresBots(t *testing.T) {
	var m Message
	if err := json.Unmarshal([]byte(`{"id":"10","type":0,"timestamp":"2026-10-13T00:00:00Z","content":"x","author":{"id":"1","username":"u","bot":true},"attachments":[]}`), &m); err != nil {
		t.Fatal(err)
	}
	if e, err := EventFromMessage(m, "g", "c"); err != nil || e != nil {
		t.Fatalf("bot: %v %v", e, err)
	}
	m.Author.Bot = false
	m.Timestamp = "not a date"
	if _, err := EventFromMessage(m, "g", "c"); err == nil {
		t.Fatal("invalid timestamp accepted")
	}
}
