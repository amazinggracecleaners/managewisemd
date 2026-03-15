export default function PrivacyPolicy() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p>Last updated: {new Date().getFullYear()}</p>

      <p>
        ManageWiseMD and Amazing Grace Cleaners respect your privacy and are
        committed to protecting your personal information. This Privacy Policy
        explains how we collect, use, and protect information when you use our
        services.
      </p>

      <h2 className="text-xl font-semibold">Information We Collect</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Employee name and contact information</li>
        <li>Phone number used for operational notifications</li>
        <li>Work schedule and payroll confirmation data</li>
        <li>Time tracking information</li>
      </ul>

      <h2 className="text-xl font-semibold">How We Use Your Information</h2>
      <p>
        The information we collect is used only for business operations,
        including:
      </p>

      <ul className="list-disc pl-6 space-y-2">
        <li>Payroll confirmations</li>
        <li>Employee schedule notifications</li>
        <li>Operational communication</li>
        <li>Work tracking and reporting</li>
      </ul>

      <h2 className="text-xl font-semibold">SMS Communications</h2>
      <p>
        Employees may receive SMS notifications related to payroll confirmations,
        work schedules, or operational alerts. Message frequency varies.
        Standard message and data rates may apply.
      </p>

      <p>
        Employees may opt out of SMS notifications at any time by replying
        <strong> STOP</strong> to any message.
      </p>

      <h2 className="text-xl font-semibold">Data Security</h2>
      <p>
        We implement reasonable security measures to protect personal
        information from unauthorized access, disclosure, or alteration.
      </p>

      <h2 className="text-xl font-semibold">Sharing of Information</h2>
      <p>
        We do not sell, trade, or rent personal information to third parties.
        Information may only be shared with service providers required to
        operate our services (such as cloud hosting or messaging providers).
      </p>

      <h2 className="text-xl font-semibold">Contact</h2>
      <p>
        If you have questions about this Privacy Policy, contact us at:
        <br />
        <strong>Amazing Grace Cleaners</strong>
      </p>
    </main>
  );
}