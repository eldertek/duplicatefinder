<?php
 return [
    'routes' => [
        // Page routes
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],

        // Filter routes
        ['name' => 'filter#index', 'url' => '/api/filters', 'verb' => 'GET'],
        ['name' => 'filter#create', 'url' => '/api/filters', 'verb' => 'POST'],
        ['name' => 'filter#destroy', 'url' => '/api/filters/{id}', 'verb' => 'DELETE'],

        // Duplicate routes
        ['name' => 'duplicate_api#find', 'url' => '/api/duplicates/find', 'verb' => 'POST'],
        ['name' => 'duplicate_api#clear', 'url' => '/api/duplicates/clear', 'verb' => 'POST'],
        ['name' => 'duplicate_api#list', 'url' => '/api/duplicates/{type}', 'verb' => 'GET', 'requirements' => ['page' => '\d+', 'limit' => '\d+', 'onlyNonProtected' => 'true|false']],
        ['name' => 'duplicate_api#acknowledge', 'url' => '/api/duplicates/acknowledge/{hash}', 'verb' => 'POST'],
        ['name' => 'duplicate_api#unacknowledge', 'url' => '/api/duplicates/unacknowledge/{hash}', 'verb' => 'POST'],

        // Settings routes
        ['name' => 'settings_api#list', 'url' => '/api/settings', 'verb' => 'GET'],
        ['name' => 'settings_api#save', 'url' => '/api/settings/{key}/{value}', 'verb' => 'POST'],

        // Origin folder routes
        ['name' => 'origin_folder_api#index', 'url' => '/api/origin-folders', 'verb' => 'GET'],
        ['name' => 'origin_folder_api#create', 'url' => '/api/origin-folders', 'verb' => 'POST'],
        ['name' => 'origin_folder_api#destroy', 'url' => '/api/origin-folders/{id}', 'verb' => 'DELETE'],

        // File routes
        ['name' => 'file_api#delete', 'url' => '/api/files/delete', 'verb' => 'POST'],

        // Excluded folder routes
        ['name' => 'excluded_folder#index', 'url' => '/api/excluded-folders', 'verb' => 'GET'],
        ['name' => 'excluded_folder#create', 'url' => '/api/excluded-folders', 'verb' => 'POST'],
        ['name' => 'excluded_folder#destroy', 'url' => '/api/excluded-folders/{id}', 'verb' => 'DELETE'],

        // Project routes
        ['name' => 'project_api#index', 'url' => '/api/projects', 'verb' => 'GET'],
        ['name' => 'project_api#show', 'url' => '/api/projects/{id}', 'verb' => 'GET'],
        ['name' => 'project_api#create', 'url' => '/api/projects', 'verb' => 'POST'],
        ['name' => 'project_api#update', 'url' => '/api/projects/{id}', 'verb' => 'PUT'],
        ['name' => 'project_api#destroy', 'url' => '/api/projects/{id}', 'verb' => 'DELETE'],
        ['name' => 'project_api#scan', 'url' => '/api/projects/{id}/scan', 'verb' => 'POST'],
        ['name' => 'project_api#duplicates', 'url' => '/api/projects/{id}/duplicates/{type}', 'verb' => 'GET', 'defaults' => ['type' => 'all']],
    ],
];