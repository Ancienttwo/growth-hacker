# YouTube CLI

Repo-owned YouTube account CLI for Growth Hacker.

The CLI supports OAuth setup, token status, channel proof, owned video listing, video lookup, uploads, resumable upload status/resume, and guarded comment operations.

Uploads default to `private`; `public` requires `--confirm-public`.

OAuth app credentials are shared application credentials. User authorization is not shared: each user/workspace profile must run its own browser OAuth flow and gets its own token at `~/.growth/<profile>/youtube/auth/token.json`. Do not copy a user's `token.json` into another profile.

## Setup

Enable the YouTube Data API in Google Cloud, then create an OAuth desktop client. Provide credentials with one of these options:

```bash
export YOUTUBE_OAUTH_CLIENT_FILE=/path/to/oauth-client.json
```

or:

```bash
export YOUTUBE_CLIENT_ID=...
export YOUTUBE_CLIENT_SECRET=...
```

Non-secret defaults can live in `growth-hacker.config.json`:

```json
{
  "youtube": {
    "oauthClientFile": "~/.growth/secrets/youtube-oauth-client.json",
    "defaultAuthScope": "read",
    "authOpenBrowser": true,
    "authForceConsent": false,
    "authTimeoutMs": 120000,
    "authLoginHint": "",
    "expectedChannelId": "",
    "expectedChannelTitle": ""
  }
}
```

`--profile`, `--scope`, `--client-file`, and environment variables still override these defaults. Keep the OAuth client JSON outside the repo. `defaultProfile` is supported only as a personal local convenience; shared config and live smoke should use an explicit `--profile`/`YT_CLI_PROFILE`.

Choose a profile segment for the user or workspace before authorizing:

```bash
export YT_PROFILE=workspace-or-user
export YT_CLI_EXPECTED_CHANNEL_ID=UC...
```

Authenticate a profile:

```bash
bun --silent run yt-cli -- auth start --profile "$YT_PROFILE" --scope read --json
```

For guarded uploads and comment mutations, authenticate with operate scope. Write commands verify the current channel before mutation, so upload-only scope is not enough for this CLI's safety gate:

```bash
bun --silent run yt-cli -- auth start --profile "$YT_PROFILE" --scope operate --force-consent --json
```

For read-only operations, read scope is enough. For broad local testing, `full` expands to read + upload + operate:

```bash
bun --silent run yt-cli -- auth start --profile "$YT_PROFILE" --scope full --force-consent --json
```

If Google does not return a refresh token, rerun with:

```bash
bun --silent run yt-cli -- auth start --profile "$YT_PROFILE" --scope read --force-consent --json
```

## Commands

```bash
bun --silent run yt-cli -- auth status --profile "$YT_PROFILE" --json
bun --silent run yt-cli -- auth revoke --profile "$YT_PROFILE" --json
bun --silent run yt-cli -- channel mine --profile "$YT_PROFILE" --json
bun --silent run yt-cli -- videos list --profile "$YT_PROFILE" --max-results 25 --json
bun --silent run yt-cli -- videos get --profile "$YT_PROFILE" --video-id VIDEO_ID --json
bun --silent run yt-cli -- upload create --profile "$YT_PROFILE" --file artifacts/videos/foo.mp4 --title "Title" --description-file description.md --privacy private --made-for-kids false --contains-synthetic-media true --json
bun --silent run yt-cli -- upload status --profile "$YT_PROFILE" --json
bun --silent run yt-cli -- upload status --profile "$YT_PROFILE" --upload-id UPLOAD_ID --json
bun --silent run yt-cli -- upload resume --profile "$YT_PROFILE" --upload-id UPLOAD_ID --json
bun --silent run yt-cli -- comments list --profile "$YT_PROFILE" --video-id VIDEO_ID --max-results 50 --json
bun --silent run yt-cli -- comments reply --profile "$YT_PROFILE" --parent-id COMMENT_ID --text-file reply.md --dry-run --json
bun --silent run yt-cli -- comments reply --profile "$YT_PROFILE" --parent-id COMMENT_ID --text-file reply.md --confirm COMMENT_ID --json
bun --silent run yt-cli -- comments moderate --profile "$YT_PROFILE" --comment-id COMMENT_ID --status rejected --dry-run --json
bun --silent run yt-cli -- comments moderate --profile "$YT_PROFILE" --comment-id COMMENT_ID --status rejected --ban-author --confirm COMMENT_ID --json
bun --silent run yt-cli -- comments delete --profile "$YT_PROFILE" --comment-id COMMENT_ID --confirm COMMENT_ID --json
```

