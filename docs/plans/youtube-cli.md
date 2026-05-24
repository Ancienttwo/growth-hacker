# YouTube CLI Plan

Status: draft execution plan
Owner surface: `packages/youtube-cli`
Reference material: `_ref/CLI-Anything`

## Decision

Build a repo-owned TypeScript CLI package named `@growth-hacker/youtube-cli` with the executable command `yt-cli`.

Use `_ref/CLI-Anything` as a design reference for agent-native CLI behavior: explicit command groups, JSON output, test-first harness thinking, and AI-readable docs. Do not depend on `cli-hub` or any third-party registry at runtime.

## Step 0: Scope Challenge

### What Already Exists

- `apps/server/src/socialPlatforms.ts` already has a YouTube placeholder adapter with workspace support but no configured CLI.
- `apps/server/src/server.ts` already has a YouTube video-generation route. It explicitly creates source video assets through Hermes and must not call YouTube APIs.
- `apps/server/src/hermesVideos.ts` already persists generated video artifacts into `~/.growth/<profile>/youtube/artifacts/videos`.
- `packages/core/src/index.ts` already models `youtube` as a supported workspace platform.
- `_ref/CLI-Anything` provides useful harness conventions, especially `--json`, command grouping, SKILL docs, and TEST.md planning.

### Minimum Useful Change

First implementation slice:

- Create `packages/youtube-cli`.
- Implement OAuth token storage and refresh.
- Implement read-only account verification through `channel mine`.
- Implement read-only videos and comments listing.
- Wire YouTube adapter status to detect `yt-cli`.

This is enough to prove the identity, token, API, output, and workspace contracts before adding writes.

### Complexity Check

The complete YouTube admin surface would naturally exceed eight files and introduce several service modules. That is acceptable for the full product, but not for the first PR. The first PR should stay below the blast radius line:

```text
Phase 1: auth + read-only account proof
Phase 2: uploads
Phase 3: comment operations and moderation
Phase 4: dashboard UI integration
```

Do not implement uploads, reply sending, deletion, or moderation in Phase 1.

### Distribution Check

Phase 1 distribution is repo-local:

- Root script: `bun run yt-cli -- ...`
- Package script: `bun --filter @growth-hacker/youtube-cli start -- ...`
- Package bin metadata: `yt-cli` for local linking and later packaging.

Publishing to npm, Homebrew, GitHub Releases, or standalone binaries is not in Phase 1. The CLI is first a local operator tool owned by this repo.

## Goals

- Give Growth Hacker a real YouTube account-operation base instead of a placeholder adapter.
- Keep account auth, API calls, and token handling in one package, not scattered through `apps/server`.
- Make every command agent-friendly: deterministic exit codes, stable JSON output, no secrets in stdout, clear errors.
- Preserve the current Hermes video-generation boundary: generating a video asset is separate from uploading or mutating a YouTube account.

## NOT In Scope

- Public video upload in Phase 1. Upload is high quota, high risk, and requires metadata validation.
- Comment reply, delete, reject, or ban in Phase 1. These mutate account state and need dry-run plus confirmation gates.
- YouTube Studio browser automation. Use official YouTube Data API, not UI automation.
- `cli-hub` installation. `_ref/CLI-Anything` is a reference only.
- Dashboard UI controls for YouTube account actions in Phase 1.
- npm package publishing or GitHub Release binaries in Phase 1.

## Architecture Map

