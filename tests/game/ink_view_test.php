<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/config/game/match.php';
$card = gameHiddenCard();
$card['id'] = $card['rules']['sourceId'] = 101;
$card['name'] = 'Private ink fixture';
$card['inkwell'] = true;
$state = gameCreate(['player' => array_fill(0, 12, $card), 'bot' => array_fill(0, 12, $card)], 42);
foreach (GAME_PLAYERS as $owner) {
    $state['players'][$owner]['inkwell'] = array_splice($state['players'][$owner]['hand'], 0, 2);
    $state['players'][$owner]['inkwell'][0]['exerted'] = true;
}
$before = serialize($state);
$checks = 0;
$check = static function (bool $ok, string $label) use (&$checks): void {
    if (!$ok) throw new RuntimeException($label);
    $checks++;
};
foreach ([1, 2] as $seat) {
    $owner = gameSeatPlayer($seat);
    $view = gameViewForSeat($state, $seat, ['opponent' => 'Opponent'])['state']['players'];
    $check(count($view['player']['inkwell']) === 2, 'Own ink count');
    $check($view['player']['inkwell'][0]['card']['id'] === 101, 'Owner sees card details');
    $check($view['player']['inkwell'][0]['iid'] === $state['players'][$owner]['inkwell'][0]['iid'], 'Correct seat orientation');
    $check($view['player']['inkwell'][0]['exerted'] && !$view['player']['inkwell'][1]['exerted'], 'Available/used state preserved');
    $check($view['bot']['inkwell'][0]['card']['id'] === 0 && $view['bot']['inkwell'][0]['card']['name'] === '', 'Opponent ink remains private');
    $check($view['bot']['hand'][0]['card']['id'] === 0, 'Opponent hand remains private');
    $check($view['player']['deck'][0]['card']['id'] === 0 && $view['bot']['deck'][0]['card']['id'] === 0, 'Both deck orders remain private');
}
$check(serialize($state) === $before, 'Inspection does not mutate authoritative state');
echo "PASS: {$checks} ink visibility checks; both seats.\n";
