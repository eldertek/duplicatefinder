<?php
/**
 * Create your routes in here. The name is the lowercase name of the controller
 * without the controller part, the stuff after the hash is the method.
 * e.g. page#index -> OCA\DuplicateFinder\Controller\PageController->index()
 *
 * The controller class has to be registered in the application.php file since
 * it's instantiated in there
 */
return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],
        ['name' => 'duplicate_api#list', 'url' => '/api/{apiVersion}/duplicates', 'verb' => 'GET', 'requirements' => ['apiVersion' => 'v1']],
        ['name' => 'duplicate_api#delete', 'url' => '/api/{apiVersion}/duplicates/{id}', 'verb' => 'DELETE', 'requirements' => ['apiVersion' => 'v1', 'id' => '\d+']],
        ['name' => 'settings_api#list', 'url' => '/api/{apiVersion}/settings', 'verb' => 'GET', 'requirements' => ['apiVersion' => 'v1']],
        ['name' => 'settings_api#save', 'url' => '/api/{apiVersion}/settings', 'verb' => 'PATCH', 'requirements' => ['apiVersion' => 'v1']],
        ['name' => 'filter_api#list', 'url' => '/api/{apiVersion}/filters', 'verb' => 'GET', 'requirements' => ['apiVersion' => 'v1']],
        ['name' => 'filter_api#save', 'url' => '/api/{apiVersion}/filters', 'verb' => 'PUT', 'requirements' => ['apiVersion' => 'v1']],
    ]
];
