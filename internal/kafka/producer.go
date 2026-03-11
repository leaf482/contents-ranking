package kafka

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/segmentio/kafka-go"

	"contents-ranking/internal/metrics"
)

// Producer is the write interface; keeps the handler testable with a mock.
type Producer interface {
	WriteMessages(ctx context.Context, msgs ...kafka.Message) error
	Close() error
}

var (
	// ErrQueueFull indicates the buffered producer queue is at capacity.
	ErrQueueFull = errors.New("kafka producer queue is full")
	// ErrProducerClosed indicates the producer is shutting down or closed.
	ErrProducerClosed = errors.New("kafka producer is closed")
)

type kafkaProducer struct {
	writer *kafka.Writer
}

func NewProducer(brokers []string, topic string) Producer {
	w := &kafka.Writer{
		Addr:                   kafka.TCP(brokers...),
		Topic:                  topic,
		Balancer:               &kafka.Hash{}, // hash of message Key → partition
		Async:                  false,
		WriteTimeout:           2 * time.Second,
		ReadTimeout:            2 * time.Second,
		AllowAutoTopicCreation: false,
	}
	return &kafkaProducer{writer: w}
}

func (p *kafkaProducer) WriteMessages(ctx context.Context, msgs ...kafka.Message) error {
	return p.writer.WriteMessages(ctx, msgs...)
}

func (p *kafkaProducer) Close() error {
	return p.writer.Close()
}

// bufferedProducer wraps a kafkaProducer with an in-memory buffer and background
// batching worker. API handlers enqueue messages and return immediately.
type bufferedProducer struct {
	base      *kafkaProducer
	queue     chan kafka.Message
	maxBatch  int
	linger    time.Duration
	wg        sync.WaitGroup
	debugLogs bool
	mu        sync.RWMutex
	closed    uint32
}

// NewBufferedProducer creates a Producer that buffers messages in-memory and
// flushes them to Kafka in batches.
func NewBufferedProducer(brokers []string, topic string, queueSize, maxBatch int, linger time.Duration) Producer {
	base := NewProducer(brokers, topic).(*kafkaProducer)

	if queueSize <= 0 {
		queueSize = 10_000
	}
	if maxBatch <= 0 {
		maxBatch = 100
	}
	if linger <= 0 {
		linger = 5 * time.Millisecond
	}

	p := &bufferedProducer{
		base:      base,
		queue:     make(chan kafka.Message, queueSize),
		maxBatch:  maxBatch,
		linger:    linger,
		debugLogs: os.Getenv("DEBUG") != "",
	}

	metrics.ProducerQueueDepth.Set(0)

	p.wg.Add(1)
	go p.run()

	return p
}

// WriteMessages enqueues messages into the in-memory buffer and returns
// immediately. If the queue is full, it returns an explicit error.
func (p *bufferedProducer) WriteMessages(ctx context.Context, msgs ...kafka.Message) error {
	if atomic.LoadUint32(&p.closed) != 0 {
		return ErrProducerClosed
	}

	p.mu.RLock()
	defer p.mu.RUnlock()
	if atomic.LoadUint32(&p.closed) != 0 {
		return ErrProducerClosed
	}

	for _, m := range msgs {
		select {
		case p.queue <- m:
			metrics.ProducerQueueDepth.Set(float64(len(p.queue)))
		default:
			metrics.KafkaEnqueueFailuresTotal.Inc()
			if p.debugLogs {
				log.Printf("api: kafka queue full, enqueue failed key=%s", string(m.Key))
			}
			return ErrQueueFull
		}
	}
	return nil
}

func (p *bufferedProducer) run() {
	defer p.wg.Done()

	ticker := time.NewTicker(p.linger)
	defer ticker.Stop()

	batch := make([]kafka.Message, 0, p.maxBatch)

	flush := func() {
		if len(batch) == 0 {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		err := p.base.WriteMessages(ctx, batch...)
		cancel()
		if err != nil {
			log.Printf("api: kafka batch write error: %v", err)
		}

		metrics.APIKafkaBatchSize.Observe(float64(len(batch)))
		metrics.APIKafkaBatchFlushTotal.Inc()
		if p.debugLogs {
			log.Printf("api: kafka flush batch_size=%d", len(batch))
		}

		batch = batch[:0]
	}

	for {
		select {
		case msg, ok := <-p.queue:
			if !ok {
				flush()
				metrics.ProducerQueueDepth.Set(0)
				return
			}
			batch = append(batch, msg)
			metrics.ProducerQueueDepth.Set(float64(len(p.queue)))
			if len(batch) >= p.maxBatch {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// Close stops the background worker, flushes remaining messages, and closes the
// underlying Kafka writer.
func (p *bufferedProducer) Close() error {
	if !atomic.CompareAndSwapUint32(&p.closed, 0, 1) {
		return nil
	}

	// Closing the queue drains all buffered messages before the worker exits.
	p.mu.Lock()
	close(p.queue)
	p.mu.Unlock()
	p.wg.Wait()
	return p.base.Close()
}

// EnsureTopicExists creates the topic if it doesn't exist. Safe to call repeatedly.
func EnsureTopicExists(brokers []string, topic string) error {
	if len(brokers) == 0 {
		return fmt.Errorf("kafka: no brokers provided")
	}

	conn, err := kafka.DialContext(context.Background(), "tcp", brokers[0])
	if err != nil {
		return fmt.Errorf("kafka: dial %s: %w", brokers[0], err)
	}
	defer func() {
		if cerr := conn.Close(); cerr != nil {
			log.Printf("kafka: EnsureTopicExists: close bootstrap conn: %v", cerr)
		}
	}()

	controller, err := conn.Controller()
	if err != nil {
		return fmt.Errorf("kafka: fetch controller: %w", err)
	}

	// Topic creation must go to the controller broker.
	controllerAddr := net.JoinHostPort(controller.Host, strconv.Itoa(controller.Port))
	ctrlConn, err := kafka.DialContext(context.Background(), "tcp", controllerAddr)
	if err != nil {
		return fmt.Errorf("kafka: dial controller %s: %w", controllerAddr, err)
	}
	defer func() {
		if cerr := ctrlConn.Close(); cerr != nil {
			log.Printf("kafka: EnsureTopicExists: close controller conn: %v", cerr)
		}
	}()

	err = ctrlConn.CreateTopics(kafka.TopicConfig{
		Topic:             topic,
		NumPartitions:     24,
		ReplicationFactor: 1,
	})
	if err != nil {
		return fmt.Errorf("kafka: create topic %q: %w", topic, err)
	}

	log.Printf("kafka: topic %q is ready", topic)
	return nil
}
