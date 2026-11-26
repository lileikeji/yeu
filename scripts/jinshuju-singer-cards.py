"""把决赛选手渲染成投票卡片（大头照位 + 姓名 + 歌名），供金数据图片选项使用。

用法：python scripts/jinshuju-singer-cards.py --out /tmp/cards --data /tmp/singers.json
数据格式：[{"name": "林敬凯", "song": "神探", "photo": "C:/path/photo.jpg" | null}, ...]
"""

import argparse
import colorsys
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH = 640
HEIGHT = 640
FONT_BOLD = 'C:/Windows/Fonts/msyhbd.ttc'
FONT_REGULAR = 'C:/Windows/Fonts/msyh.ttc'


def hue_for(name: str) -> int:
    """按姓名稳定取色，换一批选手也不会撞成一片。"""
    total = sum((index + 1) * ord(char) for index, char in enumerate(name))
    return total % 360


def palette(name: str):
    hue = hue_for(name) / 360.0
    base = colorsys.hls_to_rgb(hue, 0.62, 0.55)
    light = colorsys.hls_to_rgb(hue, 0.94, 0.6)
    return tuple(int(value * 255) for value in base), tuple(int(value * 255) for value in light)


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def draw_centered(draw: ImageDraw.ImageDraw, text: str, font, center_x: int, top: int, fill):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text((center_x - (box[2] - box[0]) / 2 - box[0], top), text, font=font, fill=fill)


def render_card(name: str, song: str, photo_path: str | None, out_path: Path) -> None:
    """方形头像卡：金数据把图片选项压成小缩略图，只有占满画面的头像在小尺寸下还认得出。"""
    base, light = palette(name)
    canvas = Image.new('RGB', (WIDTH, HEIGHT), light)
    draw = ImageDraw.Draw(canvas)

    radius = 250
    center = (WIDTH // 2, HEIGHT // 2 - 10)
    draw.ellipse(
        [center[0] - radius - 16, center[1] - radius - 16, center[0] + radius + 16, center[1] + radius + 16],
        fill=(255, 255, 255),
    )

    if photo_path and os.path.exists(photo_path):
        photo = Image.open(photo_path).convert('RGB')
        side = min(photo.size)
        photo = photo.crop((
            (photo.width - side) // 2,
            (photo.height - side) // 2,
            (photo.width + side) // 2,
            (photo.height + side) // 2,
        )).resize((radius * 2, radius * 2), Image.LANCZOS)
        mask = Image.new('L', (radius * 2, radius * 2), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, radius * 2, radius * 2], fill=255)
        canvas.paste(photo, (center[0] - radius, center[1] - radius), mask)
    else:
        draw.ellipse(
            [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
            fill=base,
        )
        initial = name[0] if name else '?'
        draw_centered(
            draw, initial,
            load_font(FONT_BOLD, 230), center[0], center[1] - 155, (255, 255, 255),
        )

    canvas.save(out_path, 'JPEG', quality=84, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('--data', required=True)
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = json.loads(Path(args.data).read_text(encoding='utf-8'))

    manifest = []
    for index, row in enumerate(rows):
        name = str(row.get('name') or '').strip()
        if not name:
            continue
        song = str(row.get('song') or '').strip()
        target = out_dir / f'{index + 1:02d}-{name}.jpg'
        render_card(name, song, row.get('photo'), target)
        manifest.append({
            'name': name,
            'song': song,
            'file': str(target),
            'bytes': target.stat().st_size,
        })

    (out_dir / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8',
    )
    total = sum(row['bytes'] for row in manifest)
    print(json.dumps({'cards': len(manifest), 'totalBytes': total}, ensure_ascii=False))


if __name__ == '__main__':
    main()
