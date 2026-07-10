module mythic-provisioner

go 1.25.0

require golang.org/x/crypto v0.52.0

require golang.org/x/sys v0.45.0 // indirect

// Reproducible build:
//   go mod tidy     # resolves golang.org/x/crypto + writes go.sum (needs network once)
//   go build -o mythic-provisioner .
// The only external module is golang.org/x/crypto (SSH client). Everything else
// is the Go standard library, so the output is a single static binary.
