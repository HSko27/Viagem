<?php

declare(strict_types=1);

// Převádí namespace Viagem na cestu v adresáři src bez potřeby Composeru.
spl_autoload_register(static function (string $class): void {
    $prefix = 'Viagem\\';

    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $path = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';

    if (is_file($path)) {
        require $path;
    }
});
