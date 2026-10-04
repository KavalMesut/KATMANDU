import path from 'node:path';
import { isFileLoadingAllowed, type Plugin } from 'vite';

// Keep the default Vite exclusions and protect private workspace data too.
export const PRIVATE_FILE_DENY_LIST = [
  '.env', '.env.*', '*.{crt,pem,key,cert,secret}', '**/.git/**',
  '**/solutions/**', '**/cozumler/**', '**/basarisiz_deneme/**', '**/tasarim_secenekleri/**', '**/KATMANDU.desktop',
  '**/FUTURE_ROADMAP.md', '**/EXPORT_ROADMAP.md', '**/AGENTS.md'
];

export function assertNoBuildSecrets(env: Record<string, unknown>): void {
  const fields = Object.keys(env).filter(name =>
    /^VITE_.*(?:API_KEY|TOKEN|PASSWORD|SECRET)$/.test(name) &&
    typeof env[name] === 'string' && (env[name] as string).trim()
  );
  if (fields.length) {
    // Report variable names only; never print their values.
    throw new Error(`Production build blocked: ${fields.join(', ')} contains private credentials. Remove these build-time values and enter API keys in application Settings instead.`);
  }
}

export function publicationSafetyPlugin(): Plugin {
  return {
    name: 'katmandu-publication-safety',
    configResolved(config) {
      if (config.command === 'build') assertNoBuildSecrets(config.env);
    },
    configureServer(server) {
      // Reject private assets before Vite can transform ?import or ?raw requests.
      server.middlewares.use((req, res, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
        } catch {
          res.statusCode = 400;
          res.end('Invalid request path.');
          return;
        }
        const file = pathname.startsWith('/@fs/')
          ? pathname.slice(process.platform === 'win32' ? 5 : 4)
          : path.resolve(server.config.root, `.${pathname}`);
        if (!isFileLoadingAllowed(server.config, file.replace(/\\/g, '/'))) {
          res.statusCode = 403;
          res.end('Private workspace files are not publicly accessible.');
          return;
        }
        next();
      });
    }
  };
}
