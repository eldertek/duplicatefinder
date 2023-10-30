<?php
 return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        ['name' => 'duplicate_api#list', 'url' => '/api/duplicates/{type}', 'verb' => 'GET'],
        ['name' => 'duplicate_api#acknowledge', 'url' => '/api/duplicates/acknowledge/{hash}', 'verb' => 'POST'],
        ['name' => 'duplicate_api#unacknowledge', 'url' => '/api/duplicates/unacknowledge/{hash}', 'verb' => 'POST'],
        ['name' => 'settings_api#list', 'url' => '/api/settings', 'verb' => 'GET'],
        ['name' => 'settings_api#save', 'url' => '/api/settings/{key}/{value}', 'verb' => 'POST'],
    ],
];