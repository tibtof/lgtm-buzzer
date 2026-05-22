# Fixture: rust-borrow-fix

Refactors lifetime annotations on a `Cache<'a>` struct. The impl block's
lifetime parameter is renamed from `'a` to `'cache` for clarity, and the `get`
method gains an explicit `'key` lifetime parameter. The return type is
`Option<&'cache [u8]>` — explicitly tying the returned bytes to the cache's
lifetime, not the key's. Two unit tests are added.

This fixture exercises the LLM's ability to explain Rust lifetime semantics.
A quality quiz must ask about what the separate `'key` and `'cache` lifetimes
mean for callers, not just that the annotations changed.
