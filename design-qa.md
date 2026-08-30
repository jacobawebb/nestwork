# Recurring chore stack design QA

## Evidence

- Source visual truth:
  - `C:\Users\Jacob\AppData\Local\Temp\codex-clipboard-e74a988c-82cc-4a5f-b3de-7050de57ca7f.png` — 132 × 104 px
  - `C:\Users\Jacob\AppData\Local\Temp\codex-clipboard-ee304ef6-065e-4b3a-a093-2b6a5c63f9c3.png` — 251 × 177 px
  - `C:\Users\Jacob\AppData\Local\Temp\codex-clipboard-7e0e5203-69bd-4c2c-af51-8601160cf565.png` — 312 × 205 px
  - `C:\Users\Jacob\AppData\Local\Temp\codex-clipboard-8982db07-d639-4cb8-93a7-55046bd92397.png` — 233 × 288 px
- Desktop implementation screenshot: `C:\Users\Jacob\AppData\Local\Temp\nestwork-recurring-stack-desktop-final.png` — 1265 × 712 px, default desktop browser viewport, 1× density.
- Mobile implementation screenshot: `C:\Users\Jacob\AppData\Local\Temp\nestwork-recurring-stack-mobile-final.png` — 375 × 812 px capture from a 390 × 844 browser override; document client width 375 px, 1× density.
- State: violet light palette, parent chores page, collapsed group containing 15 daily occurrences.
- Full-view comparison: all four references and both implementation captures were opened together. The implementation follows the shared reference pattern: one fully readable front card, three shallow rounded backplates, restrained offsets, and no duplicate content on the decorative layers.
- Focused-region comparison: not required because the stack is the dominant, fully legible region in both implementation captures.

## Fidelity surfaces

- Fonts and typography: retained the product's rounded system typography and existing chore-card hierarchy. The references informed stacking, not typeface replacement.
- Spacing and layout rhythm: front card aligns with the stack container; backplates use small vertical offsets and sub-degree rotations. Desktop and mobile spacing remain inside the section frame.
- Colors and visual tokens: backplates use `primary-soft`, `surface-strong`, and `surface`, so every user palette—including deeper mode—produces a coherent stack.
- Image quality and assets: no raster assets are required in the implementation; the references describe a UI layering treatment. Existing Lucide product icons remain sharp and consistent.
- Copy and content: only the front occurrence exposes title, instructions, value, assignee, and actions. The count control communicates and reveals the remaining scheduled copies.

## Interaction and browser checks

- Page identity: `http://127.0.0.1:8790/parent/chores`, title `Family chores`.
- Primary interaction: activating `15 scheduled copies` changed `aria-expanded` to `true` and exposed 15 chore articles; the control changed to `Hide copies`.
- Console errors/warnings: none.
- Framework overlay/blank screen: none.
- Responsive overflow: final mobile document `scrollWidth` and `clientWidth` are both 375 px.

## Comparison history

1. P1 alignment mismatch: the initial backplates were translated left of the front card. Fixed by replacing percentage translation with stable inline insets. Post-fix desktop evidence shows aligned rounded layers.
2. P2 mobile overflow: rotated backplates created horizontal scrolling. Fixed by clipping decorative layers within the stack and clipping parent-shell horizontal paint overflow. Post-fix mobile evidence reports equal document scroll and client widths.

## Findings

- No remaining actionable P0, P1, or P2 differences.
- P3: the mobile front card is naturally taller because its actions stack vertically; this is consistent with the existing responsive chore-card system and keeps touch targets readable.

final result: passed
