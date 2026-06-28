//! Cross-contract integration tests for the RemitMortgage protocol.
//!
//! This crate is intentionally empty at the library level. It exists solely to
//! host end-to-end tests under `tests/` that deploy the escrow and lending-pool
//! contracts together and exercise the full borrower lifecycle. It is never
//! compiled to WASM (the crate produces no `cdylib`).
