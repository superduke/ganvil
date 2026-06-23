---
name: plan
description: >
  Generate a product specification from a brief description. Classifies the project
  as frontend/backend/fullstack, defines features, creates a visual design language
  (for frontend), and decomposes into sprints with testable acceptance criteria.
  Use when you only need a product spec without building the application.
argument-hint: <product description in 1-4 sentences>
---

# Harness Plan — Product Specification Generator

Generate a comprehensive product specification from a brief description, without building the application.

## What to Do

1. Create the `harness-artifacts/` directory if it doesn't exist.
2. Delegate to the **planner** agent with the user's description: `$ARGUMENTS`
   - If the current directory contains an existing project (has `package.json`, `Cargo.toml`, `requirements.txt`, `go.mod`, etc.), include context: \"Note: there is an existing codebase in the working directory. Analyze it and plan to extend/modify it rather than building from scratch.\"
3. The planner will:
   - Classify the project type (FRONTEND / BACKEND / FULLSTACK)
   - Generate a complete product specification
   - Define a visual design language (for frontend projects)
   - Decompose the work into sprints with testable acceptance criteria
4. The output will be written to `harness-artifacts/spec.md`
5. After planning is complete, summarize:
   - Project type classification
   - Number of sprints planned
   - Key features identified
   - Highlight any particularly ambitious or AI-powered features

## Usage

```
/harness:plan A collaborative whiteboard tool with real-time editing
```

This will generate a full spec in `harness-artifacts/spec.md` that can later be used with `/harness:build` or manually implemented.
