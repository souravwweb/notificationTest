# NotiReact: Firebase Client-Side Realtime Notification Guide

Since notifications are only required when the browser tab is **open but unfocused** (e.g. you are on another tab or in another application), we do **not** need complex service workers, VAPID key pairs, or Firebase Cloud Functions. 

Instead, the application uses **Firestore's `onSnapshot` real-time listener** in combination with the native **Browser HTML5 Notification API**. This handles alerts instantly as long as the application tab is open.

---

## 1. Firebase Console Configuration

You need to create a project in the [Firebase Console](https://console.firebase.google.com/) and enable the following services:

### A. Authentication
1. Go to **Authentication** > **Get Started**.
2. Enable the **Email/Password** sign-in provider.

### B. Cloud Firestore
1. Go to **Firestore Database** > **Create Database**.
2. Select your location and start in **Production Mode**.
3. Apply the following security rules in the **Rules** tab to protect data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Profiles rules
    match /profiles/{userId} {
      allow read: if true;
      allow create, update: if request.auth != null && request.auth.uid == userId;
    }
    
    // Messages rules
    match /messages/{messageId} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.sender_id;
      allow update, delete: if false;
    }
  }
}
```

---

## 2. Local Environment Configuration (`.env`)

Add the following environment variables to your `.env` file in the root of your project:

```env
# Firebase Configuration Keys
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
```

---

## 3. How the Notification Trigger Works
1. **Firestore onSnapshot**: The React component maintains an active socket listener on the `messages` collection.
2. **Tab in Background**: If the tab is unfocused (you are browsing another website or working in another program), browser javascript processes continue running.
3. **Notification permission**: Upon logging in, clicking the permission toggle triggers:
   ```javascript
   Notification.requestPermission()
   ```
4. **Desktop Trigger**: When a new message document matches your user ID as the `tagged_user_id`, the listener fires the system card:
   ```javascript
   new Notification("Mentioned by @username", { body: "message content" })
   ```
5. **Acoustic Indicator**: Simultaneously, the browser Web Audio API synthesizes a double-tone chime through your computer's audio channel.
