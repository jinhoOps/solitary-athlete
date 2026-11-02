package collector

import (
	"errors"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type User struct {
	ID         string `json:"id"`
	Username   string `json:"username"`
	GlobalName string `json:"global_name"`
	Bot        bool   `json:"bot"`
}
type Member struct {
	Nick string `json:"nick"`
}
type Attachment struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	Size        *int64 `json:"size"`
	Width       *int   `json:"width"`
	Height      *int   `json:"height"`
}
type Message struct {
	ID              string        `json:"id"`
	ChannelID       string        `json:"channel_id"`
	Type            *int          `json:"type"`
	Timestamp       string        `json:"timestamp"`
	EditedTimestamp *string       `json:"edited_timestamp"`
	Content         *string       `json:"content"`
	Author          *User         `json:"author"`
	Member          *Member       `json:"member"`
	Attachments     *[]Attachment `json:"attachments"`
}
type Image struct {
	ID          string  `json:"attachment_id"`
	Filename    string  `json:"filename"`
	ContentType *string `json:"content_type"`
	Size        *int64  `json:"size"`
	Width       *int    `json:"width"`
	Height      *int    `json:"height"`
}
type Event struct {
	MessageID, GuildID, ChannelID, UserID, Username string
	CreatedAt                                       time.Time
	EditedAt                                        *time.Time
	Memo                                            string
	HasPhoto                                        bool
	Attachments                                     []Image
}

func numeric(id string) bool {
	if id == "" {
		return false
	}
	for _, r := range id {
		if r < '0' || r > '9' {
			return false
		}
	}
	_, err := strconv.ParseUint(id, 10, 64)
	return err == nil
}
func imageAttachment(a Attachment) bool {
	if a.ContentType != "" {
		return strings.HasPrefix(strings.ToLower(a.ContentType), "image/")
	}
	switch strings.ToLower(filepath.Ext(a.Filename)) {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif":
		return true
	}
	return false
}
func EventFromMessage(m Message, guild, channel string) (*Event, error) {
	if !numeric(m.ID) || m.Type == nil || m.Author == nil || !numeric(m.Author.ID) || m.Timestamp == "" || m.Content == nil || m.Attachments == nil {
		return nil, errors.New("incomplete message")
	}
	if m.ChannelID != "" && m.ChannelID != channel {
		return nil, errors.New("message channel mismatch")
	}
	created, err := time.Parse(time.RFC3339Nano, m.Timestamp)
	if err != nil {
		return nil, errors.New("invalid timestamp")
	}
	var edited *time.Time
	if m.EditedTimestamp != nil {
		v, err := time.Parse(time.RFC3339Nano, *m.EditedTimestamp)
		if err != nil {
			return nil, errors.New("invalid edited timestamp")
		}
		edited = &v
	}
	if m.Author.Bot || (*m.Type != 0 && *m.Type != 19) {
		return nil, nil
	}
	var images []Image
	hasPhoto := false
	for _, a := range *m.Attachments {
		if imageAttachment(a) {
			hasPhoto = true
			if numeric(a.ID) {
				var mime *string
				if a.ContentType != "" {
					v := a.ContentType
					mime = &v
				}
				images = append(images, Image{a.ID, a.Filename, mime, a.Size, a.Width, a.Height})
			}
		}
	}
	if images == nil {
		images = []Image{}
	}
	memo := strings.TrimSpace(*m.Content)
	if memo == "" && !hasPhoto {
		return nil, nil
	}
	name := m.Author.Username
	if m.Author.GlobalName != "" {
		name = m.Author.GlobalName
	}
	if m.Member != nil && m.Member.Nick != "" {
		name = m.Member.Nick
	}
	if name == "" {
		return nil, errors.New("missing username")
	}
	return &Event{m.ID, guild, channel, m.Author.ID, name, created, edited, memo, hasPhoto, images}, nil
}
