# 📱 Responsive Design Quick Reference

## Common Patterns Used

### 1. **Responsive Padding**
```jsx
// Good - scales from 2 to 6
<div className="p-2 sm:p-4 lg:p-6" />

// Mobile: p-2 (8px)
// Tablet (sm): p-4 (16px)  
// Desktop (lg): p-6 (24px)
```

### 2. **Responsive Text**
```jsx
// Good - scales from small to large
<h1 className="text-sm sm:text-base lg:text-lg" />

// Mobile: text-sm (14px)
// Tablet: text-base (16px)
// Desktop: text-lg (18px)
```

### 3. **Responsive Icons**
```jsx
// Good - icon scales with breakpoint
<Icon className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7" />

// Mobile: 20x20
// Tablet: 24x24
// Desktop: 28x28
```

### 4. **Responsive Grid**
```jsx
// Good - 2 cols mobile, 3 tablet, 4 desktop
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" />
```

### 5. **Show/Hide Content**
```jsx
// Hidden on mobile, shown on lg
<div className="hidden lg:block" />

// Shown on mobile, hidden on lg
<div className="lg:hidden" />

// Shown on sm and up
<div className="hidden sm:block" />
```

### 6. **Responsive Flex Direction**
```jsx
// Stack vertically on mobile, row on tablet
<div className="flex flex-col sm:flex-row gap-4" />

// Stack on mobile, horizontally on desktop
<div className="flex flex-col lg:flex-row" />
```

### 7. **Safe Area Insets** (iPhone notch)
```jsx
// Container respects safe area
<div className="px-safe" /> // Uses env(safe-area-inset-*)
```

---

## Tailwind Breakpoints Reference

```
Device Type      Breakpoint   Width Range      CSS
────────────────────────────────────────────────────
Mobile           (default)    < 640px          @media (max-width: 639px)
Large Mobile     sm           ≥ 640px          @media (min-width: 640px)
Tablet           md           ≥ 768px          @media (min-width: 768px)
Desktop          lg           ≥ 1024px         @media (min-width: 1024px)
Large Desktop    xl           ≥ 1280px         @media (min-width: 1280px)
XL Desktop       2xl          ≥ 1536px         @media (min-width: 1536px)
```

---

## ❌ Patterns to Avoid

### ❌ Fixed Sizes
```jsx
// BAD - doesn't scale
<div className="w-[1000px] h-[500px]" />

// GOOD - responsive
<div className="w-full h-auto" />
```

### ❌ Single Breakpoint
```jsx
// BAD - only considers lg
<h1 className="lg:text-2xl" />

// GOOD - handles all sizes
<h1 className="text-sm sm:text-lg lg:text-2xl" />
```

### ❌ Inconsistent Spacing
```jsx
// BAD - different spacing at different levels
<div className="p-8 sm:p-2 lg:p-16" />

// GOOD - consistent scaling
<div className="p-2 sm:p-4 lg:p-6" />
```

### ❌ No Mobile-First Design
```jsx
// BAD - mobile as afterthought
<div className="text-3xl sm:text-sm lg:text-lg" />

// GOOD - mobile first
<div className="text-sm sm:text-base lg:text-lg" />
```

---

## Layout Patterns

### Mobile-First Sidebar
```jsx
// Desktop: sidebar visible on left
// Mobile: sidebar in drawer menu
<div className="flex flex-col lg:flex-row">
  <Sidebar className="hidden lg:flex w-72" />
  <div className="flex-1">
    <Header />
    <MainContent />
  </div>
</div>
```

### Responsive Grid
```jsx
// 1 col mobile, 2 col sm, 3 col lg, 4 col xl
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

### Responsive Navigation
```jsx
// Vertical menu on mobile, horizontal on desktop
<nav className="flex flex-col sm:flex-row gap-4 sm:gap-0">
  {navItems.map(item => (
    <Link key={item.id} to={item.path}>
      {item.label}
    </Link>
  ))}
</nav>
```

---

## Testing in DevTools

### Chrome/Edge DevTools
1. Open DevTools (F12)
2. Click "Toggle device toolbar" (Ctrl+Shift+M)
3. Select device or set custom width
4. Test responsive behavior

### Firefox DevTools
1. Open DevTools (F12)
2. Click "Responsive Design Mode" (Ctrl+Shift+M)
3. Select device or set custom size

### Safari DevTools
1. Develop → Enter Responsive Design Mode
2. Select device to test

---

## Performance Tips

1. **Use CSS classes** instead of inline styles for responsive
2. **Avoid calculations** in className (use Tailwind utilities)
3. **Don't overuse breakpoints** - use only what's needed
4. **Test on real devices** - DevTools aren't always accurate
5. **Check console for warnings** - CSS load issues

---

## Debugging Responsive Issues

### Issue: Text too small on mobile
```jsx
// Add sm: for tablets
<h1 className="text-sm sm:text-base lg:text-lg" />
```

### Issue: Layout broken on tablet
```jsx
// Add md: or lg: breakpoint
<div className="flex flex-col md:flex-row lg:gap-6" />
```

### Issue: Content overlaps on mobile
```jsx
// Check p-* or m-* values
// May need different padding for mobile
<div className="p-2 sm:p-4 lg:p-6" />
```

### Issue: Buttons not clickable on mobile
```jsx
// Minimum touch target is 44px
<button className="h-11 px-4" /> {/* 44px height */}
```

### Issue: Content hidden on notched devices
```jsx
// Use safe-area classes or env vars
<div style={{ paddingLeft: 'env(safe-area-inset-left)' }} />
```

---

## Quick Checklist Before Commit

- [ ] Mobile layout (< 640px) looks good
- [ ] Tablet layout (md/lg) is responsive
- [ ] Desktop layout (lg+) is properly aligned
- [ ] No horizontal scrollbar on any width
- [ ] Text is readable (min 14px on mobile)
- [ ] Buttons are clickable (min 44x44px)
- [ ] Images scale properly
- [ ] Form inputs work on mobile
- [ ] Safe area respected on notches
- [ ] Tested in DevTools and real device

---

**Updated**: 2024-2025  
**Framework**: React + Tailwind CSS + Ionic  
**Status**: Ready for production use
