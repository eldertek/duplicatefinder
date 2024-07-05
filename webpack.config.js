const webpackConfig = require('@nextcloud/webpack-vue-config');
const path = require('path');

webpackConfig.entry = {
    'main': './src/main.js',
    'settings': './src/settings.js'
};

webpackConfig.devtool = false;

module.exports = webpackConfig;

webpackConfig.resolve.alias = {
    '@': path.resolve(__dirname, 'src')
};