Upload safety:

- `--made-for-kids true|false` is required.
- `--contains-synthetic-media true|false` is required.
- `--privacy` defaults to `private`; accepted values are `private`, `unlisted`, and `public`.
- `--privacy public` requires `--confirm-public`.
- `--notify-subscribers` defaults to `false`.
- `upload create` and `upload resume` require an expected channel binding through `youtube.expectedChannelId`, `YT_CLI_EXPECTED_CHANNEL_ID`, or `--expected-channel-id`.
- Upload mutations require upload-capable and read-capable scope so the CLI can verify the channel before mutation.
- `upload status` without `--upload-id` lists local in-flight resumable sessions without hitting YouTube.
- `upload status --upload-id ...` checks the remote resumable session with YouTube.
- `upload resume --upload-id ...` continues from the byte after YouTube's returned `Range` header.

Comment mutation safety:

- `comments reply`, `comments moderate`, and `comments delete` default to dry-run when `--confirm` is absent.
- Real mutation requires `--confirm` to exactly match the target `COMMENT_ID`.
- Real mutation also requires expected channel binding through `youtube.expectedChannelId`, `YT_CLI_EXPECTED_CHANNEL_ID`, or `--expected-channel-id`.
- `--ban-author` is only accepted with `--status rejected`.
- Comment mutation commands require `operate` scope.

## Runtime Files

```text
~/.growth/<profile>/youtube/auth/token.json
~/.growth/<profile>/youtube/account.json
~/.growth/<profile>/youtube/uploads/<upload-id>.json
```

The auth directory is written as `0700`. Token files are written as `0600`. Access tokens, refresh tokens, client secrets, and authorization headers are redacted from CLI output.

## Scopes

```text
read    https://www.googleapis.com/auth/youtube.readonly
upload  https://www.googleapis.com/auth/youtube.upload
operate https://www.googleapis.com/auth/youtube.force-ssl
full    read + upload + operate
```

Read commands accept `read` or `operate`. `upload status --upload-id` requires `upload` or `operate`. `upload create` and `upload resume` require upload-capable plus read-capable scope for channel verification; use `operate` or `full` in normal guarded flows. Comment mutation commands require `operate`.

## Live Smoke

The live smoke harness is gated so it cannot accidentally call YouTube without explicit opt-in:

```bash
YT_CLI_LIVE=1 \
YT_CLI_PROFILE="$YT_PROFILE" \
YT_CLI_EXPECTED_CHANNEL_ID=UC... \
bun run yt-cli:live-smoke
```

If no token exists, launch OAuth from the same harness:

```bash
YOUTUBE_OAUTH_CLIENT_FILE=/path/to/oauth-client.json \
YT_CLI_LIVE=1 \
YT_CLI_PROFILE="$YT_PROFILE" \
YT_CLI_EXPECTED_CHANNEL_ID=UC... \
YT_CLI_AUTH=1 \
bun run yt-cli:live-smoke
```

Optional checks:

```bash
YT_CLI_LIVE=1 YT_CLI_PROFILE="$YT_PROFILE" YT_CLI_EXPECTED_CHANNEL_ID=UC... YT_CLI_COMMENT_ID=COMMENT_ID bun run yt-cli:live-smoke
YT_CLI_LIVE=1 YT_CLI_PROFILE="$YT_PROFILE" YT_CLI_EXPECTED_CHANNEL_ID=UC... YT_CLI_LIVE_UPLOAD=1 YT_CLI_UPLOAD_FILE=video.mp4 bun run yt-cli:live-smoke
```

The smoke harness refuses to continue without `YT_CLI_PROFILE` and an expected channel binding (`YT_CLI_EXPECTED_CHANNEL_ID`, `YT_CLI_EXPECTED_CHANNEL_TITLE`, or the matching `youtube.expectedChannel*` config fields). The upload check always uses `privacy=private`. Comment checks are dry-run unless you run the lower-level confirmed commands yourself.
