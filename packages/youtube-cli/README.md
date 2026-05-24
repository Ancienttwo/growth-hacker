# YouTube CLI

Repo-owned YouTube account CLI for Growth Hacker.

Phase 1 supports OAuth setup, token status, channel proof, owned video listing, video lookup, and comment listing. It does not upload videos or mutate comments yet.

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

Authenticate a profile:

```bash
bun --silent run yt-cli -- auth start --profile astrozi --scope read --json
```

If Google does not return a refresh token, rerun with:

```bash
bun --silent run yt-cli -- auth start --profile astrozi --scope read --force-consent --json
```

## Commands

```bash
bun --silent run yt-cli -- auth status --profile astrozi --json
bun --silent run yt-cli -- auth revoke --profile astrozi --json
bun --silent run yt-cli -- channel mine --profile astrozi --json
bun --silent run yt-cli -- videos list --profile astrozi --max-results 25 --json
bun --silent run yt-cli -- videos get --profile astrozi --video-id VIDEO_ID --json
bun --silent run yt-cli -- comments list --profile astrozi --video-id VIDEO_ID --max-results 50 --json
```

## Runtime Files

```text
~/.growth/<profile>/youtube/auth/token.json
~/.growth/<profile>/youtube/account.json
```

The auth directory is written as `0700`. Token files are written as `0600`. Access tokens, refresh tokens, client secrets, and authorization headers are redacted from CLI output.

## Scopes

```text
read    https://www.googleapis.com/auth/youtube.readonly
upload  https://www.googleapis.com/auth/youtube.upload
operate https://www.googleapis.com/auth/youtube.force-ssl
full    read + upload + operate
```

Phase 1 read commands accept `read` or `operate`.
