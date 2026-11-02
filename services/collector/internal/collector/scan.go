package collector

import (
	"context"
	"errors"
	"strconv"
)

// Persist each completely saved page before fetching the next. The public
// collection cursor is advanced only after the entire frozen scan completes.
func (c *Collector) scanMessages(ctx context.Context, api guardedAPI, owner string, fence int64, scan Scan) (Scan, error) {
	var floor uint64
	var err error
	if scan.Base != "" {
		floor, err = strconv.ParseUint(scan.Base, 10, 64)
		if err != nil {
			return scan, errors.New("invalid scan cursor")
		}
	}
	for !scan.Complete {
		prior := scan
		if err = verifyContentIntent(ctx, api); err != nil {
			return scan, err
		}
		if err = c.Store.Renew(ctx, owner, fence); err != nil {
			return scan, err
		}
		page, err := c.Discord.Messages(ctx, c.Settings.Channel, scan.Before)
		if err != nil {
			return scan, err
		}
		if err = verifyContentIntent(ctx, api); err != nil {
			return scan, err
		}
		if scan.Ceiling == "" {
			if len(page) > 0 {
				scan.Ceiling = page[0].ID
			} else {
				scan.Ceiling = scan.Base
			}
		}
		done := len(page) < 100
		events := make([]*Event, 0, len(page))
		var previous uint64
		for i, msg := range page {
			id, e := strconv.ParseUint(msg.ID, 10, 64)
			if e != nil || id == 0 {
				return prior, errors.New("invalid message id")
			}
			if i > 0 && id >= previous {
				return prior, errors.New("non-progressing message page")
			}
			if scan.Before != "" {
				before, e := strconv.ParseUint(scan.Before, 10, 64)
				if e != nil || id >= before {
					return prior, errors.New("non-progressing message cursor")
				}
			}
			previous = id
			if scan.Base != "" && id <= floor {
				done = true
				break
			}
			event, e := EventFromMessage(msg, c.Settings.Guild, c.Settings.Channel)
			if e != nil {
				return prior, e
			}
			events = append(events, event)
		}
		for _, event := range events {
			if err = c.Store.SaveNew(ctx, owner, fence, event); err != nil {
				return prior, err
			}
		}
		if err = verifyContentIntent(ctx, api); err != nil {
			return prior, err
		}
		if len(page) > 0 {
			scan.Before = page[len(page)-1].ID
		}
		scan.Count += len(events)
		scan.Complete = done
		if err = c.Store.SaveScanPage(ctx, owner, fence, c.Settings.Channel, prior, scan); err != nil {
			return prior, err
		}
	}
	return scan, nil
}
