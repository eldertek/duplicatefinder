#!/usr/bin/env python3
"""Unit and parity tests for scripts/merge_l10n_fallback.py, l10n-fallback/, and appinfo/info.xml."""

from __future__ import annotations

import json
import pathlib
import re
import tempfile
import unittest
import xml.etree.ElementTree as ET

import merge_l10n_fallback as merger

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent

PRIORITY_16_LOCALES = [
    "fr",
    "de",
    "de_DE",
    "es",
    "it",
    "pt_BR",
    "pt_PT",
    "nl",
    "pl",
    "ru",
    "tr",
    "ja",
    "ko",
    "zh_CN",
    "ar",
    "sv",
]

EXTENDED_FULL_LOCALES = [
    "da",
    "sk",
    "cs",
    "uk",
    "ro",
    "id",
    "el",
    "en_GB",
    "zh_HK",
]

CIRCLE_3_LOCALES = [
    "fi",
    "ca",
    "zh_TW",
    "nb",
    "hu",
    "sl",
    "bg",
    "hr",
    "he",
    "vi",
    "th",
    "sr",
    "lt_LT",
    "lv",
    "et_EE",
]

PLACEHOLDER_RE = re.compile(r"\{[a-zA-Z_][a-zA-Z0-9_]*\}|%[ns]")
NPLURALS_RE = re.compile(r"nplurals\s*=\s*(\d+)")


def parse_js_string(source: str, idx: int) -> tuple[str, int]:
    quote = source[idx]
    idx += 1
    out: list[str] = []
    while idx < len(source):
        ch = source[idx]
        if ch == "\\" and idx + 1 < len(source):
            nxt = source[idx + 1]
            escapes = {"n": "\n", "r": "\r", "t": "\t", "\\": "\\", "'": "'", '"': '"'}
            if nxt in escapes:
                out.append(escapes[nxt])
            elif nxt != "\n":
                out.append("\\" + nxt)
            idx += 2
        elif ch == quote:
            return "".join(out), idx + 1
        else:
            out.append(ch)
            idx += 1
    raise ValueError("Unterminated string literal")


def skip_ws_comments(source: str, idx: int) -> int:
    while idx < len(source):
        if source[idx].isspace():
            idx += 1
        elif source[idx : idx + 2] == "//":
            nl = source.find("\n", idx)
            idx = len(source) if nl == -1 else nl + 1
        elif source[idx : idx + 2] == "/*":
            end = source.find("*/", idx + 2)
            idx = len(source) if end == -1 else end + 2
        else:
            break
    return idx


def parse_concat_string(source: str, idx: int) -> tuple[str | None, int]:
    idx = skip_ws_comments(source, idx)
    if idx >= len(source) or source[idx] not in ('"', "'"):
        return None, idx
    parts: list[str] = []
    while True:
        part, idx = parse_js_string(source, idx)
        parts.append(part)
        nxt = skip_ws_comments(source, idx)
        if nxt < len(source) and source[nxt] == "+":
            nxt2 = skip_ws_comments(source, nxt + 1)
            if nxt2 < len(source) and source[nxt2] in ('"', "'"):
                idx = nxt2
                continue
        break
    return "".join(parts), idx


def extract_runtime_keys(repo_root: pathlib.Path) -> set[str]:
    keys: set[str] = set()
    for path in sorted((repo_root / "src").rglob("*")):
        if path.suffix not in (".vue", ".js", ".ts"):
            continue
        text = path.read_text(encoding="utf-8")
        for match in re.finditer(r"""(?<![\w$])t\(\s*['"]duplicatefinder['"]\s*,""", text):
            value, _ = parse_concat_string(text, match.end())
            if value is not None:
                keys.add(value)
        for match in re.finditer(r"""(?<![\w$])n\(\s*['"]duplicatefinder['"]\s*,""", text):
            singular, idx = parse_concat_string(text, match.end())
            idx = skip_ws_comments(text, idx)
            if singular is not None and idx < len(text) and text[idx] == ",":
                plural, _ = parse_concat_string(text, idx + 1)
                if plural is not None:
                    keys.add(f"_{singular}_::_{plural}_")

    for directory in ("lib", "templates"):
        folder = repo_root / directory
        if not folder.exists():
            continue
        for path in sorted(folder.rglob("*.php")):
            text = path.read_text(encoding="utf-8")
            for match in re.finditer(r"->t\(\s*", text):
                value, _ = parse_concat_string(text, match.end())
                if value is not None:
                    keys.add(value)
            for match in re.finditer(r"->n\(\s*", text):
                singular, idx = parse_concat_string(text, match.end())
                idx = skip_ws_comments(text, idx)
                if singular is not None and idx < len(text) and text[idx] == ",":
                    plural, _ = parse_concat_string(text, idx + 1)
                    if plural is not None:
                        keys.add(f"_{singular}_::_{plural}_")
    return keys


