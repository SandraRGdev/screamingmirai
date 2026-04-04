---
name: no-use-effect
description: Avoid useEffect in React components. Use this skill for ALL React/Next.js component development. Enforce derived state, data-fetching libs, event handlers, useMountEffect, key-based reset, and no ref patches for broken effects.
---

# No useEffect — React Effect Avoidance Rules

**TL;DR:** Never write `useEffect` directly in a React component. Use the alternatives below. Direct `useEffect` is ONLY acceptable inside reusable custom hooks (like `useMountEffect`), never in components.

## When to Activate

This skill applies to EVERY React/Next.js component file. Before writing any `useEffect`, stop and apply these rules.

## Rule 1: Derive State, Do Not Sync It

If you can compute a value from existing state/props, compute it inline or with `useMemo`. Do NOT `useEffect` + `setState`.

```tsx
// ❌ BAD — syncing derived state
const [items, setItems] = useState([]);
const [count, setCount] = useState(0);
useEffect(() => { setCount(items.length); }, [items]);

// ✅ GOOD — derive inline
const [items, setItems] = useState([]);
const count = items.length;

// ✅ GOOD — expensive computation
const sorted = useMemo(() => items.sort(byName), [items]);
```

**If removing the effect and the value can still be computed from state/props → it was derived state. Derive it.**

## Rule 2: Use Data-Fetching Libraries

Never fetch data in `useEffect`. Use React Query, SWR, or Next.js built-in data fetching.

```tsx
// ❌ BAD — fetch in effect
useEffect(() => {
  fetch('/api/data').then(r => r.json()).then(setData);
}, []);

// ✅ GOOD — React Query / SWR / Next.js Server Components
const { data } = useQuery(['key'], fetcher);
// OR in Next.js App Router: fetch directly in Server Component
```

**Rationale:** Effects for data fetching cause race conditions on fast navigation, no deduplication, no caching, no error boundaries.

## Rule 3: Event Handlers, Not Effects

User actions (click, submit, navigation) belong in event handlers, NOT in effects.

```tsx
// ❌ BAD — reacting to state change that was just set
const [submitted, setSubmitted] = useState(false);
useEffect(() => {
  if (submitted) { navigate('/done'); }
}, [submitted]);

// ✅ GOOD — do it in the handler
const handleSubmit = () => { navigate('/done'); };
```

**If the effect runs in response to a user action you just triggered → move it to the event handler.**

## Rule 4: useMountEffect for Mount-Time Sync

For code that MUST run once on mount (analytics, subscriptions, DOM measurements), use the named wrapper `useMountEffect`.

```tsx
// Custom hook (the ONLY place direct useEffect is allowed)
export function useMountEffect(effect: () => void | (() => void)) {
  /* eslint-disable react-hooks/exhaustive-deps, no-restricted-syntax */
  useEffect(effect, []);
}

// ✅ GOOD — in component
useMountEffect(() => {
  const subscription = subscribe(channel, handler);
  return () => subscription.unsubscribe();
});
```

**`useMountEffect` makes intent explicit. Mount-only logic should be clearly named.**

## Rule 5: Reset with Key

When props change and you need to reset component state, use React's `key` prop to remount — not an effect.

```tsx
// ❌ BAD — reset effect
useEffect(() => {
  setDraft('');
  setError(null);
}, [userId]);

// ✅ GOOD — key-based reset
<ProfileEditor key={userId} />
```

**If an effect resets multiple state values when an ID changes → use `key`.**

## Rule 6: Never Patch a Broken Effect with a Ref

If you're adding a ref to "fix" an effect's stale closure, the effect itself is wrong. Eliminate the root effect instead.

```tsx
// ❌ BAD — ref patching a stale closure
const callbackRef = useRef(callback);
useEffect(() => { callbackRef.current = callback; });
useEffect(() => {
  window.addEventListener('resize', () => callbackRef.current());
}, []);

// ✅ GOOD — callback ref (runs on every render, no effect needed)
const ref = useCallback((node: HTMLElement | null) => {
  if (node) {
    const handler = () => measure(node);
    // setup
    return () => { /* cleanup */ };
  }
}, [dep]);

// ✅ GOOD — useEffectEvent (experimental, React 19+)
const onResize = useEffectEvent(() => callback());
useEffect(() => {
  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}, [onResize]);
```

## Decision Checklist

Before writing `useEffect`, ask:

1. **Can this value be computed from state/props?** → Rule 1 (derive it)
2. **Is this data fetching?** → Rule 2 (use data-fetching lib)
3. **Does this run in response to a user action?** → Rule 3 (event handler)
4. **Must this run once on mount?** → Rule 4 (`useMountEffect`)
5. **Is this resetting state on prop change?** → Rule 5 (`key` prop)
6. **Are you adding a ref to fix a stale closure?** → Rule 6 (eliminate the effect)

If NONE of the above apply, the effect may be justified. Document WHY with a comment.

## ESLint Enforcement

Add to your ESLint config to enforce at the lint level:

```json
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.name='useEffect']",
        "message": "useEffect is restricted. See .claude/skills/no-use-effect/SKILL.md for alternatives."
      }
    ]
  }
}
```

## References

- Detailed patterns: `references/patterns.md`
- Original repo: https://github.com/alejandrobailo/no-use-effect