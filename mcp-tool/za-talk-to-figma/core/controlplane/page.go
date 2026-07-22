package controlplane

import (
	_ "embed"
)

//go:embed web/index.html
var page string

func HTML() string {
	return page
}
