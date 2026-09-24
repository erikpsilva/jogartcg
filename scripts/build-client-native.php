<?php
declare(strict_types=1);
// Compile the legacy TS browser client with the native Go executable, never Node.
// Existing CSS remains intact; new mobile styles are a separate plain-CSS asset.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$root = dirname(__DIR__);
chdir($root);
$binary = $root . '/node_modules/@esbuild/win32-x64/esbuild.exe';
if (!is_file($binary)) throw new RuntimeException('Native esbuild executable not found.');
$command = [$binary, 'apps/game-client/src/main.tsx', '--bundle', '--format=esm', '--platform=browser',
    '--target=es2022', '--jsx=automatic', '--minify', '--loader:.less=empty', '--loader:.css=empty',
    '--loader:.png=dataurl', '--loader:.svg=dataurl', '--loader:.webp=dataurl',
    '--define:process.env.NODE_ENV="production"', '--define:import.meta.env={}',
    '--alias:@jogartcg/game-core=./packages/game-core/src/index.ts',
    '--alias:virtual:pwa-register=./apps/game-client/src/pwa/native-register.ts',
    '--outfile=client/assets/index-mobile-ink-v1.js'];
$process = proc_open($command, [STDIN, STDOUT, STDERR], $pipes, $root, null, ['bypass_shell' => true]);
if (!is_resource($process)) throw new RuntimeException('Could not start native compiler.');
$status = proc_close($process);
if ($status !== 0) exit($status);
$command[1] = 'apps/game-client/src/native-header.tsx';
$command[count($command) - 1] = '--outfile=client/assets/shared-header-v1.js';
$process = proc_open($command, [STDIN, STDOUT, STDERR], $pipes, $root, null, ['bypass_shell' => true]);
if (!is_resource($process)) throw new RuntimeException('Could not compile shared header.');
exit(proc_close($process));
