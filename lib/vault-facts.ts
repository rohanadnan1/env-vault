export type FactCategory = 'security' | 'features' | 'coming-soon' | 'did-you-know' | 'mission';

export interface VaultFact {
  category: FactCategory;
  text: string;
}

export const VAULT_FACTS: VaultFact[] = [
  // Security
  { category: 'security', text: 'All your secrets are encrypted with AES-256-GCM before leaving your browser — our servers only ever see encrypted ciphertext, never your actual values.' },
  { category: 'security', text: 'We use PBKDF2 with 600,000 iterations to derive your vault key. That intentional slowness makes brute-force attacks 600,000× harder than a simple hash.' },
  { category: 'security', text: 'Your master password never leaves your device. Only a cryptographic salt is stored on our servers — there is nothing to steal that could unlock your vault.' },
  { category: 'security', text: 'Every secret gets a fresh 96-bit random IV (Initialization Vector) at encryption time — so identical values always produce completely different ciphertext.' },
  { category: 'security', text: 'We use Additional Authenticated Data (AAD) to cryptographically bind each secret to its specific environment. An attacker cannot move or copy secrets between projects.' },
  { category: 'security', text: 'Your derived vault key lives only in memory and is never written to disk, localStorage, or cookies. It disappears completely when you close or lock the tab.' },
  { category: 'security', text: 'AES-GCM provides both confidentiality and integrity in one pass — any tampering with encrypted data is detected and rejected before decryption even completes.' },
  { category: 'security', text: 'env-vault is a true zero-knowledge system. Even our engineers with full database access cannot decrypt your secrets without knowing your master password.' },
  { category: 'security', text: 'Your vault auto-locks after configurable inactivity — so even if you walk away from your computer, your secrets stay safe behind your master password.' },
  { category: 'security', text: 'Version history is also encrypted end-to-end. Every historical value of every secret is just as protected as your current values.' },
  { category: 'security', text: 'Secret comments are encrypted client-side just like values. Your annotations and notes are as private as the credentials themselves.' },
  { category: 'security', text: 'Two-factor authentication ensures a stolen password alone is never enough — an attacker needs both your password and physical access to your authenticator device.' },
  { category: 'security', text: 'Recovery codes are cryptographically hashed before storage. They can verify your identity without our server ever seeing the actual code.' },
  { category: 'security', text: 'The 10-day cooldown between master password resets is a deliberate security control — it prevents rapid credential cycling after a suspected compromise.' },
  { category: 'security', text: 'All encryption uses the Web Crypto API — a native browser standard with hardware acceleration and FIPS-compliant implementations on modern devices.' },
  { category: 'security', text: 'File contents are encrypted with the same AES-256-GCM algorithm as your secrets. Whether it is an API key or an SSL certificate, the protection is identical.' },

  // Features
  { category: 'features', text: 'env-vault supports multiple projects, environments, and nested folders — organize your secrets exactly the way your team thinks about them.' },
  { category: 'features', text: 'Every secret change is versioned with full encrypted history. You can view past values when unlocked and see exactly who changed what and when.' },
  { category: 'features', text: 'File vault lets you store entire .env files, SSL certificates, SSH keys, and any text-based config — all encrypted end-to-end, zero compromise.' },
  { category: 'features', text: 'Import an entire .env file in seconds. We detect duplicates, compare values against existing secrets, and handle conflicts without overwriting anything unexpectedly.' },
  { category: 'features', text: 'Each environment — development, staging, production — is fully isolated. Secrets in one environment can never accidentally bleed into another.' },
  { category: 'features', text: 'Share encrypted secrets with teammates without ever exposing plaintext. The recipient decrypts locally with their own key — your vault key never travels.' },
  { category: 'features', text: 'Folders let you group related secrets together — perfect for separating database credentials, third-party API keys, and internal service configs.' },
  { category: 'features', text: 'Bundle sharing packages a group of secrets into a time-limited, optionally single-use encrypted link — ideal for onboarding new developers safely.' },
  { category: 'features', text: 'Tags let you label and categorize secrets across your vault — filter by service, environment type, or criticality to find exactly what you need.' },
  { category: 'features', text: 'The session auto-lock respects your workflow — active usage resets the timer, so you are never locked out mid-task, only when you step away.' },

  // Coming Soon
  { category: 'coming-soon', text: 'Coming soon: IDE plugin for VS Code and JetBrains. Open a project and your environment variables are automatically available — no more copying .env files.' },
  { category: 'coming-soon', text: 'We are building organization mode with teams, roles, and fine-grained access control — share specific environments with specific people, nothing more.' },
  { category: 'coming-soon', text: 'Soon you will be able to link your vault to a Git repository. Files added to .gitignore are automatically vaulted and versioned alongside your code.' },
  { category: 'coming-soon', text: 'Coming: a CLI tool for CI/CD pipelines. Inject your encrypted secrets directly into build scripts at runtime — nothing ever written to disk in plaintext.' },
  { category: 'coming-soon', text: 'We are planning secret expiry dates. Set a TTL on any credential and get notified before it expires — no more surprise outages from rotated API keys.' },
  { category: 'coming-soon', text: 'Future org plans will include SSO integration. Log in with your company identity provider and get automatic team access provisioned without manual invite flows.' },
  { category: 'coming-soon', text: 'Planned: real-time collaboration indicators. See when teammates are actively working in the same environment — without ever revealing the values they see.' },
  { category: 'coming-soon', text: 'We are working on secret scanning. Accidentally commit a credential? We detect it instantly and notify you before it can be harvested by automated scanners.' },
  { category: 'coming-soon', text: 'Coming: webhook notifications when secrets change. Keep your deployments in sync automatically whenever credentials are rotated or new ones are added.' },
  { category: 'coming-soon', text: 'Future: environment diff view. Compare staging vs production side by side to spot missing secrets or mismatched values before they cause incidents.' },
  { category: 'coming-soon', text: 'Planned: smart secret templates for AWS, Stripe, Twilio, Supabase, Vercel, and 50+ popular services — the right structure suggested automatically.' },
  { category: 'coming-soon', text: 'Coming: mobile app for iOS and Android with biometric authentication. Securely access, copy, and share credentials from anywhere, any device.' },
  { category: 'coming-soon', text: 'We are building a browser extension that auto-fills secrets into web-based admin panels and developer dashboards — no more copy-pasting credentials.' },
  { category: 'coming-soon', text: 'Future: runtime SDK packages for Node.js, Python, Go, and Rust. Load secrets programmatically at startup with no .env files on disk anywhere.' },
  { category: 'coming-soon', text: 'Planned: secret request workflow. Team members request access to specific secrets, and admins approve or deny from a central dashboard with a single click.' },
  { category: 'coming-soon', text: 'Coming: automatic dependency detection. We scan your package.json, requirements.txt, or go.mod to suggest which secrets your project likely needs.' },
  { category: 'coming-soon', text: 'Future: multi-region encrypted replication. Your vault available globally with low latency — even if an entire cloud region goes offline.' },
  { category: 'coming-soon', text: 'Planned: compliance audit logs with exportable PDF reports. Prove to auditors exactly who accessed which secrets, when, and from which IP address.' },
  { category: 'coming-soon', text: 'We are working on secret inheritance — define base variables at the organization level and selectively override them per project or per environment.' },
  { category: 'coming-soon', text: 'Coming: one-click secret rotation for supported services. Rotate an AWS access key, and we automatically update it across every environment that uses it.' },

  // Did You Know?
  { category: 'did-you-know', text: 'Did you know? AES-256-GCM is used by the US National Security Agency to protect classified information at the Top Secret level.' },
  { category: 'did-you-know', text: 'Did you know? A single leaked API key can cost companies millions in unauthorized cloud usage. AWS bills have exceeded $50,000 in a single day after accidental key exposure.' },
  { category: 'did-you-know', text: 'Did you know? Over 100,000 API keys and credentials are accidentally committed to public GitHub repositories every single day — most are found by bots within minutes.' },
  { category: 'did-you-know', text: 'Did you know? PBKDF2 with 600,000 iterations takes roughly 200ms on modern hardware — that delay is deliberate and makes offline brute-force attacks cost-prohibitive.' },
  { category: 'did-you-know', text: 'Did you know? The average cost of a data breach in 2024 was $4.88 million USD, with credential theft involved in over 80% of all confirmed breaches.' },
  { category: 'did-you-know', text: 'Did you know? Most environment variable leaks happen through CI/CD pipeline logs — build output that is publicly visible and cached by search engines.' },
  { category: 'did-you-know', text: 'Did you know? A 256-bit AES key has more possible combinations than there are atoms in the observable universe — exhaustive search is mathematically impossible.' },
  { category: 'did-you-know', text: 'Did you know? GCM (Galois/Counter Mode) encrypts data in parallel counter streams, making it significantly faster than CBC mode while also providing authentication.' },
  { category: 'did-you-know', text: 'Did you know? In 2023, the CircleCI breach exposed thousands of customer secrets — all because environment variables were stored without proper end-to-end encryption.' },
  { category: 'did-you-know', text: 'Did you know? The average time to identify a credential-based breach is 292 days — nearly 10 months during which attackers have unrestricted access to your systems.' },
  { category: 'did-you-know', text: 'Did you know? GitHub secret scanning has prevented over 1.8 million credential leaks — but it cannot protect secrets already inside private repos or .env files on developer laptops.' },
  { category: 'did-you-know', text: 'Did you know? Your vault key is derived fresh every time you unlock — it is never stored anywhere, making it practically impossible for malware to steal persistently.' },
  { category: 'did-you-know', text: 'Did you know? End-to-end encryption means a network interception attack cannot reveal your secrets — they are encrypted before they leave your browser, period.' },
  { category: 'did-you-know', text: 'Did you know? The Initialization Vector (IV) in AES-GCM must be unique per encryption. We use cryptographically secure random bytes from your browser to guarantee this.' },

  // Mission
  { category: 'mission', text: 'env-vault was built on a simple principle: your secrets should be accessible to you and only you — no exceptions, no backdoors, no special cases.' },
  { category: 'mission', text: 'We believe strong security should not require a security degree. We handle the complex cryptography so you can focus on building things that matter.' },
  { category: 'mission', text: 'Our mission is to make enterprise-grade secret management accessible to every developer — from solo indie hackers to global engineering organizations.' },
  { category: 'mission', text: 'Every feature we ship starts with one question: does this compromise user security in any way? If yes, we find a different approach, full stop.' },
  { category: 'mission', text: 'We are committed to transparency. Our encryption scheme is openly documented so security researchers can independently verify every claim we make.' },
  { category: 'mission', text: 'We want to become the single source of truth for every environment variable, config file, and secret across your entire development lifecycle.' },
  { category: 'mission', text: 'Our long-term vision: a world where accidentally leaking a credential in a commit is as difficult as accidentally sending encrypted mail in plaintext.' },
  { category: 'mission', text: 'The best security tool is one developers actually love using — so we obsess over developer experience just as much as cryptographic correctness.' },
  { category: 'mission', text: 'We are building the infrastructure layer that makes secure-by-default the path of least resistance for every team, regardless of size or budget.' },
];

export function shuffleFacts(facts: VaultFact[]): VaultFact[] {
  const arr = [...facts];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
