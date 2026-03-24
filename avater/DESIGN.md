# Design System Strategy: The Stadium Pulse

## 1. Overview & Creative North Star
The Creative North Star for this system is **"The Digital Arena."** 

We are not building a static interface; we are designing a high-stakes, live broadcast experience. This system rejects the "flat web" aesthetic in favor of depth, kinetic energy, and atmospheric immersion. To break the "template" look, we utilize **intentional asymmetry**—such as overlapping player stats over background gradients—and **extreme typographic contrast** to mirror the intensity of a live IPL broadcast. Every element should feel like it is floating within a pressurized, high-energy environment.

---

## 2. Colors & Atmospheric Depth
Our palette is rooted in the "Deep Purple" of the midnight sky and the "Neon Green" of the floodlit pitch.

### The Palette
- **Primary Action:** `primary_container` (#00FFAB) – Use this exclusively for the most critical user actions (Predict, Bet, Join).
- **Surface Foundations:** `surface` (#111317) and `surface_container_lowest` (#0c0e12).
- **The Glow (Highlights):** `secondary_container` (#14d1ff) for real-time score updates and `tertiary_fixed_dim` (#d1bcff) for deep background depth.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders to section content. Boundaries must be defined by background color shifts. 
*   *Example:* A prediction card using `surface_container_high` should sit on a `surface` background. The change in tonal value creates the "edge," not a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of glass. 
1.  **Base Layer:** `surface` (The stadium floor).
2.  **Sectioning:** `surface_container_low` (Large content blocks).
3.  **Interactive Cards:** `surface_container_high` (Floating over sections).
4.  **Pop-overs/Modals:** `surface_bright` (Closest to the user).

### The "Glass & Gradient" Rule
To achieve the premium broadcast feel, use **Glassmorphism**. High-priority containers (like Live Scoreboards) should use a semi-transparent `surface_container` with a `backdrop-filter: blur(20px)`. 
*   **Signature Texture:** Apply a subtle linear gradient from `primary_container` (#00FFAB) to `primary_fixed_dim` (#00e297) at a 135° angle for main CTAs to give them a "lit-from-within" energy.

---

## 3. Typography: The Broadcast Voice
The typography is designed to shout the scores and whisper the details.

*   **Display & Headlines (Space Grotesk):** This is our "Stadium" font. Use `display-lg` for massive score totals and `headline-lg` for match titles. It is wide, aggressive, and high-energy.
*   **Titles & Body (Inter):** For navigation and data. `title-md` provides clarity for betting odds, while `body-md` ensures readability for rules and descriptions.
*   **Labels (Manrope):** `label-sm` is used for micro-data (e.g., "Overs," "Run Rate") to provide a technical, data-driven aesthetic.

**Scale Philosophy:** Always lean into the extremes. If a score is important, make it `display-lg`. If a detail is secondary, make it `label-md`. Avoid the "middle ground" to maintain the editorial edge.

---

## 4. Elevation & Depth
We eschew traditional material shadows in favor of **Tonal Layering** and **Ambient Glows**.

*   **The Layering Principle:** Stack `surface_container_lowest` (Background) → `surface_container_low` (Card) → `surface_container_highest` (Inner Element). This creates a sophisticated, recessed feel without a single shadow.
*   **Ambient Shadows:** When an element must "float" (e.g., a floating action button), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4)`. The shadow should feel like a soft pool of dark purple (`on_tertiary_fixed`), not grey.
*   **The "Ghost Border":** If a separation is required for accessibility, use the `outline_variant` token at **15% opacity**. This creates a hint of an edge that disappears into the glass effect.

---

## 5. Components

### Buttons
*   **Primary:** `primary_container` background with `on_primary_container` text. Use `rounded-md` (0.375rem). Apply a subtle `primary` glow on hover.
*   **Secondary:** Glass-style. Background: `surface_container_high` at 40% opacity. Backdrop-blur: 12px.

### Prediction Chips
*   Use `surface_container_highest` for the base. When selected, transition the background to `secondary_container` (#14d1ff) with a high-contrast `on_secondary_container` label.

### Live Score Cards
*   **Forbid Dividers.** Separate "Team A" and "Team B" using a `2.5` (0.625rem) vertical gap or a subtle shift from `surface_container_low` to `surface_container_high`.
*   Numbers should be `display-md` to ensure they are the first thing the eye hits.

### Input Fields
*   Background: `surface_container_lowest`. 
*   Focus State: No heavy border. Instead, use a "Ghost Border" of `primary_fixed` at 30% and a soft `primary_container` outer glow.

### Additional Component: "The Pulse Meter"
*   A custom progress bar for win-probabilities using a gradient from `secondary_container` (Electric Blue) to `primary_container` (Neon Green).

---

## 6. Do's and Don'ts

### Do:
*   **Use Oversized Typography:** Let the numbers for ranks and scores breathe with `display` scales.
*   **Embrace the Dark:** Keep 90% of the UI in the `surface` to `surface_container_low` range to make the Neon Green pop.
*   **Use Asymmetric Padding:** Try using `spacing-10` on the left and `spacing-6` on the right for hero headers to create movement.

### Don't:
*   **Never use #000000:** Always use `surface_container_lowest` (#0c0e12) for the deepest blacks to maintain "inkiness" and depth.
*   **No 1px Dividers:** If you feel the need for a line, use white space or a tonal shift instead.
*   **Avoid Flat Colors:** Use the "Signature Textures" (subtle gradients) on any element larger than 100px to avoid a "cheap" digital look.
*   **Don't Over-Round:** Stick to `md` (0.375rem) or `lg` (0.5rem) for cards. Avoid "bubbly" full-rounded corners unless it's a small chip or tag.