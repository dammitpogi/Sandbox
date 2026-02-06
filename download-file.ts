import { tool } from "@opencode-ai/plugin"
import { mkdir } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"

function inferFilenameFromUrl(url: URL): string {
  const lastSegment = url.pathname.split("/").filter(Boolean).pop()
  return lastSegment || "downloaded-file"
}

export default tool({
  description: "Download a file from an HTTP(S) URL and save it locally.",
  args: {
    url: tool.schema
      .string()
      .url()
      .describe("HTTP(S) URL for the file to download"),
    outputPath: tool.schema
      .string()
      .optional()
      .describe(
        "Optional output path. Relative paths are resolved from context.directory.",
      ),
  },
  async execute(args, context) {
    const parsedUrl = new URL(args.url)
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Only http and https URLs are supported.")
    }

    const outputPath = args.outputPath
      ? isAbsolute(args.outputPath)
        ? args.outputPath
        : resolve(context.directory, args.outputPath)
      : resolve(context.directory, inferFilenameFromUrl(parsedUrl))

    const response = await fetch(parsedUrl)
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}.`)
    }

    const arrayBuffer = await response.arrayBuffer()
    await mkdir(dirname(outputPath), { recursive: true })
    await Bun.write(outputPath, Buffer.from(arrayBuffer))

    return {
      url: parsedUrl.toString(),
      outputPath,
      bytesWritten: Buffer.byteLength(Buffer.from(arrayBuffer)),
    }
  },
})
