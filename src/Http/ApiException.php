<?php

declare(strict_types=1);

namespace Viagem\Http;

use RuntimeException;

final class ApiException extends RuntimeException
{
    // Nese srozumitelnou chybu a HTTP status, které router vrátí klientovi.
    public function __construct(
        string $message,
        public readonly int $statusCode,
    ) {
        parent::__construct($message);
    }
}
