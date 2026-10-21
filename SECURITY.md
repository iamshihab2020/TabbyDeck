# Security policy

TabbyDeck controls a PC from other devices on the network, so security reports matter.

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please do not open a public issue. Report it privately instead:

1. Open the **Security** tab of this repository.
2. Choose **Report a vulnerability**.

Include what you found, the steps to reproduce it, and what an attacker could do with it. You will get a reply within 7 days.

## How TabbyDeck protects your PC

- A new phone or tablet must be approved on the PC by typing the 6-digit code it shows.
- Each approved device gets its own 256-bit token; you can block or forget a device at any time.
- The editor only listens on `127.0.0.1` and needs a token that changes every launch.
- TabbyDeck makes no outbound network calls and sends no telemetry.
