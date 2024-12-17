<?php
 return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        ['name' => 'duplicate_api#list', 'url' => '/api/duplicates/{type}', 'verb' => 'GET', 'requirements' => ['page' => '\d+', 'limit' => '\d+']],
        ['name' => 'duplicate_api#acknowledge', 'url' => '/api/duplicates/acknowledge/{hash}', 'verb' => 'POST'],
        ['name' => 'duplicate_api#unacknowledge', 'url' => '/api/duplicates/unacknowledge/{hash}', 'verb' => 'POST'],
        ['name' => 'duplicate_api#find', 'url' => '/api/duplicates/find', 'verb' => 'POST'],
        ['name' => 'duplicate_api#clear', 'url' => '/api/duplicates/clear', 'verb' => 'POST'],
        ['name' => 'settings_api#list', 'url' => '/api/settings', 'verb' => 'GET'],
        ['name' => 'settings_api#save', 'url' => '/api/settings/{key}/{value}', 'verb' => 'POST'],
        ['name' => 'origin_folder_api#index', 'url' => '/api/origin-folders', 'verb' => 'GET'],
        ['name' => 'origin_folder_api#create', 'url' => '/api/origin-folders', 'verb' => 'POST'],
        ['name' => 'origin_folder_api#destroy', 'url' => '/api/origin-folders/{id}', 'verb' => 'DELETE'],
        ['name' => 'file_api#delete', 'url' => '/api/files/delete', 'verb' => 'POST'],
    ],
];