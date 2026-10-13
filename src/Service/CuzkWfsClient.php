<?php

declare(strict_types=1);

namespace Viagem\Service;

use Viagem\Http\ApiException;

final class CuzkWfsClient
{
    // INSPIRE WFS poskytuje geometrii parcel a dostupné atributy jako GeoJSON.
    private const ENDPOINT = 'https://services.cuzk.cz/wfs/inspire-cp-wfs.asp';
    private const FEATURE_TYPE = 'cp:CadastralParcel';
    public const FEATURE_LIMIT = 10000;

    /** Načte parcely i jejich geometrii v EPSG:5514; frontend souřadnice převede pro mapu. */
    public function getParcels(array $bbox): array
    {
        // EPSG:5514 se používá pro filtr i výstup, aby se předešlo prázdným výsledkům.
        $query = http_build_query([
            'service' => 'WFS',
            'version' => '2.0.0',
            'request' => 'GetFeature',
            'typeNames' => self::FEATURE_TYPE,
            'bbox' => implode(',', $bbox) . ',EPSG:5514',
            'count' => self::FEATURE_LIMIT,
            'outputFormat' => 'application/json',
            'srsName' => 'EPSG:5514',
        ], '', '&', PHP_QUERY_RFC3986);

        // Časový limit a ověření TLS brání dlouhému čekání i neověřenému spojení.
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 12,
                'ignore_errors' => true,
                'header' => [
                    'Accept: application/geo+json, application/json',
                    'User-Agent: ViagemParcelMap/1.0',
                ],
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);

        // Služba může vrátit tělo i při chybovém HTTP stavu, proto kontrolujeme obojí.
        $body = @file_get_contents(self::ENDPOINT . '?' . $query, false, $context);
        $statusLine = $http_response_header[0] ?? '';

        if ($body === false || !preg_match('/\s2\d\d\s/', $statusLine)) {
            error_log('ČÚZK WFS request failed: ' . ($statusLine ?: 'no response'));
            throw new ApiException('Datový zdroj ČÚZK není momentálně dostupný.', 502);
        }

        // Odpověď musí být platná FeatureCollection, než ji předáme controlleru.
        try {
            $data = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            error_log('ČÚZK WFS returned invalid JSON: ' . $exception->getMessage());
            throw new ApiException('Datový zdroj ČÚZK vrátil neplatná data.', 502);
        }

        if (
            !is_array($data)
            || ($data['type'] ?? null) !== 'FeatureCollection'
            || !isset($data['features'])
            || !is_array($data['features'])
        ) {
            error_log('ČÚZK WFS returned an unexpected GeoJSON structure.');
            throw new ApiException('Datový zdroj ČÚZK vrátil neočekávaný formát.', 502);
        }

        return $data;
    }
}
