<?php

define('PHPUNIT_RUN', 1);

// Utiliser l'environnement Nextcloud existant
require_once '/var/www/nextcloud/lib/base.php';

// Ajouter les namespaces de test
\OC::$composerAutoloader->addPsr4('OCA\\DuplicateFinder\\Tests\\', __DIR__, true);
\OC::$composerAutoloader->addPsr4('Tests\\', '/var/www/nextcloud/tests/', true);

// Charger l'application
\OC_App::loadApp('duplicatefinder');

// Nettoyer les hooks
OC_Hook::clear();

