#!/usr/bin/env python3
"""Traduz lotes exportados pelo Jogar TCG usando um modelo Argos/CTranslate2 local."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import ctranslate2
import sentencepiece as spm


EXACT_TRANSLATIONS = {
    "Action": "Ação",
    "Character": "Personagem",
    "Item": "Item",
    "Location": "Local",
    "Song": "Canção",
    "Amber": "Âmbar",
    "Amethyst": "Ametista",
    "Emerald": "Esmeralda",
    "Ruby": "Rubi",
    "Sapphire": "Safira",
    "Steel": "Aço",
    "Common": "Comum",
    "Uncommon": "Incomum",
    "Rare": "Rara",
    "Super Rare": "Super-rara",
    "Legendary": "Lendária",
    "Enchanted": "Encantada",
    "Epic": "Épica",
    "Iconic": "Icônica",
    "Special": "Especial",
    "Promo": "Promocional",
    "Storyborn": "Nascido da História",
    "Dreamborn": "Nascido do Sonho",
    "Floodborn": "Nascido da Enchente",
    "Hero": "Herói",
    "Villain": "Vilão",
    "Princess": "Princesa",
    "Prince": "Príncipe",
    "Queen": "Rainha",
    "King": "Rei",
    "Ally": "Aliado",
    "Mentor": "Mentor",
    "Captain": "Capitão",
    "Pirate": "Pirata",
    "Sorcerer": "Feiticeiro",
    "Fairy": "Fada",
    "Knight": "Cavaleiro",
    "Detective": "Detetive",
    "Inventor": "Inventor",
    "Musketeer": "Mosqueteiro",
    "Rush": "Investida",
    "Ward": "Proteção",
    "Evasive": "Evasivo",
    "Bodyguard": "Guarda-costas",
    "Support": "Apoio",
    "Reckless": "Imprudente",
    "Challenger": "Desafiante",
    "Resist": "Resistência",
    "Shift": "Transformação",
    "Singer": "Cantor",
    "Vanish": "Desaparecer",
    "Infinity": "Infinito",
    "Core": "Principal",
    "expansion": "expansão",
    "promo": "promocional",
}

TRANSLATABLE_OBJECT_KEYS = {
    "effect",
    "fullText",
    "name",
    "reminderText",
    "keywordValue",
    "text",
    "title",
}

CARD_TRANSLATION_FIELDS = {
    "name",
    "version",
    "type",
    "color",
    "rarity",
    "story",
    "subtypes",
    "subtypes_text",
    "keyword_abilities",
    "abilities",
    "effects",
    "full_text",
    "flavor_text",
    "clarifications",
    "errata",
}

TRANSLATE_ALL_LIST_FIELDS = {"subtypes", "keyword_abilities"}


class Translator:
    def __init__(self, model_dir: Path) -> None:
        self.processor = spm.SentencePieceProcessor(model_file=str(model_dir.parent / "sentencepiece.model"))
        self.engine = ctranslate2.Translator(str(model_dir), device="cpu", inter_threads=2, intra_threads=0)
        self.cache: dict[str, str] = {}

    @staticmethod
    def _protect(text: str) -> tuple[str, dict[str, str]]:
        protected: dict[str, str] = {}
        pattern = re.compile(r"(\{[^{}]+\}|\[[^\[\]]+\])")

        def replace(match: re.Match[str]) -> str:
            token = f"ZXQ{len(protected)}QXZ"
            protected[token] = match.group(0)
            return token

        return pattern.sub(replace, text), protected

    @staticmethod
    def _restore(text: str, protected: dict[str, str]) -> str:
        for token, original in protected.items():
            text = text.replace(token, original)
            text = text.replace(token.lower(), original)
        return text

    def translate_many(self, texts: list[str]) -> None:
        symbol_pattern = re.compile(r"(⟳|◊|⬡|¤)")
        pending: list[dict[str, Any]] = []
        jobs: list[tuple[int, int, str, dict[str, str], str, str]] = []
        for original in dict.fromkeys(texts):
            if original in self.cache:
                continue
            if original in EXACT_TRANSLATIONS:
                self.cache[original] = EXACT_TRANSLATIONS[original]
                continue
            if not original.strip():
                self.cache[original] = original
                continue
            parts = symbol_pattern.split(original)
            pending_index = len(pending)
            pending.append({"original": original, "parts": parts})
            for part_index, part in enumerate(parts):
                if not part or symbol_pattern.fullmatch(part):
                    continue
                core = part.strip()
                if not core:
                    continue
                leading = part[: len(part) - len(part.lstrip())]
                trailing = part[len(part.rstrip()) :]
                protected_text, protected = self._protect(core)
                jobs.append((pending_index, part_index, protected_text, protected, leading, trailing))

        for start in range(0, len(jobs), 64):
            batch = jobs[start : start + 64]
            tokenized = [self.processor.encode(item[2], out_type=str) for item in batch]
            results = self.engine.translate_batch(tokenized, beam_size=1, max_decoding_length=512)
            for (pending_index, part_index, _, protected, leading, trailing), result in zip(batch, results, strict=True):
                translated = self.processor.decode(result.hypotheses[0]).strip()
                translated = self._restore(translated, protected)
                translated = translated.replace("▁", " ")
                translated = re.sub(r"[ \t]+", " ", translated).strip()
                original_part = pending[pending_index]["parts"][part_index]
                pending[pending_index]["parts"][part_index] = (
                    leading + translated + trailing if translated else original_part
                )

        for item in pending:
            self.cache[item["original"]] = "".join(item["parts"])

    def translate(self, value: str | None) -> str | None:
        if value is None:
            return None
        return self.cache.get(value, EXACT_TRANSLATIONS.get(value, value))


def collect_strings(value: Any, output: list[str], translate_all: bool = False) -> None:
    if isinstance(value, str):
        output.append(value)
    elif isinstance(value, list):
        for item in value:
            collect_strings(item, output, translate_all=translate_all)
    elif isinstance(value, dict):
        for key, item in value.items():
            if translate_all or key in TRANSLATABLE_OBJECT_KEYS:
                collect_strings(item, output, translate_all=isinstance(item, (list, dict)))


def translate_structure(value: Any, translator: Translator, translate_all: bool = False) -> Any:
    if isinstance(value, str):
        return translator.translate(value)
    if isinstance(value, list):
        return [translate_structure(item, translator, translate_all=translate_all) for item in value]
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if translate_all or key in TRANSLATABLE_OBJECT_KEYS:
                result[key] = translate_structure(item, translator, translate_all=isinstance(item, (list, dict)))
            else:
                result[key] = item
        return result
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    strings: list[str] = []
    for item in payload.get("sets", []):
        collect_strings(item.get("name"), strings)
        collect_strings(item.get("type"), strings)
    for item in payload.get("cards", []):
        for field in CARD_TRANSLATION_FIELDS:
            collect_strings(item.get(field), strings, translate_all=field in TRANSLATE_ALL_LIST_FIELDS)

    translator = Translator(args.model / "model")
    translator.translate_many(strings)
    translated = {"sets": [], "cards": []}
    for item in payload.get("sets", []):
        translated["sets"].append(
            {
                **item,
                "name": translator.translate(item.get("name")),
                "type": translator.translate(item.get("type")),
            }
        )
    for item in payload.get("cards", []):
        translated_item = dict(item)
        for field in CARD_TRANSLATION_FIELDS:
            value = item.get(field)
            translated_item[field] = translate_structure(
                value,
                translator,
                translate_all=field in TRANSLATE_ALL_LIST_FIELDS,
            )
        translated["cards"].append(translated_item)
    translated["engine"] = "argos-translate-en-pt-1.9"
    args.output.write_text(json.dumps(translated, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
