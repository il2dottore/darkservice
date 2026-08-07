import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { resolve } from 'node:path';
import { createProxyServer } from 'http-proxy-3';

interface ProxyConfig {
  modules: Record<string, string>;
  sockets?: Record<string, string>;
}

interface ProxyRoute {
  kind: 'module' | 'socket';
  publicPrefix: string;
  upstreamOrigin: string;
}

@Injectable()
export class GatewayService {
  private readonly logger = new Logger(GatewayService.name);
  private readonly proxy: ReturnType<typeof createProxyServer>;
  private readonly routes: ProxyRoute[];

  constructor(private readonly config: ConfigService) {
    this.proxy = createProxyServer({
      changeOrigin: true,
      xfwd: true,
      ws: true,
    });
    this.routes = this.loadRoutes();

    this.proxy.on('error', (...args: unknown[]) => {
      const [error, request, response] = args as [
        Error,
        IncomingMessage,
        ServerResponse | Socket,
      ];
      this.handleProxyError(error, request, response);
    });
  }

  use(
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ): void {
    const route = this.findRoute(request.url);
    if (!route) {
      next();
      return;
    }

    this.proxy.web(request, response, {
      target: this.createTarget(route, request.url ?? '/'),
      ignorePath: true,
    });
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    const route = this.findRoute(request.url);
    if (!route || route.kind !== 'socket') {
      socket.destroy();
      return;
    }

    this.proxy.ws(request, socket, head, {
      target: this.createTarget(route, request.url ?? '/'),
      ignorePath: true,
    });
  }

  logListening(port: number): void {
    this.logger.log(`API gateway listening on http://localhost:${port}`);
    for (const route of this.routes) {
      this.logger.log(
        `${route.kind} ${route.publicPrefix} -> ${route.upstreamOrigin}`,
      );
    }
  }

  private loadRoutes(): ProxyRoute[] {
    const configPath = resolve(
      process.cwd(),
      this.config.get<string>('PROXY_CONFIG', 'apps/gateway/config.json'),
    );
    let parsed: ProxyConfig;

    try {
      parsed = JSON.parse(readFileSync(configPath, 'utf8')) as ProxyConfig;
    } catch (error) {
      throw new Error(
        `Cannot read proxy config "${configPath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!parsed.modules || Object.keys(parsed.modules).length === 0) {
      throw new Error(`Proxy config "${configPath}" does not define modules`);
    }

    const routes = Object.entries(parsed.modules).map(([name, value]) =>
      this.createModuleRoute(name, value),
    );
    const socketRoutes = Object.entries(parsed.sockets ?? {}).map(
      ([publicPrefix, value]) => this.createSocketRoute(publicPrefix, value),
    );
    const allRoutes = [...routes, ...socketRoutes];
    const duplicatePrefixes = allRoutes
      .map((route) => route.publicPrefix)
      .filter((prefix, index, prefixes) => prefixes.indexOf(prefix) !== index);

    if (duplicatePrefixes.length > 0) {
      throw new Error(
        `Duplicate proxy route prefix: ${[...new Set(duplicatePrefixes)].join(', ')}`,
      );
    }

    return allRoutes.sort(
      (left, right) => right.publicPrefix.length - left.publicPrefix.length,
    );
  }

  private createModuleRoute(name: string, value: string): ProxyRoute {
    const upstream = this.parseUrl(value, `module "${name}"`);
    if (!upstream.pathname || upstream.pathname === '/') {
      throw new Error(
        `Module "${name}" must include an upstream path: ${value}`,
      );
    }

    return {
      kind: 'module',
      publicPrefix: removeTrailingSlash(upstream.pathname),
      upstreamOrigin: upstream.origin,
    };
  }

  private createSocketRoute(publicPrefix: string, value: string): ProxyRoute {
    const upstream = this.parseUrl(value, `socket "${publicPrefix}"`);
    const normalizedPrefix = removeTrailingSlash(publicPrefix);
    if (!normalizedPrefix.startsWith('/socket.io/')) {
      throw new Error(
        `Socket route must start with /socket.io/: ${publicPrefix}`,
      );
    }

    return {
      kind: 'socket',
      publicPrefix: normalizedPrefix,
      upstreamOrigin: upstream.origin,
    };
  }

  private parseUrl(value: string, label: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Invalid URL for ${label}: ${value}`);
    }

    if (!parsed.protocol || !parsed.host) {
      throw new Error(`Invalid upstream URL for ${label}: ${value}`);
    }
    return parsed;
  }

  private findRoute(requestUrl = '/'): ProxyRoute | undefined {
    const pathname = new URL(requestUrl, 'http://gateway.invalid').pathname;
    return this.routes.find(
      (route) =>
        pathname === route.publicPrefix ||
        pathname.startsWith(`${route.publicPrefix}/`),
    );
  }

  private createTarget(route: ProxyRoute, requestUrl: string): string {
    const request = new URL(requestUrl, 'http://gateway.invalid');
    const target = new URL(route.upstreamOrigin);

    if (route.kind === 'module') {
      target.pathname = request.pathname;
    } else {
      const suffix = request.pathname.slice(route.publicPrefix.length);
      target.pathname = joinPath('/socket.io/', suffix);
    }
    target.search = request.search;
    return target.toString();
  }

  private handleProxyError(
    error: Error,
    request: IncomingMessage,
    response: ServerResponse | Socket,
  ): void {
    this.logger.error(
      `Proxy ${request.method ?? 'HTTP'} ${request.url ?? '/'} failed: ${error.message}`,
    );

    if (response && 'headersSent' in response && !response.headersSent) {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'upstream service unavailable' }));
    } else if (
      response &&
      'writableEnded' in response &&
      !response.writableEnded
    ) {
      response.end();
    }
  }
}

function removeTrailingSlash(value: string): string {
  const normalized = value.trim().replace(/\\/g, '/');
  if (normalized === '/') {
    return normalized;
  }
  return normalized.replace(/\/+$/, '');
}

function joinPath(prefix: string, suffix: string): string {
  return `${prefix.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}