```text
growth-hacker repo
|
|-- packages/youtube-cli
|   |-- src/cli.ts          command routing, flags, JSON envelope
|   |-- src/config.ts       env/config normalization
|   |-- src/store.ts        profile-scoped credential/token files
|   |-- src/oauth.ts        auth URL, loopback callback, refresh, revoke
|   |-- src/youtubeApi.ts   official YouTube Data API REST wrapper
|   |-- src/commands/       auth/channel/videos/comments groups
|   |-- src/output.ts       JSON/human output, redaction, exit codes
|   `-- test/              unit + subprocess tests
|
|-- apps/server
|   |-- socialPlatforms.ts  detects yt-cli availability
|   `-- future routes      call package library, not raw Google endpoints
|
`-- _ref/CLI-Anything      ignored reference repo, no runtime dependency
```

Ownership boundary:

- `packages/youtube-cli` owns YouTube OAuth, token refresh, API requests, YouTube-specific schemas, quota/error normalization, and CLI output.
- `apps/server` owns dashboard HTTP/UI orchestration and should call the package API or CLI, not duplicate YouTube logic.
- `packages/core` owns cross-platform type shapes only when dashboard surfaces need them.

## Concrete Trace: `yt-cli channel mine`

```text
operator
  |
  | yt-cli channel mine --profile astrozi --json
  v
src/cli.ts
  |
  | parse command, profile, output mode
  v
src/store.ts
  |
  | read ~/.growth/astrozi/youtube/auth/token.json
  | validate 0600 token file and required fields
  v
src/oauth.ts
  |
  | refresh access token if expired
  | write refreshed token atomically
  v
src/youtubeApi.ts
  |
  | GET https://www.googleapis.com/youtube/v3/channels
  | params: part=snippet,contentDetails,statistics&mine=true
  v
src/output.ts
  |
  | emit stable JSON envelope
  v
stdout
```

JSON success:

```json
{
  "ok": true,
  "data": {
    "channel": {
      "id": "UC...",
      "title": "Channel Name"
    }
  },
  "meta": {
    "profile": "astrozi",
    "account": "youtube",
    "scopes": ["https://www.googleapis.com/auth/youtube.readonly"]
  }
}
```

JSON error:

```json
{
  "ok": false,
  "error": {
    "code": "youtube_auth_missing",
    "message": "Run `yt-cli auth start --profile astrozi --scope read` first."
  }
}
```

## Auth Design

Use Google OAuth for native apps with a loopback redirect and PKCE. The command opens the system browser and runs a temporary local callback server.

```text
auth start
  |
  | create state + PKCE verifier/challenge
  | choose local callback port
  v
browser consent
  |
  | Google redirects to 127.0.0.1:<port>/oauth2/callback
  v
local callback
  |
  | validate state
  | exchange code for tokens
  v
store token.json mode 0600
```

Credential sources, in priority order:

1. `--client-file <path>` containing Google OAuth desktop-client JSON.
2. `YOUTUBE_OAUTH_CLIENT_FILE`.
3. `YOUTUBE_CLIENT_ID` plus `YOUTUBE_CLIENT_SECRET`.

Token path:

```text
~/.growth/<profile>/youtube/auth/token.json
~/.growth/<profile>/youtube/auth/client.json   optional copied client metadata
~/.growth/<profile>/youtube/account.json       non-secret account identity
```

Permissions:

- Auth directory mode: `0700`.
- Token files mode: `0600`.
- Never print access tokens, refresh tokens, client secrets, cookies, or authorization headers.

Scopes:

```text
read:
  https://www.googleapis.com/auth/youtube.readonly

upload:
  https://www.googleapis.com/auth/youtube.upload

operate:
  https://www.googleapis.com/auth/youtube.force-ssl

full:
  read + upload + operate
```

Commands must assert required scopes before API calls and return `youtube_scope_missing` when a token is valid but insufficient.

## Command Surface

Phase 1:

```bash
yt-cli auth status --profile astrozi --json
yt-cli auth start --profile astrozi --scope read --json
yt-cli auth revoke --profile astrozi --json

yt-cli channel mine --profile astrozi --json
yt-cli videos list --profile astrozi --max-results 25 --json
yt-cli videos get --profile astrozi --video-id VIDEO_ID --json
yt-cli comments list --profile astrozi --video-id VIDEO_ID --max-results 50 --json
```

Phase 2:

```bash
yt-cli upload create --profile astrozi --file artifacts/videos/foo.mp4 \
  --title "Title" --description-file description.md \
  --privacy private --made-for-kids false --contains-synthetic-media true \
  --json
