

# Plan: Harden OAuth Redirects in useAuth.tsx

Now that the dashboard settings are updated, we should apply the code-level safety net to ensure redirects always use the production domain, even if a user somehow lands on a preview URL.

## Change

### File: `src/hooks/useAuth.tsx`

Add a `getRedirectOrigin()` helper and use it in three places:

**Add helper** (before the `signUp` function, around line 43):
```typescript
const getRedirectOrigin = () => {
  const origin = window.location.origin;
  if (origin.includes('lovable.app') || origin.includes('lovableproject.com')) {
    return 'https://actsolo.ai';
  }
  return origin;
};
```

**Update `signUp`** — replace `window.location.origin` with `getRedirectOrigin()`:
```typescript
const redirectUrl = `${getRedirectOrigin()}/manage-scripts`;
```

**Update `signInWithGoogle`** — same replacement:
```typescript
redirectTo: `${getRedirectOrigin()}/manage-scripts`
```

**Update `signOut`** — use absolute production URL:
```typescript
window.location.href = 'https://actsolo.ai/login';
```

This ensures that no matter which domain the user is on (preview, staging, or production), OAuth flows always redirect to `https://actsolo.ai`.

