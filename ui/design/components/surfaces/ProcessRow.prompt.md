A process-list row: name + mono id + tag on one side, activity count, then «اطلاعات کلی» / «فلوچارت» buttons and a delete icon.

```jsx
<ProcessRow name="خرید و پرداخت هزینه" id="cooking-001" count="۸"
  tag="۲ تعارض" tagTone="danger" onSummary={s} onFlow={f} onDelete={d} />
```

Composes Badge, Button, IconButton. On mobile the actions wrap full-width.
