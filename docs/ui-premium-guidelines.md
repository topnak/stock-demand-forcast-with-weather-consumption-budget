# Premium UI Design Guidelines

These guidelines define the visual and interaction standards for building a **modern, premium dashboard interface**.

The goal is to create an interface that feels **clean, spacious, refined, and high-end**, similar to products like Apple, Stripe, Linear, and Notion.

All UI components should follow these rules.

---

# 1. Design Principles

The interface should feel:

• Minimal
• Spacious
• Calm
• Elegant
• Modern
• Polished

Avoid:

• Crowded layouts
• Heavy borders
• Flat or dated styling
• Excessive colors
• Dense UI components

Whitespace and hierarchy should guide the user naturally.

---

# 2. Layout & Spacing

Spacing is critical to achieving a premium feel.

Use generous whitespace.

## Layout spacing

Page padding: 32px – 40px
Section spacing: 32px – 40px
Card padding: 28px – 32px
Grid gap: 24px – 32px

Never allow elements to feel cramped.

Example:

```
section {
  margin-bottom: 40px;
}

.card {
  padding: 32px;
}
```

---

# 3. Border Radius

Use soft rounded corners.

Small elements: 8px
Buttons: 10px – 12px
Cards: 16px
Large containers: 20px

Example:

```
.card {
  border-radius: 16px;
}
```

---

# 4. Color System

Use a calm neutral palette with a single primary accent.

## Core colors

Background
#F6F7FB

Card background
#FFFFFF

Primary
#2563EB

Text primary
#111827

Text secondary
#6B7280

Divider / border
rgba(0,0,0,0.05)

---

## Status colors

Success
#22C55E

Warning
#F59E0B

Danger
#EF4444

Use very soft backgrounds for status indicators.

Example:

```
.success-badge {
  background: rgba(34,197,94,0.1);
}
```

Avoid strong saturated colors.

---

# 5. Typography

Use the **Inter** font family.

```
font-family: "Inter", system-ui, sans-serif;
```

Typography hierarchy must be clear.

## Font scale

Page title
32px
Weight 600

Section title
20px
Weight 600

Metric numbers
36px – 40px
Weight 700

Body text
14px
Weight 400

Caption text
12px
Weight 400

Secondary text should use a muted color:

```
color: #6B7280;
```

---

# 6. Cards

Cards should feel soft and elevated.

Avoid heavy borders.

Use subtle shadows and gradients.

Example card styling:

```
.card {
  background: linear-gradient(180deg,#ffffff,#f7f8fa);
  border-radius: 16px;
  border: 1px solid rgba(0,0,0,0.05);
  box-shadow: 0 8px 30px rgba(0,0,0,0.08);
  padding: 32px;
}
```

Cards should have breathing room around them.

---

# 7. Metric / KPI Cards

Numbers should be visually dominant.

Example structure:

```
40px bold number
small label underneath
optional icon
```

Example style:

```
.metric-number {
  font-size: 40px;
  font-weight: 700;
}

.metric-label {
  font-size: 14px;
  color: #6B7280;
}
```

Icons should sit inside soft circular backgrounds.

Example:

```
.icon-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(37,99,235,0.1);
}
```

---

# 8. Buttons

Buttons should feel modern and refined.

Primary button example:

```
.primary-button {
  background: linear-gradient(135deg,#2563EB,#4F8CFF);
  color: white;
  border-radius: 12px;
  padding: 10px 16px;
}
```

Secondary button example:

```
.secondary-button {
  background: white;
  border: 1px solid rgba(0,0,0,0.08);
}
```

Buttons should never feel flat.

---

# 9. Hover Effects

Subtle motion makes the interface feel polished.

Cards should lift slightly on hover.

Example:

```
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px rgba(0,0,0,0.12);
  transition: all .25s ease;
}
```

Buttons should fade or elevate slightly.

Example:

```
button:hover {
  opacity: 0.95;
}
```

Animations must be subtle and smooth.

---

# 10. Dividers

Avoid heavy borders.

Use soft dividers:

```
border: 1px solid rgba(0,0,0,0.05);
```

Prefer whitespace over visible separators.

---

# 11. Icons

Icons should be:

• simple
• consistent size
• minimal

Recommended size:

20px – 24px

Icons should often sit inside soft colored circles.

Example:

```
.icon-container {
  background: rgba(37,99,235,0.1);
  border-radius: 50%;
}
```

---

# 12. Map & Data Visualizations

Maps and charts should be contained inside premium cards.

Use:

• rounded corners
• soft shadows
• clean headers

Example container:

```
.map-container {
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.12);
}
```

Charts should use minimal grid lines and muted colors.

---

# 13. Background Styling

The main page background should not be pure white.

Use a subtle gradient.

Example:

```
body {
  background: radial-gradient(
    circle at top,
    #ffffff,
    #f4f6fb
  );
}
```

This adds visual depth.

---

# 14. Interaction Design

All interactions should feel smooth and intentional.

Use consistent animation timing.

Recommended:

```
transition: all .25s ease;
```

Avoid abrupt changes.

---

# 15. Consistency Rules

Always maintain consistency for:

• spacing
• border radius
• shadows
• typography scale
• color palette

Consistency is what makes the interface feel premium.

---

# 16. Implementation Rule for Copilot

When modifying UI components:

1. Follow these guidelines.
2. Improve visual hierarchy.
3. Increase whitespace where necessary.
4. Refactor CSS to use reusable styles.
5. Keep existing functionality unchanged.

The goal is to **increase polish and visual quality without adding clutter**.

---

# End of Guidelines
