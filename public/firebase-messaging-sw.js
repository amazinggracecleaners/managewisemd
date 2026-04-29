importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  

  apiKey: "AIzaSyDfWJ1hL8CTaIsTZjNzaDKAw-bKjOa8ccw",
  authDomain: "managewise-cd655.firebaseapp.com",
  projectId: "managewise-cd655",
  storageBucket: "managewise-cd655.firebasestorage.app",
  messagingSenderId: "34277434137",
  appId: "1:34277434137:web:f5506608ad358b45105b88",
  measurementId: "G-DMZXZCL4Z4"

});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "ManageWiseMD";
  const options = {
    body: payload.notification?.body || "You have a new manager notification.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: payload.data || {}
  };

  self.registration.showNotification(title, options);
});