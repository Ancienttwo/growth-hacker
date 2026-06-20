# Video Agent Stage Contracts

All outputs use `schemaVersion: "1"`, the exact requested `stage`, a `data` payload, and a string-array `warnings` field.

## story_analysis

Produce logline, premise, genres, themes, audience promise, point of view, stable story beats, character goals, emotional arc, compression plan, and production risks. Required beats must fit the target duration.

## story_bible

Produce world rules, a visual bible, characters, locations, and props. Descriptions must be repeatable and visibly testable. Every character/location/prop has a stable ID and continuity anchors.

## scene_breakdown

Return `{ "scenes": SceneSpec[] }`. Scenes reference only declared beat, character, location, and prop IDs. Include continuity-in/out state and an estimated duration.

## shot_planning

Return `{ "shots": ShotSpec[] }`. Every scene has at least one shot. Shot order is unique within a scene. Each shot contains the complete executable production direction described in `SKILL.md`.

## continuity_review

Return verdict, summary, issues, and checked rules. Every issue has severity, scope, target IDs when applicable, field, concrete finding, and concrete suggested fix. The application adds deterministic cross-reference and duration checks afterward.

## Deterministic stages

The Agent does not emit results for:

- `prompt_compilation`;
- `storyboard_document`;
- `preproduction_approval`.

These are executed by application code or an operator.
