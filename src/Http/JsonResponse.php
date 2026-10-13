<?php

declare(strict_types=1);

namespace Viagem\Http;

final class JsonResponse
{
    public static function send(array $payload, int $statusCode = 200): never
    {
        // Každou odpověď odešleme jako UTF-8 JSON s bezpečnostními hlavičkami.
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        echo json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );

        exit;
    }
}
