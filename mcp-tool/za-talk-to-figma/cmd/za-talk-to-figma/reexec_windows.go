//go:build windows

package main

import (
	"os"
)

func reexecSelf() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	attr := &os.ProcAttr{
		Env: os.Environ(),
		Files: []*os.File{
			os.Stdin,
			os.Stdout,
			os.Stderr,
		},
	}
	proc, err := os.StartProcess(exe, os.Args, attr)
	if err != nil {
		return err
	}
	return proc.Release()
}
