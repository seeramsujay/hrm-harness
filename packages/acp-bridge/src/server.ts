import * as http from "node:http";
import { DiffInterceptor } from "./interceptor.ts";

export interface ACPBridgeConfig {
  port: number;
  host: string;
}

export class ACPBridgeServer {
  private server: http.Server | null = null;
  private config: ACPBridgeConfig;
  private interceptor = new DiffInterceptor();

  constructor(config: Partial<ACPBridgeConfig> = {}) {
    this.config = {
      port: config.port ?? 51121,
      host: config.host ?? "127.0.0.1"
    };
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        const pathname = reqUrl.pathname;

        // CORS headers for Antigravity / IDE webviews
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }

        // OAuth PKCE Callback Endpoint
        if (pathname === "/oauth/callback" || pathname === "/auth") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                <h2>Antigravity / ACP Authentication Successful</h2>
                <p>You can close this window and return to your terminal.</p>
              </body>
            </html>
          `);
          return;
        }

        // Health check endpoint
        if (pathname === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "healthy", bridge: "acp-antigravity", port: this.config.port }));
          return;
        }

        // ACP Candidate Diff Interceptor Endpoint
        if (pathname === "/v1/intercept" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", async () => {
            try {
              const payload = JSON.parse(body);
              const result = await this.interceptor.interceptProposedEdit(payload);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not Found" }));
      });

      this.server.on("error", (err) => reject(err));
      this.server.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }
}
