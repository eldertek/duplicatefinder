import { generateFilePath } from '@nextcloud/router'

import { createApp } from 'vue'
import Settings from './Settings.vue'

// eslint-disable-next-line
__webpack_public_path__ = generateFilePath(appName, '', 'js/')


const app = createApp(Settings);
app.mount('#content');