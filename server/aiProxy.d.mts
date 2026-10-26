import type { Plugin } from 'vite';

export function aiProxyPlugin(env: Record<string, string>): Plugin;
export function resolveTranscribeConfig(env: Record<string, string>): { key: string; base: string; model: string };
export function resolveAiConfig(env: Record<string, string>): { provider: string; key: string; base: string; model: string };
export function createAiHandler(
  env: Record<string, string>,
  fetchImpl?: typeof fetch,
): (req: unknown, res: unknown, next: () => void) => Promise<void>;
