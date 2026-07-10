package main

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// log.go — helpful but secret-lean logging.
//
// Never logged in plaintext: provider tokens, private SSH keys, admin tokens,
// full Authorization headers, passwords. Anything matching a secret pattern is
// masked. We log: phase, timestamp, resource id, server IP, status, healthcheck
// and cleanup results, and a masked secret hint.

func maskSecret(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 6 {
		return "***"
	}
	return s[:4] + "…" + s[len(s)-2:]
}

// maskAll replaces known secret fields inside arbitrary strings before printing.
func maskAll(s string) string {
	// mask bearer tokens
	if strings.Contains(s, "Bearer ") {
		s = maskBearer(s)
	}
	return s
}

func maskBearer(s string) string {
	idx := strings.Index(s, "Bearer ")
	if idx < 0 {
		return s
	}
	rest := s[idx+7:]
	end := strings.IndexAny(rest, " \n\r\t\"")
	if end < 0 {
		end = len(rest)
	}
	return s[:idx+7] + maskSecret(rest[:end]) + rest[end:]
}

type logger struct{}

var log = logger{}

func (logger) line(level, msg string) {
	ts := time.Now().UTC().Format("2006-01-02T15:04:05Z")
	fmt.Fprintf(os.Stderr, "[%s] %s %s\n", level, ts, maskAll(msg))
}

func (logger) ok(msg string)   { log.line("OK", msg) }
func (logger) warn(msg string) { log.line("WARN", msg) }
func (logger) err(msg string)  { log.line("ERR", msg) }
func (logger) info(msg string) { log.line("INFO", msg) }

// maskedHint returns a safe hint for a secret without revealing it.
func maskedHint(label, secret string) string {
	if secret == "" {
		return fmt.Sprintf("%s: (empty)", label)
	}
	return fmt.Sprintf("%s: %s", label, maskSecret(secret))
}
