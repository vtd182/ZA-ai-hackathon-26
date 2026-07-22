//go:build !windows

package core

import (
	"os"
	"syscall"
)

func requestProcessReload() error {
	proc, err := os.FindProcess(os.Getpid())
	if err != nil {
		return err
	}
	return proc.Signal(syscall.SIGHUP)
}
