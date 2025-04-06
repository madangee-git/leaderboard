# Define the application name
APP_NAME = leaderboard-app
TEST_APP_NAME = test

# Define the Docker Compose file
DOCKER_COMPOSE = docker-compose.yml

# Default Node.js commands
NODE = node
NPM = npm
JEST = npx jest
ESLINT = npx eslint
PRETTIER = npx prettier

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	@$(NPM) install

# Run tests inside a Docker container
test-docker:
	@echo "🐳 Running tests in a Docker container..."
	@docker-compose -f $(DOCKER_COMPOSE) run --rm $(TEST_APP_NAME) $(JEST) --coverage --verbose

# Run ESLint for code quality checks
lint:
	@echo "🔍 Running ESLint..."
	@$(ESLINT) . --ext .js,.ts

# Format code with Prettier
format:
	@echo "🖋 Formatting code with Prettier..."
	@$(PRETTIER) --write .

# Clean dependencies and build artifacts
clean:
	@echo "🧹 Cleaning dependencies and build artifacts..."
	@rm -rf node_modules
	@rm -rf dist
	@rm -rf coverage
	@$(NPM) cache clean --force

# Run the app in a Docker container
docker-run:
	@echo "🐳 Running the application in Docker..."
	@docker-compose -f $(DOCKER_COMPOSE) up -d --build

# Stop the running Docker containers
docker-stop:
	@echo "🛑 Stopping Docker containers..."
	@docker-compose -f $(DOCKER_COMPOSE) down

# Show available commands
help:
	@echo "📌 Available commands:"
	@echo "  make install        - Install dependencies"
	@echo "  make test-docker    - Run tests in Docker"
	@echo "  make format         - Format code with Prettier"
	@echo "  make clean          - Remove dependencies and build files"
	@echo "  make docker-run     - Run the app in Docker"
	@echo "  make docker-stop    - Stop running Docker containers"