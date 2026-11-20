#!/usr/bin/env python3
# SPDX-FileCopyrightText: André Théo LAURET <andrelauret@eclipse-technology.eu>
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Merge complementary l10n-fallback/*.json dictionaries into packaged l10n/*.json and l10n/*.js.

Transifex non-overwrite contract:
- Existing non-empty translations in target l10n/<locale>.json ALWAYS take precedence.
- Existing pluralForm rules in target l10n/<locale>.json ALWAYS take precedence.
- Only absent or blank/whitespace keys are populated from l10n-fallback/<locale>.json.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Tuple

APP_ID = "duplicatefinder"
DEFAULT_PLURAL_FORM = "nplurals=2; plural=(n != 1);"


def format_nextcloud_json(translations: Dict[str, str], plural_form: str) -> str:
    items = [
        f"    {json.dumps(key, ensure_ascii=False)} : {json.dumps(val, ensure_ascii=False)}"
        for key, val in translations.items()
    ]
    body = ",\n".join(items)
    encoded_plural = json.dumps(plural_form, ensure_ascii=False)
    if body:
        return f'{{ "translations": {{\n{body}\n}},"pluralForm" :{encoded_plural}\n}}\n'
    return f'{{ "translations": {{}},"pluralForm" :{encoded_plural}\n}}\n'


def format_nextcloud_js(translations: Dict[str, str], plural_form: str) -> str:
    items = [
        f"    {json.dumps(key, ensure_ascii=False)} : {json.dumps(val, ensure_ascii=False)}"
        for key, val in translations.items()
    ]
    body = ",\n".join(items)
    encoded_app = json.dumps(APP_ID, ensure_ascii=False)
    encoded_plural = json.dumps(plural_form, ensure_ascii=False)
    if body:
        return f"OC.L10N.register(\n    {encoded_app},\n    {{\n{body}\n}},\n{encoded_plural});\n"
    return f"OC.L10N.register(\n    {encoded_app},\n    {{}},\n{encoded_plural});\n"


def merge_locale_files(
    target_dir: Path,
    locale: str,
    fallback_payload: Dict[str, object],
    dry_run: bool = False,
) -> Tuple[int, int]:
    fallback_translations = fallback_payload.get("translations", {})
    if not isinstance(fallback_translations, dict):
        raise ValueError(f"Fallback file for '{locale}' must define a 'translations' object")

    target_json_path = target_dir / f"{locale}.json"
    target_js_path = target_dir / f"{locale}.js"

    if target_json_path.exists():
        existing_payload = json.loads(target_json_path.read_text(encoding="utf-8"))
        existing_translations = existing_payload.get("translations", {})
        if not isinstance(existing_translations, dict):
            raise ValueError(f"Target file '{target_json_path}' has invalid 'translations' object")
        merged_translations: Dict[str, str] = dict(existing_translations)
        plural_form = str(
            existing_payload.get("pluralForm")
            or fallback_payload.get("pluralForm")
            or DEFAULT_PLURAL_FORM
        )
    else:
        merged_translations = {}
        plural_form = str(fallback_payload.get("pluralForm") or DEFAULT_PLURAL_FORM)

    added_count = 0
    preserved_count = 0

    for key, fallback_value in fallback_translations.items():
        if not isinstance(key, str) or not isinstance(fallback_value, str):
            continue
        if fallback_value.strip() == "":
            continue

        current_value = merged_translations.get(key)
        if isinstance(current_value, str) and current_value.strip() != "":
            preserved_count += 1
            continue

        merged_translations[key] = fallback_value
        added_count += 1

    if added_count > 0 and not dry_run:
        target_dir.mkdir(parents=True, exist_ok=True)
        target_json_path.write_text(
            format_nextcloud_json(merged_translations, plural_form),
            encoding="utf-8",
            newline="\n",
        )
        target_js_path.write_text(
            format_nextcloud_js(merged_translations, plural_form),
            encoding="utf-8",
            newline="\n",
        )

    return added_count, preserved_count


def merge_all_fallbacks(
    target_dir: Path,
    fallback_dir: Path,
    dry_run: bool = False,
) -> Dict[str, Dict[str, int]]:
    summary: Dict[str, Dict[str, int]] = {}
    if not fallback_dir.exists():
        return summary

    for fallback_file in sorted(fallback_dir.glob("*.json")):
        locale = fallback_file.stem
        payload = json.loads(fallback_file.read_text(encoding="utf-8"))
        added, preserved = merge_locale_files(
            target_dir=target_dir,
            locale=locale,
            fallback_payload=payload,
            dry_run=dry_run,
        )
        summary[locale] = {"added": added, "preserved": preserved}

    return summary


def main(argv: list[str] | None = None) -> int:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(
        description="Merge l10n-fallback dictionaries into packaged l10n files without overwriting Transifex strings."
    )
    parser.add_argument(
        "--target-dir",
        required=True,
        type=Path,
        help="Target packaged l10n directory (e.g. build/artifacts/source/sign/duplicatefinder/l10n)",
    )
    parser.add_argument(
        "--fallback-dir",
        default=repo_root / "l10n-fallback",
        type=Path,
        help="Directory containing <locale>.json fallback dictionaries",
    )
    parser.add_argument(
        "--allow-source-l10n",
        action="store_true",
        help="Explicitly allow merging into the repository's tracked l10n directory",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute merge counts without writing files",
    )

    args = parser.parse_args(argv)
    target_dir = args.target_dir.resolve()
    fallback_dir = args.fallback_dir.resolve()
    tracked_l10n = (repo_root / "l10n").resolve()

    if target_dir == tracked_l10n and not args.allow_source_l10n and not args.dry_run:
        print(
            "Refusing to modify tracked ./l10n in place without --allow-source-l10n (pass packaged build target).",
            file=sys.stderr,
        )
        return 2

    results = merge_all_fallbacks(
        target_dir=target_dir,
        fallback_dir=fallback_dir,
        dry_run=args.dry_run,
    )
    total_added = sum(item["added"] for item in results.values())
    total_preserved = sum(item["preserved"] for item in results.values())
    updated_locales = sum(1 for item in results.values() if item["added"] > 0)
    print(
        f"l10n-fallback: {updated_locales}/{len(results)} locales updated, "
        f"{total_added} missing keys populated, {total_preserved} existing Transifex keys preserved."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
