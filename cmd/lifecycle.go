package cmd

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/sam1el/snyk-api-import-go/internal/logging"
)

// RunWithLifecycleWithSigChan runs the provided function with a cancellable
// context and listens for a signal on the provided channel to initiate
// graceful shutdown. This helper is useful for tests where a fake signal
// channel can be injected.
func RunWithLifecycleWithSigChan(run func(ctx context.Context), sigs <-chan os.Signal) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		sig := <-sigs
		logging.Infof("received signal %s: initiating shutdown", sig)
		cancel()
		// If the process doesn't exit after a short grace period, force exit.
		time.AfterFunc(10*time.Second, func() {
			logging.Errorf("graceful shutdown timed out; forcing exit")
			os.Exit(1)
		})
	}()

	run(ctx)
}

// RunWithLifecycle is the production-friendly wrapper that registers for
// SIGINT/SIGTERM and delegates to RunWithLifecycleWithSigChan. Keeping this
// thin wrapper preserves the simple public API while enabling test injection.
func RunWithLifecycle(run func(ctx context.Context)) {
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	defer func() {
		signal.Stop(sigs)
		close(sigs)
	}()

	RunWithLifecycleWithSigChan(run, sigs)
}
