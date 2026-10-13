<?php

declare(strict_types=1);

namespace Viagem\Controller;

use Viagem\Http\ApiException;
use Viagem\Http\JsonResponse;
use Viagem\Service\CuzkWfsClient;
use Viagem\Support\FileCache;

final class ParcelController
{
    // Omezení chrání vzdálený WFS před příliš velkými dotazy z mapového klienta.
    private const MAX_BBOX_SPAN = 35000;
    private const MAX_BBOX_AREA = 800000000;

    public function __construct(
        private readonly CuzkWfsClient $wfsClient,
        private readonly FileCache $cache,
    ) {
    }

    /** Vrátí GeoJSON pro výřez mapy z cache, nebo jej načte ze služby ČÚZK. */
    public function index(): never
    {
        // Výřez validujeme a zaokrouhlené souřadnice použijeme jako klíč krátké cache.
        $bbox = $this->parseBbox($_GET['bbox'] ?? null);
        $cacheKey = implode(',', array_map(
            static fn (float $coordinate): string => number_format($coordinate, 1, '.', ''),
            $bbox,
        ));

        // Cache omezuje opakované požadavky na veřejnou službu při pohybu mapy.
        $features = $this->cache->get($cacheKey);
        $wasCached = $features !== null;

        if (!$wasCached) {
            $collection = $this->wfsClient->getParcels($bbox);
            $features = $collection['features'];
            $this->cache->put($cacheKey, $features);
        }

        // Odpověď doplňuje GeoJSON o zdroj a informaci o případném limitu výsledků.
        JsonResponse::send([
            'type' => 'FeatureCollection',
            'features' => $features,
            'meta' => [
                'source' => 'ČÚZK INSPIRE WFS',
                'cached' => $wasCached,
                'truncated' => count($features) >= CuzkWfsClient::FEATURE_LIMIT,
                'limit' => CuzkWfsClient::FEATURE_LIMIT,
            ],
        ]);
    }

    private function parseBbox(mixed $input): array
    {
        // Nejprve ověříme tvar a číselnost všech čtyř souřadnic.
        if (!is_string($input)) {
            throw new ApiException('Parametr bbox je povinný (minX,minY,maxX,maxY).', 400);
        }

        $parts = explode(',', $input);

        if (count($parts) !== 4) {
            throw new ApiException('Parametr bbox musí obsahovat právě čtyři souřadnice.', 400);
        }

        foreach ($parts as $part) {
            if ($part === '' || !is_numeric($part) || !is_finite((float) $part)) {
                throw new ApiException('Parametr bbox obsahuje neplatnou souřadnici.', 400);
            }
        }

        [$minX, $minY, $maxX, $maxY] = array_map('floatval', $parts);

        // Rozsah souřadnic i velikost výřezu jsou omezené na okolí okresu Jičín.
        if (
            $minX < -800000 || $maxX > -550000
            || $minY < -1100000 || $maxY > -900000
            || $minX >= $maxX || $minY >= $maxY
        ) {
            throw new ApiException('Parametr bbox je mimo podporovanou oblast EPSG:5514.', 400);
        }

        $width = $maxX - $minX;
        $height = $maxY - $minY;

        if ($width > self::MAX_BBOX_SPAN || $height > self::MAX_BBOX_SPAN || $width * $height > self::MAX_BBOX_AREA) {
            throw new ApiException(
                'Výřez mapy je příliš velký. Přibližte mapu a zkuste to znovu.',
                422,
            );
        }

        return [$minX, $minY, $maxX, $maxY];
    }
}
