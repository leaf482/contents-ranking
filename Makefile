# Contents Ranking - System Automation Makefile
# Compatible with Mac, Linux, and Windows (Git Bash / PowerShell)

.PHONY: up down restart logs status clean help

# Cross-platform sleep (Windows: PowerShell, Mac/Linux: sleep)
ifeq ($(OS),Windows_NT)
SLEEP = powershell -Command "Start-Sleep -Seconds 15"
else
SLEEP = sleep 15
endif

# Default target
help:
	@echo "Contents Ranking - Available targets:"
	@echo "  make up       - Start all services + run load test"
	@echo "  make down     - Stop and remove all containers"
	@echo "  make restart  - down + up"
	@echo "  make logs     - Follow all container logs"
	@echo "  make status   - Show container status"
	@echo "  make clean    - Remove volumes and unused images"
	@echo ""
	@echo "Prerequisites for 'make up':"
	@echo "  - go-api running on :8080 (go run cmd/api/main.go)"
	@echo "  - simulation-service running on :3000 (cd simulation-service && npm run start:dev)"

up:
	@echo "==> [1/3] Starting Docker services (go-worker x3)..."
	@docker compose up -d --scale go-worker=3
	@echo "==> [2/3] Waiting 15s for services to stabilize..."
	@$(SLEEP)
	@echo "==> [3/3] Starting load test (simulation-service must be running on :3000)..."
	@cd simulation-service && npm run load-test

down:
	@echo "==> Stopping and removing all containers..."
	@docker compose down
	@echo "==> Done."

restart: down up
	@echo "==> Restart complete."

logs:
	@echo "==> Following logs (Ctrl+C to exit)..."
	@docker compose logs -f

status:
	@echo "==> Container status:"
	@docker compose ps -a

clean:
	@echo "==> Stopping containers..."
	@-docker compose down -v
	@echo "==> Removing unused volumes..."
	@docker volume prune -f
	@echo "==> Removing dangling images..."
	@docker image prune -f
	@echo "==> Clean complete."
