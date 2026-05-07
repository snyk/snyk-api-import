package cmd

import (
	"context"
	"os"
	"syscall"
	"testing"
	"time"
)

// TestRunWithLifecycleWithSigChan ensures that RunWithLifecycleWithSigChan
// cancels the provided run function when a signal is delivered on the
// injected channel.
func TestRunWithLifecycleWithSigChan(t *testing.T) {
	sigs := make(chan os.Signal, 1)
	didCancel := make(chan struct{})

	// Run the lifecycle in a goroutine so we can send the signal from the
	// test thread.
	go func() {
		RunWithLifecycleWithSigChan(func(ctx context.Context) {
			select {
			case <-ctx.Done():
				close(didCancel)
			case <-time.After(5 * time.Second):
				t.Errorf("run func did not receive cancel in time")
			}
		}, sigs)
	}()

	// Give the goroutine a moment to start and install its listener.
	time.Sleep(50 * time.Millisecond)

	// Send a fake signal and expect the run function to exit quickly.
	sigs <- syscall.SIGINT

	select {
	case <-didCancel:
		// success
	case <-time.After(2 * time.Second):
		t.Fatalf("lifecycle did not cancel run function after signal")
	}
}
