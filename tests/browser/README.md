# Odometer browser regression

Run `bun tests/browser/odometer.mjs` with Playwright and its Chromium browser installed.

The check uses the production counter CSS and bundled Inter font. Startup screenshots must match ordinary text pixel for pixel. At 1.25x display scaling, the final animation frame must match the settled pixels and per-digit horizontal positions. A German browser locale verifies that 9000 stays ungrouped. Digit-count growth and shrinkage must animate both the digits and the changing width. Other checks cover rendered text dimensions at different font sizes and scales, hidden initialization, independent counter instances, interrupted and paused animations, reduced motion, tab visibility, and clearing a counter while an animation is running.
