package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"contents-ranking/internal/config"
	redispkg "contents-ranking/internal/redis"
	"contents-ranking/internal/worker"
)

const consumerGroupID = "contents-ranking-worker"

func main() {
	cfg := config.LoadConfig()

	rdb, err := redispkg.NewClient(cfg.RedisAddr)
	if err != nil {
		log.Fatalf("startup: redis connection failed: %v", err)
	}
	defer func() {
		if cerr := rdb.Close(); cerr != nil {
			log.Printf("worker: redis close error: %v", cerr)
		}
	}()

	log.Printf("worker: connected to Redis at %s", cfg.RedisAddr)

	processor := worker.NewProcessor(rdb)
	w := worker.New(cfg.KafkaBrokers, cfg.KafkaTopic, consumerGroupID, processor)
	defer func() {
		if cerr := w.Close(); cerr != nil {
			log.Printf("worker: kafka reader close error: %v", cerr)
		}
	}()

	ctx, cancel := context.WithCancel(context.Background())

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		<-quit
		log.Println("worker: shutdown signal received")
		cancel()
	}()

	log.Printf("worker: consuming topic=%s group=%s", cfg.KafkaTopic, consumerGroupID)
	w.Run(ctx)

	log.Println("worker: shutdown complete")
}
