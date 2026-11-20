FROM nextcloud:35.0.3-apache

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
