"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  Shield, 
  Share2, 
  Terminal, 
  Sparkles, 
  Lock, 
  ArrowRight,
  Crown,
  Users,
  Code,
  Fingerprint,
  History,
  KeyRound,
  FileCode2,
  Workflow
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface LandingPageProps {
  isLoggedIn: boolean;
}

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } 
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

// Animated IDE Variables for Hero
const IDE_LINES = [
  { key: "DATABASE_URL", value: '"postgres://admin:********@aws.neon.tech/main"', color: "emerald" },
  { key: "NEXTAUTH_SECRET", value: '"vlt_sec_8f92jK..."', color: "emerald" },
  { key: "STRIPE_SECRET_KEY", value: '"sk_live_51M..."', color: "emerald" },
  { key: "OPENAI_API_KEY", value: '"sk-proj-7x9..."', color: "emerald" },
  { key: "AWS_ACCESS_KEY_ID", value: '"AKIAIOSFODNN7EXAMPLE"', color: "emerald" },
];

export default function LandingPage({ isLoggedIn }: LandingPageProps) {
  const [visibleLines, setVisibleLines] = useState<number>(2);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisibleLines((prev) => (prev >= IDE_LINES.length ? 1 : prev + 1));
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden selection:bg-indigo-200">
      
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-600/20">
              V
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-800">EnVault</span>
          </div>
          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <Link 
                href="/dashboard"
                className="px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link 
                  href="/login"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Log in
                </Link>
                <Link 
                  href="/register"
                  className="px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-600/20"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-400/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-violet-400/20 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="flex flex-col items-center">
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" />
              <span>The Next Generation of Secret Management</span>
            </motion.div>
            
            <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-bold tracking-tight text-slate-900 mb-6 leading-tight">
              Secure your secrets.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
                Empower your team.
              </span>
            </motion.h1>
            
            <motion.p variants={fadeIn} className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl leading-relaxed">
              Zero-knowledge end-to-end encryption. Seamless CLI integration. Granular sharing. Built specifically for modern developer workflows.
            </motion.p>
            
            <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <Link 
                href={isLoggedIn ? "/dashboard" : "/register"}
                className="group px-8 py-4 rounded-full bg-slate-900 text-white font-medium hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/10 hover:shadow-2xl hover:shadow-slate-900/20 hover:-translate-y-0.5"
              >
                {isLoggedIn ? "Enter Your Vault" : "Get Started for Free"}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          </motion.div>
        </div>

        {/* Animated Hero Mockup Graphic */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-5xl mx-auto mt-20 relative"
        >
          <div className="rounded-2xl border border-slate-200/50 bg-white/50 backdrop-blur-xl shadow-2xl p-2 relative z-10 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
            <div className="bg-slate-950 rounded-xl overflow-hidden shadow-inner aspect-[16/9] md:aspect-[21/9] flex flex-col relative">
              <div className="w-full h-10 bg-slate-900 flex items-center px-4 border-b border-slate-800 flex-shrink-0">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="mx-auto text-xs font-mono text-slate-500">.env — EnVault Workspace</div>
              </div>
              <div className="flex-1 p-8 text-left font-mono text-sm leading-loose overflow-hidden relative">
                <div className="text-slate-500 mb-2"># Production Environment Secrets</div>
                
                <AnimatePresence mode="popLayout">
                  {IDE_LINES.slice(0, visibleLines).map((line) => (
                    <motion.div 
                      key={line.key}
                      initial={{ opacity: 0, x: -20, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: "auto" }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      <span className="text-indigo-400">{line.key}</span>
                      <span className="text-slate-400 mx-2">=</span>
                      <span className={`text-${line.color}-400`}>{line.value}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                <motion.div 
                  animate={{ opacity: [1, 0] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="w-2 h-5 bg-indigo-500 inline-block align-middle ml-1 mt-1"
                />

                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1, duration: 0.5 }}
                  className="absolute bottom-6 right-6 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-2 backdrop-blur-md"
                >
                  <Shield className="w-3 h-3" />
                  E2E Encrypted & Synced
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* 3D Flip Features Grid */}
      <section className="py-24 px-6 bg-white relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Core Capabilities</h2>
            <p className="text-slate-600">Hover over the cards below to uncover the depth of our military-grade infrastructure.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FlipFeatureCard 
              icon={<Shield className="w-6 h-6 text-emerald-500" />}
              title="Zero-Knowledge Encryption"
              shortDesc="Your secrets are encrypted in your browser. The server never sees your plaintext data."
              longDesc="We use AES-256-GCM for envelope encryption. Your Master Password stays local and derives a Key Encryption Key via PBKDF2. Even in a total database breach, your secrets remain mathematically impenetrable."
              delay={0.1}
            />
            <FlipFeatureCard 
              icon={<Share2 className="w-6 h-6 text-indigo-500" />}
              title="Collaborative Sharing"
              shortDesc="Share specific files or environments via email with granular TTLs and permissions."
              longDesc="Create 'PR-style' edit requests. Shared payloads are re-encrypted client-side using a unique invitation salt, meaning a revoked share instantly cryptographically invalidates access."
              delay={0.2}
            />
            <FlipFeatureCard 
              icon={<Crown className="w-6 h-6 text-amber-500" />}
              title="Private Spaces"
              shortDesc="Create democratic workspaces where changes require peer approval to merge to the official King File."
              longDesc="Every team member receives their own personal fork. When teams grow over 10 members, an automatic election is held to vote for a 3-person Council (The Iron Throne) to govern secret merges."
              delay={0.3}
            />
            <FlipFeatureCard 
              icon={<Terminal className="w-6 h-6 text-slate-700" />}
              title="CLI & IDE Integration"
              shortDesc="Interact with your vault directly from your terminal or VS Code."
              longDesc="Generate Machine Tokens to inject secrets into your CI/CD. The VS Code extension offers inline peeking, auto-sync file watching, and Git-like conflict resolution for team collisions."
              delay={0.4}
            />
            <FlipFeatureCard 
              icon={<Sparkles className="w-6 h-6 text-violet-500" />}
              title="AI Explorer Widget"
              shortDesc="A context-aware AI assistant that understands your environments."
              longDesc="The AI only reads structural metadata (key names, counts, file types) to answer questions or detect missing keys. Plaintext secret values are NEVER sent to the LLM."
              delay={0.5}
            />
            <FlipFeatureCard 
              icon={<Lock className="w-6 h-6 text-rose-500" />}
              title="Robust Security"
              shortDesc="Protect your account with WebAuthn, TOTP 2FA, and Recovery Codes."
              longDesc="Instead of typing your password constantly, use Touch ID or Face ID. If you forget your master password, our generated Recovery Codes act as a cryptographic fallback to derive your keys."
              delay={0.6}
            />
          </div>
        </div>
      </section>

      {/* Deep Dive Section: The Iron Throne Architecture */}
      <section className="py-24 px-6 bg-slate-950 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">The "Iron Throne" Architecture</h2>
              <p className="text-slate-400 text-lg mb-6 leading-relaxed">
                EnVault introduces a radically new way to handle team secrets. In a Private Space, everyone gets their own personal fork of the environment.
              </p>
              <ul className="space-y-4 mb-8">
                <li className="flex gap-3 text-slate-300">
                  <div className="mt-1 bg-indigo-500/20 p-1 rounded-full h-fit"><Users className="w-4 h-4 text-indigo-400" /></div>
                  <span><strong>Democracy Mode:</strong> Small teams require unanimous approval to merge changes into the official "King File".</span>
                </li>
                <li className="flex gap-3 text-slate-300">
                  <div className="mt-1 bg-amber-500/20 p-1 rounded-full h-fit"><Crown className="w-4 h-4 text-amber-400" /></div>
                  <span><strong>Council Elections:</strong> Once your team grows beyond 10 members, an automatic election triggers to choose a 3-person council to approve merges.</span>
                </li>
                <li className="flex gap-3 text-slate-300">
                  <div className="mt-1 bg-emerald-500/20 p-1 rounded-full h-fit"><Code className="w-4 h-4 text-emerald-400" /></div>
                  <span><strong>Peer-to-Peer Sync:</strong> Easily cherry-pick line changes from a coworker's local fork seamlessly using the shared SpaceKey.</span>
                </li>
              </ul>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="relative aspect-square md:aspect-[4/3] rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl"
            >
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="w-full max-w-sm flex flex-col gap-6">
                  {/* King File */}
                  <div className="bg-gradient-to-r from-amber-500/20 to-amber-600/20 border border-amber-500/30 p-4 rounded-xl flex items-center gap-4 mx-auto w-4/5 relative z-20 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                    <Crown className="w-8 h-8 text-amber-400" />
                    <div>
                      <div className="text-amber-100 font-medium">The King File</div>
                      <div className="text-amber-400/70 text-xs">Official Source of Truth</div>
                    </div>
                  </div>
                  
                  {/* Arrows */}
                  <div className="flex justify-between px-10 relative h-10">
                    <div className="absolute top-0 left-[25%] w-0.5 h-full bg-gradient-to-b from-amber-500/30 to-indigo-500/30" />
                    <div className="absolute top-0 right-[25%] w-0.5 h-full bg-gradient-to-b from-amber-500/30 to-emerald-500/30" />
                    <div className="absolute top-1/2 left-[25%] right-[25%] h-0.5 bg-slate-800 border-t border-dashed border-slate-700" />
                  </div>
                  
                  {/* User Forks */}
                  <div className="flex gap-4">
                    <div className="flex-1 bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center gap-3 relative z-20">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-bold">A</div>
                      <div>
                        <div className="text-slate-200 text-sm font-medium">Alice's Fork</div>
                        <div className="text-slate-500 text-xs">Drafting changes</div>
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-800/50 border border-slate-700 p-4 rounded-xl flex items-center gap-3 relative z-20">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">B</div>
                      <div>
                        <div className="text-slate-200 text-sm font-medium">Bob's Fork</div>
                        <div className="text-slate-500 text-xs">Synced</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Feature Section: Ecosystem */}
      <section className="py-24 px-6 bg-slate-900 text-white relative overflow-hidden border-t border-slate-800">
        <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-indigo-600/10 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">The Complete Developer Ecosystem</h2>
            <p className="text-slate-400">Manage secrets where you work. EnVault goes beyond the browser, delivering native tools for your terminal and IDE.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="space-y-8"
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Terminal className="w-6 h-6 text-indigo-400" />
                  <h3 className="text-2xl font-bold">EnVault CLI</h3>
                </div>
                <p className="text-slate-400 leading-relaxed mb-4">
                  Run <code className="text-indigo-300 bg-indigo-900/30 px-1 rounded">vault pull</code> or <code className="text-indigo-300 bg-indigo-900/30 px-1 rounded">vault push</code> directly from your terminal. Inject secrets securely into your processes using <code className="text-indigo-300 bg-indigo-900/30 px-1 rounded">vault run -- npm run dev</code> without ever writing plaintext to your disk.
                </p>
              </div>
              
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <FileCode2 className="w-6 h-6 text-violet-400" />
                  <h3 className="text-2xl font-bold">VS Code Extension</h3>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Never leave your editor. See inline hovers of your decrypted values, gutter indicators showing sync status, and resolve merge conflicts visually just like Git. Auto-push on save keeps your team perfectly in sync.
                </p>
              </div>
              
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Workflow className="w-6 h-6 text-emerald-400" />
                  <h3 className="text-2xl font-bold">CI/CD Integration</h3>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Generate scoped Machine Tokens to easily pull production secrets into GitHub Actions, Vercel, or AWS deployment pipelines automatically.
                </p>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              className="bg-[#0D1117] border border-slate-700 rounded-2xl p-6 shadow-2xl font-mono text-sm relative"
            >
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-700" />
                  <div className="w-3 h-3 rounded-full bg-slate-700" />
                  <div className="w-3 h-3 rounded-full bg-slate-700" />
                </div>
                <div className="text-slate-500 text-xs">zsh — vault-cli</div>
              </div>
              <div className="space-y-4">
                <div>
                  <span className="text-emerald-400">➜</span> <span className="text-indigo-300">my-app</span> <span className="text-white">vault login</span>
                  <div className="text-slate-400 mt-1">Authenticated successfully as developer@envault.dev</div>
                </div>
                <div>
                  <span className="text-emerald-400">➜</span> <span className="text-indigo-300">my-app</span> <span className="text-white">vault pull --env=production</span>
                  <div className="text-slate-400 mt-1">Downloading and decrypting 24 secrets...</div>
                  <div className="text-emerald-400 mt-1">✔ Successfully updated local .env</div>
                </div>
                <div>
                  <span className="text-emerald-400">➜</span> <span className="text-indigo-300">my-app</span> <span className="text-white">vault status</span>
                  <div className="text-amber-400 mt-1">1 modified secret (DATABASE_URL)</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Advanced Sharing & Security Grid */}
      <section className="py-24 px-6 bg-slate-50 relative border-t border-slate-200">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Multi-Sharing & Version Control</h2>
            <p className="text-slate-600">Total control over who sees what, and the ability to travel back in time if something goes wrong.</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white border border-slate-200 rounded-3xl p-8 md:p-12 shadow-sm hover:shadow-xl transition-shadow"
            >
              <Share2 className="w-10 h-10 text-indigo-600 mb-6" />
              <h3 className="text-2xl font-bold mb-4">Granular Multi-Sharing</h3>
              <p className="text-slate-600 leading-relaxed mb-6">
                Share entire environments, specific folders, or single variables. Recipient data is securely re-encrypted on your browser before sending, and you remain in total control.
              </p>
              <ul className="space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> Granular Read / Comment / Edit permissions</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> Time-To-Live (TTL) auto-expiring links</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> Out-of-band passphrase protection for recipients</li>
                <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> "PR-style" review flow to approve changes</li>
              </ul>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-indigo-600 text-white rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
              <History className="w-10 h-10 text-white mb-6 relative z-10" />
              <h3 className="text-2xl font-bold mb-4 relative z-10">Infinite Version History</h3>
              <p className="text-indigo-100 leading-relaxed relative z-10 mb-8">
                Mistakes happen. That's why every single change to a secret or a file is versioned and cryptographically preserved. You can roll back an entire folder to its exact state from yesterday.
              </p>
              <div className="space-y-4 relative z-10">
                <div className="bg-indigo-500/50 border border-indigo-400/50 rounded-xl p-4">
                  <div className="text-xs text-indigo-200 mb-1">Today at 2:30 PM</div>
                  <div className="font-mono text-sm line-through opacity-70">STRIPE_KEY = "sk_live_old..."</div>
                  <div className="font-mono text-sm text-emerald-300">STRIPE_KEY = "sk_live_new..."</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-indigo-600 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-white/10 rounded-[100%] blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10 text-white">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Stop passing .env files over Slack</h2>
          <p className="text-indigo-100 text-lg mb-10 max-w-2xl mx-auto">
            Join developers keeping their secrets secure, synced, and democratized with EnVault.
          </p>
          <Link 
            href={isLoggedIn ? "/dashboard" : "/register"}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-indigo-600 font-bold hover:bg-indigo-50 transition-all shadow-xl hover:-translate-y-1"
          >
            {isLoggedIn ? "Open Dashboard" : "Create Free Account"}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-xs">
              V
            </div>
            <span className="font-bold text-slate-800">EnVault</span>
          </div>
          <p className="text-slate-500 text-sm">
            © {new Date().getFullYear()} EnVault. Secure by design.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Custom 3D Flip Card Component
function FlipFeatureCard({ icon, title, shortDesc, longDesc, delay }: { icon: React.ReactNode, title: string, shortDesc: string, longDesc: string, delay: number }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div 
      className="relative w-full h-[280px] [perspective:1000px] cursor-pointer group"
      onMouseEnter={() => setIsFlipped(true)}
      onMouseLeave={() => setIsFlipped(false)}
    >
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, delay }}
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        className="w-full h-full relative [transform-style:preserve-3d] transition-transform duration-500 ease-in-out"
      >
        {/* Front Face */}
        <div className="absolute w-full h-full bg-white rounded-2xl p-6 border border-slate-200 shadow-sm [backface-visibility:hidden]">
          <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-6 text-slate-600">
            {icon}
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-3">{title}</h3>
          <p className="text-slate-600 leading-relaxed text-sm">{shortDesc}</p>
          <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="w-5 h-5 text-indigo-400" />
          </div>
        </div>

        {/* Back Face */}
        <div className="absolute w-full h-full bg-indigo-600 rounded-2xl p-6 border border-indigo-700 shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)] text-white flex flex-col justify-center">
          <h3 className="text-lg font-bold mb-3">{title} Details</h3>
          <p className="text-indigo-100 text-sm leading-relaxed">{longDesc}</p>
        </div>
      </motion.div>
    </div>
  );
}
