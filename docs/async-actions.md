# Async action pattern

Use `useAsyncAction()` for button-triggered API work.

- Wrap the API call in `run(async () => { ... })`.
- Read `isRunning` to disable the clicked button and nearby navigation.
- Render `ActionError` directly above the action buttons.
- Render `ProcessingOverlay` on drawers/cards for critical actions.
- Keep drawers open on failure; refresh/close only after success.
- Do not let button action errors escape to the route ErrorBoundary.

`adminApiFetch` throws `ApiError` with `status`, `code`, `message`, and `details`.
For `400/422`, backend messages are preserved. For permission/session/server failures, the client falls back to standard action messages.
