## Summary

<!-- What this changes, and why. One paragraph. -->

## Changes

<!-- The technical detail a reviewer needs. Name any decision that would
     otherwise have to be reverse-engineered from the diff. -->

-

## Testing

<!-- Commands actually run, and what they reported. Not "tested locally". -->

```
npm run verify
npm run test:integration
npm run test:e2e
```

- [ ] Unit tests pass
- [ ] Integration tests pass (real PostgreSQL)
- [ ] End-to-end tests pass (production build)
- [ ] Production build passes

## Screenshots

<!-- Required for any UI change. Light and dark, and mobile if the layout
     differs. Delete this section for non-UI changes. -->

## Security

<!-- Delete any line that does not apply, rather than ticking it blindly. -->

- [ ] No new endpoint bypasses the `route()` / `publicRoute()` wrapper
- [ ] Every new query is scoped by `userId`
- [ ] No user input reaches a filesystem or storage path
- [ ] No secret, resume text or personal data can reach a log or a response
- [ ] Anti-fabrication behaviour is unchanged, or the change is covered by a new test

## Deployment

<!-- Delete if neither applies. -->

- [ ] New environment variables (documented in `.env.example` and `docs/deployment.md`)
- [ ] Database migration (backward-compatible with the currently deployed version)
