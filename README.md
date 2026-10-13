# Parcely Jičínska

Jednoduchá webová mapa parcel s backendem v čistém PHP. Geometrii pro aktuální výřez získává z veřejné služby INSPIRE WFS ČÚZK; mapový podklad poskytuje OpenStreetMap.

## Požadavky

- PHP 8.2 nebo novější
- Rozšíření PHP `json`, `openssl` a `standard`
- Připojení k internetu (služba ČÚZK a dlaždice OpenStreetMap)

Projekt nepoužívá Composer ani databázi. Úspěšné odpovědi WFS se na pět minut ukládají do `storage/cache`, takže opakované požadavky na stejný výřez nezatěžují vzdálenou službu. Cache lze změnit smazáním souborů v tomto adresáři.

## Spuštění

V kořenovém adresáři projektu spusťte:

```sh
php -S 127.0.0.1:8000 -t public public/router.php
```

Poté otevřete [http://127.0.0.1:8000](http://127.0.0.1:8000). Mapa nabízí rychlé přesuny do Jičína, Sobotky, Hořic a Nové Paky. Při prvním načtení dat musí být dostupná služba ČÚZK. Zápisy cache probíhají do `storage/cache`; uživatel, pod kterým PHP běží, tam proto musí mít právo zápisu.

## API

### `GET /api/health`

Kontrolní endpoint; vrací stav aplikace.

### `GET /api/parcels?bbox=minX,minY,maxX,maxY`

Vrací GeoJSON `FeatureCollection` parcel pro zadaný výřez. Parametr `bbox` i geometrie odpovědi jsou v nativním souřadnicovém systému EPSG:5514, který ČÚZK vyžaduje pro prostorové filtrování. Frontend převádí souřadnice odpovědi do WGS84 (EPSG:4326) před vykreslením. Backend ověřuje rozsah výřezu a omezuje odpověď na 10 000 prvků. Při dosažení limitu aplikace oznámí, že je potřeba mapu přiblížit.

Po kliknutí na parcelu panel zobrazí dostupné parcelní číslo nebo katastrální referenci, identifikátor prvku ČÚZK, typ geometrie, zdrojovou vrstvu a místo výběru. Pokud WFS vrátí `areaValue`, aplikace ho uvede jako údaj ČÚZK. Jinak vypočítá plochu polygonu z geometrie v EPSG:5514 a výslovně ji označí jako výpočet; nejde o úřední výměru evidovanou katastrem.

Příklad:

```sh
curl 'http://127.0.0.1:8000/api/parcels?bbox=-675000,-1015000,-669000,-1009000'
```

## Rozhodnutí a další rozvoj

- Geometrie se načítá z INSPIRE WFS ČÚZK až podle aktuálního výřezu namísto stahování celostátní datové sady. Klient převádí hranice výřezu do EPSG:5514 (WFS prostorový filtr), požaduje parcelní geometrii ve stejném CRS a převádí ji do WGS84 před vykreslením mapou. Ověřil jsem, že WFS při odlišném CRS filtru a geometrie vrací prázdný výsledek, proto jsou CRS sjednocené. Je to jednoduchý způsob, jak mít aktuální data a omezit přenos i paměť mapy; dostupnost aplikace proto závisí na dostupnosti ČÚZK.
- API předává GeoJSON přímo mapě, používá limit 10 000 prvků a krátkou diskovou cache. Výchozí přiblížení míří na centrum Jičína a vrstva zvýrazní vybranou parcelu, aniž by zakrývala podkladovou mapu. Pro dlouhodobý nebo víceuživatelský provoz by bylo vhodné přidat přednačítání dat do prostorové databáze (například PostGIS) a vektorové dlaždice.
- Veřejná odpověď WFS se může lišit podle dostupných atributů. Aplikace zobrazuje parcelní referenci a výměru z ČÚZK jen tehdy, pokud je zdroj vrátí; dopočtenou plochu vždy odlišuje od evidované výměry. Nezobrazuje neověřené údaje o vlastnících ani jiné neveřejné informace.
- Vzhled stránky je připravený pomocí utility tříd Tailwind CSS a je možné jej přímo upravovat v `public/index.html`. Tailwind je načítán přes CDN kvůli jednoduchému lokálnímu spuštění; pro nasazení doporučuji připnout a sestavovat jeho verzi lokálně.
# Viagem
