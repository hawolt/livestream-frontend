# CONVENTIONS.md

Mandatory rules. Apply to every file in every project in this repo.

## No comments

Do not add comments to code. If you encounter a comment in a file you are editing, delete it before saving.

## No em dash

Never use the em dash character anywhere: not in code, strings, markdown, HTML, or any other file type.

## No explanatory prose in code

Do not write docstrings, block comment headers, or inline annotations that describe what the code does. Names should be self-explanatory.

## Number inputs

Every numeric input uses the shared .stepper component (minus/plus buttons, src/dash/stepper.ts + the .stepper block in shared.css). Never ship a native number spinner. Range sliders are a different control and unaffected.
