<?php
// Local QA only. Not included in any release allowlist.
if (PHP_SAPI!=='cli-server') {http_response_code(404);exit;}
$path=rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH));
if (!str_starts_with($path,'/__qa/')) return false;
if ($path==='/__qa/form/request.php') {require __DIR__.'/../.qa-preview/private-test/bootstrap.php';exit;}
$root=realpath(__DIR__.'/../.qa-preview');$file=realpath($root.'/'.substr($path,6));
if (!$file || !str_starts_with($file,$root.'/') || !is_file($file)) {http_response_code(404);exit;}
$types=['html'=>'text/html; charset=utf-8','css'=>'text/css','js'=>'text/javascript','webp'=>'image/webp','svg'=>'image/svg+xml','mp4'=>'video/mp4'];
$type=$types[pathinfo($file,PATHINFO_EXTENSION)]??null;
if (!$type) {http_response_code(404);exit;}
header('Content-Type: '.$type);header('Cache-Control: no-store');readfile($file);exit;
