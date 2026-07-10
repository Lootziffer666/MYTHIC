package main

import (
	"strings"
	"time"
)

func sleep(seconds int) {
	time.Sleep(time.Duration(seconds) * time.Second)
}

func contains(s, sub string) bool {
	return strings.Contains(s, sub)
}

// indent prefixes every line of s with n spaces.
func indent(s string, n int) string {
	pad := strings.Repeat(" ", n)
	lines := strings.Split(s, "\n")
	for i, l := range lines {
		if l != "" {
			lines[i] = pad + l
		}
	}
	return strings.Join(lines, "\n")
}

// shellQuote wraps s in single quotes, escaping any embedded single quotes.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
