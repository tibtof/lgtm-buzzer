# Fixture: python-add-route

Adds a new Flask POST route `POST /api/v1/orders` with `@require_auth` decorator.
The handler parses JSON silently (returns 400 for invalid JSON), calls
`create_order` with `user_id`, `items`, and `shipping_address`, returns 201 on
success, and maps `OrderValidationError` to a 422 with `code: "validation_failed"`.
Three tests are added covering authentication, invalid JSON, and the validation
error path.

This fixture exercises the LLM's ability to read framework-specific code and
produce questions about HTTP status codes, decorator semantics, and error mapping.
