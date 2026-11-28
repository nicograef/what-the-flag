package contract

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"testing"

	"github.com/nicograef/what-the-flag/internal/quiz"
)

// update rewrites the golden files: go test -tags=integration ./internal/contract -update
var update = flag.Bool("update", false, "rewrite the golden files in testdata")

// pinned replaces the non-null values that differ between test runs; the frontend schemas must still accept them.
var pinned = map[string]any{
	"id":         "00000000-0000-4000-8000-000000000001",
	"quizId":     "00000000-0000-4000-8000-000000000002",
	"lastQuizId": "00000000-0000-4000-8000-000000000002",
	"runId":      "00000000-0000-4000-8000-000000000003",
	"serverNow":  "2026-01-01T12:00:00.123456Z",
	"deadline":   "2026-01-01T12:00:15.123456Z",
	// A flag key hashes the flag file, which a data refresh changes.
	"flagKey": "0123456789",
	// The global ranks depend on every run the database holds.
	"globalRank": 1,
	"worldRank":  1,
}

// golden compares body, a JSON value, with testdata/<name>.json after pinning its volatile values
// and applying edit. The frontend's contract test parses each file with its schemas.
func golden(t *testing.T, name string, body []byte, edit func(map[string]any)) {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		t.Fatalf("golden %s: parse %s: %v", name, body, err)
	}
	v = pin(v)
	if m, ok := v.(map[string]any); ok && edit != nil {
		edit(m)
	}
	got, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatalf("golden %s: %v", name, err)
	}
	got = append(got, '\n')
	testdata, err := os.OpenRoot("testdata")
	if err != nil {
		t.Fatalf("golden %s: %v", name, err)
	}
	defer func() { _ = testdata.Close() }()
	file := name + ".json"
	if *update {
		if err := testdata.WriteFile(file, got, 0o600); err != nil {
			t.Fatalf("golden %s: %v", name, err)
		}
		return
	}
	want, err := testdata.ReadFile(file)
	if err != nil {
		t.Fatalf("golden %s: %v; run with -update to create it", name, err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("testdata/%s differs from the response; rerun with -update if the change is meant:\n%s", file, got)
	}
}

func pin(v any) any {
	switch v := v.(type) {
	case map[string]any:
		for k, e := range v {
			if p, ok := pinned[k]; ok && e != nil {
				v[k] = p
			} else {
				v[k] = pin(e)
			}
		}
	case []any:
		for i, e := range v {
			v[i] = pin(e)
		}
	}
	return v
}

func TestQuestionTypes(t *testing.T) {
	ids := make([]string, len(quiz.Types))
	for i, typ := range quiz.Types {
		ids[i] = typ.ID()
	}
	body, err := json.Marshal(ids)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	golden(t, "question-types", body, nil)
}
