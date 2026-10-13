<?php

declare(strict_types=1);

namespace Viagem\Support;

use RuntimeException;

final class FileCache
{
    public function __construct(
        private readonly string $directory,
        private readonly int $ttlSeconds,
    ) {
        if (!is_dir($this->directory) && !mkdir($this->directory, 0775, true) && !is_dir($this->directory)) {
            throw new RuntimeException('Cache directory could not be created.');
        }
    }

    /** Vrátí platný záznam jako pole; pro chybějící nebo expirovanou cache vrátí null. */
    public function get(string $key): ?array
    {
        $path = $this->pathFor($key);

        if (!is_file($path) || filemtime($path) + $this->ttlSeconds < time()) {
            return null;
        }

        $contents = file_get_contents($path);

        if ($contents === false) {
            throw new RuntimeException('Cached data could not be read.');
        }

        try {
            $payload = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException $exception) {
            error_log('Removing invalid parcel cache entry: ' . $exception->getMessage());
            unlink($path);

            return null;
        }

        if (!is_array($payload)) {
            error_log('Removing parcel cache entry with an unexpected format.');
            unlink($path);

            return null;
        }

        return $payload;
    }

    public function put(string $key, array $payload): void
    {
        $path = $this->pathFor($key);
        $temporaryPath = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $contents = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );

        if (file_put_contents($temporaryPath, $contents, LOCK_EX) === false) {
            if (is_file($temporaryPath)) {
                unlink($temporaryPath);
            }

            throw new RuntimeException('Cached data could not be written.');
        }

        if (!rename($temporaryPath, $path)) {
            unlink($temporaryPath);
            throw new RuntimeException('Cached data could not be published.');
        }
    }

    private function pathFor(string $key): string
    {
        return $this->directory . '/' . hash('sha256', $key) . '.json';
    }
}
