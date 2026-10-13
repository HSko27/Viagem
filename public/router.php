<?php

declare(strict_types=1);

use Viagem\Controller\ParcelController;
use Viagem\Http\ApiException;
use Viagem\Http\JsonResponse;
use Viagem\Service\CuzkWfsClient;
use Viagem\Support\FileCache;

require dirname(__DIR__) . '/src/bootstrap.php';

// Router oddělí API požadavky od statických souborů a lokálního rozhraní mapy.
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

if (!is_string($path)) {
    JsonResponse::send(['error' => 'Neplatná adresa požadavku.'], 400);
}

// Vestavěnému PHP serveru předáme existující veřejný soubor, aby jej obsloužil přímo.
$publicFile = realpath(__DIR__ . $path);

if (
    $path !== '/'
    && $path !== '/index.html'
    && $publicFile !== false
    && str_starts_with($publicFile, __DIR__ . DIRECTORY_SEPARATOR)
    && is_file($publicFile)
) {
    return false;
}

// API je záměrně pouze pro čtení; ostatní HTTP metody jsou odmítnuty.
if (str_starts_with($path, '/api/') && ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    JsonResponse::send(['error' => 'Tato metoda není podporována.'], 405);
}

// Jednotlivé endpointy připraví odpověď; výjimky se převádějí na JSON chyby.
try {
    if ($path === '/api/health') {
        JsonResponse::send([
            'status' => 'ok',
            'service' => 'Viagem parcel API',
        ]);
    }

    if ($path === '/api/parcels') {
        $controller = new ParcelController(
            new CuzkWfsClient(),
            new FileCache(dirname(__DIR__) . '/storage/cache', 300),
        );
        $controller->index();
    }

    if (str_starts_with($path, '/api/')) {
        JsonResponse::send(['error' => 'Požadovaný endpoint nebyl nalezen.'], 404);
    }
} catch (ApiException $exception) {
    JsonResponse::send(['error' => $exception->getMessage()], $exception->statusCode);
} catch (Throwable $exception) {
    error_log('Unhandled API error: ' . $exception->getMessage());
    JsonResponse::send(['error' => 'Interní chyba serveru.'], 500);
}

return false;
