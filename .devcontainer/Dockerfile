# Utiliser une image de base Ubuntu
FROM ubuntu:24.04

# Mettre à jour les paquets et installer les dépendances nécessaires
RUN apt-get update && apt-get install -y \
    sudo \
    apache2 \
    libapache2-mod-php \
    mariadb-server \
    php \
    php-mysql \
    php-xml \
    php-mbstring \
    php-curl \
    php-zip \
    php-gd \
    php-intl \
    php-bcmath \
    php-gmp \
    wget \
    make \
    unzip \
    git \
    composer \
    npm \
    && apt-get clean

# Supprimer les fichiers de configuration Apache par défaut
RUN rm /etc/apache2/sites-enabled/000-default.conf /etc/apache2/sites-available/000-default.conf

# Démarrer le service MariaDB et créer la base de données
RUN service mariadb start \
    && sudo mysql -e "CREATE DATABASE nextcloud;" \
    && sudo mysql -e "CREATE USER 'nextclouduser'@'localhost' IDENTIFIED BY 'nextcloudpassword';" \
    && sudo mysql -e "GRANT ALL PRIVILEGES ON nextcloud.* TO 'nextclouduser'@'localhost';" \
    && sudo mysql -e "FLUSH PRIVILEGES;"

# Télécharger et installer Nextcloud
RUN wget https://download.nextcloud.com/server/releases/nextcloud-31.0.3.zip -O /tmp/nextcloud.zip \
    && unzip /tmp/nextcloud.zip -d /var/www/ \
    && sudo chown -R www-data:www-data /var/www/nextcloud

# Créer un lien symbolique pour duplicatefinder
RUN ln -s /workspaces/duplicatefinder /var/www/nextcloud/apps/duplicatefinder

# Configurer Nextcloud avec un utilisateur admin
RUN sudo service mariadb start \
    && cd /var/www/nextcloud \
    && sudo -u www-data php occ maintenance:install --database "mysql" --database-name "nextcloud" --database-user "nextclouduser" --database-pass "nextcloudpassword" --admin-user "admin" --admin-pass "admin"

# Configurer Apache pour Nextcloud
COPY nextcloud.conf /etc/apache2/sites-available/nextcloud.conf
RUN a2ensite nextcloud.conf && a2enmod rewrite headers env dir mime

# Définir la directive ServerName globalement pour supprimer l'avertissement
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Exposer le port 80
EXPOSE 80

# Démarrer Apache en premier plan
CMD ["apache2ctl", "-D", "FOREGROUND"]
