import { showError as showErrorToast, showSuccess as showSuccessToast } from "@nextcloud/dialogs";

// Define the notification queue and active notifications count
const notificationQueue = [];
let activeNotifications = 0;

/**
 * Show notification
 * 
 * @param {string} type - The type of notification ('success' or 'error')
 * @param {string} message - The message to display in the notification
 */
export function showNotification(type, message) {
    // Define the notification function depending on the type
    let notificationFunction;
    if (type === 'success') {
        notificationFunction = () => {
            return showSuccessToast(message, {
                onRemove: onNotificationRemove
            });
        };
    } else if (type === 'error') {
        notificationFunction = () => {
            return showErrorToast(message, {
                onRemove: onNotificationRemove
            });
        };
    } else {
        console.error('Invalid notification type:', type);
        return;
    }

    // Function to display the next notification if less than two are active
    const displayNextNotification = () => {
        if (activeNotifications < 2 && notificationQueue.length > 0) {
            const notificationToShow = notificationQueue.shift();
            notificationToShow(); // This will show the notification
            activeNotifications++;
        }
    };

    // Callback for when a notification is removed
    const onNotificationRemove = () => {
        activeNotifications--;
        displayNextNotification();
    };

    // Add notification to the queue and display
    notificationQueue.push(notificationFunction);
    displayNextNotification();
}

/** 
 * Show success notification
 * 
 * @param {string} message - The message to display in the notification
 */
export function showSuccessNotification(message) {
    showNotification('success', message);
}

/**
 * Show error notification
 * 
 * @param {string} message - The message to display in the notification
 */
export function showErrorNotification(message) {
    showNotification('error', message);
}
