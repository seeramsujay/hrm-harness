import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  type HRMModelSpec,
  getRegisteredModels,
  resolveModelSpec
} from "./model-registry.ts";

export interface ModelManifest {
  id: string;
  name: string;
  repo: string;
  revision: string;
  architecture: string;
  downloadedAt: string;
  files: string[];
  totalBytes: number;
}

export interface LocalModelStatus {
  spec: HRMModelSpec;
  isDownloaded: boolean;
  localPath: string;
  totalBytes: number;
  downloadedFiles: string[];
  manifest?: ModelManifest;
}

export interface ModelDownloadProgress {
  currentFile: string;
  fileIndex: number;
  totalFiles: number;
  fileBytesDownloaded: number;
  fileTotalBytes: number;
  totalBytesDownloaded: number;
  totalEstimatedBytes: number;
  percent: number;
}

export interface DownloadOptions {
  revision?: string;
  files?: string[];
  token?: string;
  force?: boolean;
  endpoint?: string;
  onProgress?: (progress: ModelDownloadProgress) => void;
}

export class HRMModelManager {
  private cacheDir: string;
  private defaultEndpoint: string;

  constructor(
    cacheDir?: string,
    defaultEndpoint: string = "https://huggingface.co"
  ) {
    this.cacheDir =
      cacheDir ||
      process.env.HRM_CACHE_DIR ||
      path.join(os.homedir(), ".cache", "hrm-models");
    this.defaultEndpoint = defaultEndpoint;
  }

  public getCacheDir(): string {
    return this.cacheDir;
  }

  public getModelPath(spec: HRMModelSpec): string {
    const sanitizedRepo = spec.repo.replace(/[/\\:]/g, "--");
    return path.join(this.cacheDir, sanitizedRepo);
  }

