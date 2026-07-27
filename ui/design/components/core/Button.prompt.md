Inja Food action button — verb/noun label, brand violet by default; use for any primary/secondary action.

```jsx
<Button variant="primary" onClick={save}>ذخیره</Button>
<Button variant="secondary">انصراف</Button>
<Button variant="danger">حذف کامل</Button>
```

Variants: `primary` (violet), `coral`, `danger` (red + coral glow), `ok` (green), `secondary` (white/violet border), `ghost`. Sizes `sm|md|lg`. `block` for full width, `icon` for a leading line-SVG. Filled variants brighten on hover; ghost/secondary fill with `#F4EFFB`. Never scales on press — color shift only.
