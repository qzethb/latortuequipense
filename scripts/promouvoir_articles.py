"""Publie les articles « à venir » dont la date est atteinte.

Déplace articles-data-avenir/<slug>.json vers articles-data/<slug>.json lorsque
la date de l'article (champ « date ») est aujourd'hui ou passée (UTC), et
renseigne « publie_le ». La génération des pages est faite ensuite par
scripts/generer_articles.py.

Usage (depuis la racine du dépôt) :  python scripts/promouvoir_articles.py
"""

import json
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
AVENIR_DIR = ROOT_DIR / "articles-data-avenir"
PUBLIE_DIR = ROOT_DIR / "articles-data"


def main() -> None:
    if not AVENIR_DIR.exists():
        print("Aucun article à venir.")
        return

    maintenant = datetime.now(timezone.utc)
    aujourdhui = maintenant.date().isoformat()
    promus = 0

    for source in sorted(AVENIR_DIR.glob("*.json")):
        with source.open(encoding="utf-8") as fichier:
            data = json.load(fichier)
        date_article = str(data.get("date", ""))
        if not date_article or date_article > aujourdhui:
            continue

        cible = PUBLIE_DIR / source.name
        if cible.exists():
            print(f"Avertissement : {cible.name} existe déjà dans articles-data/ ; {source.name} laissé en place.")
            continue

        data["publie_le"] = maintenant.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        PUBLIE_DIR.mkdir(exist_ok=True)
        with cible.open("w", encoding="utf-8", newline="\n") as fichier:
            json.dump(data, fichier, ensure_ascii=False, indent=2)
            fichier.write("\n")
        source.unlink()
        promus += 1
        print(f"Promu : {source.stem} (date {date_article})")

    print(f"{promus} article(s) promu(s)." if promus else "Aucun article à promouvoir aujourd’hui.")


if __name__ == "__main__":
    main()
