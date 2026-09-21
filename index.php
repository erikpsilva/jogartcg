<?php

declare(strict_types=1);

$scriptDirectory = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
$basePath = rtrim($scriptDirectory, '/');
$target = ($basePath === '' ? '' : $basePath) . '/client/#/cartas';

header('Location: ' . $target, true, 302);
exit;
