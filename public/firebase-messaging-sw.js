// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in configuration.
// Replace these with your actual Firebase config parameters if needed.
firebase.initializeApp({
  apiKey: "mock-api-key",
  authDomain: "mock-auth-domain.firebaseapp.com",
  projectId: "mock-project-id",
  storageBucket: "mock-storage-bucket.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);
  
  const notificationTitle = payload.notification?.title || 'Mentioned on NotiReact';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || 'You have a new mention!',
    icon: '/vite.svg',
    badge: '/vite.svg',
    data: {
      url: payload.data?.click_action || '/dashboard'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
