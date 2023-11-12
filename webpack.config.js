const webpackConfig = require('@nextcloud/webpack-vue-config');

webpackConfig.entry = {
    'main': './src/main.js',
    'settings': './src/settings.js'
};

webpackConfig.devtool = false;

module.exports = webpackConfig;