const detectors: { code: string; pattern: RegExp }[] = [
  { code: 'PRIVATE_KEY', pattern: /-----BEGIN [^-]*PRIVATE KEY-----/i },
  { code: 'OPENAI_KEY', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { code: 'GITHUB_TOKEN', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/ },
  { code: 'BEARER_TOKEN', pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { code: 'NAMED_SECRET', pattern: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/i },
];
export function detectedSecretCodes(text: string): string[] { return detectors.filter(item => item.pattern.test(text)).map(item => item.code); }