  /**
   * Lists all registered and locally cached models with their download status.
   */
  public listModels(): LocalModelStatus[] {
    const presets = getRegisteredModels();
    const results: LocalModelStatus[] = [];
    const processedRepos = new Set<string>();

    for (const spec of presets) {
      processedRepos.add(spec.repo.toLowerCase());
      results.push(this.getModelStatus(spec));
    }

    // Inspect cache directory for any custom models not in presets
    if (fs.existsSync(this.cacheDir)) {
      try {
        const entries = fs.readdirSync(this.cacheDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const manifestPath = path.join(this.cacheDir, entry.name, ".hrm-manifest.json");
            if (fs.existsSync(manifestPath)) {
              try {
                const manifest: ModelManifest = JSON.parse(
                  fs.readFileSync(manifestPath, "utf-8")
                );
                if (!processedRepos.has(manifest.repo.toLowerCase())) {
                  processedRepos.add(manifest.repo.toLowerCase());
                  const customSpec = resolveModelSpec(manifest.repo);
                  results.push(this.getModelStatus(customSpec));
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    return results;
  }

  /**
   * Gets the local download status of a specific model.
   */
  public getModelStatus(idOrRepoOrSpec: string | HRMModelSpec): LocalModelStatus {
    const spec =
      typeof idOrRepoOrSpec === "string"
        ? resolveModelSpec(idOrRepoOrSpec)
        : idOrRepoOrSpec;
    const modelPath = this.getModelPath(spec);
    const manifestPath = path.join(modelPath, ".hrm-manifest.json");

    let isDownloaded = false;
    let totalBytes = 0;
    let downloadedFiles: string[] = [];
    let manifest: ModelManifest | undefined;

    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (manifest && Array.isArray(manifest.files) && manifest.files.length > 0) {
          downloadedFiles = manifest.files.filter((f) =>
            fs.existsSync(path.join(modelPath, f))
          );
          if (downloadedFiles.length === manifest.files.length) {
            isDownloaded = true;
          }
          totalBytes = manifest.totalBytes || 0;
        }
      } catch {}
    }

    // If no manifest, check if files exist on disk
    if (!isDownloaded && fs.existsSync(modelPath)) {
      const diskFiles: string[] = [];
      let diskBytes = 0;
      for (const primaryFile of spec.primaryFiles) {
        const full = path.join(modelPath, primaryFile);
        if (fs.existsSync(full)) {
          diskFiles.push(primaryFile);
          diskBytes += fs.statSync(full).size;
        }
      }
      if (diskFiles.length === spec.primaryFiles.length && diskFiles.length > 0) {
        isDownloaded = true;
        downloadedFiles = diskFiles;
        totalBytes = diskBytes;
      }
    }

    return {
      spec,
      isDownloaded,
      localPath: modelPath,
      totalBytes,
      downloadedFiles,
      manifest
    };
  }

  /**
   * Queries Hugging Face Hub REST API for model metadata and sibling files.
   */
  public async fetchRemoteRepoInfo(
    spec: HRMModelSpec,
    token?: string
  ): Promise<{ sha?: string; siblings: string[]; private?: boolean }> {
    const authHeader = token || process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
    const headers: Record<string, string> = {
      "User-Agent": "hrm-harness/0.1.0"
    };
    if (authHeader) {
      headers["Authorization"] = `Bearer ${authHeader}`;
    }

    const url = `${this.defaultEndpoint}/api/models/${spec.repo}`;
    const res = await fetch(url, { headers });

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Authentication required for repository '${spec.repo}'. Set HF_TOKEN or pass --token.`
      );
    }
    if (res.status === 404) {
      throw new Error(`HuggingFace repository '${spec.repo}' was not found.`);
    }
    if (!res.ok) {
      throw new Error(
        `Failed to fetch HuggingFace model info (${res.status} ${res.statusText})`
      );
    }

    const data = (await res.json()) as any;
    const siblings: string[] = (data.siblings || [])
      .map((s: any) => s.rfilename)
      .filter(Boolean);

    return {
      sha: data.sha,
      siblings,
      private: data.private
    };
  }

  /**
   * Downloads model weights and configuration files from HuggingFace.
   */
  public async downloadModel(
    idOrRepo: string,
    options: DownloadOptions = {}
  ): Promise<LocalModelStatus> {
    const spec = resolveModelSpec(idOrRepo);
    const revision = options.revision || spec.defaultBranch || "main";
    const endpoint = options.endpoint || this.defaultEndpoint;
    const token =
      options.token || process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
    const modelDir = this.getModelPath(spec);

    fs.mkdirSync(modelDir, { recursive: true });

    // Determine target files to download
    let targetFiles = options.files;
    if (!targetFiles || targetFiles.length === 0) {
      try {
        const repoInfo = await this.fetchRemoteRepoInfo(spec, token);
        if (repoInfo.siblings.length > 0) {
          // Select essential files matching model needs (config, tokenizer, weights)
          targetFiles = repoInfo.siblings.filter((file) => {
            if (spec.primaryFiles.includes(file)) return true;
            if (file.endsWith(".safetensors") || file.endsWith(".gguf") || file.endsWith(".bin")) return true;
            if (file.endsWith(".json") && !file.includes("/")) return true;
            return false;
          });
        }
      } catch (err: any) {
        // If remote API listing fails (e.g. offline or strict network), fall back to primaryFiles
        targetFiles = [...spec.primaryFiles];
      }
    }

    if (!targetFiles || targetFiles.length === 0) {
      targetFiles = [...spec.primaryFiles];
    }

    const downloadedFiles: string[] = [];
    let totalBytes = 0;

    for (let i = 0; i < targetFiles.length; i++) {
      const fileName = targetFiles[i];
      const destPath = path.join(modelDir, fileName);
      const destDir = path.dirname(destPath);
      fs.mkdirSync(destDir, { recursive: true });

      // Check if file already exists
      if (!options.force && fs.existsSync(destPath)) {
        const stat = fs.statSync(destPath);
        if (stat.size > 0) {
          downloadedFiles.push(fileName);
          totalBytes += stat.size;
          if (options.onProgress) {
            options.onProgress({
              currentFile: fileName,
              fileIndex: i + 1,
              totalFiles: targetFiles.length,
              fileBytesDownloaded: stat.size,
              fileTotalBytes: stat.size,
              totalBytesDownloaded: totalBytes,
              totalEstimatedBytes: totalBytes,
              percent: Math.round(((i + 1) / targetFiles.length) * 100)
            });
          }
          continue;
        }
      }

      // Download file stream from HuggingFace resolve URL
      const fileUrl = `${endpoint}/${spec.repo}/resolve/${revision}/${fileName}`;
      const headers: Record<string, string> = {
        "User-Agent": "hrm-harness/0.1.0"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(fileUrl, { headers, redirect: "follow" });

      if (res.status === 404) {
        // If a non-essential file isn't found, continue if it wasn't the main weights
        if (fileName === "model.safetensors" || fileName.endsWith(".gguf")) {
          throw new Error(`Model weight file '${fileName}' not found at ${fileUrl}`);
        }
        continue;
      }

      if (!res.ok) {
        throw new Error(
          `Failed downloading '${fileName}' from HuggingFace (${res.status} ${res.statusText})`
        );
      }

      const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
      const tempPath = `${destPath}.tmp.${Date.now()}`;
      const writeStream = fs.createWriteStream(tempPath);

      if (res.body) {
        let fileBytes = 0;
        const reader = res.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            writeStream.write(Buffer.from(value));
            fileBytes += value.length;
            totalBytes += value.length;

            if (options.onProgress) {
              const filePercent = contentLength > 0
                ? Math.round((fileBytes / contentLength) * 100)
                : 0;
              options.onProgress({
                currentFile: fileName,
                fileIndex: i + 1,
                totalFiles: targetFiles.length,
                fileBytesDownloaded: fileBytes,
                fileTotalBytes: contentLength,
                totalBytesDownloaded: totalBytes,
                totalEstimatedBytes: contentLength > 0 ? contentLength : totalBytes,
                percent: filePercent
              });
            }
          }
        }

        await new Promise<void>((resolve, reject) => {
          writeStream.end((err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Rename temp file to dest
      fs.renameSync(tempPath, destPath);
      downloadedFiles.push(fileName);
    }

    // Write manifest
    const manifest: ModelManifest = {
      id: spec.id,
      name: spec.name,
      repo: spec.repo,
      revision,
      architecture: spec.architecture,
      downloadedAt: new Date().toISOString(),
      files: downloadedFiles,
      totalBytes
    };

    fs.writeFileSync(
      path.join(modelDir, ".hrm-manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    return this.getModelStatus(spec);
  }

  /**
   * Deletes locally cached model files and manifest.
   */
  public removeModel(idOrRepo: string): boolean {
    const spec = resolveModelSpec(idOrRepo);
    const modelPath = this.getModelPath(spec);

    if (fs.existsSync(modelPath)) {
      fs.rmSync(modelPath, { recursive: true, force: true });
      return true;
    }
    return false;
  }
}
