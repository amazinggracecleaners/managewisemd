import { EventEmitter } from "events";

/**
 * Central event bus for Firebase-related errors.
 * Used to surface permission/auth issues across the app.
 */
export const errorEmitter = new EventEmitter();

/**
 * Optional: limit listeners to avoid memory leak warnings
 */
errorEmitter.setMaxListeners(20);
