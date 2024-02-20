<template>
    <NcAppNavigation>
        <template #list>
            <!-- Navigation for Unacknowledged Duplicates -->
            <NcAppNavigationItem name="Unacknowledged" :allowCollapse="true" :open="true">
                <template #icon>
                    <CloseCircle :size="20" />
                </template>
                <template>
                    <DuplicateListItem v-for="duplicate in unacknowledgedDuplicates" :key="duplicate.id"
                        :duplicate="duplicate" :isActive="currentDuplicateId === duplicate.id"
                        @duplicate-selected="openDuplicate" />
                </template>
            </NcAppNavigationItem>
            <!-- Navigation for Acknowledged Duplicates -->
            <NcAppNavigationItem name="Acknowledged" :allowCollapse="true" :open="true">
                <template #icon>
                    <CheckCircle :size="20" />
                </template>
                <template>
                    <DuplicateListItem v-for="duplicate in acknowledgedDuplicates" :key="duplicate.id"
                        :duplicate="duplicate" :isActive="currentDuplicateId === duplicate.id"
                        @duplicate-selected="openDuplicate" />
                </template>
            </NcAppNavigationItem>
        </template>
    </NcAppNavigation>
</template>

<script>
import { NcAppNavigation, NcAppNavigationItem } from '@nextcloud/vue';
import DuplicateListItem from './DuplicateListItem.vue';
import CloseCircle from 'vue-material-design-icons/CloseCircle';
import CheckCircle from 'vue-material-design-icons/CheckCircle';

export default {
    components: { DuplicateListItem, NcAppNavigation, NcAppNavigationItem, CheckCircle, CloseCircle },
    props: ['acknowledgedDuplicates', 'unacknowledgedDuplicates', 'currentDuplicateId'],
    methods: {
        openDuplicate(duplicate) {
            this.$emit('open-duplicate', duplicate);
        }
    }
};
</script>