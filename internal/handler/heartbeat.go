package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
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

func (h *Handler) HandleHeartbeat(w http.ResponseWriter, r *http.Request) {
	log.Println("handler: HandleHeartbeat entered")
	defer log.Println("handler: HandleHeartbeat exited")

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

	log.Printf("Received heartbeat request for VideoID: %s", event.VideoID)

	payload, err := json.Marshal(event)
	if err != nil {
		log.Printf("handler: marshal error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// VideoID as key routes all events for the same video to the same partition.
	msg := kafka.Message{
		Key:   []byte(event.VideoID),
		Value: payload,
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := h.producer.WriteMessages(ctx, msg); err != nil {
		log.Printf("handler: kafka write error (video=%s): %v", event.VideoID, err)
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return
	}

	log.Printf("handler: published event session=%s video=%s", event.SessionID, event.VideoID)
	w.WriteHeader(http.StatusAccepted)
}
