import { generateFilePath } from '@nextcloud/router'

import Vue from 'vue'
import Settings from './Settings.vue'

// eslint-disable-next-line
__webpack_public_path__ = generateFilePath(appName, '', 'js/')

Vue.mixin({ methods: { t, n } })

// Mount on our own element, printed by templates/Settings.php. Recent Nextcloud versions (34 and 35
// checked) render the admin settings page with a Vue shell that no longer provides #app-content.
export default new Vue({
	el: '#duplicatefinder-admin-settings',
	render: h => h(Settings),
})