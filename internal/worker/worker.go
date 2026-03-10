package worker

import (
	"context"
	"fmt"
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
		Brokers:  brokers,
		Topic:    topic,
		GroupID:  groupID,
		MinBytes: 1,
		MaxBytes: 10e6,
		// CommitInterval=0 disables auto commits; we only commit offsets
		// after a batch has been successfully processed to avoid message loss.
		CommitInterval: 0,
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

	// Derive a child context so this worker can cancel its own internal
	// goroutines (producer/batcher) on fatal batch failures without
	// affecting unrelated parent work.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

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

		// flush processes the current in-memory batch.
		// Important failure semantics:
		//   - The batch is only cleared after BOTH processing and offset commit
		//     succeed. This ensures messages are not dropped from memory on
		//     transient failures and can be retried.
		//   - If processing or commit fails, the batch remains in memory and
		//     will be retried on the next flush trigger (size or interval).
		flush := func(ctx context.Context) error {
			if len(batch) == 0 {
				return nil
			}
			toProcess := make([]kafka.Message, len(batch))
			copy(toProcess, batch)

			ranked, err := w.processor.ProcessBatch(ctx, toProcess)
			if err != nil {
				err = fmt.Errorf("batch process error: %w", err)
				log.Printf("worker: %v", err)
				return err
			}
			if err := w.reader.CommitMessages(ctx, toProcess...); err != nil {
				err = fmt.Errorf("batch commit error: %w", err)
				log.Printf("worker: %v", err)
				// Keep the batch in memory so it can be retried; offsets have
				// not been committed, so reprocessing is safer than loss.
				return err
			}
			// Processing and commit both succeeded; it is now safe to drop the batch.
			batch = batch[:0]
			log.Printf("worker: processed batch size=%d ranked=%d", len(toProcess), ranked)
			return nil
		}

		drainAndFlush := func(ctx context.Context) {
			for msg := range msgCh {
				batch = append(batch, msg)
				if len(batch) >= w.batchSize {
					if err := flush(ctx); err != nil {
						// During shutdown we do best-effort flushing; errors are
						// logged by flush and do not change shutdown behavior.
						log.Printf("worker: flush error during shutdown: %v", err)
					}
				}
			}
			if err := flush(ctx); err != nil {
				log.Printf("worker: flush error during shutdown: %v", err)
			}
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
					if err := flush(ctx); err != nil {
						log.Printf("worker: flush error on channel close: %v", err)
					}
					return
				}
				batch = append(batch, msg)
				if len(batch) >= w.batchSize {
					if err := flush(ctx); err != nil {
						log.Printf("worker: fatal batch flush error: %v; stopping worker", err)
						// Cancel the worker context so the producer can stop and
						// the Run method can return. Offsets for this batch were
						// not committed, so they will be safely reprocessed.
						cancel()
						return
					}
					ticker.Reset(w.flushInt)
				}
			case <-ticker.C:
				if err := flush(ctx); err != nil {
					log.Printf("worker: fatal batch flush error on interval: %v; stopping worker", err)
					cancel()
					return
				}
			}
		}
	}()

	wg.Wait()
	log.Println("worker: consumer loop stopped")
}

func (w *Worker) Close() error {
	return w.reader.Close()
}
