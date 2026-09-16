package logging

import (
	"sync"
	"testing"
)

type fakeLogger2 struct {
	mu    sync.Mutex
	calls []string
}

func (f *fakeLogger2) record(s string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, s)
}

func (f *fakeLogger2) Debugf(format string, args ...interface{}) { f.record("debug") }
func (f *fakeLogger2) Infof(format string, args ...interface{})  { f.record("info") }
func (f *fakeLogger2) Warnf(format string, args ...interface{})  { f.record("warn") }
func (f *fakeLogger2) Errorf(format string, args ...interface{}) { f.record("error") }

func TestSetLogger_RestoreBehavior_Alt(t *testing.T) {
	// Install first fake
	f1 := &fakeLogger2{}
	restore1 := SetLogger(f1)
	defer func() { restore1() }()

	// Install second fake on top
	f2 := &fakeLogger2{}
	restore2 := SetLogger(f2)

	// Current logger should be f2
	Infof("first")
	Debugf("first-debug")

	if len(f2.calls) == 0 {
		t.Fatalf("expected f2 to receive calls, got none")
	}

	// Restore second -> should revert to f1
	restore2()
	Infof("second")

	if len(f1.calls) == 0 {
		t.Fatalf("expected f1 to receive calls after restore, got none")
	}
}
