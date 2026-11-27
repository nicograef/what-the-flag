package config

import "testing"

func TestLoad(t *testing.T) {
	full := map[string]string{
		"DB_HOST":           "localhost",
		"POSTGRES_USER":     "admin",
		"POSTGRES_PASSWORD": "secret",
		"POSTGRES_DB":       "whattheflag",
	}
	//nolint:gosec // G101: fixture credentials of a unit test, not secrets.
	tests := []struct {
		name    string
		env     map[string]string
		url     string
		wantErr string
	}{
		{
			name: "plain credentials",
			env:  full,
			url:  "postgres://admin:secret@localhost:5432/whattheflag?sslmode=disable",
		},
		{
			name:    "missing vars named",
			env:     map[string]string{"POSTGRES_USER": "admin", "POSTGRES_DB": "whattheflag"},
			wantErr: "missing environment variables: DB_HOST, POSTGRES_PASSWORD",
		},
		{
			name: "escaped password",
			env: map[string]string{
				"DB_HOST":           "postgres",
				"POSTGRES_USER":     "ad min",
				"POSTGRES_PASSWORD": "p@ss:w/rd?#",
				"POSTGRES_DB":       "whattheflag",
			},
			url: "postgres://ad%20min:p%40ss%3Aw%2Frd%3F%23@postgres:5432/whattheflag?sslmode=disable",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg, err := Load(func(k string) string { return tt.env[k] })
			if tt.wantErr != "" {
				if err == nil || err.Error() != tt.wantErr {
					t.Fatalf("err = %v, want %q", err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			if got := cfg.DatabaseURL(); got != tt.url {
				t.Errorf("DatabaseURL = %q, want %q", got, tt.url)
			}
		})
	}
}
