/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

//import {setGlobalOptions} from "firebase-functions";
import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

admin.initializeApp();

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
//setGlobalOptions({ maxInstances: 10 });

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
//export { sendPayrollConfirmationSms } from "./sendPayrollConfirmationSms";
export const sendManagerNotificationPush = onDocumentCreated(
  "companies/{companyId}/notifications/{notificationId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { companyId, notificationId } = event.params;

    const tokensSnap = await admin
      .firestore()
      .collection("companies")
      .doc(companyId)
      .collection("push_tokens")
      .where("role", "==", "manager")
      .get();

    const tokens = tokensSnap.docs
      .map((doc) => doc.data().token as string | undefined)
      .filter(Boolean) as string[];

    if (!tokens.length) {
      console.log("No manager push tokens found.");
      return;
    }

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: data.title || "Manager Notification",
        body: data.message || "You have a new ManageWiseMD notification.",
      },
      webpush: {
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        },
      },
      data: {
        companyId,
        notificationId,
        type: String(data.type || "notification"),
      },
    });
  }
);