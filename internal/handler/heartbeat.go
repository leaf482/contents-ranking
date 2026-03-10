package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/segmentio/kafka-go"

	kafkapkg "contents-ranking/internal/kafka"
	"contents-ranking/internal/models"
)

type Handler struct {
	producer kafkapkg.Producer
}

func NewHandler(p kafkapkg.Producer) *Handler {
	return &Handler{producer: p}
}

func debugLog(format string, args ...interface{}) {
	if os.Getenv("DEBUG") != "" {
		log.Printf("[handler] "+format, args...)
	}
}

func (h *Handler) HandleHeartbeat(w http.ResponseWriter, r *http.Request) {
	debugLog("HandleHeartbeat entered")
	defer debugLog("HandleHeartbeat exited")

	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var event models.HeartbeatEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		log.Printf("handler: decode error: %v", err)
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Basic validation to prevent invalid events from entering the pipeline.
	if event.VideoID == "" || event.SessionID == "" || event.Playhead < 0 || event.Timestamp == 0 {
		log.Printf("handler: invalid heartbeat payload session=%s video=%s playhead=%d timestamp=%d",
			event.SessionID, event.VideoID, event.Playhead, event.Timestamp)
		http.Error(w, "invalid heartbeat payload", http.StatusBadRequest)
		return
	}

	debugLog("received heartbeat session=%s user=%s video=%s playhead=%dms",
		event.SessionID, event.UserID, event.VideoID, event.Playhead)

	payload, err := json.Marshal(event)
	if err != nil {
		log.Printf("handler: marshal error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// SessionID as key routes all events for the same session to the same partition.
	msg := kafka.Message{
		Key:   []byte(event.SessionID),
		Value: payload,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := h.producer.WriteMessages(ctx, msg); err != nil {
		log.Printf("handler: kafka write error (session=%s, video=%s): %v", event.SessionID, event.VideoID, err)
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	debugLog("published event session=%s video=%s", event.SessionID, event.VideoID)
	w.WriteHeader(http.StatusAccepted)
}