```

Phase 3:

```bash
yt-cli comments reply --profile astrozi --parent-id COMMENT_ID --text-file reply.md --dry-run --json
yt-cli comments reply --profile astrozi --parent-id COMMENT_ID --text-file reply.md --confirm COMMENT_ID --json
yt-cli comments moderate --profile astrozi --comment-id COMMENT_ID --status rejected --dry-run --json
yt-cli comments delete --profile astrozi --comment-id COMMENT_ID --confirm COMMENT_ID --json
```

Danger rules:

- Read commands require no confirmation.
- Upload defaults to `privacy=private`.
- Upload with `privacy=public` requires `--confirm-public`.
- Reply/moderate/delete support `--dry-run`.
- Delete and reject require `--confirm <id>`.

## Data Model

```ts
interface YoutubeTokenFile {
  schemaVersion: 1;
  profile: string;
  account: "youtube";
  clientId: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  tokenType: "Bearer";
  createdAt: string;
  updatedAt: string;
}

interface YoutubeAccountFile {
  schemaVersion: 1;
  profile: string;
  channelId: string;
  title: string;
  customUrl?: string;
  syncedAt: string;
}
```

Refresh-token absence is a first-class state. Google may not return a refresh token if consent was not forced or was previously granted. The CLI should explain how to retry with `--force-consent`.

## API Wrapper Contract

`youtubeApi.ts` wraps official REST endpoints with `fetch`.

Phase 1 endpoints:

- `GET /youtube/v3/channels?mine=true`
- `GET /youtube/v3/playlistItems?playlistId=<uploads-playlist-id>`
- `GET /youtube/v3/videos?id=...`
- `GET /youtube/v3/commentThreads?videoId=...`

Phase 2 endpoint:

- `POST /upload/youtube/v3/videos?uploadType=resumable`

Phase 3 endpoints:

- `POST /youtube/v3/comments`
- `POST /youtube/v3/comments/setModerationStatus`
- `DELETE /youtube/v3/comments`

Use typed request builders, not ad hoc URL string concatenation.

## Dashboard Integration Plan

Phase 1 dashboard integration should stay small:

1. Add `cliCommand: "yt-cli"` to the YouTube adapter.
2. Keep Phase 1 status at command availability only; add profile-aware `yt-cli auth status --json` later when the dashboard has selected-profile context.
3. Do not replace the existing Hermes video generation route.
4. Future dashboard routes import `@growth-hacker/youtube-cli` library functions instead of shelling out when possible.

Boundary:

```text
Hermes video generation       YouTube account operations
----------------------        --------------------------
video_generate tool           official YouTube Data API
local artifact persistence    OAuth token store
no account mutation           uploads/comments/moderation
```

## Test Review

Test framework: Bun test.

```text
CODE PATHS                                               USER FLOWS
[+] cli.ts                                               [+] First auth setup
  |-- [GAP] command parse happy paths                       |-- [GAP] auth URL opens and callback stores token
  |-- [GAP] unknown command error                           |-- [GAP] missing client config explains fix
  `-- [GAP] --json envelope on every command                `-- [GAP] user cancels OAuth callback

[+] store.ts                                             [+] Read account proof
  |-- [GAP] profile path rejects traversal                  |-- [GAP] channel mine with valid token
  |-- [GAP] token write uses 0600                           |-- [GAP] expired token refreshes before request
  `-- [GAP] corrupt token returns actionable error          `-- [GAP] insufficient scope shows retry command

[+] oauth.ts                                             [+] Comment monitoring
  |-- [GAP] PKCE/state generation                           |-- [GAP] comments list paginates
  |-- [GAP] callback state mismatch                         `-- [GAP] disabled comments returns clear error
  `-- [GAP] refresh-token missing state

