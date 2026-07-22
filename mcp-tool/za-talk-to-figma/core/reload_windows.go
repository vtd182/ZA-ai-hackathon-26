//go:build windows

package core

import "fmt"

func requestProcessReload() error {
	return fmt.Errorf("runtime reload is not supported on Windows control plane yet")
}
