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
		flushInterval = 25 * time.Millisecond
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

type partitionLane struct {
	partition int
	ch        chan kafka.Message
}

func (w *Worker) Run(ctx context.Context) {
	log.Println("worker: starting consumer loop (partition-lane batch mode)")
	log.Printf("worker: batch config size=%d flush=%v", w.batchSize, w.flushInt)

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	msgCh := make(chan kafka.Message, w.batchSize*16)

	var fetchWG sync.WaitGroup
	var lanesWG sync.WaitGroup
	var commitMu sync.Mutex

	lanes := make(map[int]*partitionLane)

	flushLane := func(ctx context.Context, batch *[]kafka.Message) error {
		if len(*batch) == 0 {
			return nil
		}

		toProcess := make([]kafka.Message, len(*batch))
		copy(toProcess, *batch)

		ranked, err := w.processor.ProcessBatch(ctx, toProcess)
		if err != nil {
			err = fmt.Errorf("batch process error: %w", err)
			log.Printf("worker: %v", err)
			return err
		}

		commitMu.Lock()
		err = w.reader.CommitMessages(ctx, toProcess...)
		commitMu.Unlock()
		if err != nil {
			err = fmt.Errorf("batch commit error: %w", err)
			log.Printf("worker: %v", err)
			return err
		}

		*batch = (*batch)[:0]
		log.Printf("worker: partition=%d processed batch size=%d ranked=%d", toProcess[0].Partition, len(toProcess), ranked)
		return nil
	}

	startLane := func(partition int) *partitionLane {
		lane := &partitionLane{
			partition: partition,
			ch:        make(chan kafka.Message, w.batchSize*8),
		}

		lanesWG.Add(1)
		go func() {
			defer lanesWG.Done()

			batch := make([]kafka.Message, 0, w.batchSize)
			ticker := time.NewTicker(w.flushInt)
			defer ticker.Stop()

			flush := func(ctx context.Context) error {
				return flushLane(ctx, &batch)
			}

			for {
				select {
				case <-ctx.Done():
					shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()

					for msg := range lane.ch {
						batch = append(batch, msg)
						if len(batch) >= w.batchSize {
							if err := flush(shutdownCtx); err != nil {
								log.Printf("worker: partition=%d flush error during shutdown: %v", partition, err)
							}
						}
					}
					if err := flush(shutdownCtx); err != nil {
						log.Printf("worker: partition=%d final flush error during shutdown: %v", partition, err)
					}
					log.Printf("worker: partition lane stopped partition=%d", partition)
					return

				case msg, ok := <-lane.ch:
					if !ok {
						if err := flush(ctx); err != nil {
							log.Printf("worker: partition=%d flush error on channel close: %v", partition, err)
						}
						log.Printf("worker: partition lane closed partition=%d", partition)
						return
					}

					batch = append(batch, msg)
					if len(batch) >= w.batchSize {
						if err := flush(ctx); err != nil {
							log.Printf("worker: fatal partition batch flush error partition=%d: %v", partition, err)
							cancel()
							return
						}
						ticker.Reset(w.flushInt)
					}

				case <-ticker.C:
					if err := flush(ctx); err != nil {
						log.Printf("worker: fatal partition batch flush error on interval partition=%d: %v", partition, err)
						cancel()
						return
					}
				}
			}
		}()

		return lane
	}

	closeAllLanes := func() {
		for _, lane := range lanes {
			close(lane.ch)
		}
		lanesWG.Wait()
	}

	dispatch := func(msg kafka.Message) bool {
		lane, ok := lanes[msg.Partition]
		if !ok {
			lane = startLane(msg.Partition)
			lanes[msg.Partition] = lane
			log.Printf("worker: started partition lane partition=%d", msg.Partition)
		}

		select {
		case lane.ch <- msg:
			return true
		case <-ctx.Done():
			return false
		}
	}

	// Fetcher: pull from Kafka as fast as possible.
	fetchWG.Add(1)
	go func() {
		defer fetchWG.Done()
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

	for {
		select {
		case <-ctx.Done():
			fetchWG.Wait()
			for msg := range msgCh {
				if !dispatch(msg) {
					break
				}
			}
			closeAllLanes()
			log.Println("worker: consumer loop stopped")
			return

		case msg, ok := <-msgCh:
			if !ok {
				closeAllLanes()
				log.Println("worker: consumer loop stopped")
				return
			}
			if !dispatch(msg) {
				fetchWG.Wait()
				for msg := range msgCh {
					_ = dispatch(msg)
				}
				closeAllLanes()
				log.Println("worker: consumer loop stopped")
				return
			}
		}
	}
}

func (w *Worker) Close() error {
	return w.reader.Close()
}
