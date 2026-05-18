import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from publish_note import (
    append_initial_metrics,
    find_markdown_leaks,
    find_native_body_quality_issues,
    find_title_quality_issues,
    find_note_in_my_notes,
    markdown_to_xhs_native,
    max_consecutive_blank_lines,
    max_consecutive_nonempty_lines,
    prepare_note_from_markdown,
    title_char_count,
)


class PublishNoteTest(unittest.TestCase):
    def test_prepare_note_converts_markdown_to_xhs_native_body(self):
        draft = textwrap.dedent(
            """
            # Fallback H1

            ## Final Title

            一张图看懂：**八字十神**到底在说什么？

            ## Final Body

            很多人第一次看八字，
            最容易卡在「十神」。

            **十神 = 我和外界的十种关系。**

            🌿 **1｜比劫：和我同类的人**

            - 它不一定好
            - 也不一定坏

            [查看说明](https://example.com)

            ## Hashtags

            #八字 #十神
            """
        )

        note = prepare_note_from_markdown(draft)

        self.assertEqual(note.title, "一张图看懂：八字十神到底在说什么？")
        self.assertIn("十神 = 我和外界的十种关系。", note.full_body)
        self.assertIn("🌿 1｜比劫：和我同类的人", note.full_body)
        self.assertIn("• 它不一定好", note.full_body)
        self.assertIn("• 也不一定坏", note.full_body)
        self.assertIn("查看说明", note.full_body)
        self.assertNotIn("**", note.full_body)
        self.assertNotIn("[查看说明]", note.full_body)
        self.assertEqual(find_markdown_leaks(note.full_body), [])
        self.assertEqual(find_native_body_quality_issues(note.full_body), [])

    def test_markdown_leak_detector_rejects_common_visible_markers(self):
        text = "## Heading\n\n**bold**\n\n- [ ] todo\n\n| a | b |"
        leaks = find_markdown_leaks(text)
        self.assertIn("heading_marker", leaks)
        self.assertIn("bold_or_italic_marker", leaks)
        self.assertIn("checklist_marker", leaks)
        self.assertIn("markdown_table", leaks)

    def test_title_quality_counts_punctuation_in_twenty_char_limit(self):
        valid = "一二三四五六七八九十，一二三四五六七八九"
        invalid = f"{valid}！"

        self.assertEqual(title_char_count(valid), 20)
        self.assertEqual(find_title_quality_issues(valid), [])
        self.assertEqual(title_char_count(invalid), 21)
        self.assertIn("title_chars:21>20", find_title_quality_issues(invalid))

    def test_markdown_to_xhs_native_turns_table_row_into_native_line(self):
        converted = markdown_to_xhs_native("| Day | Title |\n|---|---|\n| D3 | 十神是什么 |")
        self.assertIn("Day ｜ Title", converted)
        self.assertIn("D3 ｜ 十神是什么", converted)
        self.assertNotIn("|---|", converted)

    def test_markdown_to_xhs_native_caps_blank_spacing_at_one_line(self):
        converted = markdown_to_xhs_native("第一段\n\n\n\n第二段")

        self.assertEqual(converted, "第一段\n\n第二段")
        self.assertEqual(max_consecutive_blank_lines(converted), 1)
        self.assertNotIn("\n\n\n", converted)

    def test_native_body_quality_flags_dense_blocks(self):
        dense = "第一句\n第二句\n第三句\n第四句"

        self.assertEqual(max_consecutive_nonempty_lines(dense), 4)
        self.assertIn("max_consecutive_nonempty_lines:4", find_native_body_quality_issues(dense))
        self.assertIn("missing_structural_markers", find_native_body_quality_issues(dense))

    def test_native_body_quality_flags_multiple_blank_spacers(self):
        airy = "第一段\n\n\n第二段"

        self.assertEqual(max_consecutive_blank_lines(airy), 2)
        self.assertIn("max_consecutive_blank_lines:2", find_native_body_quality_issues(airy))

    def test_native_body_quality_accepts_symbol_marked_short_groups(self):
        body = "开头一句\n\n🌿 1｜先说问题\n这段解释控制在两行\n\n• 一个重点\n• 另一个重点"

        self.assertEqual(max_consecutive_nonempty_lines(body), 2)
        self.assertEqual(find_native_body_quality_issues(body), [])

    def test_find_note_accepts_items_shape_from_my_notes(self):
        payload = {
            "items": [
                {
                    "note_id": "note-1",
                    "note_card": {
                        "display_title": "一张图看懂十神",
                        "interact_info": {"view_count": "1024", "liked_count": "88", "comment_count": "6"},
                    },
                }
            ]
        }

        self.assertEqual(find_note_in_my_notes(payload, "note-1", "missing")["note_id"], "note-1")
        self.assertEqual(find_note_in_my_notes({"data": payload}, "", "一张图看懂十神")["note_id"], "note-1")

    def test_initial_metrics_uses_nested_my_notes_counts_and_note_id(self):
        note = prepare_note_from_markdown(
            textwrap.dedent(
                """
                ## Final Title
                一张图看懂十神

                ## Final Body
                十神 = 我和外界的十种关系。
                """
            )
        )
        note_data = {
            "note_id": "note-1",
            "note_card": {
                "interact_info": {
                    "view_count": "1024",
                    "liked_count": "88",
                    "collect_count": "12",
                    "comment_count": "6",
                    "share_count": "2",
                }
            },
            "tab_status": 2,
            "permission_code": 0,
        }

        with tempfile.TemporaryDirectory() as tmp:
            append_initial_metrics(Path(tmp), note, note_data, content_type="tutorial", keyword="十神")
            metrics = (Path(tmp) / "metrics.csv").read_text(encoding="utf-8")

        self.assertIn("一张图看懂十神", metrics)
        self.assertIn("1024,88,12,6,2", metrics)
        self.assertIn("note_id=note-1", metrics)


if __name__ == "__main__":
    unittest.main()
