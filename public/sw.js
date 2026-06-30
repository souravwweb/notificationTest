// public/sw.js

// Handle notification click events to focus/restore the app window
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // Try to find an open tab/window of the application
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // If the window is open, focus it
        if ('focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, launch a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
