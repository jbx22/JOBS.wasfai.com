// hostSlug is the OpenRouter provider allowed to receive the model request.
export const PERSONAL_AI_MODELS = [
  {
    id: "deepseek-v4.1-flash",
    model: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    host: "DeepInfra",
    hostSlug: "deepinfra",
  },
  {
    id: "gpt-4.1-mini",
    model: "openai/gpt-4.1-mini",
    label: "GPT-4.1 mini",
    host: "OpenAI",
    hostSlug: "openai",
  },
];
