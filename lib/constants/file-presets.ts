export type FileDraftPreset = {
  label: string;
  description: string;
  name: string;
  folderPath: string;
  content: string;
};

export const FILE_DRAFT_PRESETS: FileDraftPreset[] = [
  { label: 'Markdown', description: 'Docs, notes, readmes', name: 'README.md', folderPath: '/', content: '# Untitled\n\n' },
  { label: 'TypeScript', description: 'App logic or utilities', name: 'index.ts', folderPath: '/src', content: "export function main() {\n  return 'hello';\n}\n" },
  { label: 'JavaScript', description: 'Scripts and small modules', name: 'script.js', folderPath: '/src', content: "export function main() {\n  return 'hello';\n}\n" },
  { label: 'JSON', description: 'Config and metadata', name: 'config.json', folderPath: '/config', content: '{\n  "name": "private-space"\n}\n' },
  { label: 'Env', description: 'Secrets or environment flags', name: '.env.local', folderPath: '/', content: 'API_URL=\nAPI_TOKEN=\n' },
  { label: 'Text', description: 'Scratch or plain text', name: 'notes.txt', folderPath: '/', content: '' },
  
  // 35 More templates
  { label: 'Python', description: 'Scripts and backend logic', name: 'main.py', folderPath: '/src', content: "def main():\n    print('Hello World')\n\nif __name__ == '__main__':\n    main()\n" },
  { label: 'Go', description: 'Fast backend services', name: 'main.go', folderPath: '/cmd', content: "package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"Hello, World!\")\n}\n" },
  { label: 'Rust', description: 'Systems programming', name: 'main.rs', folderPath: '/src', content: "fn main() {\n    println!(\"Hello, world!\");\n}\n" },
  { label: 'Java', description: 'Enterprise applications', name: 'Main.java', folderPath: '/src', content: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello World\");\n    }\n}\n" },
  { label: 'C++', description: 'High performance code', name: 'main.cpp', folderPath: '/src', content: "#include <iostream>\n\nint main() {\n    std::cout << \"Hello World!\" << std::endl;\n    return 0;\n}\n" },
  { label: 'C', description: 'Low level systems', name: 'main.c', folderPath: '/src', content: "#include <stdio.h>\n\nint main() {\n    printf(\"Hello World\\n\");\n    return 0;\n}\n" },
  { label: 'C#', description: '.NET Applications', name: 'Program.cs', folderPath: '/src', content: "using System;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.WriteLine(\"Hello World!\");\n    }\n}\n" },
  { label: 'PHP', description: 'Web backend scripts', name: 'index.php', folderPath: '/public', content: "<?php\n\necho \"Hello World!\";\n" },
  { label: 'Ruby', description: 'Scripts and Rails apps', name: 'main.rb', folderPath: '/lib', content: "def main\n  puts 'Hello World'\nend\n\nmain\n" },
  { label: 'Swift', description: 'Apple ecosystem apps', name: 'main.swift', folderPath: '/Sources', content: "print(\"Hello, World!\")\n" },
  { label: 'Kotlin', description: 'Android and JVM', name: 'Main.kt', folderPath: '/src', content: "fun main() {\n    println(\"Hello World\")\n}\n" },
  { label: 'HTML', description: 'Web page structure', name: 'index.html', folderPath: '/public', content: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n    <meta charset=\"UTF-8\">\n    <title>Hello World</title>\n</head>\n<body>\n    <h1>Hello World</h1>\n</body>\n</html>\n" },
  { label: 'CSS', description: 'Stylesheets', name: 'styles.css', folderPath: '/public', content: "body {\n    margin: 0;\n    font-family: sans-serif;\n}\n" },
  { label: 'SCSS', description: 'Sass stylesheets', name: 'styles.scss', folderPath: '/src/styles', content: "$primary-color: #333;\n\nbody {\n  color: $primary-color;\n}\n" },
  { label: 'SQL', description: 'Database queries', name: 'schema.sql', folderPath: '/db', content: "CREATE TABLE users (\n    id INT PRIMARY KEY,\n    name VARCHAR(255) NOT NULL\n);\n" },
  { label: 'YAML', description: 'Configuration and CI/CD', name: 'config.yml', folderPath: '/', content: "version: '3'\nservices:\n  app:\n    image: node:alpine\n" },
  { label: 'TOML', description: 'Configuration formats', name: 'Config.toml', folderPath: '/', content: "[server]\nport = 8080\nhost = \"127.0.0.1\"\n" },
  { label: 'XML', description: 'Data formatting', name: 'data.xml', folderPath: '/data', content: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<root>\n    <item>Hello World</item>\n</root>\n" },
  { label: 'Bash', description: 'Shell scripts', name: 'script.sh', folderPath: '/scripts', content: "#!/bin/bash\n\necho \"Hello World\"\n" },
  { label: 'PowerShell', description: 'Windows automation', name: 'script.ps1', folderPath: '/scripts', content: "Write-Host \"Hello World\"\n" },
  { label: 'Dockerfile', description: 'Container definitions', name: 'Dockerfile', folderPath: '/', content: "FROM alpine:latest\nCMD [\"echo\", \"Hello World\"]\n" },
  { label: 'Makefile', description: 'Build scripts', name: 'Makefile', folderPath: '/', content: "all:\n\techo \"Hello World\"\n" },
  { label: 'GraphQL', description: 'API schemas', name: 'schema.graphql', folderPath: '/src', content: "type Query {\n  hello: String\n}\n" },
  { label: 'Prisma', description: 'Database ORM schema', name: 'schema.prisma', folderPath: '/prisma', content: "generator client {\n  provider = \"prisma-client-js\"\n}\n\ndatasource db {\n  provider = \"postgresql\"\n  url      = env(\"DATABASE_URL\")\n}\n" },
  { label: 'Docker Compose', description: 'Multi-container orchestration', name: 'docker-compose.yml', folderPath: '/', content: "version: '3.8'\nservices:\n  web:\n    build: .\n    ports:\n      - \"8000:8000\"\n" },
  { label: 'GitIgnore', description: 'Git exclusion rules', name: '.gitignore', folderPath: '/', content: "node_modules/\n.env\n.DS_Store\n" },
  { label: 'NPM Package', description: 'Node package manifest', name: 'package.json', folderPath: '/', content: "{\n  \"name\": \"my-project\",\n  \"version\": \"1.0.0\",\n  \"scripts\": {\n    \"start\": \"node index.js\"\n  }\n}\n" },
  { label: 'TSConfig', description: 'TypeScript config', name: 'tsconfig.json', folderPath: '/', content: "{\n  \"compilerOptions\": {\n    \"target\": \"es2022\",\n    \"module\": \"commonjs\",\n    \"strict\": true\n  }\n}\n" },
  { label: 'Prettier', description: 'Code formatting config', name: '.prettierrc', folderPath: '/', content: "{\n  \"semi\": true,\n  \"singleQuote\": true,\n  \"tabWidth\": 2\n}\n" },
  { label: 'ESLint', description: 'Linting configuration', name: '.eslintrc.json', folderPath: '/', content: "{\n  \"extends\": [\"eslint:recommended\"],\n  \"env\": {\n    \"node\": true,\n    \"es2022\": true\n  }\n}\n" },
  { label: 'React Component', description: 'React UI component', name: 'Component.tsx', folderPath: '/src/components', content: "import React from 'react';\n\nexport function Component() {\n  return (\n    <div>Hello World</div>\n  );\n}\n" },
  { label: 'Next.js Page', description: 'Next.js App Router page', name: 'page.tsx', folderPath: '/app', content: "export default function Page() {\n  return (\n    <main>\n      <h1>Hello World</h1>\n    </main>\n  );\n}\n" },
  { label: 'Tailwind Config', description: 'Tailwind CSS setup', name: 'tailwind.config.js', folderPath: '/', content: "/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: [\"./src/**/*.{js,ts,jsx,tsx}\"],\n  theme: {\n    extend: {},\n  },\n  plugins: [],\n}\n" },
  { label: 'Vite Config', description: 'Vite bundler config', name: 'vite.config.ts', folderPath: '/', content: "import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: [],\n})\n" },
  { label: 'Jest Config', description: 'Testing configuration', name: 'jest.config.js', folderPath: '/', content: "module.exports = {\n  preset: 'ts-jest',\n  testEnvironment: 'node',\n};\n" },
  { label: 'GitHub Actions', description: 'CI/CD workflow', name: 'ci.yml', folderPath: '/.github/workflows', content: "name: CI\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n      - run: echo \"Hello World\"\n" },
];

export function getSuggestedPresetByFilename(filename: string): FileDraftPreset | null {
  const normalized = filename.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.endsWith('.md') || normalized === 'readme') return FILE_DRAFT_PRESETS[0];
  if (normalized.endsWith('.ts') || normalized.endsWith('.tsx')) return FILE_DRAFT_PRESETS[1];
  if (normalized.endsWith('.js') || normalized.endsWith('.jsx')) return FILE_DRAFT_PRESETS[2];
  if (normalized.endsWith('.json')) return FILE_DRAFT_PRESETS[3];
  if (normalized.startsWith('.env')) return FILE_DRAFT_PRESETS[4];
  if (normalized.endsWith('.txt')) return FILE_DRAFT_PRESETS[5];
  
  const match = FILE_DRAFT_PRESETS.find(p => p.name.toLowerCase() === normalized);
  if (match) return match;
  
  if (normalized.endsWith('.py')) return FILE_DRAFT_PRESETS.find(p => p.label === 'Python') || null;
  if (normalized.endsWith('.go')) return FILE_DRAFT_PRESETS.find(p => p.label === 'Go') || null;
  if (normalized.endsWith('.rs')) return FILE_DRAFT_PRESETS.find(p => p.label === 'Rust') || null;
  if (normalized.endsWith('.java')) return FILE_DRAFT_PRESETS.find(p => p.label === 'Java') || null;
  if (normalized.endsWith('.cpp') || normalized.endsWith('.cc')) return FILE_DRAFT_PRESETS.find(p => p.label === 'C++') || null;
  if (normalized.endsWith('.c')) return FILE_DRAFT_PRESETS.find(p => p.label === 'C') || null;
  if (normalized.endsWith('.cs')) return FILE_DRAFT_PRESETS.find(p => p.label === 'C#') || null;
  if (normalized.endsWith('.php')) return FILE_DRAFT_PRESETS.find(p => p.label === 'PHP') || null;
  if (normalized.endsWith('.rb')) return FILE_DRAFT_PRESETS.find(p => p.label === 'Ruby') || null;
  if (normalized.endsWith('.swift')) return FILE_DRAFT_PRESETS.find(p => p.label === 'Swift') || null;
  if (normalized.endsWith('.kt')) return FILE_DRAFT_PRESETS.find(p => p.label === 'Kotlin') || null;
  if (normalized.endsWith('.html')) return FILE_DRAFT_PRESETS.find(p => p.label === 'HTML') || null;
  if (normalized.endsWith('.css')) return FILE_DRAFT_PRESETS.find(p => p.label === 'CSS') || null;
  if (normalized.endsWith('.scss')) return FILE_DRAFT_PRESETS.find(p => p.label === 'SCSS') || null;
  if (normalized.endsWith('.sql')) return FILE_DRAFT_PRESETS.find(p => p.label === 'SQL') || null;
  if (normalized.endsWith('.yml') || normalized.endsWith('.yaml')) return FILE_DRAFT_PRESETS.find(p => p.label === 'YAML') || null;
  if (normalized.endsWith('.toml')) return FILE_DRAFT_PRESETS.find(p => p.label === 'TOML') || null;
  if (normalized.endsWith('.xml')) return FILE_DRAFT_PRESETS.find(p => p.label === 'XML') || null;
  if (normalized.endsWith('.sh')) return FILE_DRAFT_PRESETS.find(p => p.label === 'Bash') || null;
  if (normalized.endsWith('.ps1')) return FILE_DRAFT_PRESETS.find(p => p.label === 'PowerShell') || null;
  
  return null;
}
