# Agro Cloud Design System 2026

This guide defines the visual and interaction rules used to keep Agro Cloud consistent, modern, accessible, and free from layout overlap.

## Foundations

### Brand Colors

Use the green palette as the primary identity:

- Primary: `#047857`
- Primary hover: `#065f46`
- Primary soft: `rgba(4, 120, 87, 0.12)`
- Background: `#eef7f1`
- Surface: `rgba(255, 255, 255, 0.88)`
- Text: `#0f172a`
- Muted text: `#475569`
- Border: `rgba(15, 23, 42, 0.10)`

Use accent colors only for section identity icons and alerts.

### Typography

Use the shared font stack from `--ds-font-sans`:

```css
Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial
```

Recommended sizes:

- Small labels: `12px`
- Navigation and inputs: `13px`
- Body text: `14px`
- Section titles: `16px` to `18px`
- Page titles: `20px` to `28px`

For Arabic UI, keep the same font stack unless a dedicated Arabic webfont is added later.

## Layout Rules

### Anti-Overlap Rules

All layout containers must support shrinking:

```css
min-width: 0;
max-width: 100%;
box-sizing: border-box;
```

Avoid `width: 100vw` inside the app shell because it can create horizontal overflow beside scrollbars. Use `width: 100%` instead.

### Grid

Use responsive grids for cards:

```css
grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
```

Use fixed-height top navigation on desktop and stacked mobile navigation below `767px`.

## Components

### Top Navigation

- Desktop: one compact horizontal row.
- Medium screens: icon-only mode to avoid overlap.
- Mobile: collapsible vertical menu.
- Dropdown labels must use `white-space: nowrap` unless the text is intentionally long documentation text.

### Cards

Cards should use:

```css
border-radius: 16px;
border: 1px solid rgba(15, 23, 42, 0.08);
box-shadow: 0 14px 34px rgba(15, 23, 42, 0.07);
```

### Tables

Wrap large tables in a scoped scroll container only:

```css
.table-wrap {
  max-width: 100%;
  overflow-x: auto;
}
```

Do not allow full-page horizontal scroll.

## Motion

Use short, subtle transitions:

```css
transition:
  background-color 180ms ease,
  border-color 180ms ease,
  color 180ms ease,
  box-shadow 180ms ease,
  transform 180ms ease;
```

Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

## Accessibility

- Every interactive element must have visible focus using `:focus-visible`.
- Icon-only buttons must include `aria-label` and `title` when helpful.
- Do not communicate state with color only; use active styles, borders, labels, or icons.
- Keep text contrast readable against glass surfaces.

## Performance

- Prefer CSS variables and shared classes over duplicated heavy styles.
- Avoid large background images for decorative effects.
- Use transitions on `transform` and `opacity` where possible.
- Keep dropdowns lightweight and avoid unnecessary JavaScript layout measurement.

## Source Files

Primary design files:

- `src/index.css`: global design tokens, layout safety, anti-overlap rules.
- `src/components/navmenu.css`: horizontal navigation, dropdowns, responsive navigation.
- `src/components/header.css`: main application header.
- `src/pages/Home.css`: home dashboard cards and responsive app grid.
- `src/pages/data-entry/EC.css`: data-entry and settings UI.

Generated deployment assets:

- `AgroCloud-GitHub-Ready.zip`
- `AgroCloud-Pages-Upload.zip`

