const stylelintConfig = require('@nextcloud/stylelint-config')

module.exports = {
	...stylelintConfig,
	rules: {
		...stylelintConfig.rules,
		'selector-pseudo-element-no-unknown': [
			true,
			{
				ignorePseudoElements: ['v-deep', 'deep', 'slotted', 'global', 'local'],
			},
		],
	},
}
