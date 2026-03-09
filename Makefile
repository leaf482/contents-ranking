# Contents Ranking - System Automation Makefile
# Compatible with Mac, Linux, and Windows (Git Bash / PowerShell)

.PHONY: up down restart logs status clean help

# Cross-platform sleep (Windows: PowerShell, Mac/Linux: sleep)
ifeq ($(OS),Windows_NT)
SLEEP = powershell -Command "Start-Sleep -Seconds 15"
SLEEP_SERVICES = powershell -Command "Start-Sleep -Seconds 20"
else
SLEEP = sleep 15
SLEEP_SERVICES = sleep 20
endif

# Default target
help:
	@echo "Contents Ranking - Available targets:"
	@echo "  make up       - Start all services + dashboard"
	@echo "  make down     - Stop and remove all containers"
	@echo "  make restart  - down + up"
	@echo "  make logs     - Follow all container logs"
	@echo "  make status   - Show container status"
	@echo "  make clean    - Remove volumes and unused images"
	@echo ""
	@echo "'make up' starts: Docker, go-api (:8080), simulation-service (:3000), dashboard (:3002)"

up:
	@echo "==> [1/5] Starting Docker services (go-worker x3)..."
	@docker compose up -d --scale go-worker=3
	@echo "==> [2/5] Waiting 15s for Docker to stabilize..."
	@$(SLEEP)
	@echo "==> [3/5] Starting go-api (:8080) and simulation-service (:3000)..."
ifeq ($(OS),Windows_NT)
	@start "go-api" cmd /k "cd /d $(CURDIR) && go run cmd/api/main.go"
	@start "simulation-service" cmd /k "cd /d $(CURDIR)/simulation-service && npm run start:dev"
else
	@nohup go run cmd/api/main.go > /tmp/go-api.log 2>&1 &
	@nohup sh -c 'cd simulation-service && npm run start:dev' > /tmp/simulation-service.log 2>&1 &
endif
	@echo "==> [4/5] Starting dashboard (:3002)..."
ifeq ($(OS),Windows_NT)
	@start "dashboard" cmd /k "cd /d $(CURDIR)/dashboard && npm run dev"
else
	@nohup sh -c 'cd dashboard && npm run dev' > /tmp/dashboard.log 2>&1 &
endif
	@echo "==> [5/5] Waiting 20s for services to be ready..."
	@$(SLEEP_SERVICES)
	@echo "==> Done. Dashboard: http://localhost:3002 | Run Load Test from the web UI."

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
