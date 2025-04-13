# Tests pour DuplicateFinder

Ce dossier contient les tests pour l'application DuplicateFinder.

## Structure

- `Unit/` : Tests unitaires
  - `Service/` : Tests pour les services
  - `BackgroundJob/` : Tests pour les tâches d'arrière-plan
- `Integration/` : Tests d'intégration

## Exécution des tests

Vous pouvez exécuter les tests en utilisant les commandes suivantes:

```bash
# Exécuter tous les tests
composer test

# Exécuter uniquement les tests unitaires
composer test:unit

# Exécuter uniquement les tests d'intégration
composer test:integration
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
