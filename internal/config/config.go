package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds all runtime configuration values loaded from environment variables.
type Config struct {
	KafkaBrokers []string
	KafkaTopic   string
	ServerPort   string
}

// LoadConfig loads configuration from a .env file (if present) and then
// reads required values from environment variables. Exits immediately via
// log.Fatal if any required value is missing.
func LoadConfig() *Config {
	// Best-effort load; a missing .env file is acceptable in production.
	_ = godotenv.Load()

	brokerRaw := os.Getenv("KAFKA_BROKERS")
	if brokerRaw == "" {
		log.Fatal("config: KAFKA_BROKERS is required but not set")
	}

	topic := os.Getenv("KAFKA_TOPIC")
	if topic == "" {
		log.Fatal("config: KAFKA_TOPIC is required but not set")
	}

	port := os.Getenv("SERVER_PORT")
	if port == "" {
		log.Fatal("config: SERVER_PORT is required but not set")
	}

	return &Config{
		KafkaBrokers: strings.Split(brokerRaw, ","),
		KafkaTopic:   topic,
		ServerPort:   port,
	}
}