class TestMergeL10nFallback(unittest.TestCase):
    def test_preserves_transifex_and_merges_singular_and_plural_fallbacks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = pathlib.Path(tmp)
            target_dir = tmp_path / "l10n"
            fallback_dir = tmp_path / "l10n-fallback"
            target_dir.mkdir()
            fallback_dir.mkdir()

            (target_dir / "fr.json").write_text(
                json.dumps(
                    {
                        "translations": {
                            "Scan": "Analyser (Transifex)",
                            "_%n file deleted_::_%n files deleted_": [
                                "%n fichier supprime (Transifex)",
                                "%n de fichiers supprimes (Transifex)",
                                "%n fichiers supprimes (Transifex)",
                            ],
                            "Empty": "   ",
                        },
                        "pluralForm": "nplurals=3; plural=(n == 0 || n == 1) ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            (fallback_dir / "fr.json").write_text(
                json.dumps(
                    {
                        "translations": {
                            "Scan": "SHOULD NOT OVERWRITE",
                            "_%n file deleted_::_%n files deleted_": [
                                "SHOULD NOT OVERWRITE 1",
                                "SHOULD NOT OVERWRITE 2",
                                "SHOULD NOT OVERWRITE 3",
                            ],
                            "Empty": "Rempli par fallback",
                            "_%n empty folder deleted_::_%n empty folders deleted_": [
                                "%n dossier vide supprimé",
                                "%n de dossiers vides supprimés",
                                "%n dossiers vides supprimés",
                            ],
                            "InvalidEmptyList": [],
                            "InvalidBlankEntry": ["ok", "  "],
                        },
                        "pluralForm": "nplurals=3; plural=(n == 0 || n == 1) ? 0 : n != 0 && n % 1000000 == 0 ? 1 : 2;",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            summary = merger.merge_all_fallbacks(
                target_dir=target_dir, fallback_dir=fallback_dir
            )
            self.assertEqual(summary["fr"]["added"], 2)
            self.assertEqual(summary["fr"]["preserved"], 2)

            merged = json.loads((target_dir / "fr.json").read_text(encoding="utf-8"))
            translations = merged["translations"]
            # Transifex entries preserved verbatim
            self.assertEqual(translations["Scan"], "Analyser (Transifex)")
            self.assertEqual(
                translations["_%n file deleted_::_%n files deleted_"],
                [
                    "%n fichier supprime (Transifex)",
                    "%n de fichiers supprimes (Transifex)",
                    "%n fichiers supprimes (Transifex)",
                ],
            )
            # Missing/blank entries filled (including plural list[str])
            self.assertEqual(translations["Empty"], "Rempli par fallback")
            self.assertEqual(
                translations["_%n empty folder deleted_::_%n empty folders deleted_"],
                [
                    "%n dossier vide supprimé",
                    "%n de dossiers vides supprimés",
                    "%n dossiers vides supprimés",
                ],
            )
            # Invalid fallback values rejected
            self.assertNotIn("InvalidEmptyList", translations)
            self.assertNotIn("InvalidBlankEntry", translations)

            # JS output contains valid OC.L10N.register call with serialized plural array
            js_text = (target_dir / "fr.js").read_text(encoding="utf-8")
            self.assertIn('OC.L10N.register(\n    "duplicatefinder",', js_text)
            self.assertIn('"%n dossier vide supprimé"', js_text)

    def test_all_fallback_files_placeholders_plurals_and_typography(self) -> None:
        fallback_dir = REPO_ROOT / "l10n-fallback"
        fallback_files = sorted(fallback_dir.glob("*.json"))
        self.assertGreaterEqual(len(fallback_files), 40)

        for path in fallback_files:
            raw = path.read_text(encoding="utf-8")
            self.assertNotIn("\u2014", raw, f"Forbidden em-dash in {path.name}")
            self.assertNotIn("\u2013", raw, f"Forbidden en-dash in {path.name}")

            payload = json.loads(raw)
            plural_form = payload.get("pluralForm", "")
            m_nplurals = NPLURALS_RE.search(plural_form)
            self.assertIsNotNone(m_nplurals, f"Missing nplurals in {path.name}")
            expected_nplurals = int(m_nplurals.group(1))

            for key, value in payload.get("translations", {}).items():
                self.assertTrue(
                    merger.is_valid_translation_value(value),
                    f"Invalid translation value in {path.name} for {key!r}",
                )
                expected_placeholders = set(PLACEHOLDER_RE.findall(key))
                if isinstance(value, list):
                    self.assertEqual(
                        len(value),
                        expected_nplurals,
                        f"{path.name}: plural key {key!r} has {len(value)} forms, expected {expected_nplurals}",
                    )
                    for form in value:
                        actual_placeholders = set(PLACEHOLDER_RE.findall(form))
                        self.assertEqual(
                            actual_placeholders,
                            expected_placeholders,
                            f"{path.name}: placeholder mismatch in plural form {form!r} for {key!r}",
                        )
                else:
                    actual_placeholders = set(PLACEHOLDER_RE.findall(value))
                    self.assertEqual(
                        actual_placeholders,
                        expected_placeholders,
                        f"{path.name}: placeholder mismatch in {value!r} for {key!r}",
                    )

    def test_100_percent_merged_coverage_for_priority_and_extended_locales(self) -> None:
        runtime_keys = extract_runtime_keys(REPO_ROOT)
        self.assertGreaterEqual(len(runtime_keys), 539)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_l10n = pathlib.Path(tmp) / "l10n"
            tmp_l10n.mkdir()
            for src_json in (REPO_ROOT / "l10n").glob("*.json"):
                (tmp_l10n / src_json.name).write_text(
                    src_json.read_text(encoding="utf-8"), encoding="utf-8"
                )

            merger.merge_all_fallbacks(
                target_dir=tmp_l10n, fallback_dir=REPO_ROOT / "l10n-fallback"
            )

            all_full_locales = (
                PRIORITY_16_LOCALES + EXTENDED_FULL_LOCALES + CIRCLE_3_LOCALES
            )
            self.assertEqual(len(all_full_locales), 40)
            for locale in all_full_locales:
                merged_path = tmp_l10n / f"{locale}.json"
                self.assertTrue(merged_path.exists(), f"Missing merged {locale}.json")
                merged = json.loads(merged_path.read_text(encoding="utf-8"))["translations"]
                valid_keys = {
                    k for k, v in merged.items() if merger.is_valid_translation_value(v)
                }
                missing = runtime_keys - valid_keys
                self.assertEqual(
                    missing,
                    set(),
                    f"Locale {locale} missing {len(missing)} keys: {sorted(missing)[:5]}",
                )

    def test_info_xml_valid_and_38_language_parity(self) -> None:
        info_xml = REPO_ROOT / "appinfo" / "info.xml"
        raw = info_xml.read_text(encoding="utf-8")
        self.assertNotIn("\u2014", raw, "Forbidden em-dash in appinfo/info.xml")
        self.assertNotIn("\u2013", raw, "Forbidden en-dash in appinfo/info.xml")

        root = ET.fromstring(raw)
        summaries = {el.attrib.get("lang") for el in root.findall("summary")}
        descriptions = {el.attrib.get("lang") for el in root.findall("description")}
        self.assertEqual(summaries, descriptions)
        self.assertEqual(len(summaries), 38)

    def test_readme_and_store_screenshots_parity(self) -> None:
        readme_path = REPO_ROOT / "README.md"
        readme = readme_path.read_text(encoding="utf-8")
        self.assertNotIn("\u2014", readme, "Forbidden em-dash in README.md")
        self.assertNotIn("\u2013", readme, "Forbidden en-dash in README.md")

        # Every Markdown image link in README.md resolves locally and is non-empty
        image_targets = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", readme)
        self.assertGreaterEqual(len(image_targets), 4)
        for target in image_targets:
            self.assertFalse(
                target.startswith(("http://", "https://")),
                f"Use relative repo image paths in README.md instead of {target}",
            )
            img_path = REPO_ROOT / target
            self.assertTrue(img_path.is_file(), f"Missing README image: {target}")
            self.assertGreater(img_path.stat().st_size, 0, f"Empty README image: {target}")

        # Every <screenshot> in appinfo/info.xml exists in img/ and is shown in README.md
        info_root = ET.fromstring((REPO_ROOT / "appinfo" / "info.xml").read_text(encoding="utf-8"))
        info_screenshots = [el.text.strip() for el in info_root.findall("screenshot") if el.text]
        self.assertEqual(len(info_screenshots), 4)
        for url in info_screenshots:
            rel_path = "img/" + url.rsplit("/", 1)[-1]
            self.assertTrue((REPO_ROOT / rel_path).is_file(), f"Missing info.xml screenshot: {rel_path}")
            self.assertIn(rel_path, image_targets, f"info.xml screenshot missing from README.md: {rel_path}")

        # Every local relative Markdown link (non-URL, non-anchor) resolves on disk
        for link in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", readme):
            if link.startswith(("http://", "https://", "mailto:", "#")):
                continue
            self.assertTrue((REPO_ROOT / link).is_file(), f"Broken local link in README.md: {link}")

        # Every GitHub anchor linked from appinfo/info.xml <documentation> matches a heading in README.md
        heading_slugs = {
            re.sub(r"[^a-z0-9\- ]", "", h.strip().lower()).replace(" ", "-")
            for h in re.findall(r"^#{1,6}\s+(.+)$", readme, flags=re.MULTILINE)
        }
        for doc_el in info_root.findall("./documentation/*"):
            if doc_el.text and "#" in doc_el.text:
                anchor = doc_el.text.rsplit("#", 1)[-1]
                self.assertIn(anchor, heading_slugs, f"Missing README heading for info.xml anchor #{anchor}")


if __name__ == "__main__":
    unittest.main()