[+] youtubeApi.ts                                       [+] Dangerous actions, later phases
  |-- [GAP] request builder encodes query params             |-- [GAP] public upload blocked without confirm
  |-- [GAP] 401 maps to auth expired                         |-- [GAP] delete blocked without confirm
  |-- [GAP] 403 quota maps to quota error                    `-- [GAP] dry-run produces no API mutation
  `-- [GAP] pagination preserves nextPageToken

COVERAGE TARGET: 0/23 currently, 23/23 before merging Phase 1 plus stubs for later danger gates.
QUALITY TARGET: all Phase 1 command, store, oauth, API, and output branches get behavior + edge + error tests.
```

Required tests:

- `packages/youtube-cli/test/cli.test.ts`
  - Parses command groups.
  - Produces JSON for success and failure.
  - Returns stable exit codes.
- `packages/youtube-cli/test/store.test.ts`
  - Blocks unsafe profile names.
  - Writes token file with `0600`.
  - Handles missing, corrupt, expired, and insufficient-scope tokens.
- `packages/youtube-cli/test/oauth.test.ts`
  - Builds auth URL with state, PKCE, redirect URI, and requested scopes.
  - Rejects callback state mismatch.
  - Refreshes expired tokens.
  - Handles missing refresh token.
- `packages/youtube-cli/test/youtubeApi.test.ts`
  - Uses mocked `fetch`.
  - Covers channel, video list, video get, comments list, pagination, 401, 403, 429, 5xx.
- `packages/youtube-cli/test/subprocess.test.ts`
  - Runs the CLI as a real subprocess through Bun.
  - Verifies `--help`, `auth status --json`, and error envelopes.
- Optional live tests gated by `YT_CLI_LIVE=1`.
  - `channel mine`.
  - `videos list`.
  - `comments list` against a known owned video.

## Failure Modes

| Codepath | Failure | Test | Handling | User sees |
|---|---|---|---|---|
| `auth start` | OAuth callback never arrives | required | local server timeout | clear retry message |
| `auth start` | state mismatch | required | reject token exchange | `youtube_oauth_state_mismatch` |
| `store.readToken` | corrupted JSON | required | do not overwrite | `youtube_token_invalid` |
| `refreshToken` | Google returns invalid_grant | required | mark auth expired | re-auth command |
| `channel mine` | token lacks scope | required | detect 403 reason | retry with `--scope read` |
| `videos list` | pagination token invalid | required | stop with API error | non-silent JSON error |
| `comments list` | comments disabled | required | map API error | clear unavailable state |
| `upload create` | file missing or too large | Phase 2 | preflight before API call | validation error |
| `comments delete` | missing confirm | Phase 3 | no API call | confirmation-required error |

Critical gap if skipped: token refresh and scope-missing tests. Those failures otherwise look like generic 403s and would waste operator time.

## Performance And Quota

- Keep Phase 1 commands single-page by default.
- Support explicit `--all-pages` later, but default to bounded reads.
- Preserve `nextPageToken` in output.
- Add `--max-results` with API-safe bounds.
- Do not cache API responses in Phase 1. Fresh account state matters more than saving one quota unit.
- For upload phase, add a resumable upload state file so interrupted uploads can resume rather than restarting large files.

## Worktree Parallelization

Phase 1 has limited parallelization because `cli.ts`, `output.ts`, and shared types connect the package. Sequential implementation is safer.

Future phases can split:

| Step | Modules touched | Depends on |
|---|---|---|
| Upload commands | `packages/youtube-cli/src/commands`, `youtubeApi.ts` | Phase 1 auth |
| Comment mutation commands | `packages/youtube-cli/src/commands`, `youtubeApi.ts` | Phase 1 auth |
| Dashboard routes | `apps/server`, `packages/core` | Phase 1 package API |
| Dashboard UI | `apps/web`, `packages/core` | Dashboard routes |

Parallel lanes after Phase 1:

- Lane A: upload commands.
- Lane B: comment mutation commands.
- Lane C: dashboard routes after A/B package APIs settle.
- Lane D: dashboard UI after route contracts settle.

## Implementation Tasks

- [x] T1 (P1, human: ~2h / CC: ~20min) - Package scaffold - Create `packages/youtube-cli` with Bun scripts, bin metadata, tsconfig, and root script.
  - Surfaced by: Architecture - YouTube needs a repo-owned runtime boundary.
  - Files: `packages/youtube-cli/*`, `package.json`
  - Verify: `bun --filter @growth-hacker/youtube-cli typecheck`
- [x] T2 (P1, human: ~3h / CC: ~30min) - Auth/store - Implement profile-safe token storage, OAuth URL generation, callback exchange, refresh, revoke, and status.
  - Surfaced by: Test review - OAuth and token state are the base contract.
  - Files: `packages/youtube-cli/src/store.ts`, `src/oauth.ts`, `test/store.test.ts`, `test/oauth.test.ts`
  - Verify: `bun test packages/youtube-cli/test/store.test.ts packages/youtube-cli/test/oauth.test.ts`
- [x] T3 (P1, human: ~2h / CC: ~25min) - API client - Implement typed REST wrapper for channel, videos, comments, pagination, and normalized errors.
  - Surfaced by: Architecture - official API calls need one wrapper, not scattered fetches.
  - Files: `packages/youtube-cli/src/youtubeApi.ts`, `packages/youtube-cli/test/youtubeApi.test.ts`
  - Verify: `bun test packages/youtube-cli/test/youtubeApi.test.ts`
- [x] T4 (P1, human: ~2h / CC: ~25min) - CLI commands - Implement `auth`, `channel`, `videos`, and `comments list` with stable JSON envelopes and exit codes.
  - Surfaced by: Code quality - command surface must be explicit and agent-readable.
  - Files: `packages/youtube-cli/src/cli.ts`, `src/commands/*`, `src/output.ts`, `test/cli.test.ts`, `test/subprocess.test.ts`
  - Verify: `bun test packages/youtube-cli/test/cli.test.ts packages/youtube-cli/test/subprocess.test.ts`
- [x] T5 (P2, human: ~45min / CC: ~10min) - Adapter status - Register `yt-cli` as the YouTube adapter command without changing Hermes video generation.
  - Surfaced by: Existing code - YouTube placeholder adapter already exists.
  - Files: `apps/server/src/socialPlatforms.ts`, `apps/server/test/socialPlatforms.test.ts`
  - Verify: `bun test apps/server/test/socialPlatforms.test.ts`
- [x] T6 (P2, human: ~1h / CC: ~10min) - Operator docs - Document OAuth setup, scopes, token paths, and Phase 1 commands.
  - Surfaced by: Distribution - local CLI is unusable without setup docs.
  - Files: `packages/youtube-cli/README.md`
  - Verify: manual command examples and `bun run typecheck`

## References

- Google OAuth 2.0 for desktop/native apps: https://developers.google.com/identity/protocols/oauth2/native-app
- YouTube Data API `videos.insert`: https://developers.google.com/youtube/v3/docs/videos/insert
- YouTube comments implementation guide: https://developers.google.com/youtube/v3/guides/implementation/comments
- CLI-Anything local reference: `_ref/CLI-Anything/cli-anything-plugin/HARNESS.md`

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope and strategy | 0 | not run | Product scope not reviewed here |
| Codex Review | `/codex review` | Independent second opinion | 0 | not run | No outside voice run for this draft |
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | draft | Plan reduced first slice to auth/read-only before writes |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | No UI in Phase 1 |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Local CLI docs included as T6 |

- UNRESOLVED: Interactive AskUserQuestion flow was unavailable in this Codex session, so defaults are recorded in the plan rather than individually approved.
- VERDICT: ENG DRAFT CLEARED FOR PHASE 1 PLANNING. Implementation should start with T1-T4 before adapter or UI work.
