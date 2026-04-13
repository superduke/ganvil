---
name: frontend-design
description: >
  Frontend design standards and aesthetic guidelines. Provides grading criteria
  for visual design quality, originality, craft, and functionality. Referenced by
  the planner and frontend evaluator. Not directly user-invocable.
user-invocable: false
---

# Frontend Design Standards

This skill provides the design evaluation criteria and aesthetic guidelines used by the harness planner and frontend evaluator. It encodes design principles that turn subjective judgments like "is this design good?" into concrete, gradable terms.

## Design Thinking Framework

Before making any design decision, understand:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Commit to a BOLD aesthetic direction. Options include (but are not limited to): brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian. Choose one and execute it with precision.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

## Aesthetic Guidelines

### Typography
Choose fonts that are beautiful, unique, and interesting. **Avoid** generic fonts like Arial, Inter, Roboto, and system fonts. Opt for distinctive choices that elevate the design: unexpected, characterful font choices. Pair a distinctive display font with a refined body font.

### Color & Theme
Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Every color choice should reinforce the chosen tone.

### Motion & Animation
Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.

### Spatial Composition
Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density. The layout itself should be a design decision, not a default.

### Backgrounds & Visual Details
Create atmosphere and depth rather than defaulting to solid colors. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

## Anti-Patterns: What to NEVER Do

The following are telltale signs of generic AI-generated design ("AI slop") and must be actively avoided:

- **Overused fonts**: Inter, Roboto, Arial, system-ui
- **Cliché color schemes**: Purple gradients on white backgrounds, generic blue buttons
- **Template layouts**: Standard card grids, Bootstrap-default spacing, identical shadow depths
- **Stock patterns**: Unmodified component library defaults, generic hero sections
- **Predictable choices**: Every generation converging on the same "safe" look

## Four-Dimension Evaluation Criteria

### 1. Design Quality (Weight: HIGH)
Does the design feel like a coherent whole rather than a collection of parts? Strong work means the colors, typography, layout, imagery, and details combine to create a distinct mood and identity.

Scoring:
- **9-10**: Museum quality. A human designer would be impressed.
- **7-8**: Noticeably polished with clear aesthetic direction.
- **5-6**: Acceptable but unremarkable.
- **3-4**: Disjointed components from different design systems.
- **1-2**: Broken or ugly.

### 2. Originality (Weight: HIGH)
Is there evidence of custom design decisions, or is this templates, library defaults, and AI-generated patterns? A human designer should recognize deliberate creative choices. Unmodified stock components or telltale AI patterns fail here.

Scoring:
- **9-10**: Unique and memorable throughout.
- **7-8**: Several distinctive choices, minor generic elements.
- **5-6**: Mix of custom and generic.
- **3-4**: Mostly defaults, AI patterns evident.
- **1-2**: Pure template with zero customization.

### 3. Craft (Weight: STANDARD)
Technical execution: typography hierarchy, spacing consistency, color harmony, contrast ratios, animation smoothness and purpose. This is a competence check. Most competent implementations score 6-8 by default; below 5 means broken fundamentals.

### 4. Functionality (Weight: STANDARD)
Usability independent of aesthetics. Can users understand what the interface does, find primary actions, and complete tasks without guessing? Are error states handled?

## How Planner Should Use This

When creating the visual design language section of a product spec:
1. Choose a bold aesthetic direction from the tone options above
2. Specify exact font choices, color palette, spacing philosophy
3. Define animation approach and interaction patterns
4. Include anti-patterns to avoid
5. Set the bar high — the best designs are museum quality

## How Frontend Evaluator Should Use This

When scoring design quality and originality:
1. Compare against the anti-patterns list — any match reduces the score
2. Look for intentional design decisions vs. defaults
3. Check if the design feels cohesive or assembled from parts
4. Weight design quality and originality more heavily than craft and functionality
5. Be skeptical — LLMs naturally want to praise LLM output
