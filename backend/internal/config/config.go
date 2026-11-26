// Package config loads the backend's settings from the environment.
package config

import (
	"errors"
	"net"
	"net/url"
	"strings"
)

// Config holds the settings the backend reads at startup.
type Config struct {
	Port       string
	DBHost     string
	DBUser     string
	DBPassword string
	DBName     string
}

// Load reads the configuration through getenv, usually os.Getenv.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:       getenv("APP_PORT"),
		DBHost:     getenv("DB_HOST"),
		DBUser:     getenv("POSTGRES_USER"),
		DBPassword: getenv("POSTGRES_PASSWORD"),
		DBName:     getenv("POSTGRES_DB"),
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	var missing []string
	for _, v := range []struct{ name, value string }{
		{"DB_HOST", cfg.DBHost},
		{"POSTGRES_USER", cfg.DBUser},
		{"POSTGRES_PASSWORD", cfg.DBPassword},
		{"POSTGRES_DB", cfg.DBName},
	} {
		if v.value == "" {
			missing = append(missing, v.name)
		}
	}
	if len(missing) > 0 {
		return Config{}, errors.New("missing environment variables: " + strings.Join(missing, ", "))
	}
	return cfg, nil
}

// DatabaseURL returns the PostgreSQL connection URL with escaped credentials.
func (c Config) DatabaseURL() string {
	u := url.URL{
		Scheme:   "postgres",
		User:     url.UserPassword(c.DBUser, c.DBPassword),
		Host:     net.JoinHostPort(c.DBHost, "5432"),
		Path:     "/" + c.DBName,
		RawQuery: "sslmode=disable",
	}
	return u.String()
}
