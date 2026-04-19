export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.6 }}>
      <h1>Privacy Policy</h1>
      <p>Last updated: 2026-01-21</p>

      <p>
        Corpus collects and processes personal health and training data that you connect to the
        platform (such as FitnessSyncer, intervals.icu, and manually uploaded medical documents). This data
        is used to provide dashboards, analytics, and summaries inside your account.
      </p>

      <h2>What We Collect</h2>
      <ul>
        <li>Account information you provide (such as username).</li>
        <li>Connected service data (activities, vitals, sleep, body metrics).</li>
        <li>Medical documents you upload for summaries and reference.</li>
        <li>Usage logs needed to keep the service running.</li>
      </ul>

      <h2>How We Use Data</h2>
      <ul>
        <li>To render your dashboards and analytics.</li>
        <li>To generate summaries and insights you request.</li>
        <li>To maintain reliability, security, and performance.</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        Your data is not sold. Data is only shared with third-party providers you explicitly connect
        (such as FitnessSyncer or intervals.icu) or when required to deliver requested features.
      </p>

      <h2>Security</h2>
      <p>
        We apply reasonable technical and organizational safeguards. No system is 100% secure, so
        please use strong credentials and keep your access private.
      </p>

      <h2>Data Retention</h2>
      <p>
        Data is retained as long as your account is active or as needed to provide services you use.
        You can request deletion at any time.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions or deletion requests, contact the Corpus administrator at
        <span> support@kurasika.tech</span>.
      </p>
    </main>
  );
}
