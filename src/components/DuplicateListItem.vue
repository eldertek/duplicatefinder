<template>
    <NcAppNavigationItem :name="getDisplayName" :class="{ 'is-active': isActive }" @click="handleClick">
        <template #icon>
            <div class="nav-thumbnail" :style="{ backgroundImage: 'url(' + getPreviewImage(duplicate.files[0]) + ')' }">
            </div>
        </template>
        <template #extra>
            <div class="file-size">{{ getFormattedSize }}</div>
        </template>
    </NcAppNavigationItem>
</template>

<script>
import { NcAppNavigationItem } from '@nextcloud/vue';
import { getFormattedSizeOfCurrentDuplicate } from '@/tools/utils';

export default {
    components: { NcAppNavigationItem },
    props: {
        duplicate: Object,
        isActive: Boolean
    },
    computed: {
        getDisplayName() {
            // Get all filenames from the duplicate files
            const filenames = this.duplicate.files.map(file => {
                const pathParts = file.path.split('/');
                return pathParts[pathParts.length - 1];
            });

            // Check if all filenames are the same
            const allSameFilename = filenames.every(name => name === filenames[0]);

            // If all files have the same name, return that name
            // Otherwise return a shortened version of the hash
            return allSameFilename ? filenames[0] : this.duplicate.hash.substring(0, 8);
        },
        getFormattedSize() {
            return getFormattedSizeOfCurrentDuplicate(this.duplicate);
        }
    },
    methods: {
        handleClick() {
            this.$emit('duplicate-selected', this.duplicate);
        },
        getPreviewImage(item) {
            // Function to normalize the item path
            const normalizeItemPath = (path) => {
                const match = path.match(/\/([^/]*)\/files(\/.*)/);
                return match ? match[2] : ''; // Return the normalized path or an empty string if not match
            };
            // Check if the item is either an image or a video
            const isImageOrVideo = ['image', 'video'].includes(item.mimetype.split('/')[0]);
            const normalizedPath = normalizeItemPath(item.path); // Normalize the item path

            if (isImageOrVideo && normalizedPath) {
                // Construct query parameters for generating the preview
                const query = new URLSearchParams({
                    file: normalizedPath,
                    fileId: item.nodeId,
                    x: 500,
                    y: 500,
                    forceIcon: 0
                });
                // Return the full URL to the preview image
                return OC.generateUrl('/core/preview.png?') + query.toString();
            } else {
                // For non-image/video files, return the URL to the mimetype icon
                return OC.MimeType.getIconUrl(item.mimetype);
            }
        },
    }
}
</script>

<style scoped>
.is-active {
    background-color: #f0f0f0;
}

.nav-thumbnail {
    width: 20px;
    height: 20px;
    background-size: cover;
    background-position: center;
    border-radius: 4px;
    display: inline-block;
    margin-right: 8px;
}

.file-size {
    font-size: 0.8rem;
    color: var(--color-text-maxcontrast);
    white-space: nowrap;
    margin-left: 4px;
}
</style>