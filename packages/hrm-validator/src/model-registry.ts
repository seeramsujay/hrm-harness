export type HRMArchitecture =
  | "hrm-dual-timescale"
  | "hrm-prefix-lm"
  | "hrm-gguf"
  | "hrm-prototype"
  | "custom";

export interface HRMModelSpec {
  id: string;
  name: string;
  repo: string;
  description: string;
  parameters: string;
  architecture: HRMArchitecture;
  primaryFiles: string[];
  estimatedSize: string;
  defaultBranch?: string;
  aliases?: string[];
}

export const HRM_PRESET_MODELS: HRMModelSpec[] = [
  {
    id: "hrm-text-1b",
    name: "HRM-Text-1B (Base)",
    repo: "sapientinc/HRM-Text-1B",
    description: "Official 1B-parameter base Hierarchical Reasoning Model with dual-timescale PrefixLM recurrence",
    parameters: "1B",
    architecture: "hrm-dual-timescale",
    primaryFiles: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "model.safetensors"
    ],
    estimatedSize: "~2.1 GB",
    defaultBranch: "main",
    aliases: ["default", "base", "1b", "official"]
  },
  {
    id: "hrm-chat",
    name: "HRM-Text-1B-Chat",
    repo: "taykso/HRM-Text-1B-Chat",
    description: "Two-phase chat & instruction fine-tune targeting explorer and refiner reasoning cycles",
    parameters: "1B",
    architecture: "hrm-dual-timescale",
    primaryFiles: [
      "config.json",
      "tokenizer.json",
      "tokenizer_config.json",
      "special_tokens_map.json",
      "model.safetensors"
    ],
    estimatedSize: "~2.1 GB",
    defaultBranch: "main",
    aliases: ["chat", "1b-chat", "taykso"]
  },
  {
    id: "hrm-gguf",
    name: "HRM-Text-1B-GGUF",
    repo: "sinimiini/HRM-Text-1B-GGUF",
    description: "Quantized GGUF checkpoint (Q4_K_M) for low-memory local runtime inference",
    parameters: "1B",
    architecture: "hrm-gguf",
    primaryFiles: [
      "config.json",
      "HRM-Text-1B-Q4_K_M.gguf"
    ],
    estimatedSize: "~780 MB",
    defaultBranch: "main",
    aliases: ["gguf", "quantized", "q4"]
  },
  {
    id: "hrm-41m",
    name: "HRM-Text1-41M",
    repo: "qingy2024/HRM-Text1-41M",
    description: "Ultra-compact 41M prototype model for rapid local invariant verification and triage",
    parameters: "41M",
    architecture: "hrm-prototype",
    primaryFiles: [
      "config.json",
      "tokenizer.json",
      "model.safetensors"
    ],
    estimatedSize: "~85 MB",
    defaultBranch: "main",
    aliases: ["41m", "tiny", "prototype"]
  },
  {
    id: "hrm-demo",
    name: "HRM-Demo-27M",
    repo: "Ex0bit/hrm-demo",
    description: "Original 27M ARC/multi-timescale demonstration recurrent checkpoint",
    parameters: "27M",
    architecture: "hrm-dual-timescale",
    primaryFiles: [
      "config.json",
      "model.safetensors"
    ],
    estimatedSize: "~55 MB",
    defaultBranch: "main",
    aliases: ["demo", "27m"]
  }
];

/**
 * Returns all preset HRM models.
 */
export function getRegisteredModels(): HRMModelSpec[] {
  return [...HRM_PRESET_MODELS];
}

/**
 * Resolves a model ID, preset alias, or arbitrary HuggingFace repository string (e.g., "org/model").
 */
export function resolveModelSpec(idOrRepo: string): HRMModelSpec {
  const normalized = idOrRepo.trim().toLowerCase();

  // 1. Direct ID match
  const directMatch = HRM_PRESET_MODELS.find(
    (m) => m.id.toLowerCase() === normalized || m.repo.toLowerCase() === normalized
  );
  if (directMatch) return directMatch;

  // 2. Alias match
  const aliasMatch = HRM_PRESET_MODELS.find((m) =>
    m.aliases?.some((a) => a.toLowerCase() === normalized)
  );
  if (aliasMatch) return aliasMatch;

  // 3. HuggingFace URL format: https://huggingface.co/org/model
  let cleanRepo = idOrRepo.trim();
  if (cleanRepo.startsWith("https://huggingface.co/")) {
    cleanRepo = cleanRepo.replace("https://huggingface.co/", "").replace(/\/$/, "");
  }

  // 4. Custom HuggingFace repository: "owner/model"
  if (cleanRepo.includes("/")) {
    const parts = cleanRepo.split("/");
    const modelName = parts[parts.length - 1];
    const sanitizedId = cleanRepo.replace(/\//g, "--").toLowerCase();

    return {
      id: sanitizedId,
      name: modelName,
      repo: cleanRepo,
      description: `Custom HuggingFace model repository (${cleanRepo})`,
      parameters: "Custom",
      architecture: "custom",
      primaryFiles: [
        "config.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "model.safetensors"
      ],
      estimatedSize: "Unknown",
      defaultBranch: "main"
    };
  }

  // Fallback: Default to base HRM-Text-1B if not matched
  return HRM_PRESET_MODELS[0];
}
