# Continuity Checklist

## Character

- Identity traits remain stable.
- Wardrobe layers, accessories, hair, makeup, wetness, dirt, and damage agree.
- Pose, gaze, handedness, emotion, and position can transition physically.
- Dialogue and mouth action do not contradict the shot plan.

## Prop

- Ownership and hand are explicit when relevant.
- Position, orientation, scale, color, open/closed state, fill level, and damage agree.
- A prop cannot appear before introduction or disappear without a motivated action.

## Space and camera

- Location geography and landmarks agree with the Story Bible.
- Entrances, exits, eyelines, and screen direction preserve spatial logic.
- Camera movement is physically possible and motivated.
- Lens/shot-size changes do not create an unintended axis or scale discontinuity.

## Environment

- Time, weather, shadows, practical lights, atmosphere, reflections, and moving background elements agree.
- Audio ambience and visible environment do not conflict.

## Temporal boundary

- End frame of the previous shot can become the start frame of the next shot.
- Compound actions are split when a generation model would need to maintain too many state changes.
- Scene and shot durations sum within the production brief tolerance.

## Report severity

- `error`: blocks a coherent render or uses an unknown required ID.
- `warning`: renderable but likely to drift, confuse, or exceed the brief.
- `note`: optional craft improvement.
