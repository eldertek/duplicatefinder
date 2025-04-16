#!/bin/bash

# Script pour exécuter les tests dans l'environnement de développement

# Vérifier si le script est exécuté en tant que root
if [ "$EUID" -ne 0 ]; then
  echo "Ce script doit être exécuté en tant que root (utilisez sudo)"
  exit 1
fi

# Démarrer les services nécessaires
echo "Démarrage de MariaDB..."
service mariadb start
if [ $? -ne 0 ]; then
  echo "Erreur lors du démarrage de MariaDB"
  exit 1
fi

echo "Démarrage d'Apache..."
service apache2 start
if [ $? -ne 0 ]; then
  echo "Erreur lors du démarrage d'Apache"
  exit 1
fi

# Vérifier que Nextcloud est accessible
if [ ! -d "/var/www/nextcloud" ]; then
  echo "Nextcloud n'est pas installé dans /var/www/nextcloud"
  exit 1
fi

echo "Vérification de l'application duplicatefinder..."
cd /var/www/nextcloud
sudo -u www-data php occ app:list | grep duplicatefinder
if [ $? -ne 0 ]; then
  echo "L'application duplicatefinder n'est pas activée dans Nextcloud"
  echo "Activation de l'application..."
  sudo -u www-data php occ app:enable duplicatefinder
fi

# Retourner au répertoire du projet
cd /workspaces/duplicatefinder

# Exécuter les tests
echo "Exécution des tests..."
if [ -z "$1" ]; then
  # Si aucun argument n'est fourni, exécuter tous les tests
  vendor/bin/phpunit
else
  # Sinon, exécuter les tests spécifiés
  vendor/bin/phpunit "$@"
fi

exit $?
