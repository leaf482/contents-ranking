package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"contents-ranking/internal/config"
	"contents-ranking/internal/handler"
	"contents-ranking/internal/kafka"
)

func main() {
	cfg := config.LoadConfig()

	if err := kafka.EnsureTopicExists(cfg.KafkaBrokers, cfg.KafkaTopic); err != nil {
		log.Fatalf("startup: kafka topic check failed: %v", err)
	}

	producer := kafka.NewProducer(cfg.KafkaBrokers, cfg.KafkaTopic)

	h := handler.NewHandler(producer)

	mux := http.NewServeMux()
	mux.HandleFunc("/v1/heartbeat", h.HandleHeartbeat)

	srv := &http.Server{
		Addr:    ":" + cfg.ServerPort,
		Handler: mux,
	}

	// Run server in a goroutine so the main goroutine can listen for signals.
	go func() {
		log.Printf("API Server is running on port %s", cfg.ServerPort)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("api: server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	log.Println("api: shutdown signal received")

	// Give in-flight HTTP requests up to 10 s to complete.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("api: http shutdown error: %v", err)
	}

	if err := producer.Close(); err != nil {
		log.Printf("api: kafka producer close error: %v", err)
	}

	log.Println("api: shutdown complete")
}
