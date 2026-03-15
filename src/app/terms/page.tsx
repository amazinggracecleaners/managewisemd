export default function Terms() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Terms and Conditions</h1>
      <p>Last updated: {new Date().getFullYear()}</p>

      <p>
        These Terms and Conditions govern the use of the ManageWiseMD employee
        management system operated by Amazing Grace Cleaners.
      </p>

      <h2 className="text-xl font-semibold">Use of the System</h2>
      <p>
        ManageWiseMD is used by employees and management for operational
        purposes including scheduling, payroll confirmation, and time tracking.
      </p>

      <h2 className="text-xl font-semibold">SMS Notifications</h2>
      <p>
        Employees may receive SMS notifications related to work schedules,
        payroll confirmations, and operational updates.
      </p>

      <p>
        Message frequency varies. Message and data rates may apply depending
        on your mobile carrier.
      </p>

      <p>
        Employees can opt out of SMS communications at any time by replying
        <strong> STOP</strong> to any message. For assistance, reply
        <strong> HELP</strong>.
      </p>

      <h2 className="text-xl font-semibold">User Responsibilities</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Provide accurate information</li>
        <li>Maintain confidentiality of login credentials</li>
        <li>Use the system only for authorized work purposes</li>
      </ul>

      <h2 className="text-xl font-semibold">Service Availability</h2>
      <p>
        While we strive to provide uninterrupted service, ManageWiseMD may be
        temporarily unavailable due to maintenance, updates, or technical
        issues.
      </p>

      <h2 className="text-xl font-semibold">Limitation of Liability</h2>
      <p>
        Amazing Grace Cleaners is not liable for indirect or consequential
        damages resulting from the use of the ManageWiseMD system.
      </p>

      <h2 className="text-xl font-semibold">Changes to Terms</h2>
      <p>
        These Terms may be updated from time to time. Continued use of the
        system constitutes acceptance of any updates.
      </p>

      <h2 className="text-xl font-semibold">Contact</h2>
      <p>
        For questions regarding these Terms, contact:
        <br />
        <strong>Amazing Grace Cleaners</strong>
      </p>
    </main>
  );
}