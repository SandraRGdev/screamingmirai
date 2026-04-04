# No useEffect — Detailed Patterns

## 1. Derived State Patterns

### Simple Derivation

```tsx
// ❌ BAD
const [filtered, setFiltered] = useState([]);
useEffect(() => {
  setFiltered(items.filter(i => i.active));
}, [items]);

// ✅ GOOD — compute inline
const filtered = items.filter(i => i.active);
```

### Expensive Derivation with useMemo

```tsx
// ❌ BAD
const [sorted, setSorted] = useState([]);
useEffect(() => {
  setSorted([...items].sort((a, b) => a.name.localeCompare(b.name)));
}, [items]);

// ✅ GOOD
const sorted = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);
```

### Conditional Derivation

```tsx
// ❌ BAD
const [label, setLabel] = useState('');
useEffect(() => {
  setLabel(status === 'active' ? 'Online' : 'Offline');
}, [status]);

// ✅ GOOD
const label = status === 'active' ? 'Online' : 'Offline';
```

---

## 2. Data Fetching Patterns

### React Query

```tsx
// ❌ BAD — fetch in effect with race condition
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  setLoading(true);
  fetch(`/api/users/${id}`)
    .then(r => r.json())
    .then(d => { setData(d); setLoading(false); });
}, [id]);

// ✅ GOOD — React Query handles loading, caching, dedup, race conditions
const { data, isLoading } = useQuery({
  queryKey: ['user', id],
  queryFn: () => fetch(`/api/users/${id}`).then(r => r.json()),
});
```

### Next.js App Router — Server Components

```tsx
// ✅ BEST — fetch in Server Component, no client effect at all
async function UserProfile({ id }: { id: string }) {
  const user = await db.user.findUnique({ where: { id } });
  return <div>{user.name}</div>;
}
```

### Next.js App Router — use() Hook

```tsx
// ✅ GOOD — use() unwraps promises in Client Components
const data = use(fetch(`/api/users/${id}`).then(r => r.json()));
```

---

## 3. Event Handler Patterns

### Navigation After Action

```tsx
// ❌ BAD — navigate in effect
const [saved, setSaved] = useState(false);
useEffect(() => {
  if (saved) router.push('/dashboard');
}, [saved]);

// ✅ GOOD — navigate in handler
const handleSave = async () => {
  await saveForm(formData);
  router.push('/dashboard');
};
```

### Analytics Tracking

```tsx
// ❌ BAD — track in effect
useEffect(() => {
  if (productId) track('view', productId);
}, [productId]);

// ✅ GOOD — track in event handler or Server Action
const handleClick = () => {
  track('click', productId);
  doAction();
};
```

### Form Submission

```tsx
// ❌ BAD — submit in effect
const [shouldSubmit, setShouldSubmit] = useState(false);
useEffect(() => {
  if (shouldSubmit) {
    submitForm(formData);
    setShouldSubmit(false);
  }
}, [shouldSubmit]);

// ✅ GOOD — submit in handler
const handleSubmit = (e: FormEvent) => {
  e.preventDefault();
  submitForm(formData);
};
```

---

## 4. useMountEffect Patterns

### Subscription Setup

```tsx
useMountEffect(() => {
  const sub = eventBus.subscribe('data', handler);
  return () => sub.unsubscribe();
});
```

### DOM Measurement

```tsx
const ref = useRef<HTMLDivElement>(null);
useMountEffect(() => {
  if (ref.current) {
    const { width, height } = ref.current.getBoundingClientRect();
    setDimensions({ width, height });
  }
});
```

### Analytics Initialization

```tsx
useMountEffect(() => {
  analytics.init({ appId: 'screaming-web' });
});
```

---

## 5. Key-Based Reset Patterns

### Reset Form on ID Change

```tsx
// ❌ BAD
function Editor({ id }: { id: string }) {
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft('');
    setDirty(false);
  }, [id]);

  return <input value={draft} onChange={e => { setDraft(e.target.value); setDirty(true); }} />;
}

// ✅ GOOD — key remounts entire component
<Editor key={id} />
```

### Reset Tab Content on Tab Change

```tsx
// ❌ BAD
useEffect(() => {
  setSearch('');
  setPage(1);
}, [activeTab]);

// ✅ GOOD
<TabContent key={activeTab} tab={activeTab} />
```

---

## 6. Ref-Patch Elimination Patterns

### Stale Closure in Event Listener

```tsx
// ❌ BAD — ref patching
const handlerRef = useRef(handler);
useEffect(() => { handlerRef.current = handler; });
useEffect(() => {
  window.addEventListener('click', () => handlerRef.current());
  return () => window.removeEventListener('click', () => handlerRef.current());
}, []);

// ✅ GOOD — useEffectEvent (React 19+)
const onClick = useEffectEvent(() => handler());
useEffect(() => {
  window.addEventListener('click', onClick);
  return () => window.removeEventListener('click', onClick);
}, []);

// ✅ GOOD — callback ref for DOM side effects
const ref = useCallback((node: HTMLElement | null) => {
  if (!node) return;
  const observer = new ResizeObserver(() => measure(node));
  observer.observe(node);
  return () => observer.disconnect();
}, [measure]);
```

### Avoiding the Debt Spiral

```
Broken effect → add ref to "fix" stale closure → ref needs updating → add another effect → more stale closures → more refs
```

Instead: eliminate the original effect using Rules 1-5.

---

## 7. Adjusting State on Prop Change

```tsx
// ❌ BAD — adjust state in effect
function List({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState<Item | null>(null);

  useEffect(() => {
    if (selected && !items.includes(selected)) {
      setSelected(null);
    }
  }, [items, selected]);

  // ...
}

// ✅ GOOD — adjust during render (no effect)
function List({ items }: { items: Item[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find(i => i.id === selectedId) ?? null;

  // ...
}
```

---

## 8. External Store Subscription

```tsx
// ✅ GOOD — useSyncExternalStore (no manual useEffect)
const width = useSyncExternalStore(
  (callback) => {
    window.addEventListener('resize', callback);
    return () => window.removeEventListener('resize', callback);
  },
  () => window.innerWidth,
);
```

---

## 9. App Initialization

```tsx
// ❌ BAD — init in component effect
function App() {
  useEffect(() => {
    initServices();
    loadConfig();
  }, []);
}

// ✅ GOOD — init in layout or server, not in effect
// In Next.js: use a Server Component for initialization
// OR use a dedicated init hook
function useAppInit() {
  const [ready, setReady] = useState(false);
  useMountEffect(() => {
    initServices();
    loadConfig();
    setReady(true);
  });
  return ready;
}
```