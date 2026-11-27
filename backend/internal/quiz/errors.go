package quiz

import "errors"

// Errors the core returns; the HTTP adapter maps each to a status and code.
var (
	ErrInvalidName        = errors.New("quiz: invalid name")
	ErrQuizNotFound       = errors.New("quiz: quiz not found")
	ErrQuizInProgress     = errors.New("quiz: the creator run has not ended")
	ErrRunNotFound        = errors.New("quiz: run not found")
	ErrNotCurrentQuestion = errors.New("quiz: not the current question")
	ErrInvalidOption      = errors.New("quiz: option outside 0..3")
	ErrQuizExhausted      = errors.New("quiz: no unused country left")
	ErrPoolTooSmall       = errors.New("quiz: pool too small for any allowed question type")
)
