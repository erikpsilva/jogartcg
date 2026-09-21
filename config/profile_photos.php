<?php
declare(strict_types=1);

function saveUploadedProfilePhoto(?array $file): ?string
{
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if (($file['error'] ?? null) !== UPLOAD_ERR_OK || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) {
        throw new InvalidArgumentException('Não foi possível receber a foto. Selecione o arquivo novamente.');
    }
    if (filesize($file['tmp_name']) > 5 * 1024 * 1024) throw new InvalidArgumentException('A foto deve ter no máximo 5 MB.');
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png'];
    $dimensions = @getimagesize($file['tmp_name']);
    if (!isset($extensions[$mime]) || !$dimensions || $dimensions['mime'] !== $mime) throw new InvalidArgumentException('Use uma foto JPG ou PNG válida.');
    if ($dimensions[0] * $dimensions[1] > 20000000) throw new InvalidArgumentException('A foto deve ter no máximo 20 megapixels.');
    $directory = dirname(__DIR__) . '/storage/uploads/avatars';
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) throw new RuntimeException('Avatar storage unavailable.');
    $filename = bin2hex(random_bytes(18)) . '.' . $extensions[$mime];
    if (!move_uploaded_file($file['tmp_name'], $directory . '/' . $filename)) throw new RuntimeException('Avatar storage unavailable.');
    return 'storage/uploads/avatars/' . $filename;
}

function isManagedProfilePhoto(?string $path): bool
{
    return is_string($path) && preg_match('~\Astorage/uploads/avatars/[a-f0-9]{36}\.(?:jpg|png)\z~D', $path) === 1;
}

/** Never follows uploaded names, traversal, symlinks or arbitrary stored paths. */
function removeManagedProfilePhoto(?string $path): bool
{
    if (!isManagedProfilePhoto($path)) return false;
    $project = realpath(dirname(__DIR__));
    $expectedDirectory = $project . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'avatars';
    $directory = realpath($expectedDirectory);
    if ($directory !== $expectedDirectory) return false;
    $file = $directory . DIRECTORY_SEPARATOR . basename($path);
    if (is_link($file) || !is_file($file) || dirname((string) realpath($file)) !== $directory) return false;
    return unlink($file);
}
