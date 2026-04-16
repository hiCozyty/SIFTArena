import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export async function checkNVIDIAApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch("/api/nvidia/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.2-3b-instruct",
        messages: [{ role: "user", content: "test" }],
        temperature: 0.2,
        top_p: 0.7,
        frequency_penalty: 0,
        presence_penalty: 0,
        max_tokens: 1,
        stream: false,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}
