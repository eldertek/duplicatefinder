const path = require('path')
const webpack = require('webpack')

const { VueLoaderPlugin } = require('vue-loader')
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')

const appName = process.env.npm_package_name
const appVersion = process.env.npm_package_version
const buildMode = process.env.NODE_ENV
const isDev = buildMode === 'development'
console.info('Building', appName, appVersion, '\n')

const rules = require('./webpack.rules')

module.exports = {
	target: 'web',
	mode: buildMode,
	devtool: isDev ? 'cheap-source-map' : 'source-map',

	entry: {
		main: path.resolve(path.join('src', 'main.js')),
		settings: path.resolve(path.join('src', 'settings.js')),
	},
	output: {
		path: path.resolve('./js'),
		publicPath: path.join('/apps/', appName, '/js/'),

		// Output file names
		filename: `${appName}-[name].js?v=[contenthash]`,
		chunkFilename: `${appName}-[name].js?v=[contenthash]`,

		// Clean output before each build
		clean: true,

		// Make sure sourcemaps have a proper path and do not
		// leak local paths https://github.com/webpack/webpack/issues/3603
		devtoolNamespace: appName,
		devtoolModuleFilenameTemplate(info) {
			const rootDir = process.cwd()
			const rel = path.relative(rootDir, info.absoluteResourcePath)
			return `webpack:///${appName}/${rel}`
		},
	},

	devServer: {
		hot: true,
		host: '127.0.0.1',
		port: 3000,
		client: {
			overlay: false,
		},
		devMiddleware: {
			writeToDisk: true,
		},
		headers: {
			'Access-Control-Allow-Origin': '*',
		},
	},

	optimization: {
		chunkIds: 'named',
		splitChunks: {
			automaticNameDelimiter: '-',
		},
		minimize: !isDev,
		minimizer: [
			new TerserPlugin({
				terserOptions: {
					output: {
						comments: false,
					}
				},
				extractComments: true,
			}),
		],
	},

	module: {
		rules: Object.values(rules),
	},

	plugins: [
		new VueLoaderPlugin(),

		// Make sure we auto-inject node polyfills on demand
		// https://webpack.js.org/blog/2020-10-10-webpack-5-release/#automatic-nodejs-polyfills-removed
		new NodePolyfillPlugin({
			// Console is available in the web-browser
			excludeAliases: ['console'],
		}),

		// Make appName & appVersion available as a constant
		new webpack.DefinePlugin({ appName: JSON.stringify(appName) }),
		new webpack.DefinePlugin({ appVersion: JSON.stringify(appVersion) }),
	],

	resolve: {
		extensions: ['*', '.ts', '.js', '.vue'],
		symlinks: false,
		// Ensure npm does not duplicate vue dependency, and that npm link works for vue 3
		// See https://github.com/vuejs/core/issues/1503
		// See https://github.com/nextcloud/nextcloud-vue/issues/3281
		alias: {
			'vue$': path.resolve('./node_modules/vue')
		},
	},
}