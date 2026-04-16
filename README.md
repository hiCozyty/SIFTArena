# ShadowProtocol

## Prerequisites

Install Rust via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Build

```bash
cargo build --release
```

## Run

```bash
cargo run
```

Or run the release binary:

```bash
./target/release/start
```

## Usage

On first run, `start` will prompt you to enter your NVIDIA API key:

```
$ cargo run
Enter your NVIDIA API key: nvapi-xxxxxxxxxxxx
API key saved to .env
ShadowProtocol ready
```

Subsequent runs will skip the prompt and display "ShadowProtocol ready".
