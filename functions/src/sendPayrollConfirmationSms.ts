//import { onCall, HttpsError } from "firebase-functions/v2/https";
//import { defineSecret } from "firebase-functions/params";
//import * as admin from "firebase-admin";
//import twilio from "twilio";

//if (!admin.apps.length) {
 // admin.initializeApp();
//}

//const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
//const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
//const TWILIO_FROM_PHONE = defineSecret("TWILIO_FROM_PHONE");

//type SendPayrollConfirmationSmsData = {
  //companyId?: string;
  //periodId?: string;
//};

//export const sendPayrollConfirmationSms = onCall(
  //{
   // secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE],
  //},
  //async (request) => {
   // const { companyId, periodId } =
     // request.data as SendPayrollConfirmationSmsData;

  //  if (!companyId || !periodId) {
    //  throw new HttpsError(
     //  "invalid-argument",
      // "companyId and periodId are required."
     // );
    //}

   /// const client = twilio(
   //   TWILIO_ACCOUNT_SID.value(),
    //  TWILIO_AUTH_TOKEN.value()
    //);
    //const fromPhone = TWILIO_FROM_PHONE.value();

    // Load company settings for branded company name
    //const settingsSnap = await admin
      //.firestore()
      //.doc(`companies/${companyId}/settings/main`)
     // .get();

    //const companyName =
     // settingsSnap.exists && settingsSnap.data()?.companyName
       // ? String(settingsSnap.data()?.companyName)
        //: "Amazing Grace Cleaners";

    // Load payroll period
    //const periodSnap = await admin
     // .firestore()
     // .doc(`companies/${companyId}/payroll_periods/${periodId}`)
     // .get();

   // if (!periodSnap.exists) {
  //    throw new HttpsError("not-found", "Payroll period not found.");
  //  }

   // const period = periodSnap.data() as {
    //  startDate?: string;
    //  endDate?: string;
    //  revision?: number;
    //  lineItems?: Array<{ employeeId?: string }>;
  //  };

    //const employeeIds = Array.from(
    //  new Set(
    //    (period.lineItems ?? [])
    //      .map((li) => li.employeeId)
    //  )
   // );

   // const employeesSnap = await admin
    //  .firestore()
    //  .collection(`companies/${companyId}/employees`)
    //  .get();

    //const targetEmployees = employeesSnap.docs
    //  .map((doc) => ({ id: doc.id, ...doc.data() }))
    //  .filter(
    //    (emp: any) =>
    //      employeeIds.includes(emp.id) &&
     //     typeof emp.phone === "string" &&
     //     emp.phone.trim()
    //  );

   // const start = String(period.startDate ?? "").slice(0, 10);
   // const end = String(period.endDate ?? "").slice(0, 10);
   // const revision = period.revision ?? 1;

    //const results = await Promise.all(
    //  targetEmployees.map(async (employee: any) => {
    //    try {
      //    const res = await client.messages.create({
       /////     from: fromPhone,
        //    to: employee.phone,
         //   body: `${companyName} Payroll: Your payroll for ${start} to ${end} (rev ${revision}) is ready for confirmation. Please open the ManageWise employee app to review and confirm.`,
         // });

         // return {
          //  employeeId: employee.id,
           // phone: employee.phone,
           // success: true,
        //    sid: res.sid,
          //};
        //} catch (error: any) {
        //  return {
         //   employeeId: employee.id,
        //   phone: employee.phone,
          //  success: false,
         //   error: error?.message ?? "Unknown SMS error",
        //  };
       // }
     // })
   // );

   // return {
   //   success: true,
    //  count: targetEmployees.length,
    //  results,
    //};
 // }
//);