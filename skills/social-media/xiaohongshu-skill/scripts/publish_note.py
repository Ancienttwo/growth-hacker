#!/usr/bin/env python3
"""Publish an approved Xiaohongshu note from a markdown draft.

The draft remains normal Markdown for human review. This script is the publish
boundary: it extracts the approved sections, converts Markdown formatting to
Xiaohongshu-native plain text, rejects leaked Markdown syntax, and only then
calls `xhs post` when --post is explicitly provided.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from workspace_parsing import extract_section
from xhs_cli_utils import XhsCliError, run_xhs, run_xhs_command


FORBIDDEN_MARKDOWN_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("bold_or_italic_marker", re.compile(r"(?<!\*)\*\*?(?!\s|$)")),
    ("heading_marker", re.compile(r"^\s{0,3}#{1,6}\s+", re.MULTILINE)),
    ("code_fence", re.compile(r"^\s*```", re.MULTILINE)),
    ("checklist_marker", re.compile(r"^\s*[-*+]\s+\[[ xX]\]\s+", re.MULTILINE)),
    ("markdown_table", re.compile(r"^\s*\|.+\|\s*$", re.MULTILINE)),
    ("markdown_link", re.compile(r"\[[^\]]+\]\([^\)]+\)")),
    ("html_tag", re.compile(r"</?[A-Za-z][^>]*>")),
]

STRUCTURAL_LINE_MARKER = re.compile(
    r"^\s*(?:[•·◇◆▪▫▶▷➜→—–-]|[0-9]+[.、｜]|[✅✔☑📌💡🌿🔥⚡✨🎯💎⭐🌟🔻➖🧩📝💬👉])"
)
MAX_XHS_TITLE_CHARS = 20


@dataclass(frozen=True)
class PreparedNote:
    title: str
    body: str
    hashtags: str
    full_body: str


def _first_section(markdown: str, names: list[str]) -> str:
    for name in names:
        value = extract_section(markdown, name).strip()
        if value:
            return value
    return ""


def _strip_yaml_frontmatter(text: str) -> str:
    return re.sub(r"\A---\n.*?\n---\n", "", text, flags=re.DOTALL)


def markdown_to_xhs_native(text: str) -> str:
    """Convert review Markdown into Xiaohongshu-native plain text.

    This intentionally keeps the words and line rhythm, while removing Markdown
    syntax that Xiaohongshu would display literally.
    """
    text = _strip_yaml_frontmatter(text).replace("\r\n", "\n").replace("\r", "\n")
    lines: list[str] = []
    in_fence = False

    for raw_line in text.split("\n"):
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            # Keep code-fence content as plain body only if it is meaningful copy.
            # Most publish drafts do not need literal code snippets.
            if stripped:
                lines.append(stripped)
            continue

        # Markdown headings become plain section labels.
        line = re.sub(r"^\s{0,3}#{1,6}\s+", "", line)
        # Blockquotes become plain quoted copy.
        line = re.sub(r"^\s*>\s?", "", line)
        # Checklists/bullets become native symbol lines.
        line = re.sub(r"^\s*[-*+]\s+\[[ xX]\]\s+", "• ", line)
        line = re.sub(r"^\s*[-*+]\s+", "• ", line)
        # Numbered Markdown lists: keep numbers, remove only indentation noise.
        line = re.sub(r"^\s+(\d+[.、])\s+", r"\1 ", line)
        # Inline links: keep readable anchor text; drop URL syntax.
        line = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", line)
        # Images are not body copy.
        line = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", r"\1", line)
        # Inline code markers: keep text.
        line = re.sub(r"`([^`]+)`", r"\1", line)
        # Bold/italic markers: keep words.
        line = line.replace("**", "").replace("__", "")
        line = re.sub(r"(?<!\w)[*_]([^*_]+)[*_](?!\w)", r"\1", line)
        # Markdown table separator rows are not body copy.
        if re.match(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$", line):
            continue
        # Table rows: turn cells into a readable native line rather than pipe syntax.
        if "|" in line and line.strip().startswith("|") and line.strip().endswith("|"):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            line = " ｜ ".join(cell for cell in cells if cell)

        lines.append(line.strip())

    # Xiaohongshu supports at most one blank spacer line between blocks.
    output = "\n".join(lines)
    output = re.sub(r"[ \t]+\n", "\n", output)
    output = re.sub(r"\n{3,}", "\n\n", output)
    return output.strip()


def find_markdown_leaks(text: str) -> list[str]:
    leaks = []
    for name, pattern in FORBIDDEN_MARKDOWN_PATTERNS:
        if pattern.search(text):
            leaks.append(name)
    return leaks


def max_consecutive_nonempty_lines(text: str) -> int:
    longest = 0
    current = 0
    for line in text.splitlines():
        if line.strip():
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def max_consecutive_blank_lines(text: str) -> int:
    longest = 0
    current = 0
    for line in text.splitlines():
        if line.strip():
            current = 0
        else:
            current += 1
            longest = max(longest, current)
    return longest


def find_native_body_quality_issues(text: str) -> list[str]:
    issues: list[str] = []
    blankest = max_consecutive_blank_lines(text)
    if blankest > 1:
        issues.append(f"max_consecutive_blank_lines:{blankest}")

    longest = max_consecutive_nonempty_lines(text)
    if longest > 3:
        issues.append(f"max_consecutive_nonempty_lines:{longest}")

    content_lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    if len(content_lines) >= 4 and not any(STRUCTURAL_LINE_MARKER.search(line) for line in content_lines):
        issues.append("missing_structural_markers")
    return issues


def title_char_count(title: str) -> int:
    return len(title)


def find_title_quality_issues(title: str) -> list[str]:
    issues: list[str] = []
    length = title_char_count(title)
    if length > MAX_XHS_TITLE_CHARS:
        issues.append(f"title_chars:{length}>20")
    return issues


def prepare_note_from_markdown(markdown: str) -> PreparedNote:
    title = _first_section(markdown, ["Final Title", "Title"]).strip()
    if not title:
        # Fallback to first H1 when the draft is simpler.
        match = re.search(r"^#\s+(.+)$", markdown, flags=re.MULTILINE)
        title = match.group(1).strip() if match else ""
    title = markdown_to_xhs_native(title).splitlines()[0].strip() if title else ""

    body_raw = _first_section(markdown, ["Final Body", "Body"])
    hashtags_raw = _first_section(markdown, ["Hashtags", "Tags"])
    if not body_raw:
        raise ValueError("Draft is missing `## Final Body` or `## Body` section")
    if not title:
        raise ValueError("Draft is missing `## Final Title`, `## Title`, or H1 title")

    body = markdown_to_xhs_native(body_raw)
    hashtags = markdown_to_xhs_native(hashtags_raw)
    full_body = body if not hashtags else f"{body}\n\n{hashtags}"
    leaks = find_markdown_leaks(full_body)
    if leaks:
        raise ValueError(f"Prepared body still contains Markdown-like syntax: {', '.join(leaks)}")
    return PreparedNote(title=title, body=body, hashtags=hashtags, full_body=full_body)


SENSITIVE_LOG_KEYS = {
    "authorization",
    "cookie",
    "cookies",
    "password",
    "refresh_token",
    "secret",
    "token",
    "xsec_token",
}


def sanitize_log_payload(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            normalized = str(key).lower()
            if normalized in SENSITIVE_LOG_KEYS or "cookie" in normalized or "token" in normalized or "secret" in normalized:
                cleaned[key] = "[REDACTED]"
            else:
                cleaned[key] = sanitize_log_payload(item)
        return cleaned
    if isinstance(value, list):
        return [sanitize_log_payload(item) for item in value]
    if isinstance(value, str):
        return re.sub(
            r"((?:api[_-]?key|authorization|cookie|password|secret|token|xsec_token)\s*[:=]\s*)[^\s'\",)}]+",
            r"\1[REDACTED]",
            value,
            flags=re.IGNORECASE,
        )
    return value


def append_action_log(client_dir: Path, entry: dict[str, Any]) -> None:
    log_path = client_dir / "xhs-action-log.md"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(f"\n\n## XHS Action — publish_note.py — {datetime.now().isoformat(timespec='seconds')}\n\n")
        handle.write("```json\n")
        handle.write(json.dumps(sanitize_log_payload(entry), ensure_ascii=False, indent=2, sort_keys=True))
        handle.write("\n```\n")


def append_initial_metrics(client_dir: Path, note: PreparedNote, note_data: dict[str, Any], *, content_type: str, keyword: str) -> None:
    metrics_path = client_dir / "metrics.csv"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    exists = metrics_path.exists() and metrics_path.stat().st_size > 0
    fieldnames = ["date", "note_title", "views", "likes", "collects", "comments", "shares", "content_type", "keyword", "status_note"]
    with metrics_path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        if not exists:
            writer.writeheader()
        writer.writerow(
            {
                "date": datetime.now().date().isoformat(),
                "note_title": note.title,
                "views": note_metric(note_data, "view_count", "views", "view_num"),
                "likes": note_metric(note_data, "likes", "like_count", "liked_count"),
                "collects": note_metric(note_data, "collected_count", "collect_count", "collects"),
                "comments": note_metric(note_data, "comments_count", "comment_count", "comments"),
                "shares": note_metric(note_data, "shared_count", "share_count", "shares"),
                "content_type": content_type,
                "keyword": keyword,
                "status_note": (
                    f"published_initial_snapshot; note_id={note_identity(note_data)}; "
                    f"tab_status={note_data.get('tab_status', '')}; permission_code={note_data.get('permission_code', '')}"
                ),
            }
        )


def find_note_in_my_notes(notes_payload: Any, note_id: str, title: str) -> dict[str, Any]:
    notes = note_candidates(notes_payload)
    for item in notes:
        if note_id and note_identity(item) == note_id:
            return item
    for item in notes:
        if note_title(item) == title:
            return item
    return {}


def note_candidates(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    for key in ["items", "notes", "list", "data"]:
        candidates = note_candidates(value.get(key))
        if candidates:
            return candidates
    return []


def note_identity(note: dict[str, Any]) -> str:
    return first_string(note.get("id"), note.get("note_id"), note.get("noteId"), nested_value(note, "note_card", "id"), nested_value(note, "note_card", "note_id"))


def note_title(note: dict[str, Any]) -> str:
    return first_string(
        note.get("display_title"),
        note.get("title"),
        nested_value(note, "note_card", "display_title"),
        nested_value(note, "note_card", "title"),
    )


def note_metric(note: dict[str, Any], *keys: str) -> Any:
    interact = nested_object(note, "note_card", "interact_info") or nested_object(note, "interact_info") or {}
    for key in keys:
        value = note.get(key)
        if value not in (None, ""):
            return value
        value = interact.get(key)
        if value not in (None, ""):
            return value
    return 0


def nested_object(value: dict[str, Any], *keys: str) -> dict[str, Any] | None:
    current: Any = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current if isinstance(current, dict) else None


def nested_value(value: dict[str, Any], *keys: str) -> Any:
    current: Any = value
    for key in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def first_string(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, int):
            return str(value)
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-dir", required=True, help="Client workspace directory")
    parser.add_argument("--draft", required=True, help="Approved markdown draft path")
    parser.add_argument("--images", required=True, nargs="+", help="Image path(s) to publish")
    parser.add_argument("--content-type", default="", help="Metrics content_type value")
    parser.add_argument("--keyword", default="", help="Metrics keyword value")
    parser.add_argument("--topic", action="append", default=[], help="Topic/hashtag to attach; may be repeated")
    parser.add_argument("--private", action="store_true", help="Publish as private note")
    parser.add_argument("--post", action="store_true", help="Actually call xhs post. Without this, only prepare and validate.")
    parser.add_argument("--body-output", help="Optional path to write the prepared native body")
    parser.add_argument("--xhs-binary", default="xhs")
    args = parser.parse_args()

    client_dir = Path(args.client_dir).expanduser().resolve()
    draft_path = Path(args.draft).expanduser().resolve()
    image_paths = [Path(path).expanduser().resolve() for path in args.images]
    for image_path in image_paths:
        if not image_path.exists():
            raise SystemExit(f"Missing image: {image_path}")

    note = prepare_note_from_markdown(draft_path.read_text(encoding="utf-8"))
    title_quality_issues = find_title_quality_issues(note.title)
    body_quality_issues = find_native_body_quality_issues(note.full_body)
    if args.body_output:
        body_output = Path(args.body_output).expanduser().resolve()
        body_output.parent.mkdir(parents=True, exist_ok=True)
        body_output.write_text(note.full_body + "\n", encoding="utf-8")

    preview = {
        "status": "prepared" if not args.post else "posting",
        "title": note.title,
        "title_quality": {
            "chars": title_char_count(note.title),
            "max_chars": MAX_XHS_TITLE_CHARS,
            "issues": title_quality_issues,
        },
        "body_chars": len(note.full_body),
        "images": [str(path) for path in image_paths],
        "markdown_leaks": find_markdown_leaks(note.full_body),
        "body_quality": {
            "max_consecutive_blank_lines": max_consecutive_blank_lines(note.full_body),
            "max_consecutive_nonempty_lines": max_consecutive_nonempty_lines(note.full_body),
            "issues": body_quality_issues,
        },
    }
    if title_quality_issues:
        preview["status"] = "blocked_title_quality"
        print(json.dumps(preview, ensure_ascii=False, indent=2))
        return 1
    if body_quality_issues:
        preview["status"] = "blocked_body_quality"
        print(json.dumps(preview, ensure_ascii=False, indent=2))
        return 1
    if not args.post:
        print(json.dumps(preview, ensure_ascii=False, indent=2))
        return 0

    started = datetime.now().isoformat(timespec="seconds")
    try:
        account = run_xhs(["whoami"], binary=args.xhs_binary)
        command = [
            "post",
            "--title",
            note.title,
            "--body",
            note.full_body,
            "--images",
            ",".join(str(path) for path in image_paths),
        ]
        for topic in args.topic:
            command.extend(["--topic", topic])
        if args.private:
            command.append("--private")
        result = run_xhs_command(command, binary=args.xhs_binary, timeout=180)
        note_id = ""
        if isinstance(result.data, dict):
            note_id = str(result.data.get("id") or "")
        my_notes = run_xhs(["my-notes"], binary=args.xhs_binary)
        note_snapshot = find_note_in_my_notes(my_notes, note_id, note.title)
        if note_snapshot:
            append_initial_metrics(client_dir, note, note_snapshot, content_type=args.content_type, keyword=args.keyword)
        entry = {
            "action": "xhs post",
            "script": "scripts/publish_note.py",
            "time_start": started,
            "time_end": datetime.now().isoformat(timespec="seconds"),
            "account": account,
            "title": note.title,
            "draft": str(draft_path),
            "images": [str(path) for path in image_paths],
            "result_envelope": result.envelope,
            "verify_snapshot": note_snapshot,
            "native_body_check": {
                "markdown_leaks": [],
                "title_chars": title_char_count(note.title),
                "title_quality_issues": title_quality_issues,
                "max_consecutive_blank_lines": max_consecutive_blank_lines(note.full_body),
                "max_consecutive_nonempty_lines": max_consecutive_nonempty_lines(note.full_body),
                "body_quality_issues": body_quality_issues,
            },
        }
        append_action_log(client_dir, entry)
        print(json.dumps({"ok": True, "note_id": note_id, "snapshot": note_snapshot}, ensure_ascii=False, indent=2))
        return 0
    except XhsCliError as exc:
        entry = {
            "action": "xhs post",
            "script": "scripts/publish_note.py",
            "time_start": started,
            "time_end": datetime.now().isoformat(timespec="seconds"),
            "title": note.title,
            "draft": str(draft_path),
            "images": [str(path) for path in image_paths],
            "error": {
                "code": exc.code,
                "message": exc.message,
                "returncode": exc.returncode,
                "details": exc.details,
                "stdout": exc.stdout,
                "stderr": exc.stderr,
            },
        }
        append_action_log(client_dir, entry)
        raise SystemExit(f"{exc.code}: {exc.message}") from exc


if __name__ == "__main__":
    raise SystemExit(main())
