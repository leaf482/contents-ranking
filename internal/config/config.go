package config

import (
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	KafkaBrokers []string
	KafkaTopic   string
	ServerPort   string
	RedisAddr    string
}

func LoadConfig() *Config {
	_ = godotenv.Load() // .env is optional

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

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		log.Fatal("config: REDIS_ADDR is required but not set")
	}

	return &Config{
		KafkaBrokers: strings.Split(brokerRaw, ","),
		KafkaTopic:   topic,
		ServerPort:   port,
		RedisAddr:    redisAddr,
	}
}
