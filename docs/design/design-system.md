# Product design specification

The generated concept at `docs/design/family-chores-concept.png` is the visual source for version 0.1.0.

## Direction

- True-white canvas, deep navy text, teal primary controls, and coral/ochre/blue/green semantic accents.
- Friendly rounded system sans-serif, disciplined labels, generous whitespace, and 44px minimum controls.
- Open rails and lists. Cards are reserved for profiles, actionable chores, balance summaries, and goals.
- Outlined 2px icons with small areas of flat fill. No emoji as the navigation/icon system.
- Motion is limited to opacity, border, and colour transitions under 150ms; reduced-motion removes them.

## Tokens

| Role | Value |
| --- | --- |
| Canvas | `#ffffff` |
| Soft surface | `#f5f8fa` |
| Ink | `#102a43` |
| Muted | `#627d98` |
| Border | `#d9e2ec` |
| Primary | `#008c95` |
| Primary dark | `#006b73` |
| Coral/review | `#e85545` |
| Ochre/waiting | `#bf7b00` |
| Green/done | `#19734a` |
| Focus | `#1b6ac9` |

## Component inventory

- Selector: centered heading, profile tiles, avatar circles, role label, focused sign-in dialog.
- Parent shell: 240px desktop rail, compact top actions, responsive bottom/overflow navigation on small screens.
- Child shell: narrow content column with top switch-user action and four-item bottom navigation.
- Chore row/card: category icon, title, value, labelled status, and exactly one obvious next action.
- Setup: four-step progress rail, single-column fields, persistent Back/Continue action row.
- Status: text and icon always accompany semantic colour.

## Allowed first-viewport copy

`Who’s using the app?`, `Choose your profile to continue.`, `Parent dashboard`, `Needs review`, `Today`, `Chore Board`, `Piggy banks`, `Recent activity`, `Add chore`, `Switch user`, `In your piggy bank`, `My chores`, `Waiting to be checked`, `Goals`, `Set up your household`, `Continue`, `Finish setup`.
