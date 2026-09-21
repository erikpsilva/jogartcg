<?php

declare(strict_types=1);

/**
 * Regras de validacao compartilhadas pela API.
 *
 * Cada funcao "validate*" devolve null quando o valor e valido ou a mensagem
 * de erro em PT-BR que deve aparecer abaixo do campo correspondente no cliente.
 * As mesmas regras estao espelhadas em apps/game-client/src/validation/registration.ts
 * para que o formulario avise durante a digitacao sem depender de ida ao servidor.
 */

const USER_NAME_MIN = 2;
const USER_NAME_MAX = 80;
const USER_LAST_NAME_MAX = 120;
const USER_EMAIL_MAX = 190;
const USER_PASSWORD_MIN = 8;
// bcrypt ignora tudo depois de 72 bytes, entao recusamos senhas maiores
// em vez de aceitar silenciosamente uma senha truncada.
const USER_PASSWORD_MAX = 72;
const USER_MIN_AGE = 13;
const USER_MAX_AGE = 120;

function onlyDigits(?string $value): string
{
    return preg_replace('/\D+/', '', (string) $value) ?? '';
}

function normalizeSpaces(?string $value): string
{
    $value = preg_replace('/\s+/u', ' ', (string) $value) ?? '';
    return trim($value);
}

function normalizeEmail(?string $value): string
{
    return mb_strtolower(trim((string) $value));
}

function isPersonNameValid(string $value): bool
{
    // Letras (com acento), espaco, hifen e apostrofo. Precisa comecar com letra.
    return (bool) preg_match("/^\p{L}[\p{L}\s'’\-]*$/u", $value);
}

function validatePersonName(?string $raw, string $label, int $max): ?string
{
    $value = normalizeSpaces($raw);

    if ($value === '') {
        return "Informe seu {$label}.";
    }
    if (mb_strlen($value) < USER_NAME_MIN) {
        return "O {$label} precisa ter pelo menos " . USER_NAME_MIN . ' letras.';
    }
    if (mb_strlen($value) > $max) {
        return "O {$label} pode ter no maximo {$max} caracteres.";
    }
    if (!isPersonNameValid($value)) {
        return "Use apenas letras, espaco, hifen ou apostrofo no {$label}.";
    }

    return null;
}

function validateEmail(?string $raw): ?string
{
    $value = normalizeEmail($raw);

    if ($value === '') {
        return 'Informe seu e-mail.';
    }
    if (mb_strlen($value) > USER_EMAIL_MAX) {
        return 'O e-mail pode ter no maximo ' . USER_EMAIL_MAX . ' caracteres.';
    }
    if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
        return 'Digite um e-mail valido, como nome@dominio.com.';
    }
    // filter_var aceita dominio sem ponto (ex.: nome@localhost).
    $domain = substr($value, (int) strrpos($value, '@') + 1);
    if (!str_contains($domain, '.')) {
        return 'Digite um e-mail valido, como nome@dominio.com.';
    }

    return null;
}

function validatePhone(?string $raw): ?string
{
    $digits = onlyDigits($raw);

    if ($digits === '') {
        return 'Informe seu telefone com DDD.';
    }
    if (strlen($digits) < 10 || strlen($digits) > 11) {
        return 'O telefone precisa ter 10 ou 11 digitos com o DDD.';
    }
    if ((int) substr($digits, 0, 2) < 11) {
        return 'DDD invalido. Use um DDD entre 11 e 99.';
    }
    if (strlen($digits) === 11 && $digits[2] !== '9') {
        return 'Para celular com 11 digitos o numero deve comecar com 9 apos o DDD.';
    }
    if (strlen($digits) === 10 && (int) $digits[2] < 2) {
        return 'Numero fixo invalido. Confira o telefone digitado.';
    }

    return null;
}

function isCpfValid(string $digits): bool
{
    if (strlen($digits) !== 11 || !ctype_digit($digits)) {
        return false;
    }
    // Sequencias como 111.111.111-11 passam no calculo, mas nao existem.
    if (preg_match('/^(\d)\1{10}$/', $digits)) {
        return false;
    }

    for ($position = 9; $position < 11; $position++) {
        $sum = 0;
        for ($index = 0; $index < $position; $index++) {
            $sum += (int) $digits[$index] * (($position + 1) - $index);
        }
        $checkDigit = ((10 * $sum) % 11) % 10;
        if ((int) $digits[$position] !== $checkDigit) {
            return false;
        }
    }

    return true;
}

