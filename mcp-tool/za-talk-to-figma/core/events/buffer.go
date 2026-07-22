package events

import (
	"sync"
	"time"
)

type Buffer struct {
	mu    sync.RWMutex
	limit int
	items []ObservedEvent
}

func NewBuffer(limit int) *Buffer {
	if limit <= 0 {
		limit = 120
	}
	return &Buffer{limit: limit}
}

func (b *Buffer) Add(event RuntimeEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.items = append(b.items, ObservedEvent{
		Type:      event.Type,
		SessionID: event.SessionID,
		ClientID:  event.ClientID,
		RequestID: event.RequestID,
		Timestamp: time.Now(),
		Data:      event.Data,
	})
	if len(b.items) > b.limit {
		b.items = append([]ObservedEvent(nil), b.items[len(b.items)-b.limit:]...)
	}
}

func (b *Buffer) Recent(limit int) []ObservedEvent {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if limit <= 0 || limit > len(b.items) {
		limit = len(b.items)
	}
	start := len(b.items) - limit
	out := make([]ObservedEvent, limit)
	copy(out, b.items[start:])
	return out
}
