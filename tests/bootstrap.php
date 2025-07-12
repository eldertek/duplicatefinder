<?php

define('PHPUNIT_RUN', 1);

// Chemin vers l'installation Nextcloud
$nextcloudPath = '/var/www/nextcloud';

// Vérifier si le chemin Nextcloud existe
if (!file_exists($nextcloudPath)) {
    die('Nextcloud installation not found at ' . $nextcloudPath);
}

// Charger l'environnement Nextcloud
require_once $nextcloudPath . '/lib/base.php';

// Initialiser l'application
try {
    \OC::$server->getAppManager()->enableApp('duplicatefinder');
} catch (\Exception $e) {
    echo 'Warning: Could not enable duplicatefinder app: ' . $e->getMessage() . "\n";
}

// Ajouter les namespaces de test
try {
    \OC::$composerAutoloader->addPsr4('OCA\\DuplicateFinder\\Tests\\', __DIR__, true);
} catch (\Exception $e) {
    echo 'Warning: Could not add test namespace: ' . $e->getMessage() . "\n";
    // Fallback: utiliser l'autoloader standard
    require_once __DIR__ . '/../vendor/autoload.php';
}

// Définir une classe de remplacement pour OC_Hook si nécessaire
if (!class_exists('OC_Hook')) {
    class OC_Hook
    {
        public static function clear()
        {
            // Ne rien faire
        }
    }

    // Nettoyer les hooks
    OC_Hook::clear();
}

// Définir une classe de remplacement pour OC_App si nécessaire
if (!class_exists('OC_App')) {
    class OC_App
    {
        public static function loadApp($appName)
        {
            // Ne rien faire
        }
    }
}
