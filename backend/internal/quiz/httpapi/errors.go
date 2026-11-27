package httpapi

import (
	"errors"
	"net/http"

	"github.com/nicograef/what-the-flag/internal/httpx"
	"github.com/nicograef/what-the-flag/internal/quiz"
)

// errUnparsableQuiz and errUnparsableRun answer an id that is no UUID like an unknown one.
var (
	errUnparsableQuiz = errors.New("quiz id is not a UUID")
	errUnparsableRun  = errors.New("run id is not a UUID")
)

var errorTable = []httpx.ErrorCode{
	{Err: quiz.ErrInvalidName, Status: http.StatusBadRequest, Code: "invalid_name", Field: "name"},
	{Err: quiz.ErrQuizNotFound, Status: http.StatusNotFound, Code: "quiz_not_found"},
	{Err: errUnparsableQuiz, Status: http.StatusNotFound, Code: "quiz_not_found"},
	{Err: quiz.ErrRunNotFound, Status: http.StatusNotFound, Code: "run_not_found"},
	{Err: errUnparsableRun, Status: http.StatusNotFound, Code: "run_not_found"},
	{Err: quiz.ErrNotCurrentQuestion, Status: http.StatusConflict, Code: "not_current_question"},
	{Err: quiz.ErrInvalidOption, Status: http.StatusBadRequest, Code: "invalid_option", Field: "option"},
}
