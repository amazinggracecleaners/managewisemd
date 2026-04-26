import { getApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

export async function requestPushToken() {
  const supported = await isSupported();
  if (!supported) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const messaging = getMessaging(getApp());

  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    ),
  });

  return token;
}