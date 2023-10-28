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
        ['name' => 'duplicate_api#list', 'url' => '/api/duplicates', 'verb' => 'GET'],
        ['name' => 'duplicate_api#listAcknowledged', 'url' => '/api/duplicates/acknowledged', 'verb' => 'GET'],
        ['name' => 'duplicate_api#acknowledge', 'url' => '/api/duplicates/acknowledge/{hash}', 'verb' => 'POST'],
        ['name' => 'duplicate_api#unacknowledge', 'url' => '/api/duplicates/unacknowledge/{hash}', 'verb' => 'POST'],
        ['name' => 'settings_api#list', 'url' => '/api/settings', 'verb' => 'GET'],
        ['name' => 'settings_api#save', 'url' => '/api/settings/{key}/{value}', 'verb' => 'POST'],
        ['name' => 'filter_api#list', 'url' => '/api/filters', 'verb' => 'GET'],
        ['name' => 'filter_api#save', 'url' => '/api/filters', 'verb' => 'PUT'],
    ],
];