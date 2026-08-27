#!/usr/bin/env python3
"""Create a background-category index with CLIP zero-shot image classification.

Run this after `unpack/images/background` and `unpack/images/backgrounds.json`
exist. The resulting JSON is consumed by the editor at build time, so image
classification never runs in the browser.

The committed `src/assets/background-categories.json` holds a finalized manual
review. Re-running this script overwrites it with fresh CLIP results, so pass
`--review <background-category-review.json>` (the editor's review export) to
re-apply the reviewed categories and removals on top.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor


CATEGORIES = {
    "city": {
        "label": "城市与设施",
        "prompts": [
            "a visual novel background of a city street, station, bridge, airport, or urban facility",
            "an exterior urban setting in a visual novel",
        ],
    },
    "nature": {
        "label": "自然与户外",
        "prompts": [
            "a visual novel background of a forest, beach, mountain, lake, snowfield, or other natural landscape",
            "an outdoor natural setting in a visual novel",
        ],
    },
    "indoor": {
        "label": "室内场景",
        "prompts": [
            "a visual novel background of an indoor room, corridor, office, warehouse, cafe, laboratory, or home",
            "an interior setting in a visual novel",
        ],
    },
    "battle": {
        "label": "战斗与废墟",
        "prompts": [
            "a visual novel background with obvious combat, weapons, explosions, fire, or a battlefield",
            "a war zone or destroyed ruins with visible damage in a visual novel",
        ],
    },
    "character": {
        "label": "人物与剧情",
        "prompts": [
            "a visual novel CG illustration focused on one or more characters",
            "an anime character story scene or close-up illustration",
        ],
    },
    "event": {
        "label": "节庆与主题",
        "prompts": [
            "a visual novel background for a celebration, festival, holiday, stage, or themed event",
            "a seasonal or special event illustration",
        ],
    },
    "special": {
        "label": "特殊画面",
        "prompts": [
            "a plain black or white visual novel screen",
            "a simple title card or graphic transition screen",
        ],
    },
    "other": {
        "label": "其他场景",
        "prompts": [
            "a general visual novel background scene",
            "an anime environment illustration",
        ],
    },
}

PATH_HINTS = (
    ("special", re.compile(r"black|white|square|mask|whitenet|title|logo|loading|guide", re.I)),
    ("event", re.compile(r"wedding|christmas|halloween|anniversary|festival|valentine|spring|summer|winter", re.I)),
    ("character", re.compile(r"cg", re.I)),
    ("city", re.compile(r"airport|street|bridge|city|station|slum|sewer|port|village|town|base|fortress|monument|guild|airport|机场|街道|大桥|城市|车站|港|村|城镇", re.I)),
    ("nature", re.compile(r"forest|beach|grass|lake|mountain|sea|snow|river|树林|冰湖|雪地|海|湖|山|沙滩|草地", re.I)),
    ("indoor", re.compile(r"bar|kitchen|warehouse|corridor|dorm|room|office|lab|hospital|cafe|theatre|作战室|工厂|室内|教堂|宿舍|走廊|餐厅|医院|实验室", re.I)),
    ("battle", re.compile(r"battlefield|battle|war|destroy|ruin|burn|explosion|战场|战斗|废墟|爆炸|燃烧", re.I)),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backgrounds", type=Path, default=Path("unpack/images/backgrounds.json"))
    parser.add_argument("--images", type=Path, default=Path("unpack/images/background"))
    parser.add_argument("--output", type=Path, default=Path("src/assets/background-categories.json"))
    parser.add_argument("--review", type=Path, help="Apply a finalized review export (categories/removed) over the CLIP results.")
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--download-base-url", help="Download missing images from this URL into --images.")
    parser.add_argument("--download-workers", type=int, default=12)
    return parser.parse_args()


def numeric_key(identifier: str) -> tuple[int, str]:
    try:
        return (int(identifier), "")
    except ValueError:
        return (1 << 30, identifier)


def download_missing(
    backgrounds: dict[str, str],
    image_root: Path,
    base_url: str | None,
    workers: int,
) -> None:
    if base_url is None:
        return

    missing = [path for path in backgrounds.values() if path and not (image_root / path).is_file()]
    if not missing:
        return

    def download(path: str) -> None:
        destination = image_root / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        request = Request(f"{base_url.rstrip('/')}/{quote(path)}", headers={"User-Agent": "gf-story-background-classifier"})
        with urlopen(request, timeout=60) as response:
            destination.write_bytes(response.read())

    with ThreadPoolExecutor(max_workers=workers) as executor:
        for completed, _ in enumerate(executor.map(download, missing), start=1):
            if completed % 50 == 0 or completed == len(missing):
                print(f"Downloaded {completed}/{len(missing)}")


def classify(
    images: list[Image.Image],
    model: CLIPModel,
    processor: CLIPProcessor,
    prompts: list[str],
    prompt_category_indices: list[int],
) -> list[int]:
    inputs = processor(text=prompts, images=images, return_tensors="pt", padding=True)
    with torch.inference_mode():
        scores = model(**inputs).logits_per_image

    category_scores = torch.stack([
        scores[:, [index for index, category_index in enumerate(prompt_category_indices) if category_index == category]].mean(dim=1)
        for category in range(len(CATEGORIES))
    ], dim=1)
    return category_scores.argmax(dim=1).tolist()


def main() -> None:
    args = parse_args()
    backgrounds: dict[str, str] = json.loads(args.backgrounds.read_text(encoding="utf-8"))
    image_root = args.images.parent
    download_missing(backgrounds, image_root, args.download_base_url, args.download_workers)
    category_prompts = [prompt for category in CATEGORIES.values() for prompt in category["prompts"]]
    category_keys = list(CATEGORIES)
    prompt_category_indices = [index for index, category in enumerate(CATEGORIES.values()) for _ in category["prompts"]]

    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()

    result: dict[str, str] = {identifier: "other" for identifier in backgrounds}
    entries: list[tuple[str, Path]] = []
    for identifier, relative_path in backgrounds.items():
        if not relative_path:
            continue
        name = Path(relative_path).stem
        hinted_category = next((category for category, pattern in PATH_HINTS if pattern.search(name)), None)
        if hinted_category is not None:
            result[identifier] = hinted_category
            continue
        image_path = image_root / relative_path
        if image_path.is_file():
            entries.append((identifier, image_path))

    for start in range(0, len(entries), args.batch_size):
        batch = entries[start:start + args.batch_size]
        images: list[Image.Image] = []
        for _, path in batch:
            with Image.open(path) as image:
                images.append(image.convert("RGB"))
        predicted_categories = classify(
            images,
            model,
            processor,
            category_prompts,
            prompt_category_indices,
        )
        for (identifier, _), category_index in zip(batch, predicted_categories):
            result[identifier] = category_keys[category_index]
        print(f"Classified {min(start + len(batch), len(entries))}/{len(entries)}")

    removals_path = args.output.parent / "background-removals.json"
    if args.review is not None:
        review = json.loads(args.review.read_text(encoding="utf-8"))
        reviewed_categories = review.get("categories", {})
        result.update({key: value for key, value in reviewed_categories.items() if key in result})
        removals = sorted(set(review.get("removed", [])), key=numeric_key)
        removals_path.write_text(
            json.dumps(removals, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Applied review: {len(reviewed_categories)} categories, {len(removals)} removals -> {removals_path}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("Categories:", dict(Counter(result.values())))


if __name__ == "__main__":
    main()
