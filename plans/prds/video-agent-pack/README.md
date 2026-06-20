# Video Agent Delivery Pack

This directory keeps planning and delivery artifacts for the Video Agent V1 intake.

- Product and architecture notes stay as Markdown files in this directory.
- `growth-hacker-video-agent-refactor.zip` is the archived implementation delivery pack.
- `growth-hacker-video-agent-refactor.zip.sha256` verifies the archive:

```bash
cd plans/prds/video-agent-pack
shasum -a 256 -c growth-hacker-video-agent-refactor.zip.sha256
```

Do not commit the unpacked `growth-hacker-video-agent-refactor/` tree. It contains its own `package.json`, `tsconfig.json`, `AGENTS.md`, and tests, so editors and test runners can discover it as a second project. If inspection is needed, unzip it outside the repo or into the ignored local path and remove it after use.
