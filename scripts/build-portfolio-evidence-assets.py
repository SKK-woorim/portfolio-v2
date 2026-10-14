"""Build the case-study evidence images from the local completion-report PPTX files.

The PPTX originals stay local (data/portfolio/*.pptx is git-ignored). This script records
exactly which slide media are published and how each one is redacted, so the WebP files in
public/assets/images/portfolio/ can be rebuilt and reviewed.

Usage: python3 scripts/build-portfolio-evidence-assets.py   (requires Pillow with WebP)
"""

import io
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCES = {
    "sdi": ROOT / "data/portfolio/삼성 SDI 멀티 에이전트 기반 MLOps 플랫폼 PoC_완료보고서_최종.pptx",
    "yonsei": ROOT / "data/portfolio/연세대학교_AI혁신연구원_의료데이터_플랫폼_구축_완료보고_최종.pptx",
}
OUT = ROOT / "public/assets/images/portfolio"
SDI = "samsung-sdi-multi-agent-mlops-poc"
YONSEI = "yonsei-medical-data-platform"


def media(deck: str, name: str) -> Image.Image:
    with zipfile.ZipFile(SOURCES[deck]) as archive:
        image = Image.open(io.BytesIO(archive.read(f"ppt/media/{name}")))
        image.load()
    if image.mode in ("P", "RGBA", "LA"):
        image = image.convert("RGBA")
        flat = Image.new("RGB", image.size, "white")
        flat.paste(image, mask=image.split()[-1])
        return flat
    return image.convert("RGB")


def redact(image: Image.Image, boxes, fill) -> Image.Image:
    draw = ImageDraw.Draw(image)
    for box in boxes:
        draw.rounded_rectangle(box, radius=4, fill=fill)
    return image


def save(image: Image.Image, slug: str, name: str, max_width: int = 1600) -> None:
    target = OUT / slug / f"{name}.webp"
    target.parent.mkdir(parents=True, exist_ok=True)
    if image.width > max_width:
        image = image.resize((max_width, round(image.height * max_width / image.width)), Image.LANCZOS)
    image.save(target, "WEBP", quality=82, method=6)
    print(f"{target.relative_to(ROOT)} {image.size[0]}x{image.size[1]} {target.stat().st_size // 1024}KB")


def main() -> None:
    # SDI slide 4/14: Dify multi-agent workflow. Mask the internal XAI serving API address.
    workflow = media("sdi", "image16.png")
    save(redact(workflow, [(404, 99, 602, 124)], workflow.getpixel((590, 111))), SDI, "agent-workflow", 2400)

    # SDI slide 4/13: ontology graph. Blur so customer table names are unreadable; keep the structure.
    save(media("sdi", "image20.png").filter(ImageFilter.GaussianBlur(2.4)), SDI, "ontology-graph", 1200)

    # SDI slide 4/11: MLOps pipeline for the XAI model. No customer identifiers.
    save(media("sdi", "image21.png"), SDI, "mlops-pipeline")

    # SDI slide 17: agent answer. Mask batch, lot and equipment IDs and the customer document number.
    answer = redact(media("sdi", "image85.png"), [
        (131, 214, 240, 234), (213, 410, 310, 430), (400, 410, 472, 430), (242, 560, 341, 580),
        (382, 560, 468, 580), (236, 590, 307, 610), (133, 800, 315, 820), (286, 1089, 365, 1109),
        (463, 1302, 536, 1322), (204, 1432, 294, 1452),
    ], (214, 221, 232))
    save(answer.crop((0, 0, 1126, 1612)), SDI, "agent-answer", 1126)

    # Yonsei slide 23: training photos.
    for source, name in [("image65.jpeg", "user-training-1"), ("image67.jpeg", "user-training-2"),
                         ("image64.jpeg", "server-room-training")]:
        save(media("yonsei", source), YONSEI, name, 1200)

    # Yonsei slide 13: admin manual excerpt. The manual already hides IPs; mask the stub left in the window title.
    manual = media("yonsei", "image24.png")
    save(redact(manual, [(166, 202, 188, 217)], manual.getpixel((196, 210))), YONSEI, "admin-manual-mig", 1352)


if __name__ == "__main__":
    main()
