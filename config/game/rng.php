<?php

declare(strict_types=1);

/**
 * Sorteio do motor de regras (porte fiel do mulberry32 usado em packages/game-core).
 *
 * O PHP trabalha com inteiros de 64 bits e o JavaScript com 32 bits, entao toda
 * operacao e mascarada em 32 bits sem sinal. A mesma semente precisa produzir
 * exatamente a mesma sequencia nos dois motores, senao as partidas divergem:
 * tests/game/rng_equivalence_test.php compara as duas implementacoes.
 */

const GAME_UINT32 = 0xFFFFFFFF;

/** Multiplicacao de 32 bits com truncamento, equivalente a Math.imul do JavaScript. */
function gameImul(int $a, int $b): int
{
    $a &= GAME_UINT32;
    $b &= GAME_UINT32;
    $aLow = $a & 0xFFFF;
    $bLow = $b & 0xFFFF;
    $high = ((($a >> 16) & 0xFFFF) * $bLow + $aLow * (($b >> 16) & 0xFFFF)) & 0xFFFF;
    return (($aLow * $bLow) + ($high << 16)) & GAME_UINT32;
}

/**
 * Proximo numero entre 0 (inclusive) e 1 (exclusivo), avancando a semente no estado.
 * Recebe o estado por referencia porque a semente faz parte da partida salva.
 */
function gameRandom(array &$state): float
{
    $state['rng'] = ($state['rng'] + 0x6d2b79f5) & GAME_UINT32;
    $value = $state['rng'];
    $value = gameImul($value ^ ($value >> 15), $value | 1);
    $value ^= ($value + gameImul($value ^ ($value >> 7), $value | 61)) & GAME_UINT32;
    $value &= GAME_UINT32;
    return (($value ^ ($value >> 14)) & GAME_UINT32) / 4294967296;
}

/** Embaralhamento de Fisher-Yates, na mesma ordem do motor em JavaScript. */
function gameShuffle(array &$state, array &$cards): void
{
    for ($i = count($cards) - 1; $i > 0; $i--) {
        $j = (int) floor(gameRandom($state) * ($i + 1));
        [$cards[$i], $cards[$j]] = [$cards[$j], $cards[$i]];
    }
}
