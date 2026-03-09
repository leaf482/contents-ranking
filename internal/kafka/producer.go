package kafka

import (
	"context"
	"fmt"
	"log"
	"net"
	"strconv"
	"time"

	"github.com/segmentio/kafka-go"
)

// Producer is the interface for publishing messages to Kafka.
// Abstracting via interface allows handler tests to inject a mock.
type Producer interface {
	WriteMessages(ctx context.Context, msgs ...kafka.Message) error
	Close() error
}

type kafkaProducer struct {
	writer *kafka.Writer
}

// NewProducer returns a Producer backed by a kafka-go Writer.
//
// Balancer: Hash ensures messages with the same VideoID key are always routed
// to the same partition, preserving per-video ordering.
// Async: false gives synchronous write semantics so errors surface immediately.
// WriteTimeout / ReadTimeout: hard network-level caps against a slow broker.
// AllowAutoTopicCreation: false — topic must be pre-created via EnsureTopicExists.
func NewProducer(brokers []string, topic string) Producer {
	w := &kafka.Writer{
		Addr:                   kafka.TCP(brokers...),
		Topic:                  topic,
		Balancer:               &kafka.Hash{},
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

// EnsureTopicExists connects to the Kafka cluster, resolves the controller
// broker, and creates the topic if it does not already exist.
// It is idempotent: calling it on an existing topic is a no-op.
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
		NumPartitions:     3,
		ReplicationFactor: 1,
	})
	if err != nil {
		return fmt.Errorf("kafka: create topic %q: %w", topic, err)
	}

	log.Printf("kafka: topic %q is ready", topic)
	return nil
}
