package main

import (
	"context"
	"flag"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/mark3labs/mcp-go/server"

	"za-talk-to-figma/core"
	"za-talk-to-figma/core/logging"
)

// version is injected at build time:
// go build -ldflags "-X main.version=1.0.0" ./cmd/za-talk-to-figma
var version = "dev"

var logger = logging.Module("main")

func main() {
	ip := flag.String("ip", "127.0.0.1", "IP address to listen on (use 0.0.0.0 to accept remote connections)")
	port := flag.Int("port", 1802, "port to listen on")
	flag.Parse()

	parsedIP := net.ParseIP(*ip)
	if parsedIP == nil {
		logger.Fatalf("invalid IP address: %q", *ip)
	}
	if !parsedIP.IsLoopback() {
		logger.Warn("binding to non-loopback address — server will be reachable from the network with no authentication", "ip", *ip)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	reloadCh := make(chan os.Signal, 1)
	signal.Notify(reloadCh, syscall.SIGHUP)
	defer signal.Stop(reloadCh)

	node := core.NewNode(*ip, *port, version)
	election := core.NewElection(*ip, *port, node)

	if err := election.Start(ctx); err != nil {
		logger.Fatalf("election start: %v", err)
	}

	logger.Info("starting za-talk-to-figma", "version", version, "role", node.RoleName(), "logLevel", logging.LevelFromEnv().String())

	s := server.NewMCPServer("za-talk-to-figma", version)
	core.RegisterTools(s, node)
	core.RegisterPrompts(s)

	logging.Go("main.reloadWatcher", func() {
		for range reloadCh {
			logger.Info("reloading za-talk-to-figma in place")
			if err := reexecSelf(); err != nil {
				logger.Error("reexec failed", "err", err)
			}
		}
	})

	logging.Go("main.shutdownWatcher", func() {
		<-ctx.Done()
		logger.Info("shutting down")
		election.Stop()
		node.Stop()
	})

	if err := server.ServeStdio(s); err != nil {
		logger.Fatalf("mcp serve: %v", err)
	}
}
