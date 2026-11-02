package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jinhoOps/solitary-athlete/services/collector/internal/collector"
	"github.com/joho/godotenv"
)

var version = "development"

func parseInterval(s string) (time.Duration, error) {
	d, err := time.ParseDuration(s)
	if err != nil || d < time.Minute {
		return 0, errors.New("interval must be at least 1m")
	}
	return d, nil
}
func errorLabel(err error) string {
	switch {
	case errors.Is(err, collector.ErrLease):
		return "busy"
	case errors.Is(err, collector.ErrMode):
		return "mode"
	case errors.Is(err, collector.ErrDatabase):
		return "database"
	case errors.Is(err, context.DeadlineExceeded):
		return "deadline"
	}
	var discord *collector.DiscordError
	if errors.As(err, &discord) && discord.Status >= 400 && discord.Status <= 599 {
		return fmt.Sprintf("discord_%d", discord.Status)
	}
	return "other"
}

func run() error {
	once := flag.Bool("once", false, "수집을 한 번 실행")
	photos := flag.Bool("backfill-photos", false, "사진 메타데이터 보완")
	intervalFlag := flag.String("interval", "1m", "수집 간격 (최소 1m)")
	flag.Parse()
	interval, err := parseInterval(*intervalFlag)
	if err != nil {
		return err
	}
	if f := os.Getenv("MUKMUK_ENV_FILE"); f != "" {
		if err = godotenv.Load(f); err != nil {
			return errors.New("environment file unavailable")
		}
	}
	required := []string{"DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "DISCORD_AUTH_CHANNEL_ID", "MUKMUK_DATABASE_URL"}
	for _, k := range required {
		if os.Getenv(k) == "" {
			return errors.New("missing required settings")
		}
	}
	store, err := collector.NewStore(os.Getenv("MUKMUK_DATABASE_URL"), false)
	if err != nil {
		return err
	}
	check, flex := "✅", "💪"
	if id := os.Getenv("DISCORD_CHECK_EMOJI_ID"); id != "" {
		check = "mukmuk_check:" + id
	}
	if id := os.Getenv("DISCORD_FLEX_EMOJI_ID"); id != "" {
		flex = "mukmuk_flex:" + id
	}
	service := collector.Collector{Store: store, Discord: collector.NewDiscord(os.Getenv("DISCORD_BOT_TOKEN"), ""), Settings: collector.Settings{Guild: os.Getenv("DISCORD_GUILD_ID"), Channel: os.Getenv("DISCORD_AUTH_CHANNEL_ID"), MemberRole: os.Getenv("DISCORD_ROLE_MEMBER_ID"), CheckEmoji: check, FlexEmoji: flex}}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if *photos {
		ctx, stop := context.WithTimeout(ctx, 15*time.Minute)
		defer stop()
		return service.BackfillPhotos(ctx)
	}
	execute := func() error {
		call, stop := context.WithTimeout(ctx, 4*time.Minute)
		defer stop()
		return service.Run(call)
	}
	log.Printf("collector_start version=%s interval=%s", version, interval)
	if *once {
		err = execute()
		if errors.Is(err, collector.ErrLease) {
			log.Print("collector_skipped=already_running")
			return nil
		}
		return err
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if err = execute(); err != nil {
			if ctx.Err() == nil {
				log.Printf("collector_not_completed reason=%s", errorLabel(err))
			}
		} else {
			log.Print("collector_success")
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}
func main() {
	if err := run(); err != nil {
		log.Printf("collector_stopped reason=%s", errorLabel(err))
		os.Exit(1)
	}
}
