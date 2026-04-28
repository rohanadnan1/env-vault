# Env Vault

Env Vault is a secure, robust environment variable and secrets management application built with Next.js. It allows developers and teams to safely store, manage, and share environment files, secrets, and project configurations with end-to-end encryption features.

## 🚀 Getting Started

Follow these steps to set up and run the project locally.

### Prerequisites
- Node.js (v18+)
- npm, yarn, pnpm, or bun
- A SQL database (PostgreSQL/MySQL/SQLite, as it uses Prisma)

### Installation & Startup

1. **Clone the repository and install dependencies:**
   ```bash
   npm install
   # or yarn install / pnpm install / bun install
   ```

2. **Environment Variables:**
   Create a `.env` file in the root directory based on your database requirements, including `DATABASE_URL` and `AUTH_SECRET` for NextAuth.

3. **Database Setup:**
   Generate the Prisma client and push the schema to your database.
   ```bash
   npx prisma generate
   npx prisma db push
   # or npx prisma migrate dev
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   # or yarn dev / pnpm dev / bun dev
   ```

5. **Open the Application:**
   Visit [http://localhost:3000](http://localhost:3000) in your browser.

## ✨ Key Features

- **Secure Environment Vaults:** Safely store, manage, and organize `.env` files for different projects and environments.
- **End-to-End Encryption:** Use a Master Key to securely encrypt and decrypt sensitive configurations on the fly.
- **Secret Comments System:** Add encrypted comments to your environment files that are only accessible with the correct vault keys. Time-based recency labels keep track of changes.
- **Variable Bundles:** Group and manage environment variables seamlessly.
- **Modern Tech Stack:** Built with Next.js (App Router), React 19, Prisma ORM, NextAuth for secure authentication, and Tailwind CSS v4.
- **Beautiful UI/UX:** Utilizes Shadcn UI, Monaco Editor, and modern aesthetics for a premium developer experience.

## 🔮 Future Endeavors (Coming Soon)

We are constantly expanding Env Vault to make developer workflows smoother and more secure. Here is what is on the roadmap:

### 🔌 Code Editor Extension
A dedicated IDE extension that syncs directly with the Env Vault app. This will allow you to update environment variables and local, untracked files (those not pushed to GitHub) in **real-time** without any manual intervention or context switching.

### 🧠 AI-Powered Summarization Package (Python & npm)
We are building a dedicated AI package designed to intelligently summarize codebases and configurations. Whether you need to summarize a single file, a folder, an entire project, an environment, or a specific bundle, this package will handle it effortlessly.

**Planned AI Features for the Package:**
- **Security & Secret Scanning:** Intelligently detect leaked secrets, hardcoded credentials, or vulnerable patterns within the summarized files.
- **Automated Documentation Generation:** Automatically generate usage docs and onboarding guides based on your project's `.env` structures and codebase summaries.
- **Anomaly Detection:** Analyze `.env` files and alert you to missing standard variables, incorrect formatting, or misaligned configurations across different environments (e.g., missing a required DB URL in staging).
- **Natural Language Querying:** Ask questions like "Where is the database connection string defined?" or "What variables do I need to run the billing service?" and get precise answers based on the project's structural summary.
- **Smart Refactoring Suggestions:** Recommend ways to consolidate duplicate environment variables or optimize your secret management architecture.

---

*This project uses [Next.js](https://nextjs.org) and [Prisma](https://www.prisma.io/). Your feedback and contributions are always welcome!*
