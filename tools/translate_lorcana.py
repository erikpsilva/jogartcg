#!/usr/bin/env python3
"""Traduz lotes exportados pelo Jogar TCG usando um modelo Argos/CTranslate2 local.

Politica de traducao das cartas:

* Nao se traduz: nome, versao, franquia, subtipos (Floodborn, Hero...), palavras-chave
  (Shift, Ward, Evasive...) com seus valores, e nomes de habilidades (ADORING FANS).
  Esses termos sao o vocabulario do jogo e aparecem assim na carta impressa.
* Traduz-se o que a carta faz: lembretes das palavras-chave, efeitos das habilidades,
  efeitos de acoes e cancoes, texto de ambientacao, esclarecimentos e erratas.
* Dentro de um efeito traduzido, nomes, subtipos, palavras-chave e simbolos continuam
  intactos, e os verbos do jogo usam os mesmos termos da mesa (exaurir, comprar...).

Tipo, cor e raridade continuam com rotulo em portugues porque aparecem como
filtros e selos da interface.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import ctranslate2
import sentencepiece as spm


# Rotulos da interface (tipo, cor, raridade, tipo de colecao).
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
    "Infinity": "Infinito",
    "Core": "Principal",
    "expansion": "expansão",
    "promo": "promocional",
}

# Palavras-chave conhecidas; as encontradas nos dados sao somadas a esta lista.
BASE_KEYWORDS = {
    "Alert", "Bodyguard", "Boost", "Challenger", "Evasive", "Reckless", "Resist", "Rush",
    "Shift", "Singer", "Sing Together", "Support", "Vanish", "Ward",
}

# Verbos e termos do jogo: o tradutor generico erra (exert -> "esforce-se",
# draw -> "desenhar"). Cada forma e trocada pelo termo usado na mesa.
GAME_TERMS = {
    "exert": "exaurir", "exerts": "exaure", "exerted": "exaurido", "exerting": "exaurindo",
    "ready": "preparar", "readies": "prepara", "readied": "preparado",
    "banish": "banir", "banishes": "bane", "banished": "banido",
    "draw": "comprar", "draws": "compra", "drawn": "comprado",
    "quest": "explorar", "quests": "explora", "quested": "explorou", "questing": "explorando",
    "inkwell": "tinteiro", "inkwells": "tinteiros",
    "lore": "lore",
    # O tradutor generico troca por "caractere", "cartão de caráter", "nesta curva", "música".
    "character": "personagem", "characters": "personagens",
    "character card": "carta de personagem", "character cards": "cartas de personagem",
    "this turn": "neste turno", "your turn": "seu turno", "next turn": "próximo turno",
    "song": "canção", "songs": "canções",
    # O tradutor copia a ordem do ingles ("escolhido adversário personagem").
    "chosen character": "personagem escolhido", "chosen characters": "personagens escolhidos",
    "chosen opposing character": "personagem adversário escolhido",
    "chosen opposing characters": "personagens adversários escolhidos",
    "opposing character": "personagem adversário", "opposing characters": "personagens adversários",
    "chosen character or location": "personagem ou local escolhido",
    "chosen character of yours": "um personagem seu escolhido",
    # "ready" tambem e adjetivo: "challenge ready characters" = personagens preparados.
    "ready character": "personagem preparado", "ready characters": "personagens preparados",
    # "deal damage" -> o tradutor produz "lidar com dano" / "dano tratado".
    "damage dealt": "dano causado",
    "deal": "causar", "deals": "causa", "dealt": "causado",
    "location": "local", "locations": "locais",
    # "ink a card" = colocar no tinteiro (o tradutor produz "imprimir").
    "ink": "colocar no tinteiro", "inked": "colocada no tinteiro",
}

# "Princess characters" -> "personagens Princess": o subtipo continua em ingles,
# mas a ordem das palavras precisa ser a do portugues.
SUBTYPE_NOUNS = {
    "character": "personagem", "characters": "personagens",
    "character card": "carta de personagem", "character cards": "cartas de personagem",
}

# Simbolos da carta impressa (custo, exaurir, forca, vontade, lore, tinteiro).
SYMBOLS = "⟳◊⬡¤⛉◉"

# O tradutor escolhe artigos sem ver o termo protegido; estes sao os erros de
# concordancia que isso produz em volta dos termos fixos do glossario.
AGREEMENT_FIXES = [
    (r"\bseu outro personagens\b", "seus outros personagens"),
    (r"\bseu personagens\b", "seus personagens"),
    (r"\boutro personagens\b", "outros personagens"),
    (r"\bdo personagens\b", "dos personagens"),
    (r"\bo personagens\b", "os personagens"),
    (r"\beste canção\b", "esta canção"),
    (r"\besse canção\b", "essa canção"),
    (r"\bum canção\b", "uma canção"),
    (r"\bo canção\b", "a canção"),
    (r"\bdo canção\b", "da canção"),
    (r"\bum carta\b", "uma carta"),
    (r"\bo carta\b", "a carta"),
    (r"\bdo carta\b", "da carta"),
    (r"\bdo neste turno\b", "deste turno"),
    (r"\b(no|em|o) neste turno\b", "neste turno"),
    # card -> "cartão": o tradutor ja concordou os artigos com o masculino,
    # entao a expressao inteira vira feminina de uma vez.
    (r"\bum cartão\b", "uma carta"), (r"\bo cartão\b", "a carta"), (r"\bdo cartão\b", "da carta"),
    (r"\bno cartão\b", "na carta"), (r"\besse cartão\b", "essa carta"), (r"\beste cartão\b", "esta carta"),
    (r"\bseu cartão\b", "sua carta"), (r"\boutro cartão\b", "outra carta"), (r"\bnenhum cartão\b", "nenhuma carta"),
    (r"\bos cartões\b", "as cartas"), (r"\bdos cartões\b", "das cartas"), (r"\bnos cartões\b", "nas cartas"),
    (r"\bseus cartões\b", "suas cartas"), (r"\besses cartões\b", "essas cartas"), (r"\bestes cartões\b", "estas cartas"),
    (r"\boutros cartões\b", "outras cartas"), (r"\btodos os cartões\b", "todas as cartas"),
    (r"\b([2-9]|\d{2,}) dano\b", r"\1 danos"),
    (r"\bUm cartão\b", "Uma carta"), (r"\bO cartão\b", "A carta"), (r"\bOs cartões\b", "As cartas"),
    (r"\bcartão\b", "carta"), (r"\bcartões\b", "cartas"),
]

TOKEN_PATTERN = re.compile(r"Z\s*X\s*Q\s*(\d+)\s*Q\s*X\s*Z", re.IGNORECASE)


def unwrap(text: str) -> str:
    """A fonte quebra linhas no meio das frases, como na carta impressa."""
    return re.sub(r"\s+", " ", text).strip()


class Glossary:
    """Termos que atravessam a traducao sem mudar (ou com traducao fixa)."""

    def __init__(self, names: list[str], subtypes: list[str], keywords: set[str], ability_names: set[str]) -> None:
        verbatim = {term for term in [*names, *subtypes, *keywords, *ability_names] if term and len(term) > 1}
        # Mais longos primeiro: "Sing Together" antes de "Sing", "Mickey Mouse" antes de "Mickey".
        ordered = sorted(verbatim, key=len, reverse=True)
        keyword_alternation = "|".join(re.escape(term) for term in sorted(keywords, key=len, reverse=True))
        # Palavra-chave com valor ("Shift 4", "Resist +1", "Challenger +2") fica inteira.
        self.keyword_value = re.compile(rf"(?<![\w])(?:{keyword_alternation})\s+[+-]?\d+(?![\w])") if keywords else None
        self.verbatim = re.compile(r"(?<![\w])(?:" + "|".join(re.escape(term) for term in ordered) + r")(?![\w])") if ordered else None
        subtype_alternation = "|".join(re.escape(term) for term in sorted({s for s in subtypes if s}, key=len, reverse=True))
        noun_alternation = "|".join(re.escape(term) for term in sorted(SUBTYPE_NOUNS, key=len, reverse=True))
        self.subtype_noun = re.compile(rf"(?<![\w])({subtype_alternation})\s+({noun_alternation})(?![\w])") if subtype_alternation else None
        self.symbols = re.compile(rf"[{SYMBOLS}]|\{{[^{{}}]+\}}|\[[^\[\]]+\]")
        self.terms = re.compile(r"(?<![\w])(" + "|".join(sorted(GAME_TERMS, key=len, reverse=True)) + r")(?![\w])", re.IGNORECASE)

    def protect(self, text: str, rules: bool = True) -> tuple[str, dict[str, str]]:
        """`rules=False` (ambientacao) so protege nomes e simbolos: "draw your sword" nao e comprar carta."""
        protected: dict[str, str] = {}

        def hold(value: str) -> str:
            token = f"ZXQ{len(protected)}QXZ"
            protected[token] = value
            return token

        if rules and self.keyword_value:
            text = self.keyword_value.sub(lambda match: hold(match.group(0)), text)
        if rules and self.subtype_noun:
            text = self.subtype_noun.sub(lambda match: hold(f"{SUBTYPE_NOUNS[match.group(2)]} {match.group(1)}"), text)
        if self.verbatim:
            text = self.verbatim.sub(lambda match: hold(match.group(0)), text)
        text = self.symbols.sub(lambda match: hold(match.group(0)), text)

        def term(match: re.Match[str]) -> str:
            original = match.group(1)
            translated = GAME_TERMS[original.lower()]
            return hold(translated[:1].upper() + translated[1:] if original[:1].isupper() else translated)

        return (self.terms.sub(term, text) if rules else text), protected

    @staticmethod
    def restore(text: str, protected: dict[str, str]) -> str | None:
        """Devolve None se o tradutor perdeu algum termo protegido."""
        seen: set[str] = set()

        def put(match: re.Match[str]) -> str:
            token = f"ZXQ{match.group(1)}QXZ"
            seen.add(token)
            return protected.get(token, match.group(0))

        restored = TOKEN_PATTERN.sub(put, text)
        return restored if seen == set(protected) else None


class Translator:
    def __init__(self, model_dir: Path, glossary: Glossary) -> None:
        self.processor = spm.SentencePieceProcessor(model_file=str(model_dir.parent / "sentencepiece.model"))
        self.engine = ctranslate2.Translator(str(model_dir), device="cpu", inter_threads=2, intra_threads=0)
        self.glossary = glossary
        # Um cache por modo: o mesmo texto pode ser regra ou ambientacao.
        self.cache: dict[tuple[bool, str], str] = {}
        self.fallbacks: list[str] = []

    def translate_many(self, texts: list[str], rules: bool = True) -> None:
        jobs: list[tuple[str, str, dict[str, str]]] = []
        for original in dict.fromkeys(texts):
            if (rules, original) in self.cache:
                continue
            if original in EXACT_TRANSLATIONS:
                self.cache[(rules, original)] = EXACT_TRANSLATIONS[original]
                continue
            if not original.strip():
                self.cache[(rules, original)] = original
                continue
            protected_text, protected = self.glossary.protect(original, rules)
            # So termos protegidos (ex.: "Shift 4" sozinho): nada a traduzir.
            if not re.sub(r"ZXQ\d+QXZ|[\s.,;:!?()\-—–]", "", protected_text):
                self.cache[(rules, original)] = self.glossary.restore(protected_text, protected) or original
                continue
            jobs.append((original, protected_text, protected))

        for start in range(0, len(jobs), 64):
            batch = jobs[start : start + 64]
            tokenized = [self.processor.encode(item[1], out_type=str) for item in batch]
            results = self.engine.translate_batch(tokenized, beam_size=2, max_decoding_length=512)
            for (original, _, protected), result in zip(batch, results, strict=True):
                translated = self.processor.decode(result.hypotheses[0]).replace("▁", " ")
                translated = re.sub(r"[ \t]+", " ", translated).strip()
                restored = self.glossary.restore(translated, protected)
                if restored is None or not restored:
                    # Melhor mostrar o original do que um efeito sem o termo que ele cita.
                    self.fallbacks.append(original)
                    restored = original
                elif rules:
                    for pattern, replacement in AGREEMENT_FIXES:
                        restored = re.sub(pattern, replacement, restored)
                self.cache[(rules, original)] = restored

    def translate(self, value: str | None, rules: bool = True) -> str | None:
        if value is None:
            return None
        return self.cache.get((rules, value), EXACT_TRANSLATIONS.get(value, value))


def ability_units(ability: dict[str, Any]) -> list[str]:
    """Trechos traduziveis de uma habilidade: so o lembrete ou o efeito."""
    if ability.get("type") == "keyword":
        reminder = ability.get("reminderText")
        return [unwrap(reminder)] if isinstance(reminder, str) and reminder.strip() else []
    effect = ability.get("effect")
    return [unwrap(effect)] if isinstance(effect, str) and effect.strip() else []


def translate_ability(ability: dict[str, Any], translator: Translator) -> dict[str, Any]:
    result = dict(ability)
    full_text = unwrap(str(ability.get("fullText") or ""))
    if ability.get("type") == "keyword":
        reminder = ability.get("reminderText")
        if isinstance(reminder, str) and reminder.strip():
            original = unwrap(reminder)
            translated = translator.translate(original) or original
            result["reminderText"] = translated
            # "Shift 4 (lembrete)": palavra-chave e valor ficam, o lembrete e traduzido.
            head = full_text.split("(", 1)[0].strip() if "(" in full_text else str(ability.get("keyword") or "")
            result["fullText"] = f"{head} ({translated})" if head else f"({translated})"
        else:
            result["fullText"] = full_text
        return result

    effect = ability.get("effect")
    if isinstance(effect, str) and effect.strip():
        original = unwrap(effect)
        translated = translator.translate(original) or original
        result["effect"] = translated
        # Nome e custo ("IT'S MY POWER NOW ⟳ —") ficam como na carta; so o efeito muda.
        result["fullText"] = full_text.replace(original, translated) if original in full_text else (
            f"{ability['name']} {translated}" if ability.get("name") else translated
        )
    return result


def text_values(value: Any) -> list[str]:
    """Textos de esclarecimentos/erratas, que chegam como lista de strings ou objetos."""
    if isinstance(value, str):
        return [unwrap(value)] if value.strip() else []
    if isinstance(value, list):
        return [text for item in value for text in text_values(item)]
    if isinstance(value, dict):
        return [text for key, item in value.items() if key in {"text", "effect", "fullText"} for text in text_values(item)]
    return []


def translate_texts(value: Any, translator: Translator) -> Any:
    if isinstance(value, str):
        return translator.translate(unwrap(value)) if value.strip() else value
    if isinstance(value, list):
        return [translate_texts(item, translator) for item in value]
    if isinstance(value, dict):
        return {key: translate_texts(item, translator) if key in {"text", "effect", "fullText"} else item for key, item in value.items()}
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    cards = payload.get("cards", [])
    glossary_input = payload.get("glossary", {})

    keywords = set(BASE_KEYWORDS)
    ability_names: set[str] = set()
    for card in cards:
        for ability in card.get("abilities") or []:
            if ability.get("type") == "keyword" and ability.get("keyword"):
                keywords.add(ability["keyword"])
            elif ability.get("name"):
                ability_names.add(ability["name"])
    glossary = Glossary(
        # Personagens, itens e locais (enviados pelo driver). Nomes de acoes ficam de fora:
        # sao frases comuns ("Be Prepared") e travariam trechos que devem ser traduzidos.
        names=list(glossary_input.get("names", [])),
        subtypes=list(glossary_input.get("subtypes", [])),
        keywords=keywords,
        ability_names=ability_names,
    )

    strings: list[str] = []
    flavors: list[str] = []
    for item in payload.get("sets", []):
        strings.extend(value for value in (item.get("type"),) if isinstance(value, str))
    for card in cards:
        strings.extend(value for value in (card.get("type"), card.get("color"), card.get("rarity")) if isinstance(value, str))
        for ability in card.get("abilities") or []:
            strings.extend(ability_units(ability))
        strings.extend(unwrap(effect) for effect in card.get("effects") or [] if isinstance(effect, str) and effect.strip())
        if isinstance(card.get("flavor_text"), str) and card["flavor_text"].strip():
            flavors.append(unwrap(card["flavor_text"]))
        strings.extend(text_values(card.get("clarifications")))
        strings.extend(text_values(card.get("errata")))

    translator = Translator(args.model / "model", glossary)
    translator.translate_many(strings)
    translator.translate_many(flavors, rules=False)

    translated: dict[str, Any] = {"sets": [], "cards": []}
    for item in payload.get("sets", []):
        # Nomes de colecao permanecem em ingles em todo o site.
        translated["sets"].append({**item, "name": item.get("name"), "type": translator.translate(item.get("type"))})

    for card in cards:
        abilities = [translate_ability(ability, translator) for ability in card.get("abilities") or []]
        effects = [translator.translate(unwrap(effect)) if isinstance(effect, str) and effect.strip() else effect for effect in card.get("effects") or []]
        # Texto completo refeito a partir das partes, uma habilidade por linha.
        lines = [ability["fullText"] for ability in abilities if ability.get("fullText")] + [effect for effect in effects if effect]
        flavor = card.get("flavor_text")
        translated["cards"].append({
            **card,
            # Nome, versao, franquia, subtipos e palavras-chave: sempre como na carta.
            "name": card.get("name"),
            "version": card.get("version"),
            "story": card.get("story"),
            "subtypes": card.get("subtypes"),
            "subtypes_text": card.get("subtypes_text"),
            "keyword_abilities": card.get("keyword_abilities"),
            "type": translator.translate(card.get("type")),
            "color": translator.translate(card.get("color")),
            "rarity": translator.translate(card.get("rarity")),
            "abilities": abilities if card.get("abilities") is not None else None,
            "effects": effects if card.get("effects") is not None else None,
            "full_text": "\n".join(lines) if lines else card.get("full_text"),
            "flavor_text": translator.translate(unwrap(flavor), rules=False) if isinstance(flavor, str) and flavor.strip() else flavor,
            "clarifications": translate_texts(card.get("clarifications"), translator),
            "errata": translate_texts(card.get("errata"), translator),
        })

    translated["engine"] = "argos-translate-en-pt-1.9+glossario-v2"
    translated["fallbacks"] = translator.fallbacks
    args.output.write_text(json.dumps(translated, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
