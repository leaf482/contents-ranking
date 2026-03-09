package worker

import (
	"context"
	"log"
	"time"

	"github.com/segmentio/kafka-go"
)

type Worker struct {
	reader    *kafka.Reader
	processor *Processor
}

func New(brokers []string, topic, groupID string, processor *Processor) *Worker {
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:        brokers,
		Topic:          topic,
		GroupID:        groupID,
		MinBytes:       1,
		MaxBytes:       10e6,
		CommitInterval: time.Second,
	})
	return &Worker{reader: r, processor: processor}
}

// Run consumes messages until ctx is cancelled.
// Offsets are committed only after successful processing.
func (w *Worker) Run(ctx context.Context) {
	log.Println("worker: starting consumer loop")
	for {
		msg, err := w.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				log.Println("worker: context cancelled, stopping")
				return
			}
			log.Printf("worker: fetch error: %v", err)
			continue
		}

		if err := w.processor.Process(ctx, msg); err != nil {
			log.Printf("worker: process error (offset=%d): %v", msg.Offset, err)
			// skip commit so the message is re-delivered on restart
			continue
		}

		if err := w.reader.CommitMessages(ctx, msg); err != nil {
			log.Printf("worker: commit error (offset=%d): %v", msg.Offset, err)
		}
	}
}

func (w *Worker) Close() error {
	return w.reader.Close()
}
