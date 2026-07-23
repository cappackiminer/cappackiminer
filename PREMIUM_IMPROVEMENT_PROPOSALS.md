# CappAckiMiner Premium Improvement Candidates

> This file contains review notes only. None of the items below will be implemented without user approval.

## Priority 1 — Visual consistency

- Consolidate historical override blocks in `src/App.css` into one final theme layer.
- Use a consistent border radius, spacing, and raised-surface language across the header, toolbar, system monitor, and wallet cards.
- Simplify overlapping legacy `.app-header h1`, toolbar, and card animation rules.
- Prevent the wallet name, status badge, and actions from colliding in narrow wallet-card headers.

## Priority 2 — Premium appearance

- Make card depth more controlled by preserving the outer shadow while reducing the white inner highlight.
- Use one soft accent for the active card and remove stacked glow layers.
- Apply the same glass-and-metal surface, hover state, and pressed behavior to Start, Stop, and Start All controls.
- Align the system monitor more evenly with the header and smooth the CPU color transition.

## Priority 3 — Animation safety

- Do not permanently enable wallet water/glint, title wave, and toolbar sheen groups together until light-effect testing is complete.
- Keep one animation debug mode and remove temporary batch-selector chains after testing.
- Add `prefers-reduced-motion` support.
- Limit `filter`, `backdrop-filter`, and `will-change` to active or hover states.

## Priority 4 — Usability

- Make keyboard focus states more visible on every primary control.
- Clearly distinguish `READY`, `WAITING`, `ERROR`, and `RECONNECT REQUIRED` wallet states.
- Display the error message, App ID, and network stage as separate fields in the activity log.
- Add an optional compact layout to reduce card density in the 24-wallet view.

## Recommended implementation order

1. Identify the exact animation light source.
2. Simplify the final CSS override layer.
3. Correct card, header, and toolbar alignment.
4. Compare premium shadows and highlights one at a time.
5. Add keyboard accessibility and reduced-motion support.

## Approval status

- Implemented changes: None.
- Items awaiting user approval: Every item in this file.
