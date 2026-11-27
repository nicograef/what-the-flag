package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nicograef/what-the-flag/internal/app"
	"github.com/nicograef/what-the-flag/internal/config"
	"github.com/nicograef/what-the-flag/internal/postgres"
)

const (
	// addr is the listen address the Caddyfile, the image healthcheck and the Vite proxy expect.
	addr            = ":8080"
	shutdownTimeout = 10 * time.Second
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(log)
	if err := run(log); err != nil {
		log.Error("server failed", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := postgres.NewPool(ctx, cfg.DatabaseURL())
	if err != nil {
		return err
	}
	srv := &http.Server{
		Addr:              addr,
		Handler:           app.New(app.Deps{Pool: pool, Log: log}),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       120 * time.Second,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelError),
	}

	serveErr := make(chan error, 1)
	go func() {
		log.Info("server started", "addr", srv.Addr)
		serveErr <- srv.ListenAndServe()
	}()
	select {
	case err := <-serveErr:
		pool.Close()
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	err = srv.Shutdown(shutdownCtx)
	pool.Close()
	if err != nil {
		return err
	}
	log.Info("server stopped")
	return nil
}
