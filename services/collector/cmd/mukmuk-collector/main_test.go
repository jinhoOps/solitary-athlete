package main

import (
	"errors"
	"github.com/jinhoOps/solitary-athlete/services/collector/internal/collector"
	"testing"
	"time"
)

func TestIntervalRejectsSubMinuteSchedules(t *testing.T) {
	for _, input := range []string{"5s", "0s", "bad"} {
		if _, err := parseInterval(input); err == nil {
			t.Fatalf("accepted %q", input)
		}
	}
	if got, err := parseInterval("1m"); err != nil || got != time.Minute {
		t.Fatalf("interval=%v err=%v", got, err)
	}
}
func TestErrorClassificationDoesNotExposeMessages(t *testing.T) {
	if got := errorLabel(&collector.DiscordError{Status: 429}); got != "discord_429" {
		t.Fatalf("rate limit = %q", got)
	}
	if got := errorLabel(errors.New("fixture-secret")); got != "other" {
		t.Fatalf("unredacted error = %q", got)
	}
	if got := errorLabel(collector.ErrDatabase); got != "database" {
		t.Fatalf("database = %q", got)
	}
	if got := errorLabel(collector.ErrMode); got != "mode" {
		t.Fatalf("mode = %q", got)
	}
}
