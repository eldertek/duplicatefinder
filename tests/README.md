# Tests pour DuplicateFinder

Ce dossier contient les tests pour l'application DuplicateFinder. Les tests sont organisés en deux catégories principales :

1. **Tests unitaires** : Testent des composants individuels de l'application de manière isolée.
2. **Tests d'intégration** : Testent l'interaction entre plusieurs composants et avec l'environnement Nextcloud.

## Structure des tests

```
tests/
├── Unit/                  # Tests unitaires
│   ├── Command/           # Tests pour les commandes CLI
│   ├── Controller/        # Tests pour les contrôleurs
│   ├── Db/                # Tests pour les modèles de données
│   ├── Service/           # Tests pour les services
│   └── BackgroundJob/     # Tests pour les tâches d'arrière-plan
├── Integration/           # Tests d'intégration
│   ├── CompleteWorkflowTest.php    # Test du flux de travail complet
│   └── FileCreationScenarioTest.php # Test de création de fichiers et détection de doublons
├── bootstrap.php          # Script d'initialisation pour les tests
├── run-tests.sh           # Script pour exécuter les tests
└── TestHelper.php         # Classe d'aide pour les tests
```

## Prérequis pour les tests

Pour exécuter les tests, vous avez besoin de :

1. Une installation fonctionnelle de Nextcloud
2. Une base de données MySQL/MariaDB
3. L'application DuplicateFinder installée et activée dans Nextcloud

## Exécution des tests

### Utilisation du script d'aide

Le moyen le plus simple d'exécuter les tests est d'utiliser le script `run-tests.sh` :

```bash
# Exécuter tous les tests
sudo ./tests/run-tests.sh

# Exécuter uniquement les tests unitaires
sudo ./tests/run-tests.sh --testsuite unit

# Exécuter uniquement les tests d'intégration
sudo ./tests/run-tests.sh --testsuite integration

# Exécuter un fichier de test spécifique
sudo ./tests/run-tests.sh tests/Integration/CompleteWorkflowTest.php
```

### Exécution manuelle

Si vous préférez exécuter les tests manuellement, assurez-vous que les services nécessaires sont démarrés :

```bash
# Démarrer MariaDB
service mariadb start

# Démarrer Apache
service apache2 start

# Exécuter les tests
vendor/bin/phpunit
```

Vous pouvez également utiliser les commandes Composer configurées :

```bash
# Exécuter tous les tests
composer test

# Exécuter uniquement les tests unitaires
composer test:unit

# Exécuter uniquement les tests d'intégration
composer test:integration
```

## Écriture de nouveaux tests

### Tests unitaires

Les tests unitaires doivent être placés dans le répertoire `tests/Unit/` et suivre la même structure que le code qu'ils testent. Par exemple, un test pour `lib/Service/FileInfoService.php` devrait être placé dans `tests/Unit/Service/FileInfoServiceTest.php`.

Exemple de test unitaire :

```php
<?php
namespace OCA\DuplicateFinder\Tests\Unit\Service;

use PHPUnit\Framework\TestCase;
use OCA\DuplicateFinder\Service\FileInfoService;

class FileInfoServiceTest extends TestCase
{
    public function testSomeMethod()
    {
        // Créer des mocks pour les dépendances
        $mockDependency = $this->createMock(SomeDependency::class);

        // Créer l'instance à tester
        $service = new FileInfoService($mockDependency);

        // Exécuter la méthode à tester
        $result = $service->someMethod();

        // Vérifier le résultat
        $this->assertEquals('expected result', $result);
    }
}
```

### Tests d'intégration

Les tests d'intégration doivent être placés dans le répertoire `tests/Integration/`. Ces tests interagissent avec l'environnement Nextcloud et peuvent créer des utilisateurs, des fichiers, etc.

Exemple de test d'intégration :

```php
<?php
namespace OCA\DuplicateFinder\Tests\Integration;

use PHPUnit\Framework\TestCase;
use OCP\Files\IRootFolder;
use OCA\DuplicateFinder\Tests\TestHelper;

class SomeIntegrationTest extends TestCase
{
    /** @var TestHelper */
    private $testHelper;

    protected function setUp(): void
    {
        parent::setUp();

        // Initialiser les services depuis le conteneur Nextcloud
        $this->testHelper = new TestHelper(
            \OC::$server->get(\OCP\IUserManager::class),
            \OC::$server->get(IRootFolder::class),
            \OC::$server->get(\OCP\IDBConnection::class),
            \OC::$server->get(\Psr\Log\LoggerInterface::class)
        );

        // Créer un utilisateur de test
        $this->testHelper->createTestUser('testuser');
    }

    public function testSomeIntegrationScenario()
    {
        // Créer un fichier de test
        $file = $this->testHelper->createFile('testuser', 'test.txt', 'Test content');

        // Exécuter le code à tester
        // ...

        // Vérifier le résultat
        $this->assertTrue(true);
    }

    protected function tearDown(): void
    {
        // Nettoyer après le test
        $this->testHelper->cleanupDatabase(['duplicatefinder_file_info', 'duplicatefinder_file_duplicate']);

        parent::tearDown();
    }
}
```

## Dépannage

### Les tests d'intégration échouent

Si les tests d'intégration échouent, vérifiez que :

1. MariaDB est en cours d'exécution : `service mariadb status`
2. Apache est en cours d'exécution : `service apache2 status`
3. Nextcloud est correctement installé dans `/var/www/nextcloud`
4. L'application DuplicateFinder est activée : `cd /var/www/nextcloud && sudo -u www-data php occ app:list | grep duplicatefinder`

### Erreurs de base de données

Si vous rencontrez des erreurs de base de données, vous pouvez essayer de réinitialiser les tables de l'application :

```sql
TRUNCATE TABLE oc_duplicatefinder_file_info;
TRUNCATE TABLE oc_duplicatefinder_file_duplicate;
TRUNCATE TABLE oc_duplicatefinder_project;
TRUNCATE TABLE oc_duplicatefinder_project_folder;
```

## Tests spécifiques pour le contexte utilisateur manquant

Les tests suivants vérifient spécifiquement le comportement de l'application lorsque le contexte utilisateur est manquant:

1. `ExcludedFolderServiceTest` - Teste le comportement de `ExcludedFolderService` lorsque le contexte utilisateur est manquant
2. `FilterServiceTest` - Teste le comportement de `FilterService` lorsque le contexte utilisateur est manquant
3. `CleanUpDBTest` - Teste le comportement de la tâche d'arrière-plan `CleanUpDB` lorsque le contexte utilisateur est manquant
4. `FileInfoServiceTest` - Teste le comportement de `FileInfoService` lorsque le contexte utilisateur est manquant

Ces tests vérifient que:
- Les services gèrent correctement l'absence de contexte utilisateur
- Les services définissent correctement le contexte utilisateur lorsqu'il est disponible
- Les exceptions sont correctement gérées
- Les tâches d'arrière-plan peuvent fonctionner même lorsque certains fichiers n'ont pas de propriétaire
