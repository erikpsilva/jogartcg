<?php
if(PHP_SAPI!=='cli')exit;
require dirname(__DIR__).'/config/economy.php';
$v=array_map(static fn($f)=>$f[1],economyFields());
$cases=[
 [[3,0,0,3,0,0,0],[1330,1700,700,900]],
 [[3,0,3,0,0,0,0],[1450,2900,700,900]],
 [[3,0,0,0,0,0,3],[1210,1400,700,900]],
 [[3,0,0,2,1,0,0],[1370,3100,700,900]],
 [[3,0,0,2,0,1,0],[1330,1900,700,900]],
 [[0,3,0,3,0,0,0],[1180,1100,550,300]],
];
foreach($cases as [$args,$expected]){$r=economyPreview($v,...$args);$actual=[$r['com_aventura']['xp'],$r['com_aventura']['gold'],$r['sem_aventura']['xp'],$r['sem_aventura']['gold']];if($actual!==$expected)throw new RuntimeException(json_encode([$actual,$expected]));}
echo "6 cenários OK: inéditas, repetidas, derrotas, boss inicial/repetido e derrotas versus.\n";
