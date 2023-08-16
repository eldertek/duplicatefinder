import { generateFilePath } from '@nextcloud/router'

import { createApp } from 'vue'
import App from './App.vue'

// eslint-disable-next-line
__webpack_public_path__ = generateFilePath(appName, '', 'js/')


const app = createApp(App);
app.mount('#content');