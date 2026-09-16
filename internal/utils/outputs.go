package utils

import (
	"fmt"
	"io"
	"io/fs"
	"os"
)

// OutputDestination abstracts printing and file operations so callers can
// inject a fake implementation in tests.
type OutputDestination interface {
	Println(a ...any) (n int, err error)
	Remove(name string) error
	WriteFile(filename string, data []byte, perm fs.FileMode) error
	GetWriter() io.Writer
}

type OutputDestinationImpl struct{}

func (odi *OutputDestinationImpl) Println(a ...any) (n int, err error) {
	return fmt.Println(a...)
}

func (odi *OutputDestinationImpl) Remove(name string) error {
	return os.Remove(name)
}

func (odi *OutputDestinationImpl) WriteFile(filename string, data []byte, perm fs.FileMode) error {
	return os.WriteFile(filename, data, perm)
}

func (odi *OutputDestinationImpl) GetWriter() io.Writer {
	return os.Stdout
}

func NewOutputDestination() OutputDestination {
	return outputDestFactory()
}

// package-level factory to allow tests to override the OutputDestination creation
var outputDestFactory = func() OutputDestination {
	return &OutputDestinationImpl{}
}

// SetOutputDestinationFactory sets a custom factory used by NewOutputDestination.
// It returns a restore function that restores the previous factory — call defer on it in tests.
func SetOutputDestinationFactory(f func() OutputDestination) func() {
	prev := outputDestFactory
	outputDestFactory = f
	return func() { outputDestFactory = prev }
}
