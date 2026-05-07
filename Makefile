.PHONY: all build build-all test test-short test-coverage lint fmt clean install-tools

# Version info
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
GIT_COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)

BUILDINFO_PKG := github.com/sam1el/snyk-api-import-go/internal/buildinfo
LDFLAGS := -X '$(BUILDINFO_PKG).Version=$(VERSION)' \
           -X '$(BUILDINFO_PKG).GitCommit=$(GIT_COMMIT)' \
           -X '$(BUILDINFO_PKG).BuildDate=$(BUILD_DATE)'

# Build for current platform
build:
	@echo "Building snyk-api-import ($(VERSION))..."
	go build -ldflags "$(LDFLAGS)" -o snyk-api-import .
	@echo "✅ Build complete: snyk-api-import"

# Build for all platforms (snapshot; matches CI via .goreleaser.yml)
build-all: clean
	@echo "Building snapshot artifacts with GoReleaser..."
	goreleaser build --snapshot --clean
	@echo "✅ Snapshot build complete:"
	@find dist -type f | sort

# Run tests
test:
	@echo "Running tests with coverage..."
	@mkdir -p logs
	SNYK_LOG_PATH=./logs go test ./... -v -race -coverprofile=coverage.out -covermode=atomic
	@echo "✅ Tests complete"

# Run tests (short mode, skip long-running tests)
test-short:
	@echo "Running tests (short mode)..."
	@mkdir -p logs
	SNYK_LOG_PATH=./logs go test ./... -short
	@echo "✅ Tests complete"

# Run tests with coverage report
test-coverage: test
	@echo "Generating coverage report..."
	go tool cover -html=coverage.out -o coverage.html
	go tool cover -func=coverage.out
	@echo "✅ Coverage report generated: coverage.html"

# Run linters
lint:
	@echo "Running linters..."
	golangci-lint run --timeout=5m
	@echo "✅ Linting complete"

# Format code
fmt:
	@echo "Formatting code..."
	gofmt -s -w .
	goimports -w .
	@echo "✅ Formatting complete"

# Vet code
vet:
	@echo "Running go vet..."
	go vet ./...
	@echo "✅ Vet complete"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist/ coverage.out coverage.html snyk-api-import logs/
	@echo "✅ Clean complete"

# Install development tools
install-tools:
	@echo "Installing development tools..."
	go install golang.org/x/tools/cmd/goimports@latest
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install github.com/goreleaser/goreleaser/v2@latest
	@echo "✅ Tools installed"

# Run all checks (format, vet, lint, test)
check: fmt vet lint test-short
	@echo "✅ All checks passed"

# Show version info
version:
	@echo "Version:    $(VERSION)"
	@echo "Git Commit: $(GIT_COMMIT)"
	@echo "Build Date: $(BUILD_DATE)"

# Help
help:
	@echo "Snyk API Import - Makefile targets:"
	@echo ""
	@echo "  build         - Build for current platform"
	@echo "  build-all     - Build for all platforms (creates dist/)"
	@echo "  test          - Run all tests with coverage"
	@echo "  test-short    - Run tests in short mode"
	@echo "  test-coverage - Generate HTML coverage report"
	@echo "  lint          - Run golangci-lint"
	@echo "  fmt           - Format code with gofmt and goimports"
	@echo "  vet           - Run go vet"
	@echo "  check         - Run all checks (fmt, vet, lint, test-short)"
	@echo "  clean         - Remove build artifacts"
	@echo "  install-tools - Install development tools"
	@echo "  version       - Show version info"
	@echo "  help          - Show this help message"
	@echo ""
	@echo "Version: $(VERSION)"

.DEFAULT_GOAL := build
