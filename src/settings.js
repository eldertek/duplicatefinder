import { generateFilePath } from '@nextcloud/router'

import Vue from 'vue'
import Settings from './Settings.vue'

// eslint-disable-next-line
__webpack_public_path__ = generateFilePath(appName, '', 'js/')

Vue.mixin({ methods: { t, n } })

export default new Vue({
	el: '#app-content',
	render: h => h(Settings),
})