function validateCpf(?string $raw): ?string
{
    $digits = onlyDigits($raw);

    if ($digits === '') {
        return 'Informe seu CPF.';
    }
    if (strlen($digits) !== 11) {
        return 'O CPF precisa ter 11 digitos.';
    }
    if (!isCpfValid($digits)) {
        return 'CPF invalido. Confira os numeros digitados.';
    }

    return null;
}

function validateBirthDate(?string $raw): ?string
{
    $value = trim((string) $raw);

    if ($value === '') {
        return 'Informe sua data de nascimento.';
    }

    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
        return 'Data de nascimento invalida.';
    }

    $today = new DateTimeImmutable('today');
    if ($date > $today) {
        return 'A data de nascimento nao pode estar no futuro.';
    }

    $age = (int) $date->diff($today)->y;
    if ($age < USER_MIN_AGE) {
        return 'E preciso ter pelo menos ' . USER_MIN_AGE . ' anos para criar uma conta.';
    }
    if ($age > USER_MAX_AGE) {
        return 'Confira o ano de nascimento digitado.';
    }

    return null;
}

function validatePassword(?string $raw): ?string
{
    $value = (string) $raw;

    if ($value === '') {
        return 'Crie uma senha.';
    }
    if (mb_strlen($value) < USER_PASSWORD_MIN) {
        return 'A senha precisa ter pelo menos ' . USER_PASSWORD_MIN . ' caracteres.';
    }
    if (strlen($value) > USER_PASSWORD_MAX) {
        return 'A senha pode ter no maximo ' . USER_PASSWORD_MAX . ' caracteres.';
    }
    if (!preg_match('/\p{Lu}/u', $value)) {
        return 'A senha precisa ter pelo menos uma letra maiuscula.';
    }
    if (!preg_match('/\p{Ll}/u', $value)) {
        return 'A senha precisa ter pelo menos uma letra minuscula.';
    }
    if (!preg_match('/\d/', $value)) {
        return 'A senha precisa ter pelo menos um numero.';
    }
    if (!preg_match('/[^\p{L}\d]/u', $value)) {
        return 'A senha precisa ter pelo menos um simbolo, como ! @ # $.';
    }

    return null;
}

function validatePasswordConfirmation(?string $password, ?string $confirmation): ?string
{
    if ((string) $confirmation === '') {
        return 'Repita a senha para confirmar.';
    }
    if ((string) $password !== (string) $confirmation) {
        return 'As senhas nao sao iguais.';
    }

    return null;
}

function validateTermsAcceptance(mixed $accepted): ?string
{
    $isAccepted = $accepted === true || $accepted === 1 || $accepted === '1' || $accepted === 'true';

    return $isAccepted ? null : 'E preciso aceitar os termos de uso para continuar.';
}

/**
 * Valida o payload completo do cadastro.
 *
 * @return array<string,string> mapa campo => mensagem, vazio quando tudo esta ok
 */
function validateRegistrationPayload(array $payload): array
{
    $errors = [];

    $checks = [
        'firstName' => validatePersonName($payload['firstName'] ?? null, 'nome', USER_NAME_MAX),
        'lastName' => validatePersonName($payload['lastName'] ?? null, 'sobrenome', USER_LAST_NAME_MAX),
        'email' => validateEmail($payload['email'] ?? null),
        'phone' => validatePhone($payload['phone'] ?? null),
        'cpf' => validateCpf($payload['cpf'] ?? null),
        'birthDate' => validateBirthDate($payload['birthDate'] ?? null),
        'password' => validatePassword($payload['password'] ?? null),
        'passwordConfirmation' => validatePasswordConfirmation(
            $payload['password'] ?? null,
            $payload['passwordConfirmation'] ?? null
        ),
        'acceptedTerms' => validateTermsAcceptance($payload['acceptedTerms'] ?? null),
    ];

    foreach ($checks as $field => $message) {
        if ($message !== null) {
            $errors[$field] = $message;
        }
    }

    return $errors;
}
