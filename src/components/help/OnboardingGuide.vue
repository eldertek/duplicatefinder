<template>
  <div class="onboarding-guide">
    <div class="onboarding-content">
      <component :is="currentStepComponent" @next="nextStep" @previous="previousStep" />
    </div>

    <!-- Navigation -->
    <div class="navigation-container">
      <!-- Progress -->
      <div class="progress-section">
        <NcProgressBar
          :value="((currentStep + 1) / totalSteps) * 100"
          size="medium"
          class="progress-bar" />
        <span class="step-counter">
          {{ t('duplicatefinder', 'Step {step} of {total}', { step: currentStep + 1, total: totalSteps }) }}
        </span>
      </div>

      <!-- Buttons -->
      <div class="button-section">
        <NcButton v-if="currentStep > 0"
          type="tertiary"
          @click="previousStep"
          class="nav-button">
          <template #icon>
            <ChevronLeft :size="20" />
          </template>
          {{ t('duplicatefinder', 'Previous') }}
        </NcButton>

        <NcButton
          type="primary"
          @click="currentStep === totalSteps - 1 ? closeGuide() : nextStep()"
          class="nav-button">
          {{ currentStep === totalSteps - 1 ? t('duplicatefinder', 'Get Started') : t('duplicatefinder', 'Next') }}
          <template #icon>
            <component :is="currentStep === totalSteps - 1 ? 'Check' : 'ChevronRight'" :size="20" />
          </template>
        </NcButton>
      </div>
    </div>
  </div>
</template>

<script>
import { NcButton, NcProgressBar } from '@nextcloud/vue'
import ChevronLeft from 'vue-material-design-icons/ChevronLeft'
import ChevronRight from 'vue-material-design-icons/ChevronRight'
import Check from 'vue-material-design-icons/Check'

// Import step components
import WelcomeStep from './steps/WelcomeStep.vue'
import FindingDuplicatesStep from './steps/FindingDuplicatesStep.vue'
import ScanningStep from './steps/ScanningStep.vue'
import ManagingDuplicatesStep from './steps/ManagingDuplicatesStep.vue'
import OriginFoldersStep from './steps/OriginFoldersStep.vue'
import ExcludedFoldersStep from './steps/ExcludedFoldersStep.vue'
import FinalStep from './steps/FinalStep.vue'

export default {
  name: 'OnboardingGuide',
  components: {
    NcButton,
    NcProgressBar,
    ChevronLeft,
    ChevronRight,
    Check,
    WelcomeStep,
    FindingDuplicatesStep,
    ScanningStep,
    ManagingDuplicatesStep,
    OriginFoldersStep,
    ExcludedFoldersStep,
    FinalStep
  },
  props: {
    show: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      currentStep: 0,
      steps: [
        'WelcomeStep',
        'FindingDuplicatesStep',
        'ScanningStep',
        'ManagingDuplicatesStep',
        'OriginFoldersStep',
        'ExcludedFoldersStep',
        'FinalStep'
      ]
    }
  },
  computed: {
    totalSteps() {
      return this.steps.length
    },
    currentStepComponent() {
      return this.steps[this.currentStep]
    }
  },
  methods: {
    nextStep() {
      if (this.currentStep < this.totalSteps - 1) {
        this.currentStep++
      }
    },
    previousStep() {
      if (this.currentStep > 0) {
        this.currentStep--
      }
    },
    closeGuide() {
      this.$emit('close')
    }
  }
}
</script>

<style scoped>
.onboarding-guide {
  display: flex;
  flex-direction: column;
  min-height: 500px;
  max-width: 900px;
  margin: 0 auto;
  background-color: var(--color-main-background);
  border-radius: var(--border-radius-large);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
}

.onboarding-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  border-radius: var(--border-radius-large) var(--border-radius-large) 0 0;
  overflow: hidden;
}

/* Navigation */
.navigation-container {
  padding: 32px 40px;
  border-top: 1px solid var(--color-border);
  background: var(--color-main-background);
  border-radius: 0 0 var(--border-radius-large) var(--border-radius-large);
}

.progress-section {
  margin-bottom: 24px;
}

.progress-bar {
  margin-bottom: 12px;
  height: 6px;
}

.step-counter {
  display: block;
  text-align: center;
  color: var(--color-text-maxcontrast);
  font-size: 14px;
  margin-top: 8px;
}

.button-section {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.nav-button {
  min-width: 140px;
  font-weight: bold;
}

:deep(.step-container) {
  border-radius: var(--border-radius-large) var(--border-radius-large) 0 0;
  overflow: hidden;
}
</style> 