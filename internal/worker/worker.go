package worker

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
)

type Worker struct {
	reader    *kafka.Reader
	processor *Processor
	batchSize int
	flushInt  time.Duration
}

func New(brokers []string, topic, groupID string, processor *Processor, batchSize int, flushInterval time.Duration) *Worker {
	if batchSize <= 0 {
		batchSize = 50
	}
	if flushInterval <= 0 {
		flushInterval = 100 * time.Millisecond
	}
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		Topic:          topic,
		GroupID:        groupID,
		MinBytes:       1,
		MaxBytes:       10e6,
		CommitInterval: time.Second,
	})
	return &Worker{
		reader:    r,
		processor: processor,
		batchSize: batchSize,
		flushInt:  flushInterval,
	}
}

func debugLog(format string, args ...interface{}) {
	if os.Getenv("DEBUG") != "" {
		log.Printf("[worker:batch] "+format, args...)
	}
}

// Run consumes messages until ctx is cancelled.
// Uses a buffer-based batcher: flush on N messages or T interval.
// Graceful shutdown flushes remaining buffer before exit.
func (w *Worker) Run(ctx context.Context) {
	log.Println("worker: starting consumer loop (batch mode)")
	log.Printf("worker: batch config size=%d flush=%v", w.batchSize, w.flushInt)

	msgCh := make(chan kafka.Message, w.batchSize*2)
	var wg sync.WaitGroup

	// Producer: fetch from Kafka and push to channel
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer close(msgCh)
		for {
			msg, err := w.reader.FetchMessage(ctx)
			if err != nil {
				if ctx.Err() != nil {
					log.Println("worker: context cancelled, stopping fetch")
					return
				}
				log.Printf("worker: fetch error: %v", err)
				continue
			}
			select {
			case msgCh <- msg:
			case <-ctx.Done():
				log.Println("worker: context cancelled during send")
				return
			}
		}
	}()

	// Batcher: collect and flush on size or interval
	wg.Add(1)
	go func() {
		defer wg.Done()
		batch := make([]kafka.Message, 0, w.batchSize)
		ticker := time.NewTicker(w.flushInt)
		defer ticker.Stop()

		flush := func(ctx context.Context) {
			if len(batch) == 0 {
				return
			}
			toProcess := make([]kafka.Message, len(batch))
			copy(toProcess, batch)
			batch = batch[:0]

			ranked, err := w.processor.ProcessBatch(ctx, toProcess)
			if err != nil {
				log.Printf("worker: batch process error: %v", err)
				return
			}
			if err := w.reader.CommitMessages(ctx, toProcess...); err != nil {
				log.Printf("worker: batch commit error: %v", err)
			}
			log.Printf("worker: processed batch size=%d ranked=%d", len(toProcess), ranked)
		}

		drainAndFlush := func(ctx context.Context) {
			for msg := range msgCh {
				batch = append(batch, msg)
				if len(batch) >= w.batchSize {
					flush(ctx)
				}
			}
			flush(ctx)
		}

		for {
			select {
			case <-ctx.Done():
				shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				drainAndFlush(shutdownCtx)
				log.Println("worker: batcher shutdown, flushed remaining")
				return
			case msg, ok := <-msgCh:
				if !ok {
					flush(ctx)
					return
				}
				batch = append(batch, msg)
				if len(batch) >= w.batchSize {
					flush(ctx)
					ticker.Reset(w.flushInt)
				}
			case <-ticker.C:
				flush(ctx)
			}
		}
	}()

	wg.Wait()
	log.Println("worker: consumer loop stopped")
}

func (w *Worker) Close() error {
	return w.reader.Close()
}
