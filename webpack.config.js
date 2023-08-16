const webpackConfig = require('@nextcloud/webpack-vue-config');

webpackConfig.entry = {
    ...webpackConfig.entry, 
    'main': './src/main.js',
    'settings': './src/settings.js'
};

module.exports = webpackConfig;