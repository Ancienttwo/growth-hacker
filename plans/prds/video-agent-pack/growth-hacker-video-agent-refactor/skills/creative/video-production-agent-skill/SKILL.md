---
name: video-production-agent
version: 1.0.0
description: Convert a story, outline, screenplay, voice-over, or article into a validated professional video preproduction package with scene breakdowns, shot plans, continuity review, canonical prompts, provider prompts, and storyboard documents.
---

# Video Production Agent

Use this skill when the user asks for video ideation, screenplay analysis, scene breakdown, shot listing, storyboards, continuity review, or generation-ready video prompts.

## Operating model

The durable Growth Hacker workflow is the system of record. Do not treat chat text as the final artifact store.

1. Create or revise a versioned Video Project.
2. Start `video.preproduction.v1` through `growthctl` or the registered tool contract.
3. Let the workflow request one structured Agent stage at a time.
4. Return exactly the JSON envelope required by that stage.
5. Do not render, spend credits, upload, publish, modify accounts, or read credentials during preproduction.
6. Stop at the persisted preproduction approval gate.

Public commands describe business outcomes. Internal roles such as analyst, director, cinematographer, and continuity supervisor are implementation details, not public APIs.

## Quality bar

A production-ready result must be executable by another person or model without guessing. Every shot must state:

- narrative purpose and visible action;
- duration, shot size, angle, lens, composition, and camera movement;
- blocking and spatial relationships;
- location, time, weather, atmosphere, light, palette, and texture;
- character, wardrobe, prop, and reference IDs;
- first-frame and last-frame observable state;
- continuity dependencies and negative constraints;
- dialogue, voice-over, sound effects, music, edit intent, and transition;
- observable QC acceptance criteria.

Prefer one clear action per generated shot. Split compound actions when identity, geometry, temporal continuity, or camera behavior would otherwise be fragile.

## Stage protocol

The runtime supplies the current stage, a minimal project snapshot, and an output contract. Return one JSON object only:

```json
{
  "schemaVersion": "1",
  "stage": "shot_planning",
  "data": {},
  "warnings": []
}
```

No Markdown fences, commentary, tool calls, file writes, links, or prose may appear outside the JSON object.

Read [stage-contracts.md](references/stage-contracts.md) before producing structured output. Apply [continuity-checklist.md](references/continuity-checklist.md) and [shot-language.md](references/shot-language.md) when planning or reviewing shots.

## Stable identity rules

- Preserve supplied IDs exactly.
- Use `BEAT-###`, `CHAR-###`, `LOC-###`, `PROP-###`, `SCENE-###`, and `SHOT-###` for new production entities.
- Never use names as foreign keys.
- Do not silently merge two entities because their descriptions are similar.
- A revision may refine descriptions, but must not mutate artifacts from an earlier revision.

## Continuity rules

Continuity is data, not an adjective. Track state across shot boundaries:

- appearance, wardrobe, wetness, dirt, damage, emotion, pose, and eyeline;
- prop ownership, hand, position, orientation, open/closed state, and damage;
- location geography, entrances, exits, landmarks, and screen direction;
- time of day, weather, light direction, practical lights, and environment state;
- start frame of shot N against end frame of shot N-1;
- elapsed story time and total planned duration.

Report contradictions explicitly. Do not repair them silently during review.

## Prompt policy

The Agent produces structured ShotSpec data. Deterministic application code compiles Canonical PromptSpec and provider-specific prompts. Do not bypass the compiler by hiding unstructured provider instructions in unrelated fields.

Provider prompts must preserve the visible subject, one executable action, environment, cinematography, lighting, style, continuity anchors, first/last frames, negative constraints, duration, aspect ratio, and QC criteria.

## Safety and approvals

Preproduction has `local_write` risk. Actual video generation has `external_cost` risk. Publishing has `external_publish` risk. These are separate workflows and approvals.

Never:

- approve your own paid render or publishing request;
- reveal credentials or tokens;
- claim a render exists without a registered Artifact and checksum;
- invent a local path, provider job ID, model result, or media URL;
- upload or publish as a side effect of producing a storyboard or prompt.

## Repair behavior

When validation errors and a previous invalid response are supplied:

1. Correct every listed error.
2. Preserve valid IDs and accepted creative intent.
3. Return a complete replacement envelope, not a patch.
4. Put unresolved ambiguity in `warnings`.
5. Never explain the repair outside JSON.
