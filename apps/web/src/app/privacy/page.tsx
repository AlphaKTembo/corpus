export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.6 }}>
      <h1>Privacy Policy</h1>
      <p>Last updated: 2026-07-16</p>

      <p>
        Corpus (&quot;we&quot;, &quot;us&quot;) provides training and health dashboards and AI coaching
        features. This policy explains what we collect, how we use it, and the controls you have.
        Corpus is not a medical device and does not provide medical advice.
      </p>

      <h2>What We Collect</h2>
      <ul>
        <li>Account information from sign-in (Google or Apple), such as email and a stable account id.</li>
        <li>Connected service data you authorize (for example intervals.icu or FitnessSyncer): activities, vitals, sleep, body metrics, and related training metrics.</li>
        <li>Medical and other documents you upload for summaries and reference.</li>
        <li>Text and voice inputs you submit to coaching or chat features, used to answer your requests in your account context.</li>
        <li>Usage and diagnostic logs needed to keep the service reliable and secure.</li>
      </ul>

      <h2>How We Use Data</h2>
      <ul>
        <li>To render your dashboards, analytics, and coaching surfaces.</li>
        <li>To generate AI summaries and insights you request, using your connected data and notes as context.</li>
        <li>To maintain reliability, security, and performance.</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        Your data is not sold. Data is only shared with third-party providers you explicitly connect
        (such as intervals.icu or FitnessSyncer), with infrastructure and AI providers required to
        deliver requested features, or when required by law.
      </p>

      <h2>Security</h2>
      <p>
        We apply reasonable technical and organizational safeguards. No system is 100% secure, so
        please use strong credentials and keep your access private.
      </p>

      <h2>Data Retention</h2>
      <p>
        Data is retained as long as your account is active or as needed to provide services you use.
      </p>

      <h2>Account Deletion</h2>
      <p>
        You can delete your account in the Corpus iOS app under More → Delete Account. That request
        removes your Corpus account record and associated server-side data for the product. You may
        also email <span>support@kurasika.tech</span> to request deletion.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions or deletion requests, contact
        <span> support@kurasika.tech</span>.
      </p>
    </main>
  );
}